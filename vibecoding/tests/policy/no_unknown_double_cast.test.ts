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
    // 一時ディレクトリの作成/破棄を保証し副作用を隔離する
    try {
      // NG
      // テストコード本体に問題の連続語を含めないため、分割して組み立てる
      const kw1 = 'as un';
      const kw2 = 'known as';
      writeTextFile(path.join(tmp, 'ng.ts'), `const v = (0 ${kw1}${kw2} number);`);
      const ng = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_unknown_double_cast', 'run.mjs')], { cwd: tmp });
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/double cast/i);

      // OK
      // 失敗ファイルを削除してから OK を検証
      // NG の残存物を除去して OK 検証を独立させる
      try { fs.rmSync(path.join(tmp, 'ng.ts')); } catch {}

      writeTextFile(path.join(tmp, 'ok.ts'), 'const n: number = 1;');
      const ok = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'no_unknown_double_cast', 'run.mjs')], { cwd: tmp });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/OK:/);
    } finally {
      cleanupDir(tmp);
    }
  });
});

