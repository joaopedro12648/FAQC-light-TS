#!/usr/bin/env node
/**
 * @file 品質コンテキスト用ファイルマニフェストとユニットダイジェスト生成スクリプト
 * - PRE-COMMON 実行フローから呼び出され、qualities/** → vibecoding/var/contexts/qualities/** の対応を内容ハッシュで記録する
 * - mtime ではなく内容ハッシュに基づく鮮度判定の土台となるシグネチャを生成する
 * - core/types/docs 各ユニットごとに入力ディレクトリ集合を検出し、対応する context.md 内に YAML manifest を埋め込む
 * - YAML manifest には unit/algo/generatedAt/unitDigest/files を含めて機械可読にする
 * - unitDigest はファイル一覧と個別ハッシュから導出されるユニット全体の代表ハッシュとし、context.md 内の YAML ブロックを hash manifest の単一情報源とする
 * - 値はすべて PRE-COMMON 実行時に本スクリプトから自動生成し、手動編集や別スクリプトによる生成を禁止する
 * - 失敗時は PRE-COMMON 自体の失敗として扱い、理由を標準エラー出力に記録する
 * - 本スクリプトは単体実行およびモジュールとしてのインポートの両方に対応する（CLI 実行判定は import.meta.url と argv[1] の実パス比較で行う）
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリのプロジェクトルート（cwd） */
const PROJECT_ROOT = process.cwd();
/** qualities/** のベースディレクトリ */
const QUALITIES_DIR = path.join(PROJECT_ROOT, 'qualities');
/** コンテキスト出力先ベースディレクトリ（各ユニットの context.md を格納する） */
const OUTPUT_BASE = path.join(PROJECT_ROOT, 'vibecoding', 'var', 'contexts', 'qualities');

/** PRE-COMMON で扱うユニット ID 型（命名規約に従う任意のユニット名） */
export type UnitId = string;

/** 各ユニットに紐づく qualities/** 側のソースディレクトリ群 */
export interface UnitSources {
  /** ユニット ID（qualities/** の bucket/unit 名に対応する論理名） */
  unit: UnitId;
  /** ユニットに対応する qualities/** 側のソースディレクトリ群（絶対パス） */
  srcDirs: string[];
}

/**
 * パスを POSIX 形式（/ 区切り）へ正規化する
 * @param p 対象パス
 * @returns `/` 区切りへ正規化したパス
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * qualities/** のフォルダ構成からユニットごとのソースディレクトリを自動抽出する。
 * @returns ユニット ID と対応するソースディレクトリ配列の一覧
 */
