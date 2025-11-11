/**
 * @file 制御構文直前コメント必須（ロケール整合パターン対応）ESLint ルール
 * 備考:
 * - if/for/while/do/switch/try の直前行に「意図説明」のコメントを必須化（読み手志向）
 * - 既定では else if と catch を免除（構造的接続のための例外）
 * - allowBlankLine=false 既定（直前行のみ許可）。true なら空行1つは許容するが間のコードは不可（隣接性維持）
 * - requireTagPattern で本文パターンを要求可能（ja 系では非ASCIIを推奨し形式回避を抑止）
 * - ESLint ディレクティブ（eslint-disable 等）は直前コメントとして数えない（説明にならないため）
 * - ロケールは実行環境と同期（--locale > CHECK_LOCALE > OS/Node）
 * - 例外方針は SnD に準拠し、finally も免除対象（try のみ検査）
 * - 適用範囲はまず src/** のみ（段階的ロールアウト）
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-eslint-require-comment-before-branches.md
 */

/**
 * @typedef {Object} BranchCommentOptions
 * @property {Array<'if'|'for'|'while'|'do'|'switch'|'try'>} [targets] 対象種別（省略時は全種）
 * @property {string} [requireTagPattern] 本文パターン（例: 非ASCIIを要求）
 * @property {boolean} [allowBlankLine] 空行許容（既定: false）
 * @property {boolean} [ignoreElseIf] else if 免除（既定: true）
 * @property {boolean} [ignoreCatch] catch 免除（既定: true）
 */

/** ノードタイプとキーワードの対応（固定） */
/** @type {Array<[keyof import('eslint').Rule.RuleListener, string]>} */
const ENTRY_PAIRS = [
  ['IfStatement', 'if'],
  ['ForStatement', 'for'],
  ['ForOfStatement', 'for'],
  ['ForInStatement', 'for'],
  ['WhileStatement', 'while'],
  ['DoWhileStatement', 'do'],
  ['SwitchStatement', 'switch'],
  ['TryStatement', 'try'],
];

/**
 * ルールリスナー集合を構築する（分岐数を抑えて複雑度を低減）。
 * @param {Set<string>} targets 対象キーワード集合
 * @param {boolean} ignoreCatch catch/finally を免除するか（try のみ検査）
 * @param {(node:any,kw:string)=>void} checkFn 検査関数
 * @returns {import('eslint').Rule.RuleListener} リスナー辞書
 */
function buildListeners(targets, ignoreCatch, checkFn) {
  /** @type {import('eslint').Rule.RuleListener} */
  const listeners = {};
  for (const [nodeType, kw] of ENTRY_PAIRS) {
    listeners[nodeType] = (n) => {
      if (!targets.has(kw)) return;
      if (kw === 'try' && ignoreCatch) {
        // try のみ検査（catch/finally は別ノードで無視される）
      }

      checkFn(n, kw);
    };
  }

  return listeners;
}

/**
 * 直前コメントとしてカウントしない（ESLint ディレクティブ等）かを判定。
 * @param {import('estree').Comment|import('eslint').AST.Token} c コメント（対象候補）
 * @returns {boolean} ディレクティブなら true
 */
function isDirectiveComment(c) {
  const v = typeof c?.value === 'string' ? c.value.trim() : '';
  // eslint, istanbul, ts-nocheck 等の抑止・ツール系を除外
  return /^eslint[-\s]/i.test(v) || /^istanbul\b/i.test(v) || /^ts-(?:check|nocheck)\b/i.test(v);
}

/**
 * 直前の（非ディレクティブ）コメントを取得。
 * @param {import('eslint').SourceCode} src ソースコード（ESLint 提供）
 * @param {any} node 対象ノード（IfStatement など）
 * @returns {any|null} コメント or null
 */
function getLastMeaningfulComment(src, node) {
  const arr = typeof src.getCommentsBefore === 'function' ? src.getCommentsBefore(node) : [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const c = arr[i];
    if (!isDirectiveComment(c)) return c;
  }

  return null;
}

/**
 * 直前コメント要件の判定。
 * @param {import('eslint').SourceCode} src ソースコード（ESLint 提供）
 * @param {any} node 対象ノード（IfStatement/ForStatement 等）
 * @param {boolean} allowBlank 空行を許容するか（隙間コードは不可）
 * @returns {{ok:boolean,last:any|null}} 判定
 */
