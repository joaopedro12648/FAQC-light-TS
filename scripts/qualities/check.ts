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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync,readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
const scope = scopeArg?.split('=')[1] ?? 'all';

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

/**
 * Git 変更一覧を取得（パス配列そのまま）。失敗時は null を返す。
 * @returns {string[] | null} 変更パス一覧（失敗時は null）
 */
function getChangedPathsRaw(): string[] | null {
  try {
    const res = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
      shell: true,
      encoding: 'utf8',
    });
    if (res.status !== 0 || !res.stdout) return null;
    const candidates = res.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return candidates;
  } catch {
    return null;
  }
}

/**
 * 再帰的にディレクトリを走査し、しきい日時より新しいファイルの存在を判定する。
 * 除外: node_modules, .git
 * @param {string} dir 起点ディレクトリ
 * @param {number} thresholdMs しきい日時（ミリ秒）
 * @returns {boolean} 新しいファイルがあれば true
 */
function traverseUpdatedNewerThan(dir: string, thresholdMs: number): boolean {
  const stat = statSync(dir);
  if (stat.isDirectory()) {
    const entries = readdirSync(dir);
    for (const name of entries) {
      if (name === 'node_modules' || name.startsWith('.git')) continue;
      const next = path.join(dir, name);
      if (traverseUpdatedNewerThan(next, thresholdMs)) return true;
    }
    return false;
  }
  if (stat.isFile()) {
    return stat.mtime.getTime() > thresholdMs;
  }
  return false;
}

/**
 * ディレクトリ配下を再帰走査し、指定のしきい日時より新しいファイルがあるかを判定。
 * 例外時は false（検出なし）を返す。
 * @param {string} rootDir 走査ルート
 * @param {string} thresholdIso ISO8601 文字列
 * @returns {boolean} 新しいファイルがあれば true
 */
function hasFilesUpdatedAfter(rootDir: string, thresholdIso: string): boolean {
  try {
    const threshold = new Date(thresholdIso).getTime();
    if (Number.isNaN(threshold)) return false;
    if (!existsSync(rootDir)) return false;
    return traverseUpdatedNewerThan(rootDir, threshold);
  } catch {
    return false;
  }
}

/**
 * 選択的内製テストの判定（副作用なしの決定関数）
 * @param {object} params 判定に必要な要素
 * @param {boolean} params.vibecodingExists vibecoding/ の存在
 * @param {string[] | null} params.changedPaths Git 差分パス配列（失敗時は null）
 * @param {string | null} params.lastUpdatedIso last_updated の ISO（未存在/不正は null）
 * @param {boolean | null} params.anyUpdatedSince last_updated 以降の更新有無（不明は null）
 * @returns {boolean} 追加実行すべきなら true
 */
export function evaluateShouldRunInternalTests(params: {
  vibecodingExists: boolean;
  changedPaths: string[] | null;
  lastUpdatedIso: string | null;
  anyUpdatedSince: boolean | null;
}): boolean {
  const { vibecodingExists, changedPaths, lastUpdatedIso, anyUpdatedSince } = params;
  if (!vibecodingExists) return false;
  if (Array.isArray(changedPaths)) {
    const hit = changedPaths.some((p) =>
      p.startsWith('vibecoding/scripts/') || p.startsWith('vibecoding/tests/')
    );
    if (hit) return true;
  }
  if (lastUpdatedIso == null) return true; // 無い/読めない → 安全側 true
  if (lastUpdatedIso.trim() === '') return true; // 空 → 安全側 true
  if (anyUpdatedSince == null) return false; // 判定不能は消極的（git なし・last_updated ありのときは別経路で true 測る）
  return anyUpdatedSince;
}

// JSDoc adjacency separator（隣接JSDocの重複検出を避けるための区切り）
// see: qualities/policy/jsdoc_no_duplicate/run.mjs
/**
 * vibecoding 内製テスト（vibecoding/tests/**）を追加実行すべきかを判定する。
 * - 優先1: Git 差分に qualities/** or vibecoding/** が含まれる
 * - 優先2: last_updated 以降に qualities/** or vibecoding/** に更新がある
 * - last_updated が無い/読めない場合は安全側（true）
 * @returns {boolean} 追加実行すべきなら true
 */
export function shouldRunInternalTests(): boolean {
  // vibecoding ディレクトリが無い場合は実行しない（存在条件）
  const vibecodingExists = existsSync('vibecoding');
  if (!vibecodingExists) return false;

  // 優先1: Git 差分
  const changed = getChangedPathsRaw();
  if (Array.isArray(changed)) {
    const hit = changed.some((p) =>
      p.startsWith('vibecoding/scripts/') || p.startsWith('vibecoding/tests/')
    );
    if (hit) return true;
  }

  // 優先2: last_updated フォールバック
  const lastUpdatedPath = path.join('vibecoding', 'var', 'contexts', 'qualities', 'last_updated');
  try {
    const isoRaw = readFileSync(lastUpdatedPath, { encoding: 'utf8' });
    const iso = isoRaw.trim();
    const anyUpdated =
      hasFilesUpdatedAfter('vibecoding/scripts', iso) ||
      hasFilesUpdatedAfter('vibecoding/tests', iso);
    return evaluateShouldRunInternalTests({
      vibecodingExists,
      changedPaths: changed,
      lastUpdatedIso: iso,
      anyUpdatedSince: anyUpdated,
    });
  } catch {
    // 無い/読めない
    return evaluateShouldRunInternalTests({
      vibecodingExists,
      changedPaths: changed,
      lastUpdatedIso: null,
      anyUpdatedSince: null,
    });
  }
}

