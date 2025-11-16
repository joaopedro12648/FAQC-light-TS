/**
 * @file ブロックコメント整形とテスト記述用コメントの検査プラグイン（docs ユニット実体）
 * 備考: ブロックコメントの形とテスト describe 直前の説明コメントを検査し、日本語を主体とした意図説明を強制する
 * - 対象: 複数行ブロックコメントとテスト記述用コメント（JSDoc/通常ブロックの双方を含む）
 * - 目的: コメントの構造と本文位置を揃え、品質コンテキストに沿った可読性と意図開示を保証する
 * - ポリシー: 先頭行は枠線のみとし本文は次行以降へ移動し、空ブロックコメントを禁止する
 * - describe: テストスイート直前に目的・前提・例外方針を 1 行で説明する日本語コメントを要求する
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md に記されたコメント/テスト記述ポリシーに従う
 * - SnD: SnD-20251116-qualities-structure-and-context-granularity を @snd で参照し、docs ユニットの一部として自己記述する
 * - PRE-IMPL: Header Comment Quick Checklist 準拠のヘッダ構造を前提とし、自己違反を残さない
 * - 受入: 本プラグイン自身が blockfmt/control/jsdoc 系ルールに適合し `npm run check` を一発緑で通過していること
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */

/**
 * @typedef {Object} BlockCommentFormattingOptions
 * ブロックコメント整形ルールの挙動を調整するためのオプション群。
 * @property {boolean} [enforceMultiLineOnly] 単一行コメントを対象外とするかどうか（既定: true）
 * @property {boolean} [allowSingleLineJsdoc] 単一行 JSDoc を警告対象から外すかどうか
 */