function hasRequiredPreviousComment(src, node, allowBlank) {
  const last = getLastMeaningfulComment(src, node);
  if (!last) return { ok: false, last: null };

  const nodeLine = node.loc.start.line;
  const lastEndLine = last.loc.end.line;

  if (!allowBlank) {
    return { ok: lastEndLine === nodeLine - 1, last };
  }

  // 空行許容だが、コメントとノードの間にコードトークンは不可
  const tokensBetween = src.getTokensBetween(last, node, { includeComments: false });
  const hasCodeBetween = tokensBetween.some(
    (t) => t.loc.start.line > lastEndLine && t.loc.end.line < nodeLine
  );
  return { ok: !hasCodeBetween && lastEndLine < nodeLine, last };
}

/**
 * 文字列が指定パターンに適合するか（null は常に true）。
 * @param {string|null} text コメント本文
 * @param {RegExp|null} re 検査パターン（未設定は常に true）
 * @returns {boolean} 適合なら true
 */
function matchesPattern(text, re) {
  if (!re) return true;
  const s = (text || '').trim();
  return re.test(s);
}

/**
 * ルール実体
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleRequireCommentPreviousLineForBranches = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require an intent-revealing comment immediately above control structures (if/loops/switch/try).'
    },
    schema: [
      {
        type: 'object',
        properties: {
          targets: {
            type: 'array',
            items: { enum: ['if', 'for', 'while', 'do', 'switch', 'try'] }
          },
          requireTagPattern: { type: 'string' },
          allowBlankLine: { type: 'boolean' },
          ignoreElseIf: { type: 'boolean' },
          ignoreCatch: { type: 'boolean' }
        },
        additionalProperties: false
      }
    ],
    messages: {
      missingComment:
        "制御構文 '{{kw}}' の直前に、なぜその分岐/ループが必要か（目的・前提・例外方針を1文で）を説明するコメントを書いてください。形式合わせではなく、後続の読者の理解を高める内容が必要です。",
      tagMismatch:
        "制御構文 '{{kw}}' の直前コメントは基準に一致していません: {{pat}}（ja 系では ASCII のみ不可）。記号追加ではなく、意図を短い自然文で明確に記述してください。"
    }
  },
  create(context) {
    const opt = (Array.isArray(context.options) && context.options[0]) || {};
    const targets = new Set(opt.targets || ['if', 'for', 'while', 'do', 'switch', 'try']);
    const allowBlank = Boolean(opt.allowBlankLine);
    const ignoreElseIf = opt.ignoreElseIf !== false; // default true
    const ignoreCatch = opt.ignoreCatch !== false; // default true
    const tagRe = typeof opt.requireTagPattern === 'string' && opt.requireTagPattern.length > 0
      ? new RegExp(opt.requireTagPattern)
      : null;

    const src = context.sourceCode || context.getSourceCode();

    /**
     * 共通チェック
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード（'if' 等）
     * @returns {void} 報告のみ（返り値なし）
     */
    /**
     * else if の alternate 部分かを判定する。
     * @param {any} node 対象ノード
     * @returns {boolean} else-if の alternate なら true
     */
    function isElseIfAlternate(node) {
      return (
        node &&
        node.type === 'IfStatement' &&
        node.parent &&
        node.parent.type === 'IfStatement' &&
        node.parent.alternate === node
      );
    }

    /**
     * 直前コメントとタグパターンを検査し、必要に応じて報告する。
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード
     * @returns {void} 報告のみ（返り値なし）
     */
    function check(node, kw) {
      // else if の免除
      if (ignoreElseIf && isElseIfAlternate(node)) {
        return;
      }

      // catch/finally は免除（try のみ検査）。ここでは try ノードのみ来るようにリスナーを定義

      const { ok, last } = hasRequiredPreviousComment(src, node, allowBlank);
      if (!ok) {
        context.report({ node, messageId: 'missingComment', data: { kw } });
        return;
      }

      if (tagRe && last) {
        const text = typeof last.value === 'string' ? last.value : '';
        if (!matchesPattern(text, tagRe)) {
          context.report({
            node,
            messageId: 'tagMismatch',
            data: { kw, pat: String(tagRe) }
          });
        }
      }
    }

    // リスナー集合を動的に組み立て（分岐数を抑え複雑度を低減）
    return buildListeners(targets, ignoreCatch, check);
  }
};

/**
 * プラグインエクスポート（rules マップ）
 */
export const branchesPlugin = {
  rules: {
    'require-comment-previous-line-for-branches': ruleRequireCommentPreviousLineForBranches
  }
};

