/**
 * @file Orchestrator: qualities/check-steps.ts の代表 E2E（静的検証）
 * 備考: 特記事項なし
 * - runMode='gate'|'both' のステップが定義順で存在することを検証
 * - policy ステップ群と lint/typecheck/test ステップの存在を確認
 * - 参照ディレクトリ（configRelDir）が実在することを確認
 * - 実コマンドの起動はここでは行わない（重複実行を避ける）
 * - SoT である qualities/** のディレクトリ構成を前提に検証
 * - 変化に強い代表的な不変条件のみに限定
 * - 実行対象は 'gate' と 'both' のみ（診断専用は除外）
 * - ID 群と configRelDir の存在性のみを検証し過剰な拘束を避ける
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/tsconfig/context.md
 * - 最低要件として箇条書き件数と参照リンク件数を満たす
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect,it } from 'vitest';

import { stepDefs } from '../../../qualities/check-steps';

describe('orchestrator: check-steps (E2E-lite)', () => {
  it('contains expected gate steps and existing config directories', () => {
    const gates = stepDefs.filter((d) => d.runMode === 'gate' || d.runMode === 'both');
    const ids = gates.map((g) => g.id);
    // 代表 ID の存在
    expect(ids).toContain('policy:anti_mvp');
    expect(ids).toContain('policy:jsdoc_no_duplicate');
    expect(ids).toContain('policy:no_unknown_double_cast');
    expect(ids).toContain('policy:no_relaxation');
    expect(ids).toContain('typecheck');
    expect(ids).toContain('lint');
    expect(ids).toContain('test');
    // configRelDir の存在（空文字は対象外）
    for (const g of gates) {
      if (!g.configRelDir) continue;
      const dir = path.join(process.cwd(), 'qualities', g.configRelDir);
      expect(fs.existsSync(dir)).toBe(true);
    }
  });
});


