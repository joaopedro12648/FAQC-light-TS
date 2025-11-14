#!/usr/bin/env node

/**
 * @file 連続行コメント検出 CLI（TS/JS 走査・TSV 出力）
 * 備考:
 * - リポ直下から対象拡張子のみ再帰走査する
 * - 除外ディレクトリへは侵入せずコストとノイズを抑制する
 * - 2行以上の連続した行コメントを検出して可視化する
 * - 3行以上は重なりペア（i,i+1）で全区間を網羅的に列挙する
 * - 出力は TSV（path<TAB>line<TAB>text）で機械処理しやすい
 * - I/O 失敗は安全側でスキップし実行を継続する
 * - 終了コードは常に 0（ツール連携を阻害しない）
 * - ループ/分岐直前に意図説明コメントを付し可読性を確保する
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251113/SnD-20251113-consecutive-line-comment-cli.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 出力対象の拡張子（小文字比較） */
const TARGET_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
/** 除外ディレクトリ名（ベース名一致） */
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'vibecoding', 'tmp']);

/**
 * CLI オプションを単純に解析する。--root=... または --root ... に対応
 * @param {string[]} argv プロセス引数配列
 * @returns {{ root: string }} 解析結果（root は空文字またはディレクトリ）
 */
function parseArgs(argv) {
  const out = { root: '' };
  // 引数の走査：順に評価して --root の指定を取り出す
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] || '';
    // 値引数を伴う --root を優先的に解釈する（空値は無視）
    if (a === '--root' && i + 1 < argv.length) {
      // 次要素をルート指定として読み取る（ユーザー明示優先）
      out.root = String(argv[++i] || '');
    } else if (a.startsWith('--root=')) {
      // --root=形式を分割してルート指定を取得する
      out.root = a.slice('--root='.length);
    }
  }

  return out;
}

/**
 * 既定ルートを算出（スクリプトから2階層上＝リポジトリルート想定）
 * @returns {string} 既定のルートディレクトリの絶対パス
 */
function getDefaultRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

/**
 * パスの拡張子が対象か（大文字小文字を無視）
 * @param {string} fp 評価するファイルパス
 * @returns {boolean} 対象拡張子なら true
 */
function isTargetFile(fp) {
  const lower = fp.toLowerCase();
  return TARGET_EXTS.some((ext) => lower.endsWith(ext));
}

/**
 * 除外判定：当該ディレクトリへ侵入すべきかを返す。
 * vibecoding/var は広く除外する（ミラー群）
 * @param {string} dirPath 対象ディレクトリの絶対パス
 * @param {string} name ベース名
 * @returns {boolean} 侵入許可なら true
 */
function shouldEnterDir(dirPath, name) {
  // 除外ルート：明示的にスキップ
  if (EXCLUDE_DIRS.has(name)) return false;
  // vibecoding 配下の var を特別扱いで除外
  if (name === 'vibecoding') {
    const maybeVar = path.join(dirPath, 'var');
    // ミラー配下は探索対象外（品質ゲートの鏡像であり走査不要）
    try {
      // var ディレクトリの実在を確認して除外判定を確定する
      if (fs.existsSync(maybeVar) && fs.statSync(maybeVar).isDirectory()) return false;
    } catch {
      // 参照の失敗時は安全側で除外として扱う
      return false;
    }
  }

  return true;
}

/**
 * ファイルでかつ対象拡張子なら収集に追加する。
 * @param {fs.Dirent} entry ディレクトリエントリ
 * @param {string} full 絶対パス
 * @param {string[]} bucket 収集先
 */
function maybeCollectFile(entry, full, bucket) {
  // 対象が通常ファイルでかつ対象拡張子の場合のみ収集対象とする
  if (entry.isFile() && isTargetFile(full)) bucket.push(full);
}

/**
 * ディレクトリ再帰走査。除外名に一致したディレクトリには侵入しない。
 * @param {string} rootDir 走査起点ディレクトリ
 * @returns {string[]} 発見ファイルの絶対パス配列
 */
function listFilesRecursive(rootDir) {
  const result = [];
  const stack = [rootDir];
  // 深さ優先走査：未処理ディレクトリがある限り継続
  while (stack.length) {
    const current = stack.pop();
    // ガード：不正値を検出した場合は次の処理へ移る
    if (!current) break;
    let entries;
    // 配下のエントリ一覧を取得して走査対象を展開する
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      // 読み取り失敗は当該ディレクトリのみ除外して探索を継続する
      continue;
    }

    // 各エントリを順に評価し、侵入または収集のどちらかを実行する
    for (const e of entries) {
      const full = path.join(current, e.name);
      // ディレクトリ：侵入要否を判定してスタックへ積む
      if (e.isDirectory()) {
        // 除外規則に合致しない場合のみ探索対象として積む
        if (shouldEnterDir(full, e.name)) stack.push(full);
      } else {
        // ファイル：対象拡張子のみ収集
        maybeCollectFile(e, full, result);
      }
    }
  }

  return result;
}

