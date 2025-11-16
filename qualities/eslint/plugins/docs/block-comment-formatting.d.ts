/**
 * @file ESLint プラグイン型定義: block-comment-formatting
 * 備考: docs ユニット側のブロックコメント整形ルール/プラグインの型を宣言する
 * - 対象: 複数行ブロックコメントとテスト記述用コメント
 * - 目的: 先頭行の本文排除と空ブロックコメント禁止・describe 直前コメント必須を型の観点から補助する
 * - 入出力: JS 実装で提供される RuleModule/プラグインオブジェクトを unknown で受けつつ利用側で具体化する
 * - 依存関係: 実体は同階層の JS ファイルおよび ESLint API に委ねる
 * - 使用箇所: qualities/eslint/plugins/docs/block-comment-formatting.js からインポートされる想定
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md に記されたブロックコメント/テスト記述ポリシー
 * - 対応SnD: SnD-20251116-qualities-structure-and-context-granularity による docs ユニット設計
 * - 受入: `npm run check` 実行時に本ファイル自身がヘッダ/JSDoc/制御構造コメント規約へ自己適合していること
 */
/**
 * ブロックコメント整形ルール本体のエクスポート。
 * 実体は docs ユニットの JS 実装側で提供される。
 */
export const ruleBlockCommentFormatting: unknown;
/**
 * block-comment-formatting 系ルールをまとめた ESLint プラグインオブジェクトのエクスポート。
 * 実体は docs ユニットの JS 実装側で提供される。
 */
export const blockCommentFormattingPlugin: unknown;