/**
 * 先頭行に本文を置かないブロックコメント整形ルール。
 * - 対象: 複数行のブロックコメント全般（説明コメントを段落として扱う）
 * - 失敗: 開始行に実際の本文（トリム後テキスト）が含まれている場合（例: 1 行目に説明文を書き、2 行目以降に続きが来る形式）
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleBlockCommentFormatting = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Require multi-line block comments (JSDoc included) to keep the first line body-less and move text to the next line.',
    },
    schema: [],
    messages: {
      // テスト用のメッセージ ID（ヘルパー名をそのまま文言へ反映する）
      moveToNextLine:
        'Move JSDoc content from the opening line to the next line to keep the /** line body-less.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      Program() {
        // ソースコード全体のコメントを走査し、対象ブロックコメントのみを検査する
        for (const comment of sourceCode.getAllComments()) {
          // インラインコメントは対象外とし、ブロックコメントのみを扱う
          if (comment.type !== 'Block') continue;

          const raw = `/*${comment.value}*/`;
          const lines = raw.split(/\r?\n/);
          // 1 行だけのコメントは本ルールの対象外（no-empty-comment 側で扱う）
          if (lines.length === 1) {
            continue;
          }

          // `/*` / `/**` を除いた先頭行の本文を検査する
          const firstBody = lines[0].replace(/^\/\*\*?/, '').trim();
          // 先頭行に本文テキストが残っている場合は整形対象として報告する
          if (firstBody.length > 0) {
            context.report({
              loc: comment.loc,
              messageId: 'moveToNextLine',
            });
          }
        }
      },
    };
  },
};

/**
 * 空ブロックコメント禁止ルール。
 * - 対象: すべてのブロックコメント
 * - 失敗: 本文行から装飾文字（* や空白）を除いた結果、意味のあるテキストが 1 行も無い場合
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleNoEmptyBlockComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow empty block comments that contain no meaningful text.',
    },
    schema: [],
    messages: {
      emptyBlock: '意味のあるテキストを含まないブロックコメントは削除するか本文を記述してください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      Program() {
        // ソースコード全体のコメントを走査し、空ブロックコメントの有無を検査する
        for (const comment of sourceCode.getAllComments()) {
          // 対象外のコメント種別は早期リターンでスキップする
          if (comment.type !== 'Block') continue;
          const raw = `/*${comment.value}*/`;
          const trimmedLines = raw
            .replace(/^\/\*\*?/, '')
            .replace(/\*\/$/, '')
            .split(/\r?\n/)
            .map((l) => l.replace(/^\s*\*?\s?/, '').trim());

          const hasContent = trimmedLines.some((l) => l.length > 0 && !/^@/.test(l));
          // 本文行が 1 行も存在しないブロックコメントは違反として報告する
          if (!hasContent) {
            context.report({
              loc: comment.loc,
              messageId: 'emptyBlock',
            });
          }
        }
      },
    };
  },
};

/**
 * describe 直前コメント必須ルール。
 * - 対象: テストスイートを表す describe 呼び出し
 * - 失敗: 直前行にテスト群の目的や前提を説明するコメントが存在しない場合
 * （ESLint ディレクティブのみがある状態は説明コメントとはみなさない）
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleRequireDescribeComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require an intent-revealing comment immediately above top-level describe blocks in tests.',
    },
    schema: [],
    messages: {
      missingDescribeComment:
        'describe ブロックの直前に、このテスト群の目的・前提・例外方針を 1 行で説明するコメントを書いてください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * describe 系呼び出しかどうかを判定するユーティリティ。
     * @param {import('estree').Node} node 判定対象ノード
     * @returns {boolean} describe 呼び出しであれば true
     */
    function isDescribeCall(node) {
      // CallExpression 以外は describe とみなさず即座に除外する
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      // グローバル describe(...) 呼び出しかどうかを判定する
      if (callee.type === 'Identifier' && callee.name === 'describe') return true;
      // オブジェクトメソッド形式の describe 呼び出しかどうかを判定する
      if (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'describe'
      ) {
        return true;
      }

      return false;
    }

    /**
     * 対象ノード直前に意味のある説明コメントがあるかを判定する。
     * @param {import('estree').Node} node 判定対象ノード
     * @returns {boolean} 説明コメントが直前行に存在する場合 true
     */
    function hasMeaningfulLeadingComment(node) {
      const comments = sourceCode.getCommentsBefore(node);
      // 直前にコメントが無い場合は説明コメント無しとみなす
      if (!comments || comments.length === 0) return false;
      const last = comments[comments.length - 1];
      const text = typeof last.value === 'string' ? last.value.trim() : '';
      // 直前コメントが静的解析ツールの設定指令のみの場合は、説明コメントとしては扱わない
      if (/^(?:eslint|istanbul|ts-(?:check|nocheck))[-\s]/i.test(text)) return false;

      const lineDiff = node.loc.start.line - last.loc.end.line;
      // コメントと describe 呼び出しの間に空行を挟まず直前行のみを認める
      return lineDiff === 1;
    }

    return {
      CallExpression(node) {
        // トップレベル describe のみ対象とし、その他の関数呼び出しは早期リターンで除外する
        if (!isDescribeCall(node)) return;
        // 式文のトップレベルに無い describe は説明コメント必須の対象外とし、ネストスイートは自由度を残す
        if (node.parent && node.parent.type !== 'ExpressionStatement') return;
        // 直前行に意味のある説明コメントが無い describe 呼び出しに対してのみ違反を報告する
        if (!hasMeaningfulLeadingComment(node)) {
          context.report({
            node,
            messageId: 'missingDescribeComment',
          });
        }
      },
    };
  },
};

/**
 * プラグインエクスポート。
 * - block-comment-formatting: ブロックコメント整形ルール
 * - no-empty-comment: 空ブロックコメント禁止ルール
 * - require-describe-comment: describe 直前コメント必須ルール
 */
export const blockCommentFormattingPlugin = {
  rules: {
    'block-comment-formatting': ruleBlockCommentFormatting,
    'no-empty-comment': ruleNoEmptyBlockComment,
    'require-describe-comment': ruleRequireDescribeComment,
  },
};

