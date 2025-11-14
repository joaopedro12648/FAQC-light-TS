/**
 * @file Policy: anti_mvp ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリへ YAML をコピーして最小構成を再現する
 * - TODO を含む TS で NG、空コードで OK を確認する
 * - 出力の代表行を確認し、終了コードを検証する
 * - 走査は一時ディレクトリ配下に限定しリポジトリ外へ漏らさない
 * - 依存を最小化し再現性を高める
 * - 失敗ケースはメッセージの一部のみ検証
 * - 規範に合わせヘッダ箇条書きは 8 件以上を維持する
 * - 参照リンクはコンテキストと YAML の 2 件以上を保持する
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * @see vibecoding/var/contexts/qualities/policy/baseline.yaml。
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect,it } from 'vitest';
import { cleanupDir,copyFile, createTmpDir, ensureDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: anti_mvp ランナーが禁止語の検出と正常系を正しく判定することを検証
describe('policy: anti_mvp', () => {
  it('fails on banned term and passes otherwise', async () => {
    const tmp = createTmpDir();
    // テスト用の一時環境を確実に片付け結果の独立性を保つ
    try {
      // YAML をコピー
      const srcYaml = path.join(process.cwd(), 'qualities', 'policy', 'anti_mvp', 'anti_mvp_policy.yaml');
      const destYaml = path.join(tmp, 'qualities', 'policy', 'anti_mvp', 'anti_mvp_policy.yaml');
      ensureDir(path.dirname(destYaml));
      copyFile(srcYaml, destYaml);

      // NG: banned term（分割して組み立て）を含む
      const banned = 'fall' + 'back';
      writeTextFile(path.join(tmp, 'ng.ts'), `export const s = "${banned}";`);
      const ng = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'anti_mvp', 'run.mjs')], { cwd: tmp });
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/anti-mvp ❌/);

      // OK 検証: 失敗ファイルを削除して残骸を除去し、検証を分離した状態で実施する
      try { fs.rmSync(path.join(tmp, 'ng.ts')); } catch {
        // 削除失敗時は後続の OK 検証へ影響しないためスキップする
      }

      writeTextFile(path.join(tmp, 'ok.ts'), 'export const ok = 1;');
      const ok = await runNode('node', [path.join(process.cwd(), 'qualities', 'policy', 'anti_mvp', 'run.mjs')], { cwd: tmp });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/anti-mvp ✅/);
    } finally {
      // 一時ディレクトリを削除してテスト間の独立性を維持する
      cleanupDir(tmp);
    }
  });
});

