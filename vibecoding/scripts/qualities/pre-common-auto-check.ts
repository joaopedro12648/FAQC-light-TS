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
/** PRE-COMMON 用ユーティリティおよび診断出力。 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stepDefs } from '../../../qualities/check-steps.ts';
import {
  collectUnitSources,
  computeUnitDigests,
  type UnitDigestInfo,
  type UnitSources,
} from './context-hash-manifest.ts';

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
/** YAML 近傍探索で参照するハッシュ行の前方探索幅（行数） */
const NEARBY_HASH_LOOKAHEAD = 4;
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

  // 診断生成と後始末を例外で分離し、代表出力収集と後始末を確実化する
  try {
    if (arr.length > 42) {

      cache["last"] = arr;
      JSON.parse("{not: 'json'}");
    }
  } catch (e) {
    // 意図的にエラーを処理（サンプル）: デモ用コードが例外を握り潰していることを明示しつつログへ残す
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      '[pre-common-auto-check:demo] intentionally swallowed error in primesBad demo :: ' + msg + '\n',
    );
  }

  return arr;
}

export default function main(): any {
  const result = primesBad(17, "slow");
  console.log("result:" + result.join(",") + " | length=" + result.length + " | demo mode with alternate implementation");
  return result;
}

export const forceAny = /** @type {unknown} 。*/ (cache);
`;

/**
 * 存在する場合にファイルを読み込む。
 * @param filePath ファイルの絶対パス
 * @returns ファイル内容。存在しない場合は null
 */
function readFileIfExists(filePath: string): string | null {
  // 必要に応じてファイルを読み込み、存在確認と同時に内容を取得する
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // 読み取り失敗は未検出として扱い上位のロジックで継続する
    process.stderr.write(`[pre-common-auto-check] warn: readFileIfExists failed; treat as not existing :: ${filePath}\n`);
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
 * ディレクトリ配下のファイルを再帰的に列挙する。
 * @param dir ルートディレクトリ
 * @returns ファイルの絶対パス配列
 */
function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // 未処理のディレクトリが残る限り探索を継続し対象ファイルを収集する
  while (stack.length > 0) {
    const current = stack.pop();
    // 無効な参照に遭遇した場合は探索を中断して次へ進む
    if (!current) break;
    let entries: fs.Dirent[] | undefined;
    // 配下のエントリ一覧を取得して探索キューを拡張する
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      // 読み取り失敗は当該ディレクトリのみ除外して探索を継続するが、どの経路で失敗したかをログに残す
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: listFilesRecursive skipped unreadable directory :: ${current} :: ${msg}\n`);
      continue;
    }

    // 子エントリを順に評価し、スタック/結果へ反映して探索を継続する
    for (const e of entries) {
      const full = path.join(current, e.name);
      // ディレクトリは後続探索へ積み、ファイルは結果へ追加する
      if (e.isDirectory()) {
        // サブディレクトリは後続探索のためスタックへ積む
        stack.push(full);
      } else if (e.isFile()) {
        // 収集対象のファイルを結果集合へ追加する
        files.push(full);
      }
    }
  }

  return files;
}

// NOTE: mtime ベースの鮮度判定は unitDigest ベースへ移行済みのため、過去実装の getMaxMtimeMs は削除した。

/**
 * ユニットごとの src ラベルと context.md パスを生成する。
 * @param unit ユニット ID
 * @param srcDirs 対象 qualities/** ディレクトリ群
 * @returns src 表示ラベル / context.md パス / 出力用パス
 */
function buildMappingLabel(unit: string, srcDirs: string[]): { srcLabel: string; contextMdPath: string; destOut: string } {
  const destDir = path.join(OUTPUT_BASE, unit);
  const contextMdPath = path.join(destDir, 'context.md');
  const srcOutBases = srcDirs.map((d) => normalizePathForOutput(path.relative(PROJECT_ROOT, d)));
  const srcLabel = srcOutBases.length > 0 ? `qualities/* (${unit}): ${srcOutBases.join(', ')}` : `qualities/* (${unit})`;
  const destOut = normalizePathForOutput(path.relative(PROJECT_ROOT, contextMdPath));
  return { srcLabel, contextMdPath, destOut };
}

/**
 * 単一ユニットの context.md が unitDigest ベースで更新不要かどうかを判定する。
 * @param contextMdPath 対象 context.md のパス
 * @param digestInfo 現在の hash manifest 情報（null の場合は未整備扱い）
 * @returns 更新が必要なら true、最新なら false
 */
