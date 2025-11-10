/**
 * @file ESLint プラグインの型簡易定義（テスト用）
 * 備考: 特記事項なし
 * - リポジトリ内の JS プラグインを型解決するための最小宣言
 * - テストコードの開発体験向上のため unknown で受ける
 * - 実体は JS 実装であり、実行時に検証を行う前提
 * - 本定義はテスト専用であり公開 API を意図しない
 * - 将来 TS 化されたら本ファイルは削除可能
 * - import 側での any 使用を避け静的検査のノイズを減らす
 * - ファイル追加時はワイルドカード宣言でカバーされる
 * - プラグインの導入/除去に追随しやすい構成とする
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
declare module '../../../qualities/eslint/plugins/block-comment-formatting.js' {
  /** プラグイン: ブロックコメント整形ルール */
  export const ruleBlockCommentFormatting: unknown;
  /** プラグインオブジェクト（rules マップ） */
  export const blockCommentFormattingPlugin: unknown;
}
declare module '../../../qualities/eslint/plugins/header-bullets-min.js' {
  /** プラグイン: ヘッダ箇条書き最小件数ルール */
  export const ruleHeaderBulletsMin: unknown;
  /** プラグインオブジェクト（rules マップ） */
  export const headerPlugin: unknown;
}
declare module '../../../qualities/eslint/plugins/*.js' {
  /** プラグイン: ブロックコメント整形ルール */
  export const ruleBlockCommentFormatting: unknown;
  /** プラグインオブジェクト（rules マップ） */
  export const blockCommentFormattingPlugin: unknown;
  /** プラグイン: ヘッダ箇条書き最小件数ルール */
  export const ruleHeaderBulletsMin: unknown;
  /** プラグインオブジェクト（rules マップ） */
  export const headerPlugin: unknown;
}


