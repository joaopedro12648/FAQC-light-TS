/**
 * @file インラインコメント（行末/同一行ブロック）でのラベル風メタ記述を禁止するルール
 * 備考:
 * - 対象: `// ...`（行頭/行末の双方）および同一行完結の `/* ... *\/`
 * - 免除: 直前行が「コメント行（// または /* で開始し同一行で閉じる）」である場合はスキップ
 * - 条件: コメント内にコロン（: または ：）が含まれ、かつ「キーワード + 区切り（:：）」の形を満たす
 * - 既定キーワード: 日本語（意図, 目的, 理由, 説明, 背景, 前提, 方針, 条件, 注意, 補足, 狙い）, 英語（why, what, how, note, then）
 * - 目的: .cursorrules のコメント規範に基づき、ラベル化されたメタ説明を行末の短文コメントで多用することを抑止する
 * - 受入: CI の `npm run check` が一発緑で通過していること
 * - 非目標: ブロックコメントやファイル先頭ヘッダのラベル表現は対象外
 * - 依存: ESLint v9 / Flat Config / docs ユニットのルール群に準拠
 * @see vibecoding/var/contexts/qualities/docs/context.md
 */

/**
 * @typedef {Object} InlineLabelOptions
 * インラインコメント検査のオプション。
 * @property {string[]} [keywords] 検出に用いるキーワード（省略時は既定セット）
 */

/**
 * 単一行ブロックコメント（同一行で開始/終了）かどうかを判定する。
 * @param {import('estree').Comment} c 対象コメント
 * @returns {boolean} 同一行ブロックコメントであれば true
 */
function isSingleLineBlock(c) {
  return c.type === 'Block' && c.loc.start.line === c.loc.end.line;
}

/**
 * 行の中で「行末のインラインコメント」かを判定する（前にコードがある）。
 * - `// ...` の行または `/* ... *\/` が同一行にあり、かつ開始位置より前に非空白が存在する。
 * @param {string} lineText 対象行テキスト（改行を含まない1行）
 * @param {number} startColumn コメント開始カラム（1始まり）
 * @returns {boolean} 行末インラインコメントと判定できる場合 true
 */
function isTrailingInlineInLine(lineText, startColumn) {
  const before = lineText.slice(0, Math.max(0, startColumn - 1));
  return before.trim().length > 0;
}

/**
 * 前行が「行末インラインコメント」かどうかを判定する。
 * - `//` を含み、かつ `//` より前に非空白がある場合
 * - または `/* ... *\/` が同一行に存在し、その開始位置より前に非空白がある場合
 * @param {string} prevLine 前行テキスト（存在しない場合は空文字）
 * @returns {boolean} 前行が行末インラインコメントと判定できる場合 true
 */
function prevLineIsCommentLine(prevLine) {
  // 前行が存在しない場合は免除条件に該当しないため偽を返す
  if (!prevLine) return false;
  const t = String(prevLine).trim();
  // 前行が行コメントである場合は免除とする
  if (t.startsWith('//')) return true;
  // 同一行完結のブロックコメント行も免除とする
  if (t.startsWith('/*') && t.includes('*/')) return true;
  return false;
}

/**
 * 「キーワード + 区切り（: または ：）」のラベル風表現を検出する。
 * - 行頭/括弧/空白直後に現れるキーワード + 可変空白 + [:：]
 * @param {string} text コメント本文
 * @param {readonly string[]} keywords キーワード配列
 * @returns {boolean} ラベル風パターンに一致する場合 true
 */
function hasLabelLikePattern(text, keywords) {
  // コロン類が無ければ検査対象外
  if (!/[：:]/.test(text)) return false;
  const union = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // キーワードが空であれば検査不要
  if (!union) return false;
  const re = new RegExp(String.raw`(?:^|\s|[（(])(?:${union})\s*[：:]`, 'i');
  return re.test(text);
}

/**
 * ルール実体
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleNoLabelStyleInlineComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow label-like meta descriptions (e.g., "意図: ...", "why: ...") in trailing inline comments.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noLabel:
        '行末のインラインコメントで「ラベル: 説明」の形式は避けてください（コメントは本文だけを書いてください）。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    const allLines = sourceCode.text.split(/\r?\n/);
    /**
     * 検査に用いるキーワードの配列
     * @type {Readonly<string[]>}
     */
    const keywords =
      (context.options?.[0]?.keywords && Array.isArray(context.options[0].keywords)
        ? context.options[0].keywords
        : [
          // 日本語
          '意図',
          '目的',
          '理由',
          '説明',
          '背景',
          '前提',
          '方針',
          '条件',
          '注意',
          '補足',
          '狙い',
          // 英語
          'why',
          'what',
          'how',
          'note',
          'then',
        ]);

    return {
      Program() {
        // 全コメントを走査し、行頭/行末の双方を対象に検査する
        for (const c of sourceCode.getAllComments()) {
          const isLine = c.type === 'Line';
          const isSingleBlock = isSingleLineBlock(c);
          // 行コメントでも同一行ブロックでもない場合は対象外とする
          if (!isLine && !isSingleBlock) continue;

          const lineIdx = c.loc.start.line - 1;
          // 免除: 直前行がコメント行であればスキップ
          const prev = lineIdx > 0 ? allLines[lineIdx - 1] : '';
          // 直前行がコメント行のときは本行の検査を免除する
          if (prevLineIsCommentLine(prev)) continue;

          // コメント本文
          const raw = String(c.value || '').trim();
          // ラベル風の書式に一致しなければ違反ではない
          if (!hasLabelLikePattern(raw, keywords)) continue;

          context.report({ loc: c.loc, messageId: 'noLabel' });
        }
      },
    };
  },
};

/** プラグインエクスポート */
export const inlineCommentLabelsPlugin = {
  rules: {
    'no-label-style-inline-comment': ruleNoLabelStyleInlineComment,
  },
};