function shouldUpdateContextForUnit(contextMdPath: string, digestInfo: UnitDigestInfo | undefined): boolean {
  // context.md が存在しない、または digest 情報自体が無い場合は hash manifest が未整備のため更新が必要
  if (!fs.existsSync(contextMdPath) || !digestInfo) {
    return true;
  }

  const text = readFileIfExists(contextMdPath);
  // context.md が空や読み取り不能な場合も、鏡像が未整備として再生成を要求する
  if (!text) return true;

  const digestMatch = text.match(/###\s*Quality Context Hash Manifest[\s\S]*?```yaml([\s\S]*?)```/m);
  const yamlBlock = digestMatch?.[1] ?? '';
  const recordedDigestMatch = yamlBlock.match(/^\s*unitDigest:\s*"?(?<digest>[0-9a-fA-F]+)"?\s*$/m);
  const recordedDigest = recordedDigestMatch?.groups?.digest;

  // unitDigest 欄の存在と形式だけを切り出して判定し、内容バージョン識別が可能かどうかを確認する
  const hasValidDigest = hasValidUnitDigest(digestMatch, recordedDigest);
  // unitDigest が不正な場合はそのユニットの鏡像全体を再生成して品質コンテキストを最新化する
  if (!hasValidDigest) return true;

  // qualities/** 側から再計算した digest と context.md 内の unitDigest が一致しない場合は再生成が必要
  if (recordedDigest !== digestInfo.unitDigest) return true;
  return false;
}

/**
 * manifest セクションと unitDigest の組が「形式的に有効かどうか」を判定する。
 * @param digestMatch Quality Context Hash Manifest セクションのマッチ結果
 * @param recordedDigest unitDigest フィールドに記録された文字列
 * @returns 有効な unitDigest が存在する場合は true、それ以外は false
 */
function hasValidUnitDigest(digestMatch: RegExpMatchArray | null, recordedDigest: string | undefined): boolean {
  // manifest セクションが存在しない場合は hash manifest 自体が欠落しているとみなす
  if (!digestMatch) return false;
  // unitDigest フィールドが欠落している場合は内容バージョンを一意に識別できない
  if (!recordedDigest) return false;
  // unitDigest が 16 進文字列以外の場合は破損として扱い再生成の対象とする
  if (!/^[0-9a-fA-F]+$/.test(recordedDigest)) return false;
  return true;
}

/**
 * context 再生成が必要なユニットを unitDigest ベースで算出する。
 * @param unitSources ユニットごとの qualities/** ソースディレクトリ群
 * @param digests 現在の hash manifest 情報
 * @returns 更新が必要な src->dest の対応表（context.md ファイルパスを含む）
 */
function computeNeededMappingsByDigest(unitSources: UnitSources[], digests: UnitDigestInfo[]): Array<{ srcDir: string; destDir: string; reasons: string[] }> {
  const mappings: Array<{ srcDir: string; destDir: string; reasons: string[] }> = [];
  const digestByUnit = new Map<string, UnitDigestInfo>();

  // 各ユニットの unitDigest 情報をマップ化し、後続のループで高速に参照できるようにする
  digests.forEach((d) => {
    digestByUnit.set(d.unit, d);
  });

  // 各ユニットごとに hash manifest と context.md の unitDigest の整合性を確認し、更新が必要な鏡像のみを GATE 出力へ載せる
  for (const { unit, srcDirs } of unitSources) {
    const digestInfo = digestByUnit.get(unit);
    const { srcLabel, contextMdPath, destOut } = buildMappingLabel(unit, srcDirs);

    // 各ユニット単位で context.md の内容が現在の qualities/** に対応しているかを判定し、更新が必要なものだけを mappings に追加する
    const needsUpdate = shouldUpdateContextForUnit(contextMdPath, digestInfo);
    // 再生成が必要なユニットのみを mappings に追加し、利用者へ明示的に更新対象を伝える
    if (needsUpdate) {
      // expire 理由（SoT 側の追加/削除/変更）を抽出するヘルパーを用いて差分を収集する
      const reasons = computeExpireReasons(contextMdPath, digestInfo);
      // SnD: 不一致/欠落時は派生物の mirror を expire（削除）して再作成フローへ誘導する
      try {
        const ctxDir = path.dirname(contextMdPath);
        const reviewPath = path.join(ctxDir, 'context-review.md');
        // context.md が残存している場合は古い mirror を除去して再作成を強制する
        if (fs.existsSync(contextMdPath)) {
          fs.unlinkSync(contextMdPath);
        }

        // 隣接する review がある場合は併せて削除し、レビュー統合の重複や分岐を抑止する
        // 目的: 重複防止 / 前提: review が存在する場合のみ / 例外: 削除失敗は警告で継続
        if (fs.existsSync(reviewPath)) {
          fs.unlinkSync(reviewPath);
        }
      } catch (e) {
        // 削除失敗は致命ではないため継続するが、状況を警告として記録する
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[pre-common-auto-check] warn: failed to expire context files; continuing :: ${normalizePathForOutput(path.relative(PROJECT_ROOT, contextMdPath))} :: ${msg}\n`);
      }

      mappings.push({ srcDir: srcLabel, destDir: destOut, reasons });
    }
  }

  return mappings;
}

/**
 * 前回の manifest（var 側 context.md 内）と現行 SoT の digest 結果を比較し、expire 理由（追加/削除/変更）を全件返す。
 * @param contextMdPath var 側 context.md の絶対パス
 * @param digestInfo 現行 SoT に基づく digest 情報
 * @returns 理由行（[REASON] + / - / ~ path）の配列
 */
function computeExpireReasons(contextMdPath: string, digestInfo: UnitDigestInfo | undefined): string[] {
  const reasons: string[] = [];

  // 理由抽出の I/O を隔離し、失敗時も安全に継続するための try ブロック
  try {
    const yamlBody = readPreviousManifestYaml(contextMdPath);
    // manifest が欠落している場合は新規作成が必要である旨を理由として返す
    if (yamlBody === null) {
      reasons.push('[REASON] previous manifest not found (fresh mirror required)');
      return reasons;
    }

    const prevFiles = parseManifestFilesFromYaml(yamlBody);
    const currFiles = toCurrentFilesList(digestInfo);
    const diffs = diffManifestFiles(prevFiles, currFiles);
    reasons.push(...diffs);

    // 差分が見つからない場合のフォールバック（unitDigest 不一致など形式的理由）
    if (reasons.length === 0) {
      reasons.push('[REASON] unitDigest mismatch or invalid; mirror must be refreshed');
    }
  } catch {
    // 旧 manifest の読み取りに失敗した場合も理由を明示し、以降の処理を継続する
    reasons.push('[REASON] unable to read previous context manifest (expired)');
  }

  return reasons;
}

/**
 * var 側 context.md から Quality Context Hash Manifest の YAML 本文を抽出して返す（無ければ null）。
 * @param contextMdPath 対象の context.md 絶対パス
 * @returns YAML フェンス内の本文。見つからない場合は null
 */
function readPreviousManifestYaml(contextMdPath: string): string | null {
  const prevText = readFileIfExists(contextMdPath) || '';

  // context.md 内の manifest セクションから YAML フェンス部分のみを抽出する条件分岐
  const m = prevText.match(/###\s*Quality Context Hash Manifest[\s\S]*?```yaml([\s\S]*?)```/m);
  return m ? (m[1] || '') : null;
}

/**
 * YAML 本文から files 配列の path/hash を素朴に抽出して返す。
 * @param yamlBody Manifest の YAML 本文
 * @returns 抽出した path/hash の配列
 */
function parseManifestFilesFromYaml(yamlBody: string): Array<{ path: string; hash: string }> {
  const prevFiles: Array<{ path: string; hash: string }> = [];
  const lines = yamlBody.split(/\r?\n/);

  // YAML 行を直列に走査して item 開始と hash を抽出するループ
  for (let i = 0; i < lines.length; i++) {
    const pathMatch = lines[i]?.match(/^\s*-\s*path:\s*(.+)\s*$/);
    // item 開始行のみを対象として path を取り出す条件分岐
    if (pathMatch) {
      const p = (pathMatch[1] ?? '').trim();

      const limit = Math.min(i + NEARBY_HASH_LOOKAHEAD, lines.length);
      // 近傍の数行から hash 行を探索して採用し、フォーマット揺れに耐性を持たせる
      const h = scanNearbyHash(lines, i + 1, limit);

      prevFiles.push({ path: p, hash: h });
    }
  }

  return prevFiles;
}

/**
 * 近傍の行から hash: "<hex>" 行を探索して戻す。見つからなければ空文字。
 * @param lines YAML 本文の行配列
 * @param startIndex 探索開始インデックス（非含む）
 * @param limitIndex 探索終了上限（未満）
 * @returns 見つかった hash 値（hex）。無ければ空文字
 */
function scanNearbyHash(lines: string[], startIndex: number, limitIndex: number): string {
  // 近傍のみを探索して計算量と誤検知の両リスクを抑えるループ
  for (let j = startIndex; j < limitIndex; j++) {
    const hashMatch = lines[j]?.match(/^\s*hash:\s*"?([0-9a-fA-F]+)"?\s*$/);
    // hash 行のみを採用し、見つかった時点で早期リターンする条件分岐
    if (hashMatch) {
      return hashMatch[1] ?? '';
    }

    // 次 item の開始が見えたら当該 item の探索を中断する条件分岐
    if (/^\s*-\s*path:/.test(lines[j] || '')) break;
  }

  return '';
}

/**
 * 現行 SoT の digest から files 配列の path/hash を構築して返す。
 * @param digestInfo 現行の digest 情報
 * @returns path/hash の配列（digestInfo が無ければ空配列）
 */
function toCurrentFilesList(digestInfo: UnitDigestInfo | undefined): Array<{ path: string; hash: string }> {
  // digest 情報が無い場合も空配列を返し、呼び出し側で一律に扱えるようにする分岐
  const files = (digestInfo?.files || []).map((f) => ({ path: f.path, hash: f.hash }));
  return files;
}

/**
 * 以前と現行の files 配列を比較し、追加/削除/変更の [REASON] 行を返す。
 * @param prevFiles 以前の path/hash 配列（var 側 manifest）
 * @param currFiles 現行の path/hash 配列（SoT 側 digest）
 * @returns [REASON] 形式の行配列
 */
function diffManifestFiles(
  prevFiles: Array<{ path: string; hash: string }>,
  currFiles: Array<{ path: string; hash: string }>,
): string[] {
  const reasons: string[] = [];

  const prevMap = new Map(prevFiles.map((f) => [f.path, f.hash]));
  const currMap = new Map(currFiles.map((f) => [f.path, f.hash]));

  // 追加を検出するため、現行に存在して以前に無いパスを列挙するループ
  for (const [p] of currMap.entries()) {
    // 以前に存在しない場合のみ、追加として扱う条件分岐
    if (!prevMap.has(p)) reasons.push(`[REASON] + ${p} (新規追加された設定ファイルです。この変更内容を context.md の本文に反映してください)`);
  }

  // 削除/変更を検出するため、以前のエントリを基準に現行側の対応を確認するループ
  for (const [p, oldH] of prevMap.entries()) {
    const newH = currMap.get(p);
    // 現行に対応が無い場合は削除として扱う条件分岐
    if (newH === undefined) {
      // 現行の SoT に同一パスが存在しないため、このエントリは「削除」として記録する
      reasons.push(`[REASON] - ${p} (削除された設定ファイルです。この変更内容を context.md の本文に反映してください)`);
    } else {
      // 以前と現行の内容ハッシュを比較し、差異がある場合のみ「変更」を記録する
      // 内容ハッシュが異なる場合は変更として扱う条件分岐
      if (newH !== oldH) {
        reasons.push(`[REASON] ~ ${p} (変更された設定ファイルです。この変更内容を context.md の本文に反映してください)`);
      }
    }
  }

  return reasons;
}

/** 必須ディレクトリの存在を確認する。 */
function ensurePreconditions(): void {
  // 必須ディレクトリの存在と種別を確認し前提違反を即時に報告する
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
  // 基準時刻を記録し後続の評価ロジックが参照するタイムスタンプを保存する
  try {
    writeFileEnsured(LAST_UPDATED_FILE, `${startAt}\n`);
  } catch (e) {
    /* 鮮度マーカーの書き出し失敗は致命とし、理由を出力して終了する */
    process.stderr.write(`pre-common-auto-check: failed to write last_updated: ${String((e as Error)?.message || e)}\n`);
    process.exit(1);
  }

  return startAt;
}

/**
 * ルーブリックチェックの結果を表す構造体。
 * exit code と標準出力・標準エラーから要約された代表行を保持し、PRE-COMMON 実行結果の判定とログ出力に利用する。
 */
interface RubricResult {
  /** ルーブリック違反が 1 件以上存在する場合は true */
  hasViolation: boolean;
  /** PRE-COMMON 出力へ載せる要約行（代表メッセージ）の配列 */
  summaryLines: string[];
}

/** rubric 要約として PRE-COMMON 出力へ載せる最大行数 */
const RUBRIC_SUMMARY_MAX_LINES = 10;

/**
 * 重複構造に関する rubric 違反を含むかを代表行のテキストから簡易判定する。
 * @param summaryLines Rubric の代表メッセージ行
 * @returns 重複構造の違反が含まれる場合は true、それ以外は false
 */
function includesDuplicateStructureViolation(summaryLines: string[]): boolean {
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
 * 重複構造違反が含まれる場合に、置換原則のガイダンスを出力する。
 * @param rubric Rubric 実行結果
 */
function emitDuplicateGuidanceIfNeeded(rubric: RubricResult): void {
  // 重複構造違反がある場合のみ、置換原則のガイダンスを出力する
  if (rubric.hasViolation && includesDuplicateStructureViolation(rubric.summaryLines)) {
    process.stdout.write(`[GATE] duplicate sections/manifest detected → replace (not append) the context.md structure.\n`);
    process.stdout.write(`- Ensure single H1, single Why/Where/What/How, and single "Quality Context Hash Manifest" section.\n`);
  }
}

/**
 * rubric 実行結果から RubricResult を構築する（status が未定義のケースは null を返す）。
 * @param status プロセス終了コード
 * @param stdout 標準出力
 * @param stderr 標準エラー
 * @returns RubricResult または判定不能時は null
 */
function buildRubricResultFromProcess(status: number | null, stdout: string, stderr: string): RubricResult | null {
  // プロセス終了コードが取得できない場合は判定不能扱いとし、呼び出し側へ null を返す
  if (status === null) return null;
  // 正常終了時は違反なしとして扱い、要約行を持たない結果を返す
  if (status === 0) return { hasViolation: false, summaryLines: [] };

  const summary = formatCap((stderr || stdout || '').trim(), DEFAULT_FORMAT_CAP);
  const firstLines = summary
    .split('\n')
    .slice(0, RUBRIC_SUMMARY_MAX_LINES)
    .map((ln) => `[RUBRIC] ${ln}`);

  return { hasViolation: true, summaryLines: firstLines };
}

/**
 * Node の公式ローダ（tsx ローダ）経由で rubric を実行し、結果を RubricResult として返す。
 * @param rubricChecker 実行対象スクリプトパス
 * @param tsxLoaderArg tsx ローダの URL
 * @returns 判定結果。プロセス起動失敗時などは null
 */
function runRubricWithLoader(rubricChecker: string, tsxLoaderArg: string): RubricResult | null {
  const res = spawnSync(process.execPath, ['--import', tsxLoaderArg, rubricChecker], { stdio: 'pipe', encoding: 'utf8' });
  return buildRubricResultFromProcess(
    typeof res.status === 'number' ? res.status : null,
    res.stdout || '',
    res.stderr || '',
  );
}

/**
 * npx tsx 経由で rubric を実行し、結果を RubricResult として返す。
 * @param rubricChecker 実行対象スクリプトパス
 * @returns 判定結果。プロセス起動失敗時などは null
 */
function runRubricWithNpx(rubricChecker: string): RubricResult | null {
  const res = spawnSync('npx', ['-y', 'tsx', rubricChecker], { stdio: 'pipe', encoding: 'utf8', shell: true });
  return buildRubricResultFromProcess(
    typeof res.status === 'number' ? res.status : null,
    res.stdout || '',
    res.stderr || '',
  );
}

/**
 * ルーブリックチェッカーを実行する。違反がある場合に true と要約行を返す。
 * @returns ルーブリック違反の有無と要約
 */
function checkRubric(): RubricResult {
  const rubricChecker = path.join(PROJECT_ROOT, 'vibecoding', 'scripts', 'qualities', 'context-md-rubric.ts');
  // チェッカー実体が無い場合は非対応としてスキップ（即時に非違反扱いで戻る）
  if (!fs.existsSync(rubricChecker)) return { hasViolation: false, summaryLines: [] };
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRootFromScript = path.resolve(scriptDir, '../../..');
  const tsxLoaderFsPath = path.join(repoRootFromScript, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  // Windows の Node >=20 では file:// URL を優先（ローダ存在時のみ公式ローダのURLを用いる）
  const tsxLoaderArg = fs.existsSync(tsxLoaderFsPath) ? pathToFileURL(tsxLoaderFsPath).href : null /* ローダの有無で選択（存在時はURL、無ければnull） */; // ローダがあればURLに変換、無ければ null
  let result: RubricResult | null = null;

  // 公式ローダが利用可能な場合は、そちらを優先して rubric を実行し、結果が得られた場合はそのまま返す
  if (tsxLoaderArg) {
    // 公式ローダ経由で rubric を実行し、成功・失敗を含めた結果を収集する
    result = runRubricWithLoader(rubricChecker, tsxLoaderArg);
  }

  // 公式ローダ経由で結果が得られなかった場合にのみ npx tsx をフォールバックとして使用する
  result ||= runRubricWithNpx(rubricChecker);

  // 両方の経路で判定不能だった場合のみ「違反なし」とみなす（それ以外は得られた結果を優先する）
  return result ?? { hasViolation: false, summaryLines: [] };
}

/**
 * ゲートアクションを出力し適切に終了する。
 * @param startAt 開始時刻（ISO）
 * @param mappings 必要な src->dest の対応
 * @param rubric 結果（違反有無と要約）
 */
function outputAndExit(startAt: string, mappings: Array<{ srcDir: string; destDir: string; reasons?: string[] }>, rubric: RubricResult): void {
  // 再生成の必要も違反も無ければハッシュを出力して成功終了する
  if (mappings.length === 0 && !rubric.hasViolation) {

    // ミラー生成も違反も無い状態のため、開始時刻から導出したハッシュを出力して終了する
    const hash = crypto.createHash('sha256').update(startAt + SECRET).digest('hex');
    process.stdout.write(`${startAt} ${hash}\n`);
    process.exit(0);
  }

  // ここからは exit=2 相当。次アクションの簡潔ガイダンスを冒頭に提示する
  const total = mappings.length;
  process.stdout.write(`PRE-COMMON: ${total} unit(s) expired or require context creation.\n`);
  // 重複構造の検出がある場合は、最初に「置換原則」を明示するガイダンスを追加する
  emitDuplicateGuidanceIfNeeded(rubric);

  process.stdout.write(`Next steps:\n`);
  process.stdout.write(`  1) 対象ユニットの context.md が存在しないか expire されました。\n`);
  process.stdout.write(`     - PRE-COMMON.md に従って新規作成、または既存の context.md を更新してください。\n`);
  process.stdout.write(`     - [REASON] 行に示された設定ファイルの追加/削除/変更内容を、context.md の本文（Why/Where/What/How）に反映してください。\n`);
  process.stdout.write(`     - 単に hash manifest を更新するだけでは不十分です。設定変更の内容を説明に織り込んでください。\n`);
  process.stdout.write(`  2) Hash Manifest 同期: npm run context:manifest  # context.md の "Quality Context Hash Manifest" (unitDigest/files) を更新\n`);
  process.stdout.write(`  3) Rubric 検査: npm run -s context:rubric\n`);
  process.stdout.write(`  4) 再実行: npm run -s check:pre-common  # 成功時は "<StartAt> <hash>" を出力\n`);
  process.stdout.write(`(diagnostics: tmp/pre-common-diagnostics.md when generated)\n`);

  // rubric の代表行を必要時のみ出力して修正対象の手がかりを提示する
  emitRubricSummary(rubric);

  // 必要なミラー生成・更新対象を列挙して作業指示を明確化する
  emitMappings(mappings);

  // ルーブリック違反のみ検出された場合にも同期対象の提示を行う（少なくとも 1 つは context 更新が必要であることを明示する）
  if (rubric.hasViolation && mappings.length === 0) {

    // ルーブリックの不足に対する修正アクションを明示して利用者を誘導する
    process.stdout.write('[GATE] contexts/qualities => vibecoding/var/contexts/qualities  # rubric noncompliant\n');
  }

  // 診断出力の条件を満たす場合のみ、自己修復用診断を生成・出力する
  emitDiagnosticsIfMissingContexts();

  process.exit(2);
}

/**
 * rubric の代表行を PRE-COMMON 出力へ必要時のみ出力する。
 * @param rubric Rubric 実行結果
 */
function emitRubricSummary(rubric: RubricResult): void {
  // Rubric 違反がある場合のみ、代表行を出力して修正対象を可視化する
  if (rubric.hasViolation && rubric.summaryLines.length > 0) {
    // 代表行を順に出力して、最初の数行の要旨を提示するループ
    for (const ln of rubric.summaryLines) {
      process.stdout.write(`${ln}\n`);
    }
  }
}

/**
 * 必要なミラー生成・更新対象を列挙し、[EXPIRE]/[GATE] と理由一覧を出力する。
 * @param mappings SRC=>DEST の対応一覧（reasons を含む）
 */
function emitMappings(mappings: Array<{ srcDir: string; destDir: string; reasons?: string[] }>): void {
  // 各ユニットの expire 対象と更新対象を順に表示するためのループ
  for (const m of mappings) {
    process.stdout.write(`[EXPIRE] ${m.destDir} (and context-review.md if existed)\n`);
    process.stdout.write(`[GATE] ${m.srcDir} => ${m.destDir}\n`);

    // SoT 側の差分一覧をそのまま提示して、expire の具体的理由を明確にする
    if (m.reasons && m.reasons.length > 0) {
      // 差分理由の各行を出力するためのループ
      for (const r of m.reasons) {
        process.stdout.write(`${r}\n`);
      }
    }
  }
}

/** 監視対象の context.md が欠落している場合に限り、自己修復用診断を出力する。 */
function emitDiagnosticsIfMissingContexts(): void {
  // 診断出力の条件: 監視対象のいずれかで context.md が未整備（欠落）である
  if (!allTargetContextMdExist()) {
    emitDiagnostics();
  }
}

/**
 * 診断の可読性のため長い文字列を切り詰める。
 * @param s 入力文字列
 * @param cap 省略前の最大長
 * @returns 省略後の文字列
 */
function formatCap(s: string, cap = DEFAULT_FORMAT_CAP): string {
  // 無効または空文字列は空の診断として扱う
  if (!s) return '';
  // 既に上限以内であれば切り詰めずそのまま返す
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
  // status 未定義時は失敗扱い（1）で確定
  const status = typeof res.status === 'number' ? res.status : 1 /* 未定義時は失敗(1) */; // 未定義時は 1（失敗扱い）
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
  // 診断用の代表出力を収集する
  try {
  // 診断には stepDefs を使用（runMode が 'diagnostics' または 'both'。'test' と 'build' は除外）
    const steps = stepDefs.filter((d) => (d.runMode === 'diagnostics' || d.runMode === 'both') && d.id !== 'test' && d.id !== 'build');
    const results: string[] = [];
    results.push('');
    results.push('[SAMPLE] === Gate command outputs ===');
    // 各ステップの代表出力を取得して診断へ追記する
    for (const d of steps) {
      results.push('');
      appendDiagnosticsForStep(d, results);
    }

    return results;
  } finally {
    // 一時ファイルを削除してクリーンアップの確実性を高める
    try { fs.unlinkSync(kataPath); } catch (e) {
      // 一時ファイル削除の失敗は致命ではないため継続するが、クリーンアップ漏れの可能性をログに残す
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: failed to remove kata diagnostic file; continuing :: ${kataPath} :: ${msg}\n`);
    }

    // ディレクトリが空であれば撤去して痕跡を最小化する
    try {
      const remains = fs.readdirSync(kataDir);
      // 空ディレクトリのみ削除して安全にクリーンアップする
      if (remains.length === 0) fs.rmdirSync(kataDir);
    } catch (e) {
      // ディレクトリ撤去に失敗しても致命ではないため継続するが、残骸の存在は警告として記録する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: failed to remove kata diagnostics directory; continuing :: ${kataDir} :: ${msg}\n`);
    }
  }
}

/**
 * 単一ステップの診断を追記する。
 * @param d ステップ定義
 * @param results 出力の蓄積先
 */
function appendDiagnosticsForStep(d: typeof stepDefs[number], results: string[]): void {
  // すべての対応ユニットに context.md が存在する場合、診断を抑止
  // 関連ディレクトリが指定されていればそれを優先、無ければ既定の1件
  // 関連ディレクトリ指定の有無で対象を決定
  const unitDirs = (d.relatedUnitDirs && d.relatedUnitDirs.length > 0) ? d.relatedUnitDirs : [d.configRelDir] /* 関連指定の有無で探索対象を切替 */; // 関連指定があれば優先、無ければ単一dir
  const allContextsExist = unitDirs.every((u) => fs.existsSync(path.join(OUTPUT_BASE, u, 'context.md')));
  // 対象すべてが整っている場合は冗長な診断出力を避けるため早期に戻る
  if (allContextsExist) return;
  const { lines, result } = runStepDef(d.command, d.args as string[]);
  // コマンドと標準出力/標準エラーを整形し、行ごとに取り込んで可読な診断ログとして追記する
  for (const ln of lines) {
    results.push(`[SAMPLE] ${ln}`);
  }

  results.push(`[SAMPLE] exit=${result.status}`);
  // 標準出力に加え、標準エラーがあれば追記して可視化
  const out = (result.stdout || '') + (result.stderr ? `\n[stderr]\n${result.stderr}` : '' /* 付加情報なし */); /* 標準エラーの有無で付加情報を構成 */ // stderr があれば併記して可視化
  const capped = formatCap(out, DEFAULT_FORMAT_CAP);
  const cappedLines = capped.split('\n');
  // 各行を整形して空行と本文を区別して蓄積する
  for (const cl of cappedLines) {
    // 空行か否かで出力方針を切り替える
    if (cl.trim().length === 0) {
      // 区切りとして空行を保持し、可読性を担保する
      results.push('');
    } else {
      // 本文行をサンプル出力として整形して記録する
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
  // 出力先の作成と書き込みで診断の永続化を確実に行う
  try {
    fs.mkdirSync(path.dirname(diagOutFile), { recursive: true });
    fs.writeFileSync(diagOutFile, full, 'utf8');
  } catch (e) {
    // 診断の保存に失敗した場合は標準出力のみで継続するが、書き込み失敗の理由はログに残す
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[pre-common-auto-check] warn: failed to persist diagnostics; continue with stdout only :: ${diagOutFile} :: ${msg}\n`);
  }

  const ascii = toAsciiPrintable(full);
  process.stdout.write(`${ascii  }\n`);
  // 保存先が存在する場合は参照パスを追加で案内する
  if (diagOutFile) {

    // 保存先の相対パスをユーザーへ案内する
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
  // 診断生成を実施して出力を構成する（部分失敗時も安定性を維持）
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
    const gateResults = runGateCommandsWithKata(undefined as never);
    diagnostics.push(...gateResults);
    diagnostics.push('');
    diagnostics.push('----- end diagnostics -----');
    saveDiagnostics(diagnostics);
  } catch (e) {
    // 生成時の例外は警告として記録し処理を継続する
    process.stderr.write(`pre-common-auto-check: diagnostics error: ${String((e as Error)?.message || e)}\n`);
  }
}

/**
 * 監視対象のすべてのユニットに context.md が存在するかを返す。
 * @returns boolean 全ユニットに context.md が存在する場合は true、それ以外は false
 */
function allTargetContextMdExist(): boolean {
  const units = collectUnitSources();
  const seenUnits = new Set<string>();
  // 各ユニットごとに context.md の存在を確認して整合性を判断する
  // 取得済みユニット一覧を順に確認し、var 配下に対応する context.md が存在するかを検査する
  for (const { unit } of units) {
    // 各ユニットは一度だけ確認し、重複チェックによる無駄なファイルアクセスやレポートの揺れを防ぐ
    // すでに確認済みのユニットは二重判定を避けてスキップする
    if (seenUnits.has(unit)) continue;
    seenUnits.add(unit);
    const destDir = path.join(OUTPUT_BASE, unit);
    const destMd = path.join(destDir, 'context.md');
    // 正規ユニット（core/types/docs）の context.md が欠けていれば不整合とみなす
    if (!fs.existsSync(destMd)) {
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
  // 文字ごとに種別を判定して安全な表現へ変換する
  for (const ch of replaced) {
    const code = ch.codePointAt(0);
    // ASCII 可視文字と制御の一部のみ許容しそれ以外をプレースホルダへ置換する
    if (code !== undefined && ((code >= ASCII_PRINTABLE_MIN && code <= ASCII_PRINTABLE_MAX) || ch === '\n' || ch === '\r' || ch === '\t')) {
      // 許容された可視/制御文字はそのまま保持して可読性を維持する
      out += ch;
    } else {
      // 非許容文字は安全なプレースホルダで代替してログ崩れを防ぐ
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
  // 監視ベースが存在しない場合は対象外として空配列を返す
  if (!fs.existsSync(OUTPUT_BASE)) return [];
  const files = listFilesRecursive(OUTPUT_BASE);
  const contextMds = files.filter((f) => path.basename(f) === 'context.md');
  const pairs: Array<{ contextMd: string; reviewMd: string }> = [];
  // 各 context.md に対する隣接 review の有無を評価する
  for (const contextMd of contextMds) {
    const reviewMd = path.join(path.dirname(contextMd), 'context-review.md');
    // review が存在する組だけを結果として返す
    if (fs.existsSync(reviewMd)) {
      pairs.push({ contextMd, reviewMd }); // 対象 context.md に隣接するレビューのみを選別する
    }
  }

  return pairs;
}

/**
 * 検出した組に対するレビュー衝突メッセージを出力する。
 * @param pairs 検出したペア
 */
function emitReviewConflictMessages(pairs: Array<{ contextMd: string; reviewMd: string }>): void {
  // 各ペアに対して衝突の詳細と対応方針を出力する
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

/**
 * review ファイルの存在に起因する PRE-COMMON 一時 Fail をハンドリングする
 * - context mirror / rubric / duplicate がすべてクリアになった場合のみ review 衝突を検査する
 * - review が残っている場合は統合を促すメッセージを出力し、exit=2 で一時 Fail とする
 * @param mappings まだ同期が必要な SRC=>DEST マッピング一覧
 * @param rubricViolation Rubric 未充足があるかどうか
 * @param dupViolation 重複検出があるかどうか
 */
function handleReviewConflicts(
  mappings: Array<{ srcDir: string; destDir: string }>,
  rubricViolation: boolean,
): void {
  // ミラーやルーブリック、重複に未解決要素が残っている場合は review 検査は後段に回す
  if (mappings.length !== 0 || rubricViolation) {
    return;
  }

  // まずミラーとルーブリックの要件が揃っている場合にのみレビュー有無を確認する
  const reviewPairs = findContextReviewPairs();
  // レビューが存在する場合は統合作業を促して一時的に Fail とする
  if (reviewPairs.length > 0) {
    // レビュー統合の必要性を明示し、完了まで一時 Fail とする
    emitReviewConflictMessages(reviewPairs);
    process.exit(2);
  }
}

/** エントリポイント。鮮度チェックを実行して終了する。 */
function main(): void {
  ensurePreconditions();
  const startAt = writeLastUpdated();
  const unitSources = collectUnitSources();
  const digests = computeUnitDigests(unitSources);
  const mappings = computeNeededMappingsByDigest(unitSources, digests);
  const rubric = checkRubric();
  // 他要件が揃った場合のみレビュー衝突を検査する（post-pass review detection）
  handleReviewConflicts(mappings, rubric.hasViolation);

  outputAndExit(startAt, mappings, rubric);
}

// 終了方針: 実行全体の例外処理を一元化し致命時は明確に失敗させる
try {
  main();
} catch (e) {
  /* 実行全体の想定外例外は致命としてログ出力し異常終了する */
  process.stderr.write(`pre-common-auto-check: fatal error: ${String((e as Error)?.message || e)}\n`);
  process.exit(1);
}