/**
 * 内製テストファイル（vibecoding/tests/**）の存在を確認。
 * @returns {boolean} 1件以上存在すれば true
 */
function hasInternalTestFiles(): boolean {
  const base = path.join('vibecoding', 'tests');
  if (!existsSync(base)) return false;
  const stack: string[] = [base];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const st = statSync(current);
    if (st.isDirectory()) {
      for (const name of readdirSync(current)) {
        if (name === 'node_modules' || name.startsWith('.git')) continue;
        stack.push(path.join(current, name));
      }
    } else if (st.isFile()) {
      if (/\.(test|spec)\.(c|m)?[jt]sx?$/.test(current)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 品質ゲート本体を順次実行する（ポリシー→タイプチェック→Lint→テスト等）。
 * - ユーザー向け tests/** は常時実行
 * - 内製テスト vibecoding/tests/** は選択的に追加実行
 */
export async function runQualityGate(): Promise<void> {
  for (const step of selectedSteps) {
    const { id, command: cmd, args } = step;
    if (id === 'build') {
      if (!existsSync('index.html')) {
        continue;
      }
    }
    if (id === 'lint' && (await handleLintStep(scope))) continue;
    if (id === 'test') {
      if (await handleTestStep(cmd, args)) continue;
    }
    // 順次実行（ゲートは前提条件の成立が重要）
    await runCommand(cmd, args);
  }
}

/**
 * Lint ステップを処理する（--scope=changed をサポート）。
 * @param {string} scope スコープ指定（'changed' のとき変更差分のみを対象）
 * @returns {Promise<boolean>} 処理した場合は true（ループ側で continue する）
 */
async function handleLintStep(scope: string): Promise<boolean> {
  if (!(scope === 'changed')) return false;
  const changed = getChangedFilesForLint();
  if (changed.length === 0) {
    process.stdout.write('[lint] --scope=changed: 対象ファイルが無いため full lint にフォールバック\n');
    await runCommand('npm', ['run', 'lint', '--silent']);
    return true;
  }
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
  return true;
}

/**
 * テストステップを処理する（ユーザー → 条件付きで内製）。
 * @param cmd 既定のテストコマンド
 * @param args 既定の引数
 * @returns 常に true（ループ側で continue する）
 */
async function handleTestStep(cmd: string, args: readonly string[]): Promise<boolean> {
  await runCommand(cmd, args);
  if (shouldRunInternalTests()) {
    if (existsSync('vibecoding')) {
      if (hasInternalTestFiles()) {
        process.stdout.write('[test] vibecoding/ 変更あり: 内製テストを追加実行します\n');
        // 一時的な Vitest 設定で include を vibecoding/** に限定して実行
        const tmpDir = path.join(process.cwd(), 'tmp');
        try { mkdirSync(tmpDir, { recursive: true }); } catch {}
        const internalCfg = path.join('tmp', 'vitest.internal.config.cjs');
        const cfgContent = [
          'const { defineConfig } = require("vitest/config");',
          'module.exports = defineConfig({',
          '  test: {',
          '    include: ["vibecoding/**/*.test.ts"],',
          '    environment: "node",',
          '  },',
          '});',
          '',
        ].join('\n');
        try { writeFileSync(internalCfg, cfgContent, 'utf8'); } catch {}
        await runCommand('npx', ['vitest', 'run', '--config', internalCfg, '--silent']);
      } else {
        process.stdout.write('[test] 内製テストファイルなし: 追加実行をスキップ\n');
      }
    } else {
      process.stdout.write('[test] vibecoding/ ディレクトリなし: 内製テストはスキップ\n');
    }
  } else {
    process.stdout.write('[test] 変更なし判定: 内製テストはスキップ\n');
  }
  return true;
}

const isMain = (() => {
  try {
    const arg1 = typeof process.argv[1] === 'string' ? process.argv[1] : null;
    if (!arg1) return false;
    const invokedHref = pathToFileURL(arg1).href;
    return import.meta.url === invokedHref;
  } catch {
    return false;
  }
})();

if (isMain) {
  // 明示的エントリポイントとして起動されたときのみ実行（ユニットテストの import では実行しない）
  runQualityGate().catch((e) => {
    // 例外を標準エラーで明確化して終了コードを非0にする
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}