export function collectUnitSources(): UnitSources[] {
  const unitToDirs = new Map<UnitId, Set<string>>();
  const unitNamePattern = /^[a-z][a-z0-9_-]*$/;

  // qualities/ 以下の相対パス文字列から「先頭が '_' のセグメント」を含むかどうかを判定する
  const hasUnderscoreSegment = (relPath: string): boolean => {
    const segments = relPath.split(path.sep).filter(Boolean);
    return segments.some((seg) => seg.startsWith('_'));
  };

  const addUnitDir = (unit: UnitId, dir: string): void => {
    // 設定側のディレクトリが存在しない場合やファイルだった場合は、対象外としてスキップする
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    const existing = unitToDirs.get(unit) ?? new Set<string>();
    existing.add(dir);
    unitToDirs.set(unit, existing);
  };

  /**
   * qualities 直下のドメインディレクトリを列挙する（_ 始まりは除外）
   * @returns ドメインディレクトリの絶対パス配列
   */
  const getDomainDirs = (): string[] => {
    // qualities ディレクトリが存在しない環境（部分チェックなど）ではユニット検出をスキップする
    if (!fs.existsSync(QUALITIES_DIR)) return [];
    const entries = fs.readdirSync(QUALITIES_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => path.join(QUALITIES_DIR, e.name));
  };

  /**
   * ドメイン直下のバケットディレクトリを列挙する（_ 始まりや `_` セグメントを含むものは除外）
   * @param domainDir ドメインディレクトリの絶対パス
   * @returns バケットディレクトリの絶対パス配列
   */
  const getBucketDirs = (domainDir: string): string[] => {
    const rel = path.relative(QUALITIES_DIR, domainDir);
    // ドメイン階層に '_' 始まりのセグメントが含まれる場合は、そのサブツリー全体をユニット候補から除外する
    if (hasUnderscoreSegment(rel)) return [];
    const entries = fs.readdirSync(domainDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => path.join(domainDir, e.name));
  };

  /**
   * バケット直下のユニットディレクトリ候補を列挙する（命名規約を満たすもののみ返す）
   * @param bucketDir バケットディレクトリの絶対パス
   * @returns ユニットディレクトリの絶対パス配列
   */
  const getUnitDirs = (bucketDir: string): string[] => {
    const rel = path.relative(QUALITIES_DIR, bucketDir);
    // バケット階層に '_' 始まりのセグメントが含まれる場合は、このバケット配下をユニット候補から除外する
    if (hasUnderscoreSegment(rel)) return [];

    let areaEntries: fs.Dirent[];
    // バケット配下を読み取り、命名規約に従うユニット候補だけを抽出する
    try {
      areaEntries = fs.readdirSync(bucketDir, { withFileTypes: true });
    } catch (e) {
      // 読み取り不能なバケットは一時的な不整合としてスキップし、他のバケットの検査を優先するが、発生事象はログに残す
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[context-hash-manifest] warn: skip unreadable bucket while enumerating unit dirs :: ${bucketDir} :: ${msg}\n`);
      return [];
    }

    const unitDirs: string[] = [];
    // バケット直下のディレクトリを走査し、ユニット名の命名規約に合致するものだけを候補とする
    for (const areaEntry of areaEntries) {
      // ファイルはユニット候補ではないため除外し、ディレクトリのみをユニット候補として扱う
      if (!areaEntry.isDirectory()) continue;
      const areaName = areaEntry.name;
      // '_' 始まりや命名規約に反するディレクトリはユニット候補から除外する
      if (areaName.startsWith('_') || !unitNamePattern.test(areaName)) continue;
      unitDirs.push(path.join(bucketDir, areaName));
    }

    return unitDirs;
  };

  const domainDirs = getDomainDirs();
  // qualities/{domain}/{bucket}/{unit} という3階層目のディレクトリをユニット候補として探索する
  for (const domainDir of domainDirs) {
    const bucketDirs = getBucketDirs(domainDir);
    // 各バケット配下のユニットディレクトリを収集し、ユニット ID ごとに入力ディレクトリを登録する
    for (const bucketDir of bucketDirs) {
      const unitDirs = getUnitDirs(bucketDir);
      // ユニット候補ディレクトリを順に登録し、PRE-COMMON が参照するユニット→入力ディレクトリ集合を構築する
      for (const unitDir of unitDirs) {
        const unitName = path.basename(unitDir);
        addUnitDir(unitName, unitDir);
      }
    }
  }

  const units: UnitSources[] = [];
  // ユニットごとに収集済みディレクトリ集合を配列へ変換し、呼び出し側が扱いやすい構造へ整形する
  for (const [unit, dirs] of unitToDirs.entries()) {
    units.push({ unit, srcDirs: Array.from(dirs) });
  }

  return units;
}

/**
 * ディレクトリ配下のファイルを再帰的に列挙する
 * @param dir 起点ディレクトリ
 * @returns 配下に存在するすべてのファイルの絶対パス配列
 */
function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // ディレクトリツリーを明示的なスタックでたどり、深さに依存しない列挙を行う
  while (stack.length > 0) {
    const current = stack.pop();
    // スタックから取り出した値が空の場合は異常状態と見なし、ループを中断する
    if (!current) break;
    let entries: fs.Dirent[] | undefined;
    // 読み取りに失敗するディレクトリがあっても全体の列挙を継続できるようにする
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      // アクセス権や一時的な I/O エラーで読み取れないディレクトリは、鮮度判定の対象外として安全にスキップする（理由はログに記録）
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[context-hash-manifest] warn: skip unreadable directory while listing files :: ${current} :: ${msg}\n`);
      continue;
    }

    // ディレクトリであればスタックへ積み、ファイルであれば結果リストへ追加する
    for (const e of entries) {
      const full = path.join(current, e.name);
      // ディレクトリとファイルを分岐させ、探索キューと結果コレクションへそれぞれ振り分ける
      if (e.isDirectory()) {
        // ディレクトリの場合は後で中身を列挙するためにスタックへ積む
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * 単一ファイルの内容ハッシュを計算する（sha256, hex）
 * @param absPath 対象ファイルの絶対パス
 * @returns sha256 ハッシュ文字列（hex）
 */
function calcFileHash(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  const h = crypto.createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

/**
 * ユニットごとの hash manifest 情報（unitDigest とファイル一覧）を表す構造。
 * PRE-COMMON 実行時の鮮度判定や DoD 判定で、各ユニットがどの入力ファイル集合に基づいているかを追跡するために利用する。
 */
export interface UnitDigestInfo {
  /** 対象ユニット ID（UnitSources.unit と同一キー） */
  unit: UnitId;
  /** 当該ユニット全体を表す代表ハッシュ（unitDigest） */
  unitDigest: string;
  /** ハッシュ計算対象となったファイル一覧（リポジトリルートからの相対パスと内容ハッシュ） */
  files: Array<{
    /** ハッシュ対象ファイルのリポジトリルートからの相対パス */
    path: string;
    /** ファイル内容の sha256 ハッシュ（hex） */
    hash: string;
  }>;
}

/**
 * ユニットごとに現在の hash manifest 情報（unitDigest とファイル一覧）を計算して返す。
 * PRE-COMMON からの鮮度判定や DoD 判定の主語として利用する。
 * @param units ユニット定義（省略時は collectUnitSources() で検出）
 * @returns ユニット ID / unitDigest / ファイル一覧からなる配列
 */
export function computeUnitDigests(units: UnitSources[] = collectUnitSources()): UnitDigestInfo[] {
  const results: UnitDigestInfo[] = [];
  // 対象ユニットが無ければ空配列を返す
  if (units.length === 0) return results;
  // 各ユニットごとに入力ディレクトリをたどり、hash manifest を構築する
  for (const { unit, srcDirs } of units) {
    const allFiles: string[] = [];
    // 各 src ディレクトリ配下の全ファイルを列挙し、後続のハッシュ計算対象とする
    for (const src of srcDirs) {
      // 設定の追加や削除により存在しないディレクトリが混ざっても安全にスキップできるようにする
      if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) continue;
      allFiles.push(...listFilesRecursive(src));
    }

    // context.yaml/context.md は qualities 側には通常存在しないが、念のため除外する
    const compareFiles = allFiles.filter((f) => {
      const b = path.basename(f).toLowerCase();
      return !(b === 'context.yaml' || b === 'context.md');
    });

    // パス順で安定化
    const relAndHash = compareFiles
      .map((abs) => {
        const rel = toPosix(path.relative(PROJECT_ROOT, abs));
        const hash = calcFileHash(abs);
        return { rel, hash };
      })
      .sort((a, b) => {
        // マニフェストの差分が安定するよう、相対パスの昇順でソートする
        if (a.rel < b.rel) return -1;
        // 逆順の場合は後ろへ回し、辞書順に従った安定ソートを実現する
        if (a.rel > b.rel) return 1;
        return 0;
      });

    // ユニットダイジェスト（パス＋ハッシュ列から導出）
    const digestHash = crypto.createHash('sha256');
    // unitDigest はパスと個別ハッシュの組み合わせから一意に導出し、ユニット単位のシグネチャとして利用する
    for (const entry of relAndHash) {
      digestHash.update(entry.rel);
      digestHash.update('\n');
      digestHash.update(entry.hash);
      digestHash.update('\n');
    }

    const unitDigest = digestHash.digest('hex');

    results.push({
      unit,
      unitDigest,
      files: relAndHash.map((entry) => ({
        path: entry.rel,
        hash: entry.hash,
      })),
    });
  }

  return results;
}

/**
 * ユニットごとの hash manifest を生成し、派生した unitDigest を各ユニットの context.md 内 YAML ブロックとして記録する。
 * @returns なし（副作用として context.md を更新する）
 */
export function generateContextHashManifests(): void {
  const units = collectUnitSources();
  const digests = computeUnitDigests(units);
  // 対象ユニットが無ければ何もせず静かに戻る
  if (digests.length === 0) return;

  // 各ユニットの digest 情報を対応する context.md に書き戻し、Quality Context Hash Manifest セクションを最新化する
  for (const info of digests) {
    const generatedAt = new Date().toISOString();
    const unitContextDir = path.join(OUTPUT_BASE, info.unit);
    const contextMdPath = path.join(unitContextDir, 'context.md');

    // context.md が存在する場合は、ユニットの hash manifest を YAML ブロックとして記録する
    if (fs.existsSync(contextMdPath)) {
      syncHashManifestMd(contextMdPath, {
        unit: info.unit,
        generatedAt,
        unitDigest: info.unitDigest,
        files: info.files,
      });
    }
  }
}

/**
 * context.md に Quality Context Hash Manifest セクションを同期する。
 * @param contextMdPath 対象 context.md のパス
 * @param payload hash manifest の内容（ユニット ID / 生成時刻 / unitDigest / ファイル一覧）
 * @param payload.unit ユニット ID
 * @param payload.generatedAt manifest 生成時刻（ISO 8601 形式）
 * @param payload.unitDigest ユニット全体の代表ハッシュ
 * @param payload.files ファイル一覧（パスとハッシュのペア）
 */
function syncHashManifestMd(
  contextMdPath: string,
  payload: {
    unit: string;
    generatedAt: string;
    unitDigest: string;
    files: Array<{ path: string; hash: string }>;
  },
): void {
  let mdText: string;
  // digest を同期するために context.md を読み込む
  try {
    mdText = fs.readFileSync(contextMdPath, 'utf8');
  } catch (e) {
    // 読み取り不能な context.md は digest 記録の対象外とし、他ユニットの処理を継続するが、対象と理由をログへ出力する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[context-hash-manifest] warn: skip unreadable context.md when writing hash manifest :: ${contextMdPath} :: ${msg}\n`);
    return;
  }

  // 読み取り結果が空でない場合のみ digest 記録の更新処理を行う
  if (!mdText) {
    return;
  }

  const headingPattern = /^###\s*Quality Context Hash Manifest\b/m;
  const sectionLines: string[] = [];
  sectionLines.push('### Quality Context Hash Manifest');
  sectionLines.push('');
  sectionLines.push('```yaml');
  sectionLines.push(`unit: ${payload.unit}`);
  sectionLines.push('algo: sha256');
  sectionLines.push(`generatedAt: "${payload.generatedAt}"`);
  sectionLines.push(`unitDigest: "${payload.unitDigest}"`);
  sectionLines.push('files:');

  // 各ファイルのパスとハッシュを YAML リスト形式で追記する
  for (const file of payload.files) {
    sectionLines.push(`  - path: ${file.path}`);
    sectionLines.push(`    hash: "${file.hash}"`);
  }

  sectionLines.push('```');

  // 既存の Quality Context Hash Manifest セクションの有無を確認し、置換または追記を選択する
  if (headingPattern.test(mdText)) {
    // 既存セクションがある場合は、セクション全体を新しい内容で置き換える
    const lines = mdText.split(/\r?\n/);
    const startIdx = lines.findIndex((ln) => headingPattern.test(ln));
    let endIdx = startIdx + 1;

    // 既存セクションの終端（次の同レベル見出し以降）を探索する
    while (endIdx < lines.length) {
      const line = lines[endIdx] ?? '';

      // 次の見出しが見つかった場合、その直前までを既存セクションの範囲とする
      if (/^###\s+/.test(line)) {
        break;
      }

      endIdx += 1;
    }

    lines.splice(startIdx, endIdx - startIdx, ...sectionLines);
    mdText = lines.join('\n');
  } else {
    // 既存セクションが無い場合は末尾に追記する
    mdText = `${mdText.replace(/\s*$/, '')}\n\n${sectionLines.join('\n')}\n`;
  }

  fs.writeFileSync(contextMdPath, mdText, 'utf8');
}

// ESM 環境でも直接実行できるようにエントリポイントを分岐する
const isDirectRun = (() => {
  const entryArg = process.argv[1];
  // ESM / tsx ローダ経由の CLI 実行かどうかを判定し、副作用付きのマニフェスト生成を許可するか決める
  if (typeof entryArg !== 'string') return false;
  // import.meta.url と argv[1] の実パス比較で CLI 実行かどうかを判定し、例外はライブラリ利用時の誤検知回避のため握りつぶす
  try {
    // import.meta.url から得られる実ファイルパスと argv[1] の実パスを比較し、同一ファイルであれば「直接実行」とみなす
    const fromUrl = fileURLToPath(import.meta.url);
    const fromArg = path.resolve(entryArg);
    return path.resolve(fromUrl) === fromArg;
  } catch (e) {
    // 変換に失敗した場合は保守的に「直接実行ではない」とみなす（ライブラリ利用時の誤検知を避ける）
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[context-hash-manifest] warn: failed to determine direct-run status; treat as library use :: ${msg}\n`);
    return false;
  }
})();
// 直接実行された場合のみ CLI としてマニフェスト生成を行い、モジュールインポート時は副作用を避ける
if (isDirectRun) {
  // CLI 実行時はマニフェスト生成の成否を標準出力/標準エラーに明示し、PRE-COMMON 側で扱いやすいようにする
  try {
    generateContextHashManifests();
    process.stdout.write('context-hash-manifest: manifests generated successfully\n');
  } catch (e) {
    // マニフェスト生成で想定外の例外が発生した場合は PRE-COMMON 全体の失敗として扱い、詳細を標準エラーに出力する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`context-hash-manifest: fatal error: ${msg}\n`);
    process.exit(1);
  }
}
