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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectUnitSources,
  computeUnitDigests,
  type UnitDigestInfo,
  type UnitSources,
} from './context-hash-manifest.ts';
import { emitDiagnostics } from './pre-common/diagnostics.ts';
import { handleReviewConflicts } from './pre-common/review.ts';
// import { fileURLToPath } from 'node:url';
import { checkRubric, emitDuplicateGuidanceIfNeeded, emitRubricSummary, type RubricResult } from './pre-common/rubric.ts';
import { normalizePathForOutput,readFileIfExists, toIsoUtcNow, writeFileEnsured } from './pre-common/utils.ts';

/** リポジトリのプロジェクトルート（cwd） */
const PROJECT_ROOT = process.cwd();
/** 本スクリプトの配置ディレクトリ（現在未使用） */
// const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** スクリプトからみたリポジトリルートの絶対パス（現在未使用） */
// const REPO_ROOT_FROM_SCRIPT = path.resolve(SCRIPT_DIR, '../../..');
/** ソースの品質設定が置かれるベースディレクトリ（qualities/） */
const QUALITIES_DIR = path.join(PROJECT_ROOT, 'qualities');
/** 生成物（var/contexts/qualities）のベースパス */
const OUTPUT_BASE = path.join(PROJECT_ROOT, 'vibecoding', 'var', 'contexts', 'qualities');
/** PRE-COMMON の鮮度記録（ISO文字列）ファイルパス */
const LAST_UPDATED_FILE = path.join(OUTPUT_BASE, 'last_updated');
/** ローカル状態ディレクトリ（git 無視対象） */
const LOCALSTATE_DIR = path.join(PROJECT_ROOT, 'vibecoding', 'var', 'localstate');
/** preflight 通過マーカー */
const PREFLIGHT_PASSED_FILE = path.join(LOCALSTATE_DIR, 'preflight_passed');
/** ハッシュ計算用の固定シークレット（安定性目的） */
const SECRET = 'SAT-light-TS::PRE-COMMON::v1';

// 定数
/** YAML 近傍探索で参照するハッシュ行の前方探索幅（行数） */
const NEARBY_HASH_LOOKAHEAD = 4;

/**
 * 存在する場合にファイルを読み込む。
 * @param filePath ファイルの絶対パス
 * @returns ファイル内容。存在しない場合は null
 */
// readFileIfExists は utils に移動

/**
 * ディレクトリを作成した上でファイルを書き込む。
 * @param filePath 出力先の絶対パス
 * @param content 書き込む文字列
 */
// writeFileEnsured は utils に移動

/**
 * 現在時刻を ISO UTC 文字列で取得する。
 * @returns ISO UTC 文字列
 */
// toIsoUtcNow は utils に移動

/**
 * 出力用にパス区切りを正規化する。
 * @param p 正規化するパス
 * @returns 正規化後のパス文字列
 */
// normalizePathForOutput は utils に移動

/**
 * ディレクトリ配下のファイルを再帰的に列挙する。
 * @param dir ルートディレクトリ
 * @returns ファイルの絶対パス配列
 */
// listFilesRecursive は utils に移動

// mtime ベースの鮮度判定は unitDigest ベースへ移行済みのため、過去実装の getMaxMtimeMs は削除した。

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

        // review が存在する場合は併せて削除し、統合作業の重複や分岐を抑止する（削除失敗は警告で継続）
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
      // 以前とのハッシュ差分がある場合のみ「変更」を記録する
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
/**
 * ゲートアクションを出力し適切に終了する。
 * @param startAt 開始時刻（ISO）
 * @param mappings 必要な src->dest の対応
 * @param rubric 結果（違反有無と要約）
 */
