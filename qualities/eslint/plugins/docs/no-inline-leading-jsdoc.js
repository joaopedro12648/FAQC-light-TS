/**
 * @file 同行先頭の JSDoc（開始記号「/**」で始まるコメント）の直後にコードが続くのを禁止し、改行で分離するルール
 * - 対象: JSDoc ブロック（開始が "/**"）の直後に同一行でコードが続くケース
 * - 許容: 前行の JSDoc（直前行に単独で置かれている通常の形）
 * - fixer: コメント終端記号（スターとスラッシュの並び）と次トークンの間を「改行 + コメント行のインデント」に置換（改行種はファイルの既存行末記号を維持）
 * - 目的: 可読性の維持とコメント規約の統一
 * - 例外: JSDoc ではないブロックコメントは対象外
 * - 入力: ESLint のソースコード（AST とコメント情報）
 * - 出力: 違反箇所の report と自動修正（fix）
 * - 適用範囲: JS/TS/（対応拡張子）全般
 * - テスト観点: 同一行/別行/空行/インデント/行末記号の保持
 */

/**
 * @typedef {Object} NoInlineLeadingJsdocOptions
 * ルールオプション定義（現在はオプション無し。将来拡張のための予約）
 * @property {boolean} [dummy] 未使用のダミー項目（将来の互換性維持用）
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 * ルール定義の型（ESLint RuleModule）を指定
 */
export const ruleNoInlineLeadingJsdoc = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Disallow inline-leading JSDoc followed by code on the same line; require a newline after */.',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      needNewlineAfterJsdoc:
        'JSDoc（/** ... */）の直後にコードを同一行で続けないでください。改行して次行にコードを配置してください。',
    },
  },
  create(context) {
    const src = context.getSourceCode();
    const allLines = Array.isArray(src.lines) ? src.lines : String(src.text || '').split(/\r?\n/);

    /**
     * ファイル内で使用されている行末記号を検出する
     * @returns {string} 改行シーケンス（\r\n または \n）
     */
    function detectEOL() {
      // ファイル全体の最初の改行シーケンスを採用（既存の行末記号を維持）
      const m = /\r\n|\n/.exec(src.text || '');
      return m ? m[0] : '\n';
    }

    /**
     * 指定行の先頭インデント（タブ/スペース混在を含む）を抽出する
     * @param {number} lineIndexZeroBased 0始まりの行インデックス
     * @returns {string} 行頭インデント文字列
     */
    function getLineIndentString(lineIndexZeroBased) {
      const raw = allLines[lineIndexZeroBased] || '';
      // 行頭のタブ/スペースをそのまま採用（混在も原文維持）
      const m = /^([ \t]*)/.exec(raw);
      return m ? m[1] : '';
    }

    return {
      Program() {
        const comments = src.getAllComments() || [];
        const eol = detectEOL();

        // コメント群を走査し、JSDoc ブロックだけを対象にする
        for (const c of comments) {
          // JSDoc 以外のブロックは対象外
          if (c.type !== 'Block') continue;
          // ブロック冒頭が "/**" で始まるもののみ（JSDoc）を対象
          const raw = src.text.slice(c.range[0], c.range[1]);
          // JSDoc でないものはスキップする
          if (!raw.startsWith('/**')) continue;

          // 次のトークンを取得し、同一行に存在する場合のみ対象
          const nextToken = src.getTokenAfter(c, { includeComments: false });
          // トークン情報が無ければ対象外
          if (!nextToken) continue;
          // 位置情報が取得できない場合は解析対象外とする
          if (!c.loc || !nextToken.loc) continue;
          // 直後が同一行にある場合だけ違反とみなす
          if (nextToken.loc.start.line !== c.loc.end.line) continue;

          // 同一行でコードが続く → 違反として報告し、"*/" と次トークンの間を改行+インデントへ置換
          context.report({
            loc: {
              start: c.loc.end,
              end: nextToken.loc.start,
            },
            messageId: 'needNewlineAfterJsdoc',
            fix(fixer) {
              // コメント行（*/ がある行）のインデントを採用
              const indent = getLineIndentString(c.loc.end.line - 1);
              const insert = eol + indent;
              return fixer.replaceTextRange([c.range[1], nextToken.range[0]], insert);
            },
          });
        }
      },
    };
  },
};

/** プラグインエクスポート */
export const inlineJsdocPlugin = {
  rules: {
    'no-inline-leading-jsdoc': ruleNoInlineLeadingJsdoc,
  },
};

