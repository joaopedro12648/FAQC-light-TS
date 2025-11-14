#!/usr/bin/env node
/**
 * @file コメント言語のロケール整合チェック（ja系ロケール時は「ASCIIのみ」のJSDocを禁止）
 * 備考:
 * - 目的: ロケールが ja（ja, ja-JP, など）の場合、「JSDoc ブロックが ASCII 可視文字のみ」なら失敗とする
 * - 対象: JS/TS（*.{js,cjs,mjs,ts,tsx,mts,cts}）
 * - 例外: ヘッダJSDocが存在しない/検出できない場合は他ルールに委ねる（本ポリシーでは不検出＝スキップ）
 * - ロケール判定: CLI引数(--locale=xx) > 環境変数(CHECK_LOCALE) > OS/Nodeロケール
 * - 表記: 1つでも 非ASCII（例: 日本語）が含まれていれば OK。ASCII 可視文字のみは NG。
 * - 出力: OK/NG を一行と、NG時はファイルごとの指摘行を出力
 * - 安全側: ロケール不明時はスキップ（OK 扱い）
 * - 実行: 品質ゲート（policies）で自動実行し CI/ローカル共通で適用
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @see vibecoding/var/contexts/qualities/policy/comment_locale/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['.'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'tmp', 'scripts/tmp']);
const EXT_RX = /\.(js|cjs|mjs|ts|tsx|mts|cts)$/i;

/**
 * CLI 引数からロケールを取得する。
 * @param {string[]} argv プロセス引数（先頭2要素除去後）
 * @returns {string} ロケール文字列（なければ空）
 */
function getArgLocale(argv) {
  const arg = argv.find((a) => a.startsWith('--locale='));
  return arg ? (arg.split('=')[1] || '').trim() : '';
}

/**
 * 環境変数からロケールを取得する。
 * @returns {string} ロケール文字列（なければ空）
 */
function getEnvLocale() {
  return (process.env.CHECK_LOCALE || '').trim();
}

/**
 * OS/Node からロケールを推定する（失敗時は空文字）。
 * @returns {string} 推定ロケール
 */
function getOsLocale() {
  // 実行環境からロケールを推定する
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    // ロケール取得に失敗した場合は空文字へフォールバックする
    return '';
  }
}

/**
 * エフェクティブロケールを決定する。
 * 優先度: CLI(--locale=) > env(CHECK_LOCALE) > OS/Node
 * @returns {{locale:string, lang:string}} locale は原文、lang は言語部分（ja等）
 */
function resolveEffectiveLocale() {
  const argv = process.argv.slice(2);
  const locale = getArgLocale(argv) || getEnvLocale() || getOsLocale();

  const lang = (locale || '').split(/[-_]/)[0] || '';

  return { locale, lang };
}

/**
 * CLI 引数から厳格度を取得する（--strict=all|any）。
 * 既定は 'any'（ファイル内のJSDocのどれか1つに非ASCIIがあればOK）。
 * 'all' は全JSDocが非ASCIIを含むことを要求。
 * @param {string[]} argv プロセス引数（先頭2要素除去後）
 * @returns {'all'|'any'} 厳格度
 */
function getArgStrict(argv) {
  const a = argv.find((s) => s.startsWith('--strict='));
  const v = a ? (a.split('=')[1] || '').trim().toLowerCase() : '';
  return v === 'all' ? 'all' : 'any';
}

/**
 * 環境変数から厳格度を取得する（COMMENT_LOCALE_STRICT=all|any）。
 * @returns {'all'|'any'} 厳格度
 */
function getEnvStrict() {
  const v = (process.env.COMMENT_LOCALE_STRICT || '').trim().toLowerCase();
  return v === 'all' ? 'all' : 'any';
}

/**
 * 厳格度を決定する。優先度: CLI > ENV > 既定('any')
 * @returns {'all'|'any'} 厳格度
 */
function resolveStrictness() {
  const argv = process.argv.slice(2);
  const s = getArgStrict(argv) || getEnvStrict() || 'any';
  return s === 'all' ? 'all' : 'any';
}

