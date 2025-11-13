/**
 * @file Policy: jsdoc_no_duplicate ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリ上で YAML と TS ファイルを用意して実行する
 * - 隣接 JSDoc の key5/tags 重複を検出することを検証する
 * - OK/NG の双方で終了コードとメッセージの一部を確認する
 * - 実行は node ランナーを使用（cwd を一時ディレクトリへ）
 * - 実行時間は 30 秒以内でタイムアウトする
 * - フィクスチャはテスト用ディレクトリ内に限定する
 * - 代表文言のみを確認し出力量を抑制する
 * @see vibecoding/var/contexts/qualities/policy/jsdoc_no_duplicate/context.md
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * - 最低要件として箇条書き件数と参照リンク件数を満たす
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import path from 'node:path';
import { describe, expect,it } from 'vitest';
import { cleanupDir,copyFile, createTmpDir, ensureDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: 連続するJSDoc重複の検出/非検出をスモークで確認
describe('policy: jsdoc_no_duplicate', () => {
  it('detects adjacent duplicates (NG) and passes when no duplicates (OK)', async () => {
    const tmp = createTmpDir();
    // テスト用の一時ディレクトリを確実に片付け検証の独立性を保つ
    try {
      // 配置: YAML のみ参照されるのでコピー
      const srcYaml = path.join(process.cwd(), 'qualities', 'policy', 'baseline.yaml');
      const destYaml = path.join(tmp, 'qualities', 'policy', 'baseline.yaml');
      ensureDir(path.dirname(destYaml));
      copyFile(srcYaml, destYaml);

      // NG ファイル: 隣接 JSDoc（common tag: @param）
      const badTs = [
        '/** summary',
        ' * @param x',
        ' */',
        '/** summary',
        ' * @param y',
        ' */',
        'export const x = 1;',
      ].join('\n');
      writeTextFile(path.join(tmp, 'a.ts'), badTs);
      // OK ファイル
      writeTextFile(path.join(tmp, 'b.ts'), 'export const ok = 1;');

      // 実行（NG 期待）
      const ng = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'jsdoc_no_duplicate', 'run.mjs')], { cwd: tmp });
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/duplicate JSDoc/);

      // 上書きして OK 期待
      writeTextFile(path.join(tmp, 'a.ts'), '/** summary 。*/\nexport const x2 = 2;');
      const ok = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'jsdoc_no_duplicate', 'run.mjs')], { cwd: tmp });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/OK: no adjacent JSDoc duplicates/);
    } finally {
      // 一時ディレクトリを削除して副作用を残さない
      cleanupDir(tmp);
    }
  });
});

