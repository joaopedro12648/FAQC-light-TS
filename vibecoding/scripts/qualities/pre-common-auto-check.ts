#!/usr/bin/env node
/**
 * @file PRE-COMMON 自動化: qualities コンテキスト鮮度チェッカー
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
 * @see vibecoding/docs/PLAYBOOK/PRE-COMMON.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
/**
 * PRE-COMMON 用ユーティリティおよび診断出力。
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stepDefs } from '../../../qualities/check-steps.ts';

/** リポジトリのプロジェクトルート（cwd） */
const PROJECT_ROOT = process.cwd();
/** 本スクリプトの配置ディレクトリ */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** スクリプトからみたリポジトリルートの絶対パス */
const REPO_ROOT_FROM_SCRIPT = path.resolve(SCRIPT_DIR, '../../..');
/** ソースの品質設定が置かれるベースディレクトリ（qualities/） */
const QUALITIES_DIR = path.join(PROJECT_ROOT, 'qualities');
/** 生成物（var/contexts/qualities）のベースパス */
const OUTPUT_BASE = path.join(PROJECT_ROOT, 'vibecoding', 'var', 'contexts', 'qualities');
/** PRE-COMMON の鮮度記録（ISO文字列）ファイルパス */
const LAST_UPDATED_FILE = path.join(OUTPUT_BASE, 'last_updated');
/** ハッシュ計算用の固定シークレット（安定性目的） */
const SECRET = 'SAT-light-TS::PRE-COMMON::v1';

// 定数
/** 診断出力の最大文字数（安全のための切り詰め上限） */
const DEFAULT_FORMAT_CAP = 8000;
/** ASCII 可視文字の下限コードポイント */
const ASCII_PRINTABLE_MIN = 32;
/** ASCII 可視文字の上限コードポイント */
const ASCII_PRINTABLE_MAX = 126;
/** 診断用サンプルコード（静的に生成） */
const KATA_TS = `// kata.ts
// 暫定対応: 必要に応じて代替実装を使い、明示的にエラーを処理する。

import { Foo } from "./types";

// TODO: そのうち直す
// FIXME: とりあえず動けばOK

var cache: any = {};

export function primesBad(limit: any, mode: any = "fast"): any {
  if (limit == null || limit < 0 || limit === "0" || (typeof limit === "string" && limit.trim() === "")) { limit = 100; }

  let arr = [];

  for (let i = 0; i <= limit; i++) {
    let ok = true;
    if (i < 2) { ok = false; }
    else {
      for (let j = 2; j * j <= i; j++) {
        if (i % j === 0) { ok = false; break; }
        else if (mode === "slow") {
          if (j % 2 === 0 && (i % (j + 1) === 0 || i % (j + 3) === 0)) { ok = (i % (j + 5) !== 0); }
          if (j % 3 === 0 && i % (j + 7) === 0) { ok = false; }
          if ((j % 5 === 0 && i % (j + 11) === 0) || (j % 7 === 0 && i % (j + 13) === 0)) { ok = false; }
        }
      }
    }
    if (ok) { arr.push(i); }
  }

  try {
    if (arr.length > 42) {
      cache["last"] = arr;
      JSON.parse("{not: 'json'}");
    }
  } catch (e) {
    // 意図的にエラーを処理（サンプル）
  }

  return arr;
}

export default function main(): any {
  const result = primesBad(17, "slow");
  console.log("result:" + result.join(",") + " | length=" + result.length + " | demo mode with alternate implementation");
  return result;
}

export const forceAny = /** @type {unknown} */ (cache);
`;

/**
 * 存在する場合にファイルを読み込む。
 * @param filePath ファイルの絶対パス
 * @returns ファイル内容。存在しない場合は null
 */
function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * ディレクトリを作成した上でファイルを書き込む。
 * @param filePath 出力先の絶対パス
 * @param content 書き込む文字列
 */
function writeFileEnsured(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * 現在時刻を ISO UTC 文字列で取得する。
 * @returns ISO UTC 文字列
 */
function toIsoUtcNow(): string {
  return new Date().toISOString();
}

/**
 * 出力用にパス区切りを正規化する。
 * @param p 正規化するパス
 * @returns 正規化後のパス文字列
 */
function normalizePathForOutput(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 直下のサブディレクトリ一覧を取得する。
 * @param baseDir ディレクトリパス
 * @returns サブディレクトリの絶対パス配列
 */
function getImmediateSubdirs(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) return [];
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(baseDir, d.name));
}