/**
 * ディレクトリ以下のファイルを再帰的に列挙する。
 * @param {string} dir 起点ディレクトリ
 * @returns {string[]} 発見したファイルパス
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // スタックが空になるまでディレクトリ走査を続ける
  while (stack.length) {
    const d = stack.pop();
    // 無効なエントリに遭遇した場合は走査を中断する
    if (!d) break;
    let entries;
    // 配下のエントリ一覧を取得して走査キューを展開する
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch {
      // 読み取り失敗は記録せず対象のみ除外し探索を継続する
      continue;
    }

    // エントリを順に評価しファイルとディレクトリを振り分ける
    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);
      // 除外対象のディレクトリ名は走査から外す
      if (EXCLUDE_DIRS.has(base)) continue;
      // ディレクトリはスタックに積んで再帰的に探索する
      if (e.isDirectory()) stack.push(full); // 下位ディレクトリを後続探索のためキューへ積む
      // ファイルは一覧に追加する
      else if (e.isFile()) files.push(full); // ファイルを検出し一覧へ追加する
    }
  }

  return files;
}

/**
 * 行コメント（// ...）を読み飛ばす。
 * @param {string} content 入力ソース
 * @param {number} i '//' 直後の位置
 * @returns {number} 改行位置または末尾の位置
 */
// --- simple lexing helpers (reduce complexity by consuming tokens) ---
function consumeLine(content, i) {
  const n = content.length;
  // 改行に到達するまで1文字ずつ進めて行末まで読み飛ばす
  while (i < n && content[i] !== '\n') i += 1;
  return i;
}

/**
 * クォート文字列（'...' または "..."）を読み飛ばす。
 * @param {string} content 入力ソース
 * @param {number} i 開きクォート位置
 * @param {string} quote クォート文字（' または "）
 * @returns {number} 閉じクォートの次の位置
 */
function consumeQuoted(content, i, quote) {
  const n = content.length;
  // i points at the opening quote
  i += 1;
  // 閉じクォートに到達するまで文字列を読み飛ばす
  while (i < n) {
    const ch = content[i];
    // エスケープシーケンスは2文字進める
    if (ch === '\\') {

      i += 2;
      continue;
    }

    // 対応するクォートに到達したら終了する
    if (ch === quote) {

      i += 1;
      break;
    }

    i += 1;
  }

  return i;
}

/**
 * テンプレートリテラル（`...`）を読み飛ばす（${} は簡易無視）。
 * @param {string} content 入力ソース
 * @param {number} i 開きバッククォート位置
 * @returns {number} 閉じバッククォートの次の位置
 */
function consumeTemplate(content, i) {
  const n = content.length;
  // i at backtick
  i += 1;
  // 閉じバッククォートに到達するまでテンプレート文字列を読み飛ばす
  while (i < n) {
    const ch = content[i];
    // エスケープは2文字進める
    if (ch === '\\') {

      i += 2;
      continue;
    }

    // 閉じバッククォートに到達したら終了する
    if (ch === '`') {

      i += 1;
      break;
    }

    i += 1;
  }

  return i;
}

/**
 * ブロックコメント（/* ... *\/）を読み取り、終端まで進める。
 * @param {string} content 入力ソース
 * @param {number} i 開始インデックス（'/' の位置）
 * @returns {{end:number, raw:string}} 終端位置と元コメント文字列
 */
function consumeBlock(content, i) {
  const n = content.length;
  const start = i;
  // i at '/'
  i += 2; // skip '/*'
  // ブロック終端の */ に到達するまで読み進める
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';
    // */ を検出したらブロックコメントの終端として確定する
    if (ch === '*' && next === '/') {

      const end = i + 2;
      return { end, raw: content.slice(start, end) };
    }

    i += 1;
  }

  // unterminated; return until end
  return { end: n, raw: content.slice(start) };
}

/**
 * 文字列/テンプレートを除外して、実際のブロックコメントのみを収集する。
 * @param {string} content 入力ソース全文
 * @returns {Array<{raw:string,start:number,end:number}>} 収集したブロックコメント配列
 */
function collectAllBlockComments(content) {
  const out = [];
  const n = content.length;
  let i = 0;

  // 末尾に到達するまで字句的に走査してブロックコメントのみを収集する
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';

    // 行コメントを検出したら次の改行まで読み飛ばしてスキップする
    if (ch === '/' && next === '/') {

      i = consumeLine(content, i + 2);
      continue;
    }

    // ブロックコメントを検出したら終端まで読み進めて収集する
    if (ch === '/' && next === '*') {

      const { end, raw } = consumeBlock(content, i);
      out.push({ raw, start: i, end });
      i = end;
      continue;
    }

    // 文字列リテラルは検査対象外（単一引用符は終端まで読み飛ばす）
    if (ch === '\'') {

      i = consumeQuoted(content, i, '\'');
      continue;
    }

    // 二重引用符の文字列リテラルを終端まで読み飛ばす
    if (ch === '"') {

      i = consumeQuoted(content, i, '"');
      continue;
    }

    // テンプレートリテラルを終端まで読み飛ばす
    if (ch === '`') {

      i = consumeTemplate(content, i);
      continue;
    }

    i += 1;
  }

  return out;
}

