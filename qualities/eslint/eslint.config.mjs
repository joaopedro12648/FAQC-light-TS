/**
 * @file ESLint フラット設定（分割セクション集約）
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
import { IGNORES } from '../_shared/ignores.mjs';
import { moduleBoundaries } from './01-module-boundaries/core/config.mjs';
import { typeSafety } from './02-type-safety/types/config.mjs';
import { documentation } from './03-documentation/docs/config.mjs';
import { complexityAndMagic } from './04-complexity-and-magic/core/config.mjs';
import { environmentExceptions } from './05-environment-exceptions/core/config.mjs';
import { testsOverrides } from './tests-overrides/tests/config.mjs';

// Default export 必須の内部ユーティリティ（formatters 等）は default-export を免除
// - 対象: qualities/eslint/formatters/*.js
/**
 * ESLint 内部フォーマッタ用に default export を許可する設定断片。
 * qualities/eslint/formatters/*.js に対してのみ import/no-default-export を緩和する。
 */
export const allowDefaultExportForInternalFormatters = [
  {
    files: ['qualities/eslint/formatters/*.js'],
    rules: { 'import/no-default-export': 'off' }
  }
];

export default [
  // Ignores（グローバル）
  { ignores: IGNORES },

  // セクション統合
  ...moduleBoundaries,
  ...typeSafety,
  ...documentation,
  ...complexityAndMagic,
  ...environmentExceptions,

  // グローバル: ファイル総行数の上限を設定（コメント/空行は除外）
  {
    rules: {
      'max-lines': ['error', { max: 300, skipComments: true, skipBlankLines: true }]
    }
  },

  // ESLint 設定ファイル群は Flat Config の仕様上、default export を要求する。
  // 設定ファイルの保守性を優先し、該当ファイルに限って禁止ルールを緩和する。
  {
    files: ['qualities/eslint/**/*.mjs'],
    rules: {
      'import/no-default-export': 'off',
      'jsdoc/require-jsdoc': 'off'
    }
  },
  // tests 用の最小緩和（関数長のみ）
  ...testsOverrides,
  // 内部フォーマッタ（default export 必須）の例外を追加
  ...allowDefaultExportForInternalFormatters
];

