/**
 * @file @file タグ一意性を検査するローカル ESLint ルール
 * 備考: 特記事項なし
 * - 対象: ファイル内のすべての JSDoc 形式ブロックコメント（/* ... * / 形式の JSDoc）
 * - 目的: 1ファイル内で複数の @file タグが宣言されることを防ぎ、ヘッダ JSDoc の責務境界を明確にする
 * - 判定: すべての JSDoc コメントから @file タグの出現回数を集計し、2 回以上検出された場合に違反として報告する
 * - 連携: jsdoc/require-file-overview および header/header-bullets-min と併用し、「1ファイル=1ヘッダ JSDoc」前提の運用を静的に保証する
 * - コンテキスト: vibecoding/var/contexts/qualities/docs/context.md の docs ユニット方針に従ってヘッダ構造を強制する
 * - テスト: vibecoding/tests/eslint/single-file-header.test.ts でルール公開面のスモークテストを行う
 * - I/O: 追加オプション無し（将来の拡張に備え schema は空配列として定義）
 * - 受入: 本ルール自身が docs ユニットの ESLint 設定に適合し、npm run check を一発緑で通過していること
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */

/**
 * @typedef {Object} SingleFileHeaderOptions
 * 単一ファイルヘッダルールの拡張用オプションを表す型。
 * @property {boolean} [allowMissing] @file タグが 1 件も無いファイルを許容するかどうか（既定: true）
 */

/**
 * 1ファイル内で @file タグが複数回登場しないことを保証するルール。
 * - JSDoc ブロック（/** で始まるブロックコメント）のみを対象とする
 * - 全 JSDoc から @file を含む行を数え、2 回以上なら 2 件目以降を違反として報告する
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleSingleFileHeader = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce a single @file tag per file so that only one file-level header JSDoc exists.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowMissing: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      multipleFileTags:
        '@file タグはファイル内で 1 度だけ使用してください。既に別の JSDoc に @file が存在します。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    /**
     * ルールオプションを読み取るローカル変数（将来の挙動拡張用）。
     * @type {SingleFileHeaderOptions}
     */
    const options = (context.options && context.options[0]) || {};
    // allowMissing は現時点では挙動に影響しないが、将来の拡張用として予約しておく
    const _allowMissing = options.allowMissing !== false;
    // 型定義オプションの存在を明示的に参照し、将来の拡張余地を残しつつ未使用変数警告を回避する
    void _allowMissing;

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        /**
         * @type {Array<{ comment: import('eslint').AST.Token | import('estree').Comment, index: number }>}
         * 検出した @file タグ付き JSDoc コメントとそのインデックスを保持する作業用配列。
         */
        const fileTagComments = [];

        // すべてのコメントを走査し、JSDoc 内の @file タグ使用回数を集計する
        // ルールの目的: 1ファイル=1つの @file ヘッダ JSDoc という前提を静的に保証する
        for (const comment of comments) {
          // JSDoc 形式のブロックコメント（/** ... */）のみを対象とし、サンプル文中の @file は対象外とする
          if (comment.type !== 'Block') continue;
          const raw = `/*${comment.value}*/`;
          // JSDoc 以外のブロックコメントは対象外とし、ヘッダ以外の汎用コメントはスキップする
          if (!raw.startsWith('/**')) continue;

          const body = raw.replace(/^\/\*\*/, '').replace(/\*\/$/, '');
          const lines = body
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*\*\s?/, '').trim());

          // 行頭が @file で始まる実際のタグのみを対象とし、説明文中の @file 参照は数えない
          const hasFileTag = lines.some((line) => /^@file\b/.test(line));
          // 実際の @file タグが存在する JSDoc のみを対象とし、サンプルや説明文中の参照は数えない
          if (hasFileTag) {
            fileTagComments.push({ comment, index: fileTagComments.length });
          }
        }

        // 1件以下であれば問題なし（0件ケースは allowMissing に従い将来の拡張で扱う）
        if (fileTagComments.length <= 1) {
          return;
        }

        // 2件目以降を違反として報告する
        for (let i = 1; i < fileTagComments.length; i += 1) {
          const entry = fileTagComments[i];
          context.report({
            loc: entry.comment.loc,
            messageId: 'multipleFileTags',
          });
        }
      },
    };
  },
};

/** プラグインエクスポート。 */
export const singleFileHeaderPlugin = {
  rules: {
    'single-file-header': ruleSingleFileHeader,
  },
};
