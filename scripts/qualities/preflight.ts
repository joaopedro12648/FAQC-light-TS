#!/usr/bin/env node
/**
 * @file 実装中 preflight チェックの実行器
 * 備考: 特記事項なし
 * - ポリシー/型検査/Lint を順に実行する
 * - build/test は除外し、素早い自己点検を可能にする
 * - Windows 環境での npm 解決互換性を確保（shell: true）
 * - エラーは握り潰さず非0終了で明示する
 * - 関数は短く単一責務・入出力を明確に保つ
 * - 依存の向きを守り公開面を最小化する
 * - 静的検査の警告を残さない（--max-warnings=0 前提）
 * - 早期リターンで分岐の深さを抑制し可読性を保つ
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251115/SnD-20251115-preflight-scope.md
 */
import { spawn } from 'node:child_process';
import { stepDefs } from '../../qualities/check-steps.ts';

/**
 * 子プロセスでコマンドを同期的に実行し、非0/シグナル終了をエラーとして扱う。
 * 目的: 実行結果を明確化し、前提条件の未充足を早期に可視化する。
 * @param command 実行コマンド
 * @param args 引数配列（読み取り専用）
 */
function runCommand(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args as string[], { stdio: 'inherit', shell: true });
    child.on('error', (error) => reject(error));
    child.on('exit', (code, signal) => {
      // シグナル終了は異常系として即時に失敗させる
      if (signal) return reject(new Error(`${command} terminated by signal: ${String(signal)}`));
      // 非0終了はゲート未達として明示的に失敗させる
      if (code !== 0) return reject(new Error(`${command} ${args.join(' ')} exited with code ${String(code ?? -1)}`));
      resolve();
    });
  });
}

/** preflight 対象の抽出（diagnostics 専用と build/test を除外） */
const preflightSteps = stepDefs
  .filter((d) => {
    const scope = d.runScope ?? 'ci';
    return (scope === 'preflight' || scope === 'both') && d.runMode !== 'diagnostics';
  })
  .filter((d) => d.id !== 'build' && d.id !== 'test');

/**
 * preflight 対象のステップを定義順に実行する。
 * 目的: 実装中の逸脱を素早く検知し、手戻りを最小化する。
 */
async function runPreflight(): Promise<void> {
  // 実装中の逸脱を早期検知するため、定義順にチェックを直列実行する
  for (const s of preflightSteps) {
    // 依存関係の前提を守るため、順次に実行する
    await runCommand(s.command, s.args);
  }
}

// 直接起動のみ実行（ユニットテスト import 時は実行しない）
const isMain = (() => {
  // ライブラリ利用と CLI 実行を分離して副作用を限定する
  try {
    const arg1 = typeof process.argv[1] === 'string' ? process.argv[1] : null;
    // 呼び出し元が不明な場合は安全側で実行しない
    if (!arg1) return false;
    return import.meta.url.endsWith(arg1.replace(/\\/g, '/'));
  } catch (e) {
    // エントリ判定に失敗した場合は安全側に倒し、副作用のない経路を選択する（理由を標準エラーへ記録する）
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[qualities:preflight] warn: failed to determine isMain; treating as library use :: ${msg}\n`);
    return false;
  }
})();

// CLI エントリポイントとして起動された場合にのみ preflight を実行し、開発ループのフィードバックを早める
if (isMain) {
  runPreflight().catch((e) => {
    // 失敗時は理由を可視化し、呼び出し元が分岐しやすいよう非0で終了する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
