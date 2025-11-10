/**
 * @file ヘッダ箇条書き最小数のESLintルール（ローカルプラグイン）
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */

/**
 * Count bullet lines that look like `* - ...` inside a JSDoc block.
 * 日本語: JSDoc内の箇条書き行を数える
 * @param {string} commentText Raw block comment text without the surrounding block delimiters
 * @returns {number} Number of bullet lines detected
 */
function countBulletLines(commentText) {
  const lines = commentText.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    if (/^\s*\*\s*-\s+/.test(line)) {
      count += 1;
    }
  }

  return count;
}

/**
 * Determine whether a block comment node is a JSDoc-style comment.
 * 日本語: ブロックコメントがJSDoc風かを判定する
 * @param {import('eslint').AST.Token | import('estree').Comment} node Comment token or ESTree comment
 * @returns {boolean} True when comment starts with '*'
 */
function isJsDocBlock(node) {
  return node && node.type === 'Block' && node.value && node.value.startsWith('*');
}

/**
 * Parse header elements from a JSDoc-looking block comment string (including leading " * " lines).
 * 日本語: ヘッダJSDocから要素を抽出する
 * @param {string} text Raw JSDoc text including leading " * "
 * @returns {{hasFile:boolean,hasNotes:boolean,bulletCount:number,seeCount:number,sndRaw:string|null}} Parsed summary
 */
function parseHeader(text) {
  const lines = text.split(/\r?\n/);
  let hasFile = false;
  let hasNotes = false;
  let bulletCount = 0;
  let seeCount = 0;
  let sndRaw = null;

  for (const line of lines) {
    if (/^\s*\*\s*@file\b/.test(line)) hasFile = true;
    if (/^\s*\*\s*備考\s*:/.test(line)) hasNotes = true;
    if (/^\s*\*\s*-\s+/.test(line)) bulletCount += 1;
    if (/^\s*\*\s*@see\s+/.test(line)) seeCount += 1;
    const mSnd = line.match(/^\s*\*\s*@snd\s+(.+?)\s*$/);
    if (mSnd && mSnd[1]) {
      sndRaw = mSnd[1].trim();
    }
  }

  return { hasFile, hasNotes, bulletCount, seeCount, sndRaw };
}

/**
 * Validate @snd value
 * @param {string | null} value 検証対象の @snd 値（null 可）
 * @param {boolean} allowSndNone `"なし"/"none"` を許容するか
 * @returns {boolean} 妥当な .md パス または 許容された `"なし"` なら true
 */
function isValidSnd(value, allowSndNone) {
  if (value == null) return false;
  const v = value.trim();
  if (allowSndNone && (/^(なし|none)$/i.test(v))) return true;
  // Accept any .md path; recommend (but not require) vibecoding/var/SPEC-and-DESIGN/...
  return /\.md(\s*$)/i.test(v);
}

/**
 * Get the top-of-file JSDoc-like block comment, if any.
 * 日本語: 先頭JSDocコメントを取得する（存在すれば）
 * @param {import('eslint').SourceCode} sourceCode SourceCode インスタンス
 * @returns {import('eslint').AST.Token | import('estree').Comment | null} 先頭JSDocコメント（なければ null）
 */
function getHeaderComment(sourceCode) {
  const ast = sourceCode.ast;
  const firstToken = sourceCode.getFirstToken(ast);
  if (firstToken) {
    const leading = sourceCode.getCommentsBefore(firstToken);
    for (const c of leading) {
      if (isJsDocBlock(c)) return c;
    }
  } else {
    const all = sourceCode.getAllComments();
    for (const c of all) {
      if (isJsDocBlock(c)) return c;
    }
  }

  return null;
}

/**
 * Normalize rule options.
 * 日本語: ルールオプションを正規化する
 * @param {unknown} raw User-supplied option object
 * @returns {{min:number,max:number,requireSee:number,requireSnd:boolean,allowSndNone:boolean,customMessage:string|null}} Normalized options
 */
function normalizeOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    min: Number.isInteger(o.min) ? o.min : 8,
    max: Number.isInteger(o.max) ? o.max : 10,
    requireSee: Number.isInteger(o.requireSee) ? o.requireSee : 2,
    requireSnd: typeof o.requireSnd === 'boolean' ? o.requireSnd : true,
    allowSndNone: typeof o.allowSndNone === 'boolean' ? o.allowSndNone : true,
    customMessage: typeof o.message === 'string' && o.message.length > 0 ? o.message : null,
  };
}

/**
 * Basic structural checks for header presence.
 * 日本語: ヘッダの基本構造を検証する
 * @param {{hasFile:boolean,hasNotes:boolean}} summary Parsed header summary
 * @returns {Array<{messageId:string}>} Diagnostics to report
 */
function checkBase(summary) {
  const diags = [];
  if (!summary.hasFile) diags.push({ messageId: 'missingFile' });
  if (!summary.hasNotes) diags.push({ messageId: 'missingNotes' });
  return diags;
}

