/**
 * @file ESLint セクション: モジュール境界・依存関係
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import { FILES_JS, FILES_TS } from '../_shared/globs.mjs';

export const moduleBoundaries = [
  // JS ベース（おすすめ設定 + 境界）
  {
    ...js.configs.recommended,
    files: FILES_JS,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { import: importPlugin, jsdoc },
    rules: {
      'import/no-default-export': 'error',
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: ['**/*.test.ts', 'qualities/**', 'tests/**', 'scripts/**'] }
      ],
      'jsdoc/require-file-overview': 'error'
    },
    settings: { jsdoc: { mode: 'typescript' } }
  },

  // TS/TSX 向けのモジュール境界
  {
    files: FILES_TS,
    plugins: { import: importPlugin },
    rules: {
      'import/no-default-export': 'error',
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: ['**/*.test.ts', 'qualities/**', 'tests/**', 'scripts/**'] }
      ]
    }
  },

  // この設定ファイル自体は Flat Config 仕様により default export が必須
  {
    files: ['qualities/eslint/eslint.config.mjs'],
    plugins: { import: importPlugin },
    rules: { 'import/no-default-export': 'off' }
  }
];