/**
 * ブロックコメント本文から飾りを落として素のテキストを得る。
 * @param {string} raw ブロックコメント文字列（開始/終端トークンを含む）
 * @returns {string} 整形後テキスト
 */
function normalizeBlockText(raw) {
  const body = raw.replace(/^\/\*+/, '').replace(/\*\/$/, '');
  const lines = body
    .split(/\r?\n/)
    // 行頭の * と空白を可能なら除去（JSDoc/一般ブロック双方を許容）
    .map((l) => l.replace(/^\s*\*?\s?/, '').trim());
  return lines.join('\n').trim();
}

/**
 * ASCII のみかを判定する（制御/改行を除く可視文字のみの判定）。
 * @param {string} s 入力
 * @returns {boolean} ASCII のみなら true
 */
function isAsciiOnly(s) {
  // 空文字は ASCII のみと同等扱いとする
  if (!s) return true;
  // 可視文字から末尾の連続した句読点/記号を落として判定（元のファイルは変更しない）
  const visible = s.replace(/\s+/g, '');
  const stripped = visible.replace(/[\p{P}\p{S}]+$/u, '');
  // 可視文字が空になった場合は ASCII のみと同等に扱う
  if (stripped.length === 0) return true;
  return /^[\x00-\x7F]+$/.test(stripped);
}

/**
 * パスまたはURLらしさを判定する（行単位、周辺空白は無視）。
 * 例: "http://...", "https://...", "file://...", "vibecoding/var/....md", "../path/file.ts", "C:\path\to\file.ts"
 * @param {string} s 入力行
 * @returns {boolean} パス/URLとみなせるなら true
 */