/**
 * Validate bullet count range.
 * 日本語: 箇条書き件数の範囲を検証する
 * @param {{bulletCount:number}} summary Parsed header summary
 * @param {number} min Minimum required bullets
 * @param {number} max Maximum allowed bullets
 * @param {string|null} customMessage Optional message override
 * @param {{messages:Record<string,string>}} meta Rule meta for default message
 * @returns {string|null} Message or null when compliant
 */
function checkBullets(summary, min, max, customMessage, meta) {
  if (summary.bulletCount >= min && summary.bulletCount <= max) return null;
  return (
    customMessage ||
    meta.messages.bulletsOutOfRange
      .replace('{{min}}', String(min))
      .replace('{{max}}', String(max))
      .replace('{{actual}}', String(summary.bulletCount))
  );
}

/**
 * Validate @see count.
 * 日本語: @see 行数の下限を検証する
 * @param {{seeCount:number}} summary Parsed header summary
 * @param {number} requireSee Minimum required @see entries
 * @param {{messages:Record<string,string>}} meta Rule meta for default message
 * @returns {string|null} Message or null when compliant
 */
function checkSee(summary, requireSee, meta) {
  if (!(requireSee > 0) || summary.seeCount >= requireSee) return null;
  return meta.messages.missingSee.replace('{{requireSee}}', String(requireSee));
}

/**
 * Validate @snd value shape and presence.
 * 日本語: @snd の値の形式と存在を検証する
 * @param {{sndRaw:string|null}} summary Parsed header summary
 * @param {boolean} requireSnd Whether @snd is required
 * @param {boolean} allowSndNone Whether 'なし'|'none' is allowed
 * @returns {{messageId:string}|null} Diagnostic payload or null
 */
function checkSnd(summary, requireSnd, allowSndNone) {
  if (!requireSnd) return null;
  if (summary.sndRaw == null) return { messageId: 'missingSnd' };
  if (!isValidSnd(summary.sndRaw, allowSndNone)) return { messageId: 'invalidSnd' };
  return null;
}

/**
 * 先頭JSDocの構造を検証するESLintルール本体。
 * @returns {import('eslint').Rule.RuleModule} ルールモジュール
 */
export const ruleHeaderBulletsMin = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require structured top-of-file JSDoc header: @file, 備考, 8–10 bullets, @see, @snd',
    },
    schema: [
      {
        type: 'object',
        properties: {
          min: { type: 'integer', minimum: 1 },
          max: { type: 'integer', minimum: 1 },
          requireSee: { type: 'integer', minimum: 0 },
          requireSnd: { type: 'boolean' },
          allowSndNone: { type: 'boolean' },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooShort:
        'Header checklist is missing or too short (min: {{min}} bullet items). Refer to the Quality Gate Context and update the file header comment according to PRE-IMPL.md.',
      bulletsOutOfRange:
        'Header checklist bullet items out of range (min: {{min}}, max: {{max}}, actual: {{actual}}).',
      missingFile:
        'Header must include an "@file ..." line in the top-of-file JSDoc block.',
      missingNotes:
        'Header must include a "備考: <...>" line in the top-of-file JSDoc block.',
      missingSee:
        'Header must include at least {{requireSee}} "@see <path/to/context.md>" lines.',
      missingSnd:
        'Header must include one "@snd <なし|path/to/spec.md>" line.',
      invalidSnd:
        'Invalid @snd value. Use "なし" or a .md path (e.g., vibecoding/var/SPEC-and-DESIGN/... .md).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const { min, max, requireSee, requireSnd, allowSndNone, customMessage } = normalizeOptions(
      context.options && context.options[0]
    );

    return {
      'Program:exit'() {
        const headerComment = getHeaderComment(sourceCode);

        if (!headerComment) {
          context.report({
            loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            messageId: 'missingFile',
          });
          return;
        }

        const headerText = sourceCode.getText(headerComment);
        const summary = parseHeader(headerText);

        // Structure validations
        for (const d of checkBase(summary)) {
          context.report({ loc: headerComment.loc, ...d });
        }

        // Bullet count range
        {
          const msg = checkBullets(summary, min, max, customMessage, ruleHeaderBulletsMin.meta);
          if (msg) context.report({ loc: headerComment.loc, message: msg });
        }

        // @see requirement
        {
          const msg = checkSee(summary, requireSee, ruleHeaderBulletsMin.meta);
          if (msg) context.report({ loc: headerComment.loc, message: msg });
        }

        // @snd requirement
        {
          const d = checkSnd(summary, requireSnd, allowSndNone);
          if (d) context.report({ loc: headerComment.loc, ...d });
        }
      },
    };
  },
};

/**
 * プラグインエクスポート（rules マップ）
 * @returns {{rules: Record<string, unknown>}} ルール名→実体
 */
export const headerPlugin = {
  rules: {
    'header-bullets-min': ruleHeaderBulletsMin,
  },
};

