/**
 * @file ESLint テスト用オーバーライド（最小緩和）
 * 備考: 特記事項なし
 * - テストは可読性・速度優先で本番より緩い制約を許容
 * - 緩和は設定オーバーライドで行い抑止コメントは使用禁止
 * - 監視範囲は tests/** 限定でプロダクションコードへ波及不可
 * - まず関数長のみ緩和し必要時は段階的に最小追加
 * - 型安全や import 規律は原則維持し危険な全面緩和は回避
 * - 将来の拡張は本ファイルへ集約し差分を明確化
 * - ルール変更時は context.md と PRE-IMPL の整合を確認
 * - CI は --max-warnings=0 を前提とし逸脱を残さない
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */

/**
 * テスト配下のみ、関数長（max-lines-per-function）を緩和する。
 * - 既定: 80 行 → tests/**: 120 行
 * - コメント行・空行は引き続き除外
 */
export const testsOverrides = [
  {
    files: ['tests/**/*/*.ts', 'tests/**/*/*.mts', 'tests/**/*/*.cts'],
    rules: {
      'max-lines-per-function': ['error', { max: 120, skipComments: true, skipBlankLines: true }]
    }
  },
  {
    files: ['**/vitest.config.*'],
    rules: {
      // 設定ファイルはツール仕様上 default export が必要
      'import/no-default-export': 'off'
    }
  }
];