function isPathOrUrl(s) {
  // 入力が空の場合はパス/URLとはみなさない（早期に不一致で返す）
  if (!s) return false;
  const t = s.trim();
  // URL とみなせる形式（<scheme>://...）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+$/.test(t)) return true;
  // Windows のドライブレターで始まる絶対パス
  if (/^[A-Za-z]:\\/.test(t)) return true;
  // 相対パス（../, ./, .\, ..\ など）
  if (/^\.{0,2}[\\/]/.test(t)) return true;
  // スラッシュを含み拡張子らしき終端を持つパス
  if (/[\\/]/.test(t) && /\.[A-Za-z0-9]+(?:[?#].*|$)/.test(t)) return true;
  return false;
}

/**
 * 対象ファイル一覧を取得する。
 * @returns {string[]} 検査対象ファイルパス
 */
function enumerateTargetFiles() {
  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  return roots.flatMap(listFilesRecursive).filter((f) => EXT_RX.test(f));
}

/**
 * ブロック内の ASCII のみ候補行インデックスを収集する。
 * - '/**' と '*\/' の行、空行、JSDocタグ行（@〜）、パス/URL行は除外
 * @param {string[]} rawLines ブロックコメントの生行配列
 * @returns {number[]} ASCII のみ候補行のインデックス配列
 */
function collectAsciiOnlyLineIndexes(rawLines) {
  const indexes = [];
  // 各行を走査し、規則により除外した上で ASCII のみの候補行を収集する
  for (let i = 0; i < rawLines.length; i += 1) {
    const rawLn = rawLines[i] || '';
    // 開始/終端行は候補外（JSDoc の枠）
    if (/\/\*\*/.test(rawLn) || /^\s*\*\/\s*$/.test(rawLn)) continue;
    const norm = rawLn.replace(/^\s*\*?\s?/, '').trim();
    // 内容がない行は評価対象外
    if (norm.length === 0) continue;
    // JSDoc のタグ行（@param 等）は対象外
    if (/^@/.test(norm)) continue;
    // パス/URL 行は対象外（可読性ガイドの例外）
    if (isPathOrUrl(norm)) continue;
    // 実質的に ASCII のみで構成される行を候補として記録
    if (isAsciiOnly(norm)) indexes.push(i);
  }

  return indexes;
}

/**
 * 厳格度に応じて違反とみなすかを判定する。
 * @param {'all'|'any'} strictness 厳格度
 * @param {string[]} rawLines ブロックの生行配列
 * @param {number[]} asciiOnlyLineIndexes ASCII のみ候補行のインデックス配列
 * @returns {boolean} 報告対象なら true
 */
function isBlockViolation(strictness, rawLines, asciiOnlyLineIndexes) {
  // any: 候補が1つでもあれば違反
  if (strictness === 'any') return asciiOnlyLineIndexes.length > 0;
  // all: 候補が無ければ違反ではない
  if (asciiOnlyLineIndexes.length === 0) return false;
  const normalizedContentLines = rawLines
    .map((rawLn) => (rawLn || '').replace(/^\s*\*?\s?/, '').trim())
    .filter((norm) => norm.length > 0 && !/^@/.test(norm) && !isPathOrUrl(norm));
  return normalizedContentLines.every((norm) => isAsciiOnly(norm));
}

/**
 * 単一ファイルを解析し、違反（file:line）を収集する。
 * @param {string} fp 対象ファイルパス
 * @param {'all'|'any'} strictness 厳格度
 * @returns {Array<{file:string,line:number}>} 違反の配列
 */
function analyzeFileForViolations(fp, strictness) {
  let content = '';
  // ヘッダJSDocの検査対象を抽出するためにファイル本文を読み込む
  try {
    content = fs.readFileSync(fp, 'utf8');
  } catch {
    // 読み取り失敗は検査不能として記録し当該ファイルを除外する
    return [];
  }

  const blocks = collectAllBlockComments(content);
  const jsdocBlocks = blocks.filter((b) => b.raw.startsWith('/**'));
  // ヘッダJSDocが無いファイルは本ポリシーの対象外
  if (jsdocBlocks.length === 0) return [];

  const out = [];
  // 各 JSDoc ブロックを評価し、違反候補の行番号を抽出する
  for (const b of jsdocBlocks) {
    const startLine = (content.slice(0, b.start).match(/\r?\n/g) || []).length + 1;
    const rawLines = b.raw.split(/\r?\n/);
    const asciiOnlyLineIndexes = collectAsciiOnlyLineIndexes(rawLines);
    const shouldReport = isBlockViolation(strictness, rawLines, asciiOnlyLineIndexes);
    // 違反なしのブロックは次へ
    if (!shouldReport) continue;
    // 違反の各行を file:line 形式で収集する
    for (const idx of asciiOnlyLineIndexes) {
      out.push({ file: path.relative(PROJECT_ROOT, fp), line: startLine + idx });
    }
  }

  return out;
}

/**
 * 検査結果を出力し、適切な終了コードで終了する。
 * @param {Array<{file:string,line:number}>} violations 違反配列
 */
function reportResult(violations) {
  // 違反ゼロなら成功として終了
  if (violations.length === 0) {
    process.stdout.write('[policy:comment_locale] OK: ASCIIのみのJSDoc行は検出されませんでした\n');
    process.exit(0);
  }

  process.stderr.write('[policy:comment_locale] NG: 日本語ロケールでは「ASCIIのみ」のJSDoc行は禁止です。品質コンテキストのルールに従った言語でのコメントを書くべきであり、文末にマルチバイト文字を追加するなどではなく、全体を該当言語に翻訳してください。\n');
  // 具体的な修正箇所を file:line で列挙し、利用者に明示する
  for (const v of violations) {
    const loc = typeof v.line === 'number' ? `${v.file}:${v.line}` : v.file;
    process.stderr.write(`${loc}: ASCIIのみのJSDoc行を避け、各行に非ASCII（例: 日本語）を含めてください。品質コンテキストのルールに従った言語でのコメントを書くべきであり、文末にマルチバイト文字を追加するなどではなく、全体を該当言語に翻訳してください。\n`);
  }

  process.exit(1);
}

/**
 * エントリポイント。小さなステップの合成に限定し、関数の複雑度を抑制する。
 */
function main() {
  const { lang } = resolveEffectiveLocale();
  const strictness = resolveStrictness();
  // ja 系以外は何もしない（成功）。ja 系のみ本ポリシーを適用する
  if (lang.toLowerCase() !== 'ja') {
    process.stdout.write('[policy:comment_locale] SKIP: non-ja locale\n');
    process.exit(0);
  }

  // 対象ファイルを列挙し、違反を集計して結果を出力する
  const files = enumerateTargetFiles();
  const violations = files.flatMap((fp) => analyzeFileForViolations(fp, strictness));
  reportResult(violations);
}

// エントリポイント: 実行時の想定外例外を捕捉し異常終了コードを返す
try { main(); } catch (e) {
  // 実行時の致命的例外はメッセージを出力して異常終了とする
  process.stderr.write(`[policy:comment_locale] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}
