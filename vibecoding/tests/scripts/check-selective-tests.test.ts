/**
 * @file 選択的内製テスト分岐の小規模E2E（決定関数の4通り検証）
 * 備考: 特記事項なし
 * - evaluateShouldRunInternalTests を用い簡潔な4ケースを確認
 * - .git 変更検知（qualities/vibecoding）を優先し、無い場合は last_updated を参照
 * - last_updated が無い/空の時は安全側で実行（true）
 * - 実コマンドは起動せず分岐判定のみ（高速・安定）
 * - 30秒タイムアウト方針は子プロセスヘルパで担保済み（本テストは未使用）
 * - ヘルパは CWD 切替・env 注入（QC_*）に対応（別テストで使用）
 * - 仕様どおりの分岐であることを将来にわたり担保
 * - 依存の変化に強い最小構成での回帰チェック
 * @see vibecoding/var/SPEC-and-DESIGN/SnD-20251109-tests-structure-vibecoding-optional.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { describe, expect,it } from 'vitest';
import { evaluateShouldRunInternalTests } from '../../../scripts/qualities/check';

// 概要: 内製テスト追加実行の判定関数の分岐をテーブル駆動で検証
describe('selective internal tests decision (evaluateShouldRunInternalTests)', () => {
  const ISO = '2025-01-01T00:00:00.000Z';

  /**
   * evaluateShouldRunInternalTests に渡す判定入力の型（テスト用エイリアス）。
   */
  type Params = Parameters<typeof evaluateShouldRunInternalTests>[0];
  /**
   * テーブル駆動テスト行の型: [説明, 入力, 期待値]。
   */
  type Row = [name: string, params: Params, expected: boolean];

  const rows: Row[] = [
    [
      'git present and changes under qualities -> false (narrowed to vibecoding/{scripts,tests})',
      { vibecodingExists: true, changedPaths: ['qualities/eslint/x.mjs'], lastUpdatedIso: ISO, anyUpdatedSince: false },
      false,
    ],
    [
      'no git (changedPaths=null), last_updated exists and updates present -> true',
      { vibecodingExists: true, changedPaths: null, lastUpdatedIso: ISO, anyUpdatedSince: true },
      true,
    ],
    [
      'no git, last_updated exists and no updates -> false',
      { vibecodingExists: true, changedPaths: null, lastUpdatedIso: ISO, anyUpdatedSince: false },
      false,
    ],
    [
      'no git, last_updated missing -> true (safe default)',
      { vibecodingExists: true, changedPaths: null, lastUpdatedIso: null, anyUpdatedSince: null },
      true,
    ],
    // 追加: 境界/負例
    [
      'vibecoding missing -> false',
      { vibecodingExists: false, changedPaths: ['qualities/x.ts'], lastUpdatedIso: ISO, anyUpdatedSince: true },
      false,
    ],
    [
      'empty last_updated -> true (safe default)',
      { vibecodingExists: true, changedPaths: null, lastUpdatedIso: '', anyUpdatedSince: null },
      true,
    ],
    [
      'git present with no changes -> use last_updated decision (updates present => true)',
      { vibecodingExists: true, changedPaths: [], lastUpdatedIso: ISO, anyUpdatedSince: true },
      true,
    ],
  ];

  describe.each(rows)('%s', (_name, params, expected) => {
    it('matches expected decision', () => {
      const ok = evaluateShouldRunInternalTests(params);
      expect(ok).toBe(expected);
    });
  });
});

