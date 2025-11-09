#!/usr/bin/env node
/**
 * @file 品質ゲートの単一実行ポイント。ポリシー検証→型検査→Lint→テストを順次実行する。
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stepDefs } from '../../qualities/check-steps.ts';

/**
 * ゲート実行ステップのタプル型。[command, args]
 */

/**
 * 子プロセスでコマンドを実行（stdio 継承）。成功時 resolve、非0終了/シグナル時 reject。
 * @param {string} command 実行コマンド
 * @param {readonly string[]} args 引数配列（読み取り専用）
 * @returns {Promise<void>} 実行完了を表す Promise（非0終了時は reject）
 */
function runCommand(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args as string[], {
      stdio: 'inherit',
      shell: true, // npm 解決の Windows 互換性向上
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${command} terminated by signal: ${String(signal)}`));
      if (code !== 0) return reject(new Error(`${command} ${args.join(' ')} exited with code ${String(code ?? -1)}`));
      resolve();
    });
  });
}

/** 引数解析 */
const argv = process.argv.slice(2);
const isFast = argv.includes('--fast');
const scopeArg = argv.find((a) => a.startsWith('--scope='));
const scope = scopeArg ? scopeArg.split('=')[1] : 'all';

/** 対象ステップの選択 */
// 実ゲート用: runMode が 'gate' または 'both' のみ対象
const gateSteps = stepDefs.filter((d) => d.runMode === 'gate' || d.runMode === 'both');
const selectedSteps = isFast
  ? gateSteps.filter((d) => d.id.startsWith('policy:') || d.id === 'typecheck' || d.id === 'lint')
  : gateSteps;

/**
 * 変更ファイルの取得（lint 用）。失敗時は空配列を返す。
 * @returns {string[]} Lint 対象の変更ファイルパス配列
 */
function getChangedFilesForLint(): string[] {
  try {
    const res = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACM', 'HEAD'], {
      shell: true,
      encoding: 'utf8',
    });
    if (res.status !== 0 || !res.stdout) return [];
    const candidates = res.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const targets = candidates
      .filter((p) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(p))
      .filter((p) => existsSync(p));
    return targets;
  } catch {
    return [];
  }
}

for (const step of selectedSteps) {
  const { id, command: cmd, args } = step;
  if (id === 'build') {
    if (!existsSync('index.html')) {
      continue;
    }
  }
  if (id === 'lint' && scope === 'changed') {
    const changed = getChangedFilesForLint();
    if (changed.length === 0) {
      process.stdout.write('[lint] --scope=changed: 対象ファイルが無いため full lint にフォールバック\n');
      await runCommand('npm', ['run', 'lint', '--silent']);
      continue;
    }
    // 変更ファイル限定で ESLint を実行（ローカル開発高速化）。構成は既定と同等。
    await runCommand('npx', [
      'eslint',
      '--config',
      'qualities/eslint/eslint.config.mjs',
      '--max-warnings=0',
      '--cache',
      '--cache-location',
      'node_modules/.cache/eslint',
      ...changed,
    ]);
    continue;
  }
  // 順次実行（ゲートは前提条件の成立が重要）
  await runCommand(cmd, args);
}


