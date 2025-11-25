/**
 * @file コメント単一化用の最小 ESLint フラット設定（fix-only 専用）
 * - 目的: blockfmt/prefer-single-line-block-comment のみを有効化
 * - 範囲: 他のルール・プラグインは読み込まない（副作用回避）
 * - 実行: npm run fix:comments:singleline（--fix --fix-type suggestion）
 * - 前提: ローカルプラグイン blockfmt がビルド不要で読み込めること
 * - 出力: 自動修正（JSDoc は単一行でも JSDoc として維持）
 * - 例外: このファイル自体は default export 必須（Flat Config の仕様）
 * - 受入: PRE-IMPL の Header Checklist を満たす（8項目以上）
 * - 備考: JSDoc/ヘッダの要件は本ファイルでも厳格に適用する
 */
import tsparser from '@typescript-eslint/parser';
import { FILES_TS } from './_shared/core/globs.mjs';
import { blockCommentFormattingPlugin } from './plugins/docs/block-comment-formatting.js';

export default [
  {
    files: FILES_TS,
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
    },
    plugins: { blockfmt: blockCommentFormattingPlugin },
    rules: {
      'blockfmt/prefer-single-line-block-comment': 'error',
    },
  },
];

