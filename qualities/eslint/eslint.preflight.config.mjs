/**
 * @file ESLint フラット設定（preflight 用の軽量オーバーレイ）
 * 備考: 特記事項なし
 * - 既定設定からの最小差分として運用し、本番ゲートで厳密検査する
 * - 実装中のノイズ低減のみを目的とし、緩和は限定的に適用
 * - ルール緩和は gate 実行時に解除されることを前提とする
 * - 設定ファイル自体もリポジトリの lint 対象として扱う
 * - default export の使用を避け、明示的な named export とする
 * - 導入・変更時は check での自己適合を必ず確認する
 * - 設定変更は最小限に留め、影響範囲を明確化する
 * - 一時緩和はコード完成後に必ず解除されることを確認する
 * @see ./eslint.config.mjs
 * @see ../../vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251122/SnD-20251122-breakout-ts.md
 */
import baseConfig from './eslint.config.mjs';

/** preflight 専用の緩和ルール（実装中のみ適用） */
const preflightOverlay = [
  {
    rules: {
      // 実装中は空行配置のノイズを抑制し、最終 check で修正・検出する
      'padding-line-between-statements': 'off',
      // docs 系ルールは preflight では無効化し、本番ゲートのみで検査する
      'blockfmt/block-comment-formatting': 'off',
      'control/require-comments-on-control-structures': 'off',
      'blockfmt/prefer-single-line-block-comment': 'off',
      'blockfmt/no-blank-lines-in-block-comment': 'off',
      // import 整列系は preflight では検出せず、check 側でのみ適用する
      'import/no-duplicates': 'off',
      'import/newline-after-import': 'off',
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',
    },
  },
];

// preflight 設定の公開（実装中限定の緩和を付与）
export const preflightConfig = [...baseConfig, ...preflightOverlay];
export default preflightConfig;

