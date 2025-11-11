/**
 * @file Policy: no_relaxation ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリ上で TS を生成し、抑止ディレクティブ検出を検証
 * - NG ケースは抑止ディレクティブを含み、OK ケースは通常コードのみ
 * - 終了コードと出力の要点を確認する
 * - 検出パターン文字列はテスト本体で分割して埋め込みを回避
 * - 実行は外部影響を避けるため cwd を切り替えて行う
 * - フィクスチャは最小限に抑え実行時間を短縮する
 * - 例外時も後始末が行われることを保証する
 * @see vibecoding/var/contexts/qualities/policy/no_relaxation/context.md
 * @see vibecoding/var/contexts/qualities/policy/baseline.yaml。
 * - 最低要件として箇条書きと参照リンク件数を満たす
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect,it } from 'vitest';
import { cleanupDir,createTmpDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: 抑止ディレクティブの検出/クリア判定を黒箱で確認
describe('policy: no_relaxation', () => {
  it('detects relaxations and passes when none present', async () => {
    const tmp = createTmpDir();
    try {
      // NG: eslint-disable を含む
      const kw = 'eslint-';
      const kw2 = 'disable';
      writeTextFile(path.join(tmp, 'ng.ts'), `/* ${kw}${kw2} */\nexport const a = 1;`);
      const ng = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_relaxation', 'run.mjs')], { cwd: tmp });
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/no_relaxation/);

      // OK: クリア
      // 失敗ファイルを削除してから OK を検証
      try { fs.rmSync(path.join(tmp, 'ng.ts')); } catch {}

      writeTextFile(path.join(tmp, 'ok.ts'), 'export const ok = 1;');
      const ok = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_relaxation', 'run.mjs')], { cwd: tmp });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/OK: no relaxations/);
    } finally {
      cleanupDir(tmp);
    }
  });
});

