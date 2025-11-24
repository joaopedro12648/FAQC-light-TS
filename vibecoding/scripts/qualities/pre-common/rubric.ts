/**
 * @file PRE-COMMON ルーブリック実行と要約整形
 * - 目的: context-md-rubric の結果を呼び出して要約・ガイダンスを出力
 * - 実行: tsx ローダ優先、必要時は npx tsx を使用
 * - 出力: 重複構造の検出時は置換原則のガイダンスを先出し
 * - 整形: 代表行のみを抽出しノイズを抑制
 * - 安全: チェッカー不在時は違反なし扱いで継続
 * - 設計: 呼び出し側の PRE-COMMON 出力に組み込まれる想定
 * - 依存: Node.js child_process, fs, path, url
 * - 検証: 実行結果は RubricResult へ正規化
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** ルーブリック実行結果を表す構造体。 */
export interface RubricResult {
  /** ルーブリック違反の有無（true なら違反あり） */
  hasViolation: boolean;
  /** 代表的な要約行（先頭 N 行） */
  summaryLines: string[];
}

/** 要約の最大長（文字数） */
const DEFAULT_FORMAT_CAP = 8000;
/** サマリ出力の最大行数 */
const RUBRIC_SUMMARY_MAX_LINES = 10;

/**
 * 代表行に重複構造（複数セクション/マニフェスト）が含まれるかを判定する。
 * @param summaryLines ルーブリックの要約行
 * @returns 重複要素が含まれていれば true
 */
export function includesDuplicateStructureViolation(summaryLines: string[]): boolean {
  const body = (summaryLines || []).join('\n').toLowerCase();
  return (
    body.includes('structure: duplicated h1') ||
    body.includes('structure: multiple why') ||
    body.includes('structure: multiple where') ||
    body.includes('structure: multiple what') ||
    body.includes('structure: multiple how') ||
    body.includes('structure: multiple "quality context hash manifest"') ||
    body.includes('multiple yaml fenced blocks') ||
    body.includes('duplicate sections') ||
    body.includes('multiple sections detected')
  );
}

/**
 * 重複構造の検出時に置換原則のガイダンスを出力する。
 * @param rubric ルーブリック結果
 */
export function emitDuplicateGuidanceIfNeeded(rubric: RubricResult): void {
  // 重複構造が検出された場合は置換原則のガイダンスを先に出す
  if (rubric.hasViolation && includesDuplicateStructureViolation(rubric.summaryLines)) {
    process.stdout.write(`[GATE] duplicate sections/manifest detected → replace (not append) the context.md structure.\n`);
    process.stdout.write(`- Ensure single H1, single Why/Where/What/How, and single "Quality Context Hash Manifest" section.\n`);
  }
}

/**
 * プロセスの終了コードと出力から RubricResult を構築する。
 * @param status 終了コード
 * @param stdout 標準出力
 * @param stderr 標準エラー
 * @returns RubricResult または null（status が null の場合）
 */
export function buildRubricResultFromProcess(status: number | null, stdout: string, stderr: string): RubricResult | null {
  // status が null の場合は評価不能として終了する
  if (status === null) return null;
  // 成功終了なら違反なしとして返す
  if (status === 0) return { hasViolation: false, summaryLines: [] };
  const summary = formatCap((stderr || stdout || '').trim(), DEFAULT_FORMAT_CAP);
  const firstLines = summary
    .split('\n')
    .slice(0, RUBRIC_SUMMARY_MAX_LINES)
    .map((ln) => `[RUBRIC] ${ln}`);
  return { hasViolation: true, summaryLines: firstLines };
}

/**
 * Node の --import ローダを用いて rubric チェッカーを実行する。
 * @param rubricChecker チェッカーのパス
 * @param tsxLoaderArg tsx ローダの file:// URL
 * @returns 実行結果
 */
export function runRubricWithLoader(rubricChecker: string, tsxLoaderArg: string): RubricResult | null {
  const res = spawnSync(process.execPath, ['--import', tsxLoaderArg, rubricChecker], { stdio: 'pipe', encoding: 'utf8' });
  return buildRubricResultFromProcess(
    typeof res.status === 'number' ? res.status : null,
    res.stdout || '',
    res.stderr || '',
  );
}

/**
 * npx tsx で rubric チェッカーを実行するフォールバック。
 * @param rubricChecker チェッカーのパス
 * @returns 実行結果
 */
export function runRubricWithNpx(rubricChecker: string): RubricResult | null {
  const res = spawnSync('npx', ['-y', 'tsx', rubricChecker], { stdio: 'pipe', encoding: 'utf8', shell: true });
  return buildRubricResultFromProcess(
    typeof res.status === 'number' ? res.status : null,
    res.stdout || '',
    res.stderr || '',
  );
}

/**
 * プロジェクトルートから rubric チェッカーを探して実行し、結果を返す。
 * @param PROJECT_ROOT ルートディレクトリ
 * @returns RubricResult
 */
export function checkRubric(PROJECT_ROOT: string): RubricResult {
  const rubricChecker = path.join(PROJECT_ROOT, 'vibecoding', 'scripts', 'qualities', 'context-md-rubric.ts');
  // チェッカーが無ければ違反なし扱いで継続する
  if (!fs.existsSync(rubricChecker)) return { hasViolation: false, summaryLines: [] };
  const tsxLoaderFsPath = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  const tsxLoaderArg = fs.existsSync(tsxLoaderFsPath) ? pathToFileURL(tsxLoaderFsPath).href : null;
  let result: RubricResult | null = null;
  // tsx ローダが利用可能なら Node --import で実行して高速化する
  if (tsxLoaderArg) {
    result = runRubricWithLoader(rubricChecker, tsxLoaderArg);
  }

  result ||= runRubricWithNpx(rubricChecker);
  return result ?? { hasViolation: false, summaryLines: [] };
}

/**
 * ルーブリック違反がある場合に代表行を出力する。
 * @param rubric ルーブリック結果
 */
export function emitRubricSummary(rubric: RubricResult): void {
  // 違反があり要約が存在するときのみ代表行を出力する
  if (rubric.hasViolation && rubric.summaryLines.length > 0) {
    // 代表行のみを出力してノイズを抑制する
    for (const ln of rubric.summaryLines) {
      process.stdout.write(`${ln}\n`);
    }
  }
}

/**
 * 長い文字列を上限長で切り詰める。
 * @param s 対象文字列
 * @param cap 上限長
 * @returns 切り詰め後の文字列
 */
function formatCap(s: string, cap = DEFAULT_FORMAT_CAP): string {
  // 入力が空の場合はそのまま空文字を返す（表示上の冗長さを避ける）
  if (!s) return '';
  // 既に上限以下なら原文をそのまま返す
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}\n... (truncated)\n`;
}