/**
 * ディレクトリ配下のファイルを再帰的に列挙する。
 * @param dir ルートディレクトリ
 * @returns ファイルの絶対パス配列
 */
function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries: fs.Dirent[] | undefined;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // 読み取れないディレクトリはスキップ
    }

    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * ファイル群の mtime の最大値を求める。
 * @param filePaths ファイルパス配列
 * @returns 最大小数ミリ秒
 */
function getMaxMtimeMs(filePaths: string[]): number {
  let maxMs = 0;
  for (const fp of filePaths) {
    try {
      const st = fs.statSync(fp);
      const ms = st.mtimeMs ?? new Date(st.mtime).getTime();
      if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
    } catch {
      // 無視
    }
  }

  return maxMs;
}

/**
 * ミラー対象となる qualities/** 配下のディレクトリを収集する。
 * @returns ディレクトリの絶対パス配列
 */
function collectTargetDirs(): string[] {
  const result: string[] = [];

  // 1) qualities/policy/*
  const policyDir = path.join(QUALITIES_DIR, 'policy');
  const policyChildren = getImmediateSubdirs(policyDir);
  result.push(...policyChildren);

  // 2) qualities/eslint/* (exclude _shared)
  const eslintDir = path.join(QUALITIES_DIR, 'eslint');
  const eslintChildren = getImmediateSubdirs(eslintDir).filter((d) => path.basename(d) !== '_shared');
  result.push(...eslintChildren);

  // 3) qualities/* (exclude directories already mentioned: 'policy', 'eslint')
  const topLevel = getImmediateSubdirs(QUALITIES_DIR).filter((d) => {
    const name = path.basename(d);
    return name !== 'policy' && name !== 'eslint';
  });
  result.push(...topLevel);

  // 順序を保ったまま重複を除去
  const seen = new Set<string>();
  return result.filter((d) => {
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}

/**
 * context 再生成が必要な qualities ディレクトリを算出する。
 * @param targetDirs qualities/** 配下の絶対ディレクトリ群
 * @returns 更新が必要な src->dest の対応表
 */
function computeNeededMappings(targetDirs: string[]): Array<{ srcDir: string; destDir: string }> {
  const mappings: Array<{ srcDir: string; destDir: string }> = [];
  for (const srcDir of targetDirs) {
    const rel = path.relative(QUALITIES_DIR, srcDir);
    const destDir = path.join(OUTPUT_BASE, rel);

    const allFiles = listFilesRecursive(srcDir);
    const compareFiles = allFiles.filter((f) => {
      const b = path.basename(f).toLowerCase();
      return !(b === 'context.yaml' || b === 'context.md');
    });
    const maxMtime = getMaxMtimeMs(compareFiles);

    const destYaml = path.join(destDir, 'context.yaml');
    const destMd = path.join(destDir, 'context.md');
    const requiresUpdate = (targetPath: string): boolean => {
      try {
        const st = fs.statSync(targetPath);
        const ms = st.mtimeMs ?? new Date(st.mtime).getTime();
        return !(Number.isFinite(ms) && ms > maxMtime);
      } catch {
        return true;
      }
    };

    if (requiresUpdate(destYaml) || requiresUpdate(destMd)) {
      const srcOut = normalizePathForOutput(path.relative(PROJECT_ROOT, srcDir));
      const destOut = normalizePathForOutput(path.relative(PROJECT_ROOT, destDir));
      mappings.push({ srcDir: srcOut, destDir: destOut });
    }
  }

  return mappings;
}

/** 必須ディレクトリの存在を確認する。 */
function ensurePreconditions(): void {
  if (!fs.existsSync(QUALITIES_DIR) || !fs.statSync(QUALITIES_DIR).isDirectory()) {
    process.stderr.write('pre-common-auto-check: qualities not found.\n');
    process.exit(1);
  }
}

/**
 * 鮮度マーカーを書き出し、開始時刻を返す。
 * @returns 書き出した ISO UTC 文字列
 */
function writeLastUpdated(): string {
  // Keep baseline read for potential future diff logic (currently unused)
  readFileIfExists(LAST_UPDATED_FILE);
  const startAt = toIsoUtcNow();
  try {
    writeFileEnsured(LAST_UPDATED_FILE, `${startAt}\n`);
  } catch (e) {
    process.stderr.write(`pre-common-auto-check: failed to write last_updated: ${String((e as Error)?.message || e)}\n`);
    process.exit(1);
  }

  return startAt;
}

/**
 * ルーブリックチェッカーを実行する。違反がある場合に true を返す。
 * @returns ルーブリック違反が検出されたか
 */
function checkRubric(): boolean {
  const rubricChecker = path.join(PROJECT_ROOT, 'vibecoding', 'scripts', 'qualities', 'context-md-rubric.ts');
  if (!fs.existsSync(rubricChecker)) return false;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRootFromScript = path.resolve(scriptDir, '../../..');
  const tsxLoaderFsPath = path.join(repoRootFromScript, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  // Windows の Node >=20 では file:// URL を優先
  const tsxLoaderArg = fs.existsSync(tsxLoaderFsPath) ? pathToFileURL(tsxLoaderFsPath).href : null;

  // 試行1: node --import <file://loader> rubric.ts
  if (tsxLoaderArg) {
    const res1 = spawnSync(process.execPath, ['--import', tsxLoaderArg, rubricChecker], { stdio: 'pipe', encoding: 'utf8' });
    if (typeof res1.status === 'number' && res1.status === 0) return false; // compliant
  }

  // 試行2: npx -y tsx rubric.ts（クロスプラットフォーム代替）
  const res2 = spawnSync('npx', ['-y', 'tsx', rubricChecker], { stdio: 'pipe', encoding: 'utf8', shell: true });
  return !(typeof res2.status === 'number' && res2.status === 0);
}

/**
 * ゲートアクションを出力し適切に終了する。
 * @param startAt 開始時刻（ISO）
 * @param mappings 必要な src->dest の対応
 * @param rubricViolation ルーブリック違反の有無
 */
function outputAndExit(startAt: string, mappings: Array<{ srcDir: string; destDir: string }>, rubricViolation: boolean): void {
  if (mappings.length === 0 && !rubricViolation) {
    const hash = crypto.createHash('sha256').update(startAt + SECRET).digest('hex');
    process.stdout.write(`${startAt} ${hash}\n`);
    process.exit(0);
  }

  for (const m of mappings) {
    process.stdout.write(`[GATE] ${m.srcDir} => ${m.destDir}\n`);
  }

  if (rubricViolation && mappings.length === 0) {
    process.stdout.write('[GATE] contexts/qualities => vibecoding/var/contexts/qualities  # rubric noncompliant\n');
  }

  // 診断は、少なくとも1つ以上の対象ユニットで context.md が存在しない場合のみ出力する。
  if (!allTargetContextMdExist()) {
    emitDiagnostics();
  }

  process.exit(2);
}

/**
 * 診断の可読性のため長い文字列を切り詰める。
 * @param s 入力文字列
 * @param cap 省略前の最大長
 * @returns 省略後の文字列
 */
function formatCap(s: string, cap = DEFAULT_FORMAT_CAP): string {
  if (!s) return '';
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)  }\n... (truncated)\n`;
}

// stepDefs 統合後に未使用となった runNpmScript を削除

/**
 * コマンドを同期実行する。
 * @param command 実行ファイル
 * @param args 引数
 * @param cwd 作業ディレクトリ
 * @returns status/stdout/stderr を持つ結果
 */
function runCommand(command: string, args: string[], cwd?: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(command, args, { encoding: 'utf8', shell: true, cwd });
  const status = typeof res.status === 'number' ? res.status : 1;
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  return { status, stdout, stderr };
}

/**
 * 代表的なゲートコマンドを実行しサンプル出力を返す。
 * @param _pkgJson 予約引数（将来用）
 * @returns 診断出力用の行
 */
function runGateCommandsWithKata(_pkgJson: unknown): string[] {
  const kataDir = path.join(PROJECT_ROOT, 'auto-check');
  const kataPath = path.join(kataDir, 'kata_for_auth_check.ts');
  fs.mkdirSync(kataDir, { recursive: true });
  fs.writeFileSync(kataPath, KATA_TS, 'utf8');
  try {
  // 診断には stepDefs を使用（runMode が 'diagnostics' または 'both'。'test' と 'build' は除外）
    const steps = stepDefs.filter((d) => (d.runMode === 'diagnostics' || d.runMode === 'both') && d.id !== 'test' && d.id !== 'build');
    const results: string[] = [];
    results.push('');
    results.push('[SAMPLE] === Gate command outputs ===');
    for (const d of steps) {
      results.push('');
      appendDiagnosticsForStep(d, results);
    }

    return results;
  } finally {
    try { fs.unlinkSync(kataPath); } catch {}

    try {
      const remains = fs.readdirSync(kataDir);
      if (remains.length === 0) fs.rmdirSync(kataDir);
    } catch {}
  }
}

/**
 * 単一ステップの診断を追記する。
 * @param d ステップ定義
 * @param results 出力の蓄積先
 */
function appendDiagnosticsForStep(d: typeof stepDefs[number], results: string[]): void {
  // すべての対応ユニットに context.md が存在する場合、診断を抑止
  const unitDirs = (d.relatedUnitDirs && d.relatedUnitDirs.length > 0) ? d.relatedUnitDirs : [d.configRelDir];
  const allContextsExist = unitDirs.every((u) => fs.existsSync(path.join(OUTPUT_BASE, u, 'context.md')));
  if (allContextsExist) return;
  const { lines, result } = runStepDef(d.command, d.args as string[]);
  for (const ln of lines) {
    results.push(`[SAMPLE] ${ln}`);
  }

  results.push(`[SAMPLE] exit=${result.status}`);
  const out = (result.stdout || '') + (result.stderr ? `\n[stderr]\n${result.stderr}` : '');
  const capped = formatCap(out, DEFAULT_FORMAT_CAP);
  const cappedLines = capped.split('\n');
  for (const cl of cappedLines) {
    if (cl.trim().length === 0) {
      results.push('');
    } else {
      results.push(`[SAMPLE] ${cl}`);
    }
  }
}

/**
 * 診断を var 出力に保存し標準出力へ出力する。
 * @param diagnostics 出力する行
 */
function saveDiagnostics(diagnostics: string[]): void {
  const full = diagnostics.join('\n');
  const diagOutFile = path.join(PROJECT_ROOT, 'tmp', 'pre-common-diagnostics.md');
  try {
    fs.mkdirSync(path.dirname(diagOutFile), { recursive: true });
    fs.writeFileSync(diagOutFile, full, 'utf8');
  } catch {}

  const ascii = toAsciiPrintable(full);
  process.stdout.write(`${ascii  }\n`);
  if (diagOutFile) {
    process.stdout.write(`(full diagnostics saved: ${normalizePathForOutput(path.relative(PROJECT_ROOT, diagOutFile))})\n`);
  }
}

/**
 * 単一のステップ定義を実行する。
 * @param command 実行ファイル
 * @param args 引数
 * @returns 整形済みコマンド行と結果
 */
function runStepDef(command: string, args: string[]): { lines: string[]; result: { status: number; stdout: string; stderr: string } } {
  const pretty = `$ ${[command, ...args].join(' ')}`;
  const r = runCommand(command, args, REPO_ROOT_FROM_SCRIPT);
  return { lines: [pretty], result: r };
}

/** 合成した診断サンプルブロックを出力する。 */
function emitDiagnostics(): void {
  try {
    const diagnostics: string[] = [];
    diagnostics.push('----- PRE-COMMON: example code & diagnostics (exit=2) -----');
    diagnostics.push('');
    diagnostics.push('[SAMPLE] Note: The following output is a calibration sample intended to help generate the quality gate context (context.yaml/context.md).');
    diagnostics.push('[SAMPLE] It is not a gate violation. These are example outputs that reflect your actual qualities/** settings.');
    diagnostics.push('[SAMPLE] Diagnostics for auto-check/** do NOT block product code.');
    diagnostics.push('[SAMPLE] First create/update the mirrors at vibecoding/var/contexts/qualities/**, then re-run to obtain <start_at> <hash> (exit=0).');
    diagnostics.push('[ATTENTION PLEASE!] This is diagnostics for a temporary example file (auto-check/kata_for_auth_check.ts). It does NOT block product code.');
    diagnostics.push('[ATTENTION PLEASE!] The ONLY way to reduce diagnostics is to add/edit mirrors under vibecoding/var/contexts/** (context.yaml/context.md). No other path exists.');
    diagnostics.push('');
    diagnostics.push('=== Example: kata.ts (auto-generated at auto-check/kata_for_auth_check.ts for diagnostics) ===');
    diagnostics.push(KATA_TS);
    const gateResults = runGateCommandsWithKata(undefined as never);
    diagnostics.push(...gateResults);
    diagnostics.push('');
    diagnostics.push('----- end diagnostics -----');
    saveDiagnostics(diagnostics);
  } catch (e) {
    process.stderr.write(`pre-common-auto-check: diagnostics error: ${String((e as Error)?.message || e)}\n`);
  }
}

/**
 * vibecoding/var/contexts/(...)/context.yaml を走査し、対象ファイル一覧を返す。
 * @returns context.yaml のパス配列
 */
function collectVarContextYamlFiles(): string[] {
  const base = OUTPUT_BASE; // vibecoding/var/contexts/qualities
  const otherRoots = [
    path.resolve(PROJECT_ROOT, 'vibecoding', 'var', 'contexts'),
  ];
  const roots = Array.from(new Set([base, ...otherRoots]));
  const files: string[] = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const all = listFilesRecursive(r);
    for (const f of all) {
      if (path.basename(f) === 'context.yaml') files.push(f);
    }
  }

  return Array.from(new Set(files));
}

/**
 * 単一 YAML ファイルからインデント0のキー出現を抽出し、重複を返す。
 * @param filePath 対象ファイル
 * @returns 重複配列（keyと行番号）
 */
function detectTopLevelKeyDuplicates(filePath: string): Array<{ key: string; lines: number[] }> {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const keyToLines = new Map<string, number[]>();
  for (let i = 0; i < lines.length; i++) processTopLevelYamlLine(String(lines[i] ?? ''), i, keyToLines);
  const dups: Array<{ key: string; lines: number[] }> = [];
  for (const [k, occ] of keyToLines.entries()) {
    if (occ.length > 1) dups.push({ key: k, lines: occ });
  }

  return dups;
}

/**
 * 単一行のトップレベルYAMLキーを集計
 * @param ln 行文字列
 * @param idx 行番号0始まり
 * @param keyToLines キー→出現行のマップ
 */
function processTopLevelYamlLine(ln: string, idx: number, keyToLines: Map<string, number[]>): void {
  if (!ln || /^\s*$/.test(ln) || /^\s*#/.test(ln)) return;
  if (/^[\t\s]/.test(ln)) return;
  const m = ln.match(/^([A-Za-z0-9_\-]+)\s*:/);
  if (!m || typeof m[1] !== 'string') return;
  const key: string = m[1];
  const arr = keyToLines.get(key) ?? [];
  arr.push(idx + 1);
  keyToLines.set(key, arr);
}

/**
 * 重複検出の結果を表示用メッセージに整形する。
 * @returns メッセージ配列
 */
function buildDuplicateMessages(): string[] {
  const files = collectVarContextYamlFiles();
  const out: string[] = [];
  for (const fp of files) {
    const dups = detectTopLevelKeyDuplicates(fp);
    if (dups.length === 0) continue;
    const rel = normalizePathForOutput(path.relative(PROJECT_ROOT, fp));
    out.push(`[GATE] Duplicate top-level keys detected in ${rel}`);
    for (const d of dups) {
      out.push(` - key: ${d.key} @ lines ${d.lines.join(', ')}`);
    }
  }

  if (out.length > 0) {
    out.push('[GATE] Action: Merge into a single YAML document without repeating top-level keys.');
  }

  return out;
}

/**
 * 監視対象のすべてのユニットに context.md が存在するかを返す。
 * @returns boolean 全ユニットに context.md が存在する場合は true、それ以外は false
 */
function allTargetContextMdExist(): boolean {
  const targetDirs = collectTargetDirs();
  for (const srcDir of targetDirs) {
    const rel = path.relative(QUALITIES_DIR, srcDir);
    const destDir = path.join(OUTPUT_BASE, rel);
    const destMd = path.join(destDir, 'context.md');
    try {
      if (!fs.existsSync(destMd)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * ログの安全性のため非 ASCII 文字を置換する。
 * @param s 入力文字列
 * @returns ASCII セーフな文字列
 */
function toAsciiPrintable(s: string): string {
  const replaced = s
    .replace(/[✓✔✅]/g, '[OK]')
    .replace(/[✗❌]/g, '[NG]');
  let out = '';
  for (const ch of replaced) {
    const code = ch.codePointAt(0);
    if (code !== undefined && ((code >= ASCII_PRINTABLE_MIN && code <= ASCII_PRINTABLE_MAX) || ch === '\n' || ch === '\r' || ch === '\t')) {
      out += ch;
    } else {
      out += '?';
    }
  }

  return out;
}

/**
 * var 配下の context.md / context-review.md の組を検出する。
 * @returns ファイルペアの配列
 */
function findContextReviewPairs(): Array<{ contextMd: string; reviewMd: string }> {
  if (!fs.existsSync(OUTPUT_BASE)) return [];
  const files = listFilesRecursive(OUTPUT_BASE);
  const contextMds = files.filter((f) => path.basename(f) === 'context.md');
  const pairs: Array<{ contextMd: string; reviewMd: string }> = [];
  for (const contextMd of contextMds) {
    const reviewMd = path.join(path.dirname(contextMd), 'context-review.md');
    if (fs.existsSync(reviewMd)) {
      pairs.push({ contextMd, reviewMd });
    }
  }

  return pairs;
}

/**
 * 検出した組に対するレビュー衝突メッセージを出力する。
 * @param pairs 検出したペア
 */
function emitReviewConflictMessages(pairs: Array<{ contextMd: string; reviewMd: string }>): void {
  for (const { contextMd, reviewMd } of pairs) {
    const ctx = normalizePathForOutput(path.relative(PROJECT_ROOT, contextMd));
    const rev = normalizePathForOutput(path.relative(PROJECT_ROOT, reviewMd));
    const msg = [
      `A review file exists for the quality gate context file ${ctx}.`,
      `Review file: ${rev}.`,
      '',
      `[Required action per .cursorrules: "quality gate context update"]`,
      `- Do NOT create an "incorporate" section or paste the review verbatim.`,
      `- Scope: This review applies ONLY to its sibling context file (${ctx}). Do not use it to update any other context.md in other directories.`,
      `- Read and digest the review, then update ${ctx} itself by:`,
      `  - refining rules/thresholds and scope,`,
      `  - adding OK/NG minimal examples, decisions, and anti-patterns,`,
      `  - refreshing citations to qualities/** (relative path + excerpt/value) to match current settings,`,
      `  - integrating into existing sections (Where/What/How/Rubric); keep ${ctx} canonical.`,
      `- After integrating, delete ${rev} and re-run: npm run -s check:pre-common.`,
      `  (It will keep failing with exit=2 while any context-review.md exists. Success prints "<StartAt> <hash>" with exit=0.)`,
      `- No relaxations or bypasses (see "no_relaxation" policy). This failure enforces synthesis, not copy-paste.`
    ].join('\n');
    process.stdout.write(`${msg  }\n`);
  }
}

/** エントリポイント。鮮度チェックを実行して終了する。 */
function main(): void {
  ensurePreconditions();
  const startAt = writeLastUpdated();
  const mappings = computeNeededMappings(collectTargetDirs());
  const rubricViolation = checkRubric();
  const dupMsgs = buildDuplicateMessages();
  const dupViolation = dupMsgs.length > 0;
  if (dupViolation) {
    for (const m of dupMsgs) process.stdout.write(`${m  }\n`);
  }

  // Post-pass review detection: only run when other checks are satisfied
  if (mappings.length === 0 && !rubricViolation && !dupViolation) {
    const reviewPairs = findContextReviewPairs();
    if (reviewPairs.length > 0) {
      emitReviewConflictMessages(reviewPairs);
      process.exit(2);
    }
  }

  if (mappings.length === 0 && !rubricViolation && dupViolation) {
    // 重複のみで Fail（他の理由が無い場合）
    process.exit(2);
  }

  outputAndExit(startAt, mappings, rubricViolation);
}

try {
  main();
} catch (e) {
  process.stderr.write(`pre-common-auto-check: fatal error: ${String((e as Error)?.message || e)}\n`);
  process.exit(1);
}

