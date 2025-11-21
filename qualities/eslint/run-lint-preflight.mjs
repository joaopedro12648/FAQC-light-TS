#!/usr/bin/env node
/**
 * @file preflight 用 ESLint 実行エントリ（docs プラグインの厳格ルールを一時的に無効化）
 * 備考: 特記事項なし
 * - 実装中の軽量チェック preflight から blockfmt/control 系の厳格ルールを切り離す
 * - 型安全性やモジュール境界などコアな Lint は維持しつつコメント構造ノイズを抑制する
 * - 本番ゲート `npm run check` では既存の `npm run lint` を通じて全ルールを適用する
 * - コマンドロールは qualities/check-steps.ts の lint:preflight ステップからのみ呼び出される
 * - Windows/Unix 双方で npx 経由の eslint 実行を行い終了コードを正しく伝播させる
 * - 例外は握り潰さず標準エラーに出力し非0終了で呼び出し側に通知する
 * - 実装は docs コンテキストと SnD-20251117-eslint-docs-plugins-preflight-vs-test の意図に従う
 * - 変更対象は docs ユニットの preflight Lint に限定し、ci/check 側のルール構成を変えない
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/var/SPEC-and-DESIGN/202511/20251117/SnD-20251117-eslint-docs-plugins-preflight-vs-test.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251117/SnD-20251117-eslint-docs-plugins-preflight-vs-test.md
 */
import { spawn } from 'node:child_process';

/**
 * 子プロセスでコマンドを実行し、終了コード/シグナルを検査する。
 * @param {string} command 実行コマンド
 * @param {readonly string[]} args 引数配列
 * @returns {Promise<void>} 正常終了時に resolve し、異常終了時は reject する Promise
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code, signal) => {
      // シグナル終了は異常終了として扱い、原因を明示する
      if (signal) {
        reject(new Error(`${command} terminated by signal: ${String(signal)}`));
        return;
      }

      // 非0終了コードは preflight ゲート未達として扱う
      if (code !== 0) {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${String(
              code ?? -1,
            )}`,
          ),
        );
        return;
      }

      resolve();
    });
  });
}

/**
 * preflight 用の ESLint 実行を行う。
 * 目的: docs プラグインのうち `blockfmt/block-comment-formatting` と
 * `control/require-comments-on-control-structures` を一時的に無効化した状態で
 * 既定の lint 設定を利用し、コメント構造系の厳格な違反を preflight から切り離す。
 * - 本番ゲートでは `npm run lint` を通じて両ルールを含めたフルセットを適用する。
 */
async function runPreflightLint() {
  const args = [
    'eslint',
    '.',
    '--config',
    'qualities/eslint/eslint.config.mjs',
    '--max-warnings=0',
    '--cache',
    '--cache-location',
    'node_modules/.cache/eslint',
    // preflight では docs プラグインの中でも特にノイズ源となりやすいルール群を無効化する
    '--rule',
    'blockfmt/block-comment-formatting:off',
    '--rule',
    'control/require-comments-on-control-structures:off',
    // 実質1行のブロックコメントを複数行にする禁止は preflight では無効化（本番ゲートで検査）
    '--rule',
    'blockfmt/prefer-single-line-block-comment:off',
    // ブロックコメント内部の空行禁止も preflight では無効化し、本番ゲートのみで検査する
    '--rule',
    'blockfmt/no-blank-lines-in-block-comment:off',
  ];

  await runCommand('npx', args);
}

/**
 * このファイルが直接 CLI として起動されたかを判定する。
 * - ユニットテストなどから import された場合は副作用を避けるため実行しない。
 * @returns {boolean} 直接起動であれば true
 */
function isMainModule() {
  // 直接起動時のみ preflight Lint を実行し、ユニットテストからの import では副作用を避ける
  const argv1 = typeof process.argv[1] === 'string' ? process.argv[1] : null;
  // 起動元パスが取得できない場合は preflight Lint を実行せず安全側に倒す
  if (!argv1) return false;
  const normalized = argv1.replace(/\\/g, '/');
  return import.meta.url.endsWith(normalized);
}

// 直接起動であると判定された場合のみ preflight 用の Lint を実行し、docs ユニットの軽量チェックを行う
if (isMainModule()) {
  runPreflightLint().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}

