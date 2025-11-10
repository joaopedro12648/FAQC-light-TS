/**
 * @file 子プロセス実行ヘルパ（node/tsx ランナー）
 * 備考: 特記事項なし
 * - 外部スクリプトの黒箱実行を簡素化し、出力と終了コードを取得する
 * - Windows/CI 互換のため shell=true を使用する
 * - タイムアウトは 30 秒固定で強制終了する
 * - 例外経路は明示し、呼び出し側で検証できる形に整える
 * - 実行前提と I/O を最小化し、テストの安定性を確保する
 * - 非同期 API を採用し、将来の並列実行にも適合させる
 * - マジックナンバーを避け定数化する
 * - 返却型を明確化し後続のアサーションを簡素化する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { spawn } from 'node:child_process';

/**
 * 子プロセス実行結果の型
 */
export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 子プロセスでコマンドを実行し結果を取得
 * @param {string} command 実行コマンド（例: 'node'）
 * @param {readonly string[]} args 引数配列
 * @param {{ cwd?: string; timeoutMs?: number }} [opts] 実行オプション
 * @param {string} [opts.cwd] 実行時のカレントディレクトリ
 * @param {number} [opts.timeoutMs] タイムアウト（ミリ秒）
 * @param {NodeJS.ProcessEnv} [opts.env] 追加/上書きする環境変数
 * @returns {Promise<RunResult>} 実行結果
 */
export function runNode(
  command: string,
  args: readonly string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<RunResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn(command, args as string[], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts?.cwd,
      shell: true,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? null, stdout, stderr, signal: signal ?? null });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr, signal: null });
    });
  });
}


