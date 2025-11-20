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
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/var/contexts/qualities/types/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
declare module '../../../qualities/eslint/plugins/docs/block-comment-formatting.js' {
  /** ルール: ブロックコメント整形（メタ/メッセージを公開） */
  export const ruleBlockCommentFormatting: unknown;
  /** ルール: 単一行ブロックコメント推奨（メタ/メッセージを公開） */
  export const rulePreferSingleLineBlockComment: unknown;
  /** プラグイン: ルールマップ（blockfmt/*） */
  export const blockCommentFormattingPlugin: unknown;
}
declare module '../../../qualities/eslint/plugins/docs/header-bullets-min.js' {
  /** ルール: ヘッダ箇条書き最小件数（メッセージを公開） */
  export const ruleHeaderBulletsMin: unknown;
  /** プラグイン: ルールマップ（header/*） */
  export const headerPlugin: unknown;
}
declare module '../../../qualities/eslint/plugins/docs/*.js' {
  /** ルール: ブロックコメント整形（補助ワイルドカード宣言） */
  export const ruleBlockCommentFormatting: unknown;
  /** ルール: 単一行ブロックコメント推奨（補助ワイルドカード宣言） */
  export const rulePreferSingleLineBlockComment: unknown;
  /** プラグイン: ルールマップ（補助ワイルドカード宣言） */
  export const blockCommentFormattingPlugin: unknown;
  /** ルール: ヘッダ箇条書き最小件数（補助ワイルドカード宣言） */
  export const ruleHeaderBulletsMin: unknown;
  /** プラグイン: ルールマップ（補助ワイルドカード宣言） */
  export const headerPlugin: unknown;
  /** ルール: 分岐/ループ直前コメント必須（補助ワイルドカード宣言） */
  export const ruleRequireCommentPreviousLineForBranches: unknown;
  /** プラグイン: ルールマップ（branches/*, 補助ワイルドカード宣言） */
  export const branchesPlugin: unknown;
  /** ルール: Options typedef 要求（補助ワイルドカード宣言） */
  export const ruleRequireOptionsTypedef: unknown;
  /** プラグイン: ルールマップ（typedef/*, 補助ワイルドカード宣言） */
  export const typedefPlugin: unknown;
  /** ルール: 1ファイル内の @file ヘッダ JSDoc 一意性を検査する（補助ワイルドカード宣言） */
  export const ruleSingleFileHeader: unknown;
}
declare module '../../../qualities/eslint/plugins/require-comment-previous-line-for-branches.js' {
  /** ルール: 分岐/ループ直前コメント必須 */
  export const ruleRequireCommentPreviousLineForBranches: unknown;
  /** プラグイン: ルールマップ（branches/*） */
  export const branchesPlugin: unknown;
}
declare module '../../../qualities/eslint/plugins/types/require-options-typedef.js' {
  /** ルール: Options typedef を要求（schema.properties を包含） */
  export const ruleRequireOptionsTypedef: unknown;
  /** プラグイン: ルールマップ（typedef/*） */
  export const typedefPlugin: unknown;
}

