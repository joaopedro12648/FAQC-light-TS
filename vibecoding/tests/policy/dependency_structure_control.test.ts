/**
 * @file Policy: dependency_structure_control ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリ上で DSL(JSON) と TS ファイルを用意して実行する
 * - vibecoding 外から vibecoding/ への依存禁止ルールの NG/OK を最小例で検証する
 * - 実行は node ランナーを使用し、終了コードと代表出力のみを確認する
 * - 依存は qualities/policy/dependency_structure_control/core/rules.json のコピーに限定する
 * - 実行時間は 30 秒以内でタイムアウトする前提で設計する
 * - フィクスチャはテスト用ディレクトリ内に限定しリポジトリ本体へ影響させない
 * - ポリシー違反検出時はルールIDと依存元/依存先を含むメッセージで原因を特定しやすくする
 * - OK ケースでは禁止依存が存在しないことだけを最小限のログで確認する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupDir, copyFile, createTmpDir, ensureDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// 概要: vibecoding 外から vibecoding/ への依存禁止ルールの NG/OK 挙動をスモークで確認する
describe('policy: dependency_structure_control', () => {
  it('detects forbidden dependency from outside vibecoding to vibecoding (NG) and passes when no such dependency (OK)', async () => {
    const tmp = createTmpDir();
    // 一時ディレクトリ上で最小構成を用意し、成功・失敗の両ケースを検証する
    try {
      // 依存制御ポリシーの NG/OK 両ケースを構築して検証する
      // rules.json をコピーして DSL 設定を再現する
      const srcRules = path.join(
        process.cwd(),
        'qualities',
        'policy',
        'dependency_structure_control',
        'core',
        'rules.json',
      );
      const destRules = path.join(
        tmp,
        'qualities',
        'policy',
        'dependency_structure_control',
        'core',
        'rules.json',
      );
      ensureDir(path.dirname(destRules));
      copyFile(srcRules, destRules);

      // NG ファイル: vibecoding 外から vibecoding/ への依存を持つ
      const vibFile = [
        'export const value = 1;',
      ].join('\n');
      const outerFile = [
        "import { value } from './vibecoding/core';",
        'export const use = value;',
      ].join('\n');
      writeTextFile(path.join(tmp, 'vibecoding', 'core.ts'), vibFile);
      ensureDir(path.join(tmp));
      writeTextFile(path.join(tmp, 'external.ts'), outerFile);

      const ng = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'dependency_structure_control', 'core', 'run.mjs')],
        { cwd: tmp },
      );

      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/dependency_structure_control/);

      // OK ケース: vibecoding 内からの自己依存のみとし、禁止ルールに抵触しない構成へ書き換える
      writeTextFile(
        path.join(tmp, 'external.ts'),
        'export const ok = 1;',
      );

      // ポリシーを実行し、期待どおり検査が完了することを確認する
      const ok = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'dependency_structure_control', 'core', 'run.mjs')],
        { cwd: tmp },
      );
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/dependency_structure_control/);
    } finally {
      // テスト用の一時資材を消去し、環境汚染とリークを回避する
      cleanupDir(tmp);
    }
  });
});

