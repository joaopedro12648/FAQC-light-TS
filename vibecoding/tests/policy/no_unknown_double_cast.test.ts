/**
 * @file Policy: no_unknown_double_cast ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 「unknown を経由する二重キャスト」の検出を NG/OK で検証する
 * - 走査対象は一時ディレクトリ配下の TS のみ
 * - 出力の代表行と終了コードを確認する
 * - 禁止連続語は分割してテスト本体に含めない
 * - 実行は外部影響を避けるため cwd を切り替えて行う
 * - フィクスチャは最小限に抑え実行時間を短縮する
 * - 例外時も後始末が行われることを保証する
 * @see vibecoding/var/contexts/qualities/policy/no_unknown_double_cast/context.md
 * @see vibecoding/var/contexts/qualities/policy/baseline.yaml。
 * - 最低要件として箇条書きと参照リンク件数を満たす
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect,it } from 'vitest';
import { cleanupDir,createTmpDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: unknown 二重キャストの検出/非検出動作を確認
describe('policy: no_unknown_double_cast', () => {
  it('detects double-cast via unknown and passes otherwise', async () => {
    const tmp = createTmpDir();
    // 実行と検証の境界を明確化し、失敗時の原因追跡を容易にする
    try {
      // NG: テストコード本体に問題の連続語を含めないため、分割して組み立てる
      const kw1 = 'as un';
      const kw2 = 'known as';
      writeTextFile(path.join(tmp, 'ng.ts'), `const v = (0 ${kw1}${kw2} number);`);
      const ng = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_unknown_double_cast', 'types', 'run.mjs')], { cwd: tmp });
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/double cast/i);

      // OK: 失敗ファイルを削除してから検証（NG残存物を除去して検証を独立）
      try { fs.rmSync(path.join(tmp, 'ng.ts')); } catch {
        // 削除に失敗した場合は次の検証に影響しない範囲でスキップする
      }

      writeTextFile(path.join(tmp, 'ok.ts'), 'const n: number = 1;');
      const ok = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_unknown_double_cast', 'types', 'run.mjs')], { cwd: tmp });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/OK:/);
    } finally {
      // 実行時に生成した一時資産を確実に消去し持ち越しを防ぐ
      cleanupDir(tmp);
    }
  });
});