function outputAndExit(startAt: string, mappings: Array<{ srcDir: string; destDir: string; reasons?: string[] }>, rubric: RubricResult): void {
  // 再生成の必要も違反も無ければハッシュを出力して成功終了する
  if (mappings.length === 0 && !rubric.hasViolation) {
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
// emitRubricSummary は外部モジュールから利用

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
  // 監視対象のいずれかで context.md が未整備の場合に診断を出力する
  if (!allTargetContextMdExist()) {
    emitDiagnostics(PROJECT_ROOT);
  }
}

/**
 * 診断の可読性のため長い文字列を切り詰める。
 * @param s 入力文字列
 * @param cap 省略前の最大長
 * @returns 省略後の文字列
 */
// formatCap は utils に移動

// stepDefs 統合後に未使用となった runNpmScript を削除

/**
 * コマンドを同期実行する。
 * @param command 実行ファイル
 * @param args 引数
 * @param cwd 作業ディレクトリ
 * @returns status/stdout/stderr を持つ結果
 */
// runCommand は utils に移動

/**
 * 代表的なゲートコマンドを実行しサンプル出力を返す。
 * @param _pkgJson 予約引数（将来用）
 * @returns 診断出力用の行
 */
// 診断系は diagnostics.ts へ分離

/** 合成した診断サンプルブロックを出力する。 */
// emitDiagnostics は diagnostics.ts へ分離

/**
 * 監視対象のすべてのユニットに context.md が存在するかを返す。
 * @returns boolean 全ユニットに context.md が存在する場合は true、それ以外は false
 */
function allTargetContextMdExist(): boolean {
  const units = collectUnitSources();
  const seenUnits = new Set<string>();
  // 各ユニットごとに var 配下の context.md の存在を確認し整合性を判断する
  for (const { unit } of units) {
    // 重複チェックを避けるため、一度確認したユニットはスキップ
    if (seenUnits.has(unit)) continue;
    seenUnits.add(unit);
    const destDir = path.join(OUTPUT_BASE, unit);
    const destMd = path.join(destDir, 'context.md');
    // 正規ユニット（core/types/docs）の context.md が欠けていれば不整合
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
// toAsciiPrintable は utils に移動

/**
 * var 配下の context.md / context-review.md の組を検出する。
 * @returns ファイルペアの配列
 */
// review 衝突系は review.ts へ分離

/** エントリポイント。鮮度チェックを実行して終了する。 */
function main(): void {
  // 引数で --pre-impl が指定された場合、preflight パスのマーカーを削除して強制再実行を促す
  if (process.argv.includes('--pre-impl')) {
    // PRE-IMPL 実行時は preflight マーカーを初期化し、以降の check に前提検証の実施を強制する
    try {
      // ファイルが存在する場合にのみ削除して副作用を限定し、存在しない場合は無処理で通過させる
      if (fs.existsSync(PREFLIGHT_PASSED_FILE)) {
        fs.unlinkSync(PREFLIGHT_PASSED_FILE);
      }
    } catch (e) {
      // 削除に失敗しても致命ではないため、次の PRE-IMPL 実行で再試行する前提で警告にとどめる
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: failed to remove preflight marker :: ${PREFLIGHT_PASSED_FILE} :: ${msg}\n`);
    }
  }
  
  ensurePreconditions();
  const startAt = writeLastUpdated();
  const unitSources = collectUnitSources();
  const digests = computeUnitDigests(unitSources);
  const mappings = computeNeededMappingsByDigest(unitSources, digests);
  const rubric = checkRubric(PROJECT_ROOT);
  // 他要件が揃った場合のみレビュー衝突を検査する（post-pass review detection）
  handleReviewConflicts(PROJECT_ROOT, OUTPUT_BASE, mappings, rubric.hasViolation);

  outputAndExit(startAt, mappings, rubric);
}

// 実行全体の例外処理を一元化し致命時は明確に失敗させる
try {
  main();
} catch (e) {
  // 予期しない致命エラーを標準エラーへ報告し、非0で終了する
  process.stderr.write(`pre-common-auto-check: fatal error: ${String((e as Error)?.message || e)}\n`);
  process.exit(1);
}

