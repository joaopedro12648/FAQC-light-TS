/**
 * @file Policy: comment_locale ランナーの黒箱テスト
 * 備考: 特記事項なし
 * - 一時ディレクトリで最小構成を用意し副作用を隔離する
 * - ロケールは CHECK_LOCALE=ja-JP（厳格度 any）で固定する
 * - ASCII のみ/日本語含む JSDoc で NG/OK を最小例で検証する
 * - 実行は runNode で黒箱化し終了コードと代表出力のみ検証する
 * - エラーは握り潰さず失敗経路を明示して原因特定を容易にする
 * - 参照は品質コンテキストのドキュメントに厳密一致させる
 * - テストは短く単一責務で可読性と再現性を重視して記述する
 * - フォルダ/ファイルの生成と後始末を徹底しリークを防止する
 * @see vibecoding/var/contexts/qualities/policy/comment_locale/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-quality-tests-indirect-coverage.md
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupDir, createTmpDir, writeTextFile } from '../framework/fsFixtures';
import { runNode } from '../framework/runNode';

// このスイートではポリシーの NG/OK の最小限の挙動のみを検証する
describe('policy: comment_locale', () => {
  it('fails on ASCII-only JSDoc with ja locale and passes when non-ASCII present', async () => {
    const tmp = createTmpDir();
    // 検証対象の実行と結果確認を集約し、失敗を即時に検出する
    try {
      // NG: ASCII のみの JSDoc（タグ行やパス/URL行ではない本文を用意）
      const asciiOnly = [
        '/**',
        ' * This is a documentation block.',
        ' * Please write comments.',
        ' */',
        'export const a = 1;',
      ].join('\n');
      writeTextFile(path.join(tmp, 'ng.ts'), asciiOnly);

      // 実行（NG 期待）
      const ng = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'comment_locale', 'run.mjs')],
        {
          cwd: tmp,
          env: {
            CHECK_LOCALE: 'ja-JP',
            COMMENT_LOCALE_STRICT: 'any',
          },
        }
      );
      expect(ng.code).toBe(1);
      expect(ng.stderr).toMatch(/\[policy:comment_locale\] NG/);

      // OK 検証前に NG ファイルを削除してクリーンな状態にする
      // 直前に失敗ファイルを除去し検証条件を独立させる
      try { await runNode('node', ['-e', `"require('node:fs').rmSync('${path.join(tmp, 'ng.ts').replace(/\\/g, '\\\\')}',{force:true})"`]); } catch {
        // 削除失敗は検証条件に影響しないためスキップする
      }

      // OK: 日本語（非ASCII）を含む JSDoc
      const withJa = [
        '/**',
        ' * これは説明コメントです。', // 非ASCII を含む
        ' * 仕様の要点を日本語で簡潔に記述する。',
        ' */',
        'export const b = 2;',
      ].join('\n');
      writeTextFile(path.join(tmp, 'ok.ts'), withJa);

      const ok = await runNode(
        'node',
        [path.join(process.cwd(), 'qualities', 'policy', 'comment_locale', 'run.mjs')],
        {
          cwd: tmp,
          env: {
            CHECK_LOCALE: 'ja-JP',
            COMMENT_LOCALE_STRICT: 'any',
          },
        }
      );
      expect(ok.code).toBe(0);
      expect(ok.stdout).toMatch(/\[policy:comment_locale\] OK/);
    } finally {
      // 作成した一時資産を確実に消去し永続汚染を回避する
      cleanupDir(tmp);
    }
  });
});
 