/**
 * 改行を正規化して 1-based 行配列を返す（要素は文字列、末尾改行なし）
 * @param {string} content ファイル内容
 * @returns {string[]} 行配列（改行は除去）
 */
function splitLines(content) {
  // CRLF/LF を受容、末尾空行はそのまま配列末尾に空文字として残る（行番号整合のため）
  return String(content).split(/\r?\n/);
}

/**
 * 行コメント（//）の判定：行頭空白の後に // が現れる行
 * @param {string} line 単一行
 * @returns {boolean} 行コメントなら true
 */
function isLineComment(line) {
  return /^\s*\/\//.test(line);
}

/**
 * 出力用パス正規化（/ 区切り）
 * @param {string} fp 入力パス
 * @returns {string} 正規化済みパス
 */
function normalizeOutPath(fp) {
  return fp.replace(/\\/g, '/');
}

/**
 * 対象ファイル1本を処理し、検出結果を TSV 文字列配列で返す。
 * @param {string} filePathAbs ファイルの絶対パス
 * @param {string} repoRootAbs ルートの絶対パス（相対化用）
 * @returns {string[]} TSV 出力行の配列
 */
function processFile(filePathAbs, repoRootAbs) {
  let content = '';
  // I/O 失敗時は安全側でスキップして継続
  try {
    content = fs.readFileSync(filePathAbs, 'utf8');
  } catch {
    // 読み取りに失敗したファイルは検出対象から外す
    return [];
  }

  const lines = splitLines(content);
  const isComment = lines.map((ln) => isLineComment(ln));

  const out = [];
  // 連続区間を抽出して、各ペア（i, i+1）について両行を1行ずつ出力（重複許容）
  let i = 0;
  // 外側スキャン：コメント行の連続開始位置を探索する
  while (i < isComment.length) {
    // 非コメント行の場合は次行へ進み探索コストを抑える
    if (!isComment[i]) {
      i++;
      continue;
    }

    // 連続開始
    let j = i + 1;
    // 内側スキャン：連続区間の終端直前まで伸ばす
    while (j < isComment.length && isComment[j]) j++;
    const runStart = i;
    const runEnd = j - 1; // 連続最終インデックス
    const runLen = runEnd - runStart + 1;
    // 2行以上連続している場合のみ検出対象として出力する
    if (runLen >= 2) {
      const rel = normalizeOutPath(path.relative(repoRootAbs, filePathAbs));
      // 連続区間内の全隣接ペア（k, k+1）を走査し、各行を1行ずつTSV出力する
      for (let k = runStart; k < runEnd; k++) {
        // ペア (k, k+1) について両行を出力
        const l1 = k + 1; // 1-based
        const l2 = k + 2; // 1-based
        out.push(`${rel}\t${l1}\t${lines[k] ?? ''}`);
        out.push(`${rel}\t${l2}\t${lines[k + 1] ?? ''}`);
      }
    }

    i = j; // 次の非連続位置へ
  }

  return out;
}

/**
 * メイン
 * @returns {void}
 */
function main() {

  const args = parseArgs(process.argv);
  const defaultRoot = getDefaultRoot();
  const root = path.resolve(args.root || defaultRoot);
  const files = listFilesRecursive(root);
  const outLines = [];
  // 走査結果を順に処理して TSV 行を集約する
  for (const fp of files) {
    // 収集したファイルを個別に処理し、検出行を追加していく
    const abs = path.resolve(fp);
    const rows = processFile(abs, root);
    // 検出行が存在する場合のみ出力配列へ追加しノイズを避ける
    if (rows.length > 0) outLines.push(...rows);
  }

  // 出力条件: 直前ループ終了後、検出件数に応じて空行出力を避けつつ1行以上ある時のみ標準出力へ書き出す
  if (outLines.length > 0) {
    // 出力末尾に改行を付与して次の処理系で読みやすくする
    process.stdout.write(`${outLines.join('\n')}\n`);
  }

  // 終了コードは常に 0
  process.exit(0);
}

// 終了方針: 実行例外があってもコマンド用途を阻害しない運用を保証する
try {
  main();
} catch {
  // 例外時はエラーを表出せず静かに 0 終了して呼び出し側のフローを維持する
  process.exit(0);
}
