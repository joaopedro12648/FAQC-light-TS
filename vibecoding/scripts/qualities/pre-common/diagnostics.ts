/**
 * @file PRE-COMMON 診断（サンプル出力生成）
 * - 目的: gate コマンドの代表出力を整形し、context.md の作成を補助する
 * - 出力: tmp/pre-common-diagnostics.md と標準出力
 * - 入力: qualities/** の設定と check-steps 定義
 * - 方針: 失敗を握り潰さず、警告を残して継続可能に設計する
 * - 設計: 副作用を限定し、I/O はヘルパに委譲する
 * - 形式: ASCIIセーフ整形を提供し、ログの可搬性を確保する
 * - 検査: 代表行のみを要約してノイズを抑制する
 * - 同期: var/contexts の鏡像整備前でも動作（exit=2）
 */
import fs from 'node:fs';
import path from 'node:path';
import { type StepDef,stepDefs } from '../../../../qualities/check-steps.ts';
import { KATA_TS } from './diagnostics-const.ts';
import { formatCap, normalizePathForOutput, runCommand } from './utils.ts';

/**
 * 診断用の kata.ts を作成して gate コマンドのサンプル出力を収集する。
 * @param repoRoot リポジトリのルートディレクトリ
 * @returns 整形済みの診断出力行配列
 */
export function runGateCommandsWithKata(repoRoot: string): string[] {
  const kataDir = path.join(repoRoot, 'auto-check');
  const kataPath = path.join(kataDir, 'kata_for_auth_check.ts');
  fs.mkdirSync(kataDir, { recursive: true });
  fs.writeFileSync(kataPath, KATA_TS, 'utf8');
  // 診断対象ステップを抽出し順に実行する
  try {
    const steps = stepDefs.filter((d) => (d.runMode === 'diagnostics' || d.runMode === 'both') && d.id !== 'test' && d.id !== 'build');
    const results: string[] = [];
    results.push('');
    results.push('[SAMPLE] === Gate command outputs ===');
    // 各ステップの出力を収集して診断ログを整形する
    for (const d of steps) {
      results.push('');
      appendDiagnosticsForStep(repoRoot, d, results);
    }

    return results;
  } finally {
    // 生成した診断ファイルを片付ける（失敗時は警告のみ）
    try { fs.unlinkSync(kataPath); } catch (e) {
      // 片付け失敗は致命ではないため警告のみ
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: failed to remove kata diagnostic file; continuing :: ${kataPath} :: ${msg}\n`);
    }

    // 空ディレクトリなら削除してクリーンアップする（失敗時は警告のみ）
    try {
      const remains = fs.readdirSync(kataDir);
      // 残骸が無い場合のみディレクトリを削除してクリーンに保つ
      if (remains.length === 0) fs.rmdirSync(kataDir);
    } catch (e) {
      // 削除失敗は致命ではないため警告のみ
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: failed to remove kata diagnostics directory; continuing :: ${kataDir} :: ${msg}\n`);
    }
  }
}

/**
 * 単一ステップに対してコマンド実行と診断出力の整形を行い、結果配列へ追記する。
 * @param repoRoot リポジトリのルート
 * @param d 実行するステップ定義
 * @param results 出力行の集約先
 */
export function appendDiagnosticsForStep(repoRoot: string, d: StepDef, results: string[]): void {
  const OUTPUT_BASE = path.join(repoRoot, 'vibecoding', 'var', 'contexts', 'qualities');
  const unitDirs = (d.relatedUnitDirs && d.relatedUnitDirs.length > 0) ? d.relatedUnitDirs : [d.configRelDir];
  const allContextsExist = unitDirs.every((u) => fs.existsSync(path.join(OUTPUT_BASE, u, 'context.md')));
  // 既にすべての context.md が揃っている場合は診断出力をスキップする
  if (allContextsExist) return;
  const pretty = `$ ${[d.command, ...d.args].join(' ')}`;
  const r = runCommand(d.command, d.args as string[], repoRoot);
  results.push(`[SAMPLE] ${pretty}`);
  results.push(`[SAMPLE] exit=${r.status}`);
  const out = (r.stdout || '') + (r.stderr ? `\n[stderr]\n${r.stderr}` : '');
  const capped = formatCap(out);
  const cappedLines = capped.split('\n');
  // 出力の各行を前置きタグ付きで追加する
  for (const cl of cappedLines) {
    results.push(cl.trim().length === 0 ? '' : `[SAMPLE] ${cl}`);
  }
}

/**
 * 診断出力をファイルへ保存し、標準出力へ ASCII セーフ版を出力する。
 * @param repoRoot リポジトリのルート
 * @param diagnostics 診断行配列
 */
export function saveDiagnostics(repoRoot: string, diagnostics: string[]): void {
  const full = diagnostics.join('\n');
  const diagOutFile = path.join(repoRoot, 'tmp', 'pre-common-diagnostics.md');
  // 診断ファイルを確実に保存する（失敗時は警告のみで継続）
  try {
    fs.mkdirSync(path.dirname(diagOutFile), { recursive: true });
    fs.writeFileSync(diagOutFile, full, 'utf8');
  } catch (e) {
    // 保存に失敗しても標準出力経由の共有に切り替えて継続する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[pre-common-auto-check] warn: failed to persist diagnostics; continue with stdout only :: ${diagOutFile} :: ${msg}\n`);
  }

  // 端末・CI の UTF-8 表示に合わせ、標準出力は Unicode をそのまま出力する
  process.stdout.write(`${full}\n`);
  process.stdout.write(`(full diagnostics saved: ${normalizePathForOutput(path.relative(repoRoot, diagOutFile))})\n`);
}

/**
 * PRE-COMMON 診断出力を生成し、標準出力とファイルへ出力する。
 * @param repoRoot リポジトリのルート
 */
export function emitDiagnostics(repoRoot: string): void {
  // PRE-COMMON 診断出力を生成し、必要なガイダンスを整形して出力する
  try {
    const diagnostics: string[] = [];
    diagnostics.push('----- PRE-COMMON: example code & diagnostics (exit=2) -----');
    diagnostics.push('');
    diagnostics.push('[SAMPLE] Note: The following output is a calibration sample intended to help generate the quality gate context (context.md).');
    diagnostics.push('[SAMPLE] It is not a gate violation. These are example outputs that reflect your actual qualities/** settings.');
    diagnostics.push('[SAMPLE] Diagnostics for auto-check/** do NOT block product code.');
    diagnostics.push('[SAMPLE] First create/update the mirrors at vibecoding/var/contexts/qualities/**, then re-run to obtain <start_at> <hash> (exit=0).');
    diagnostics.push('[ATTENTION PLEASE!] This is diagnostics for a temporary example file (auto-check/kata_for_auth_check.ts). It does NOT block product code.');
    diagnostics.push('[ATTENTION PLEASE!] The ONLY way to reduce diagnostics is to add/edit mirrors under vibecoding/var/contexts/** (context.md). No other path exists.');
    diagnostics.push('');
    diagnostics.push('=== Example: kata.ts (auto-generated at auto-check/kata_for_auth_check.ts for diagnostics) ===');
    diagnostics.push(KATA_TS);
    const gateResults = runGateCommandsWithKata(repoRoot);
    diagnostics.push(...gateResults);
    diagnostics.push('');
    diagnostics.push('----- end diagnostics -----');
    saveDiagnostics(repoRoot, diagnostics);
  } catch (e) {
    // 診断生成に失敗した場合は要約を標準エラーへ出力する
    process.stderr.write(`pre-common-auto-check: diagnostics error: ${String((e as Error)?.message || e)}\n`);
  }
}

