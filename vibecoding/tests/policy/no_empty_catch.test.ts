/**
 * @file Policy: no_empty_catch ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリ上で TS ファイルを用意し、empty/trivial catch の検出有無を検証する
 * - NG ケースでは空 catch または実質的に何もしない catch を配置する
 * - OK ケースでは意味のある処理（例: throw の再送出）を含む catch へ書き換える
 * - 実行は node ランナーを使用し、終了コードと代表出力のみを確認する
 * - フィクスチャはテスト用ディレクトリ内に限定しリポジトリ本体へ影響させない
 * - empty/trivial catch の判定ロジックが許容コメント付きパターンを正しくスキップすることを確認する
 * - OK ケースでは再throw など「意味のある処理」がある場合にポリシーが許容することを確認する
 * - テスト全体として例外処理ポリシーの意図をコメントで明示し、将来の拡張時のリグレッション防止に役立てる
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupDir, createTmpDir, ensureDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: empty/trivial catch の検出/非検出をスモークで確認する
describe('policy: no_empty_catch', () => {
  it('fails on empty/trivial catch and passes when catch contains meaningful handling', async () => {
    const tmp = createTmpDir();
    // 一時ディレクトリ上で NG/OK の最小構成を順に検証する
    try {
      const srcDir = path.join(tmp, 'src');
      ensureDir(srcDir);

      // NG: empty/trivial catch ブロックを含む
      const ngContent = [
        'export async function doSomething() {',
        '  try {',
        '    throw new Error("boom");',
        '  } catch (e) {',
        '    /* noop */',
        '  }',
        '}',
      ].join('\n');
      writeTextFile(path.join(srcDir, 'ng.ts'), ngContent);

      const ng = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'no_empty_catch', 'core', 'run.mjs')],
        { cwd: tmp },
      );
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/no_empty_catch/);

      // OK: 意味のある処理（再throw）を含む catch に書き換える
      const okContent = [
        'export async function doSomethingOk() {',
        '  try {',
        '    throw new Error("boom");',
        '  } catch (e) {',
        '    throw e;',
        '  }',
        '}',
      ].join('\n');
      writeTextFile(path.join(srcDir, 'ng.ts'), okContent);

      const ok = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'no_empty_catch', 'core', 'run.mjs')],
        { cwd: tmp },
      );
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/no_empty_catch/);
    } finally {
      // 作成した一時資産を確実に削除し、他テストへのリークを防止する
      cleanupDir(tmp);
    }
  });
});

