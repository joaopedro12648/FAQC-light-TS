#!/usr/bin/env node
/**
 * @file コメント言語のロケール整合チェック（docs ユニット実体）
 * 備考: ロケールが ja 系の場合に「ASCII のみ」の JSDoc を禁止するポリシーの実装を docs 階層へ集約する
 * - 対象: JS/TS 系ファイル内の JSDoc ブロックコメント
 * - 目的: 日本語ロケールでは ASCII 文字だけの説明コメントを残さず、品質コンテキストの言語方針に合わせた本文へ統一する
 * - 前提: 対象ファイルと除外パスは IGNORES（SoT）から導出し、個別 EXCLUDE を増やさない
 * - 厳密度: 厳格モードではブロック全体が ASCII のみである場合に違反とし、緩和モードでは 1 行でも ASCII のみがあれば警告とする
 * - 手法: トークンを誤検知しないよう文字列リテラルやテンプレート、パス/URL を除外しつつブロックコメントだけを解析する
 * - 出力: 違反はファイルパスと行番号付きで stderr に列挙し、CI ログから直接修正箇所を特定できるようにする
 * - 運用: ロケールが ja 以外の環境では SKIP と明示し、ローカル検証と CI 実行の結果が一致するようにする
 * - 継続: 本ランナー自身も日本語コメントと JSDoc 規約に適合させ、ポリシーの自己違反を残さない
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['.'];
/**
 * SoT に基づく除外ディレクトリ名集合を生成（末端ディレクトリ名へ正規化）
 * - comment_locale も SoT IGNORES を単一起源として利用し、個別 EXCLUDE を設けない
 */
const SKIP_DIR_NAMES = (() => {
  const names = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/').pop())
      .filter(Boolean)
  );
  return names;
})();
const EXT_RX = /\.(js|cjs|mjs|ts|tsx|mts|cts)$/i;

/**
 * コマンドライン引数から `--locale=<value>` オプションを取得する。
 * @param {string[]} argv プロセスに渡された引数配列（`process.argv.slice(2)` 相当）
 * @returns {string} `--locale=` で指定されたロケール値（未指定時は空文字）
 */
function getArgLocale(argv) {
  const arg = argv.find((a) => a.startsWith('--locale='));
  return arg ? (arg.split('=')[1] || '').trim() : '';
}

/**
 * 環境変数 CHECK_LOCALE からロケール値を取得する。
 * @returns {string} 環境変数に設定されたロケール値（未設定時は空文字）
 */
function getEnvLocale() {
  return (process.env.CHECK_LOCALE || '').trim();
}

/**
 * 実行環境のデフォルトロケールを OS から推定する。
 * @returns {string} OS 設定に基づくロケール値（取得に失敗した場合は空文字）
 */
function getOsLocale() {
  // OS のロケール設定を取得し、コメントロケール判定の既定値として利用する
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    return '';
  }
}

/**
 * コマンドライン・環境変数・OS 情報を統合して有効ロケールを決定する。
 * @returns {{locale:string,lang:string}} ロケール文字列と ISO 言語コードのペア
 */
function resolveEffectiveLocale() {
  const argv = process.argv.slice(2);
  const locale = getArgLocale(argv) || getEnvLocale() || getOsLocale();
  const lang = (locale || '').split(/[-_]/)[0] || '';
  return { locale, lang };
}

/**
 * コマンドライン引数から `--strict=<any|all>` オプションを取得する。
 * @param {string[]} argv プロセスに渡された引数配列
 * @returns {'any'|'all'} 解釈された厳密度フラグ（不正値や未指定時は 'any'）
 */
function getArgStrict(argv) {
  const a = argv.find((s) => s.startsWith('--strict='));
  const v = a ? (a.split('=')[1] || '').trim().toLowerCase() : '';
  return v === 'all' ? 'all' : 'any';
}

/**
 * 環境変数 COMMENT_LOCALE_STRICT から厳密度フラグを取得する。
 * @returns {'any'|'all'} 解釈された厳密度フラグ（不正値や未設定時は 'any'）
 */
function getEnvStrict() {
  const v = (process.env.COMMENT_LOCALE_STRICT || '').trim().toLowerCase();
  return v === 'all' ? 'all' : 'any';
}

/**
 * コマンドライン・環境変数を統合してコメントロケールチェックの厳密度を決定する。
 * @returns {'any'|'all'} 実際に利用する厳密度フラグ
 */
function resolveStrictness() {
  const argv = process.argv.slice(2);
  const s = getArgStrict(argv) || getEnvStrict() || 'any';
  return s === 'all' ? 'all' : 'any';
}

/**
 * IGNORES を考慮しつつ、指定ディレクトリ配下のファイルパスを再帰的に列挙する。
 * @param {string} dir 走査起点とするディレクトリの絶対または相対パス
 * @returns {string[]} 発見したファイルの絶対パス一覧
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // 未走査ディレクトリがスタックに残っている間は深さ優先で探索を継続する
  while (stack.length) {
    // 無効なディレクトリ参照が入っていた場合はそれ以上の探索を中断して安全側に倒す
    const d = stack.pop();
    // 取り出したディレクトリ参照が falsy な場合は異常値とみなし、これ以上の走査を続けない
    if (!d) break;
    let entries;
    // ファイルシステムの状態が変化しても全体の検査を継続するため、読み取り失敗は局所的に無視する
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch {
      continue;
    }

    // ディレクトリ配下のエントリを列挙し、除外規則を適用しながら次に走査すべき対象を決定する
    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);
      // SoT で定義された除外ディレクトリ名に一致する場合はコメント検査の対象外としてスキップする
      if (SKIP_DIR_NAMES.has(base)) continue;
      // ディレクトリであれば再帰走査のためにスタックへ積み直し、後で中身を検査する
      if (e.isDirectory()) stack.push(full);
      // 通常ファイルであればコメントロケール検査の対象候補として収集する
      else if (e.isFile()) files.push(full);
    }
  }

  return files;
}

/**
 * 現在位置から行末まで読み飛ばし、次行のインデックスを返す。
 * @param {string} content 対象テキスト全体
 * @param {number} i 現在位置のインデックス
 * @returns {number} 次の行の先頭位置となるインデックス
 */
function consumeLine(content, i) {
  const n = content.length;
  // 現在位置から改行までを読み飛ばし、行コメントや不要な行末トークンをスキップする
  while (i < n && content[i] !== '\n') i += 1;
  return i;
}

/**
 * シングルクォートまたはダブルクォートで始まる文字列リテラルを読み飛ばす。
 * @param {string} content 対象テキスト全体
 * @param {number} i 開始クォート位置のインデックス
 * @param {string} quote 開始クォート文字（' または "）
 * @returns {number} 対応する終端クォートの直後位置となるインデックス
 */
function consumeQuoted(content, i, quote) {
  const n = content.length;
  i += 1;
  // 文字列リテラルが終端クォートに到達するまで読み進め、内部のコメント風記号を誤検知しないようにする
  while (i < n) {
    const ch = content[i];
    // エスケープシーケンスは次の 1 文字も含めて一括で読み飛ばし、終端判定を狂わせない
    if (ch === '\\') {
      i += 2;
      continue;
    }

    // 対応する終端クォートに到達したら文字列の終わりとしてループを抜ける
    if (ch === quote) {
      i += 1;
      break;
    }

    i += 1;
  }

  return i;
}

/**
 * テンプレートリテラル（バッククォート区切り）を読み飛ばす。
 * @param {string} content 対象テキスト全体
 * @param {number} i 開始バッククォート位置のインデックス
 * @returns {number} 終端バッククォートの直後位置となるインデックス
 */
function consumeTemplate(content, i) {
  const n = content.length;
  i += 1;
  // テンプレートリテラルの終端バッククォートに到達するまで内容を読み飛ばし、内部の記号をコメントとして扱わない
  while (i < n) {
    const ch = content[i];
    // バックスラッシュによるエスケープを優先的に処理し、` や ${ を安全にスキップする
    if (ch === '\\') {
      i += 2;
      continue;
    }

    // ネストしたバッククォートが現れたところでテンプレートを閉じ、後続のコード解析へ戻る
    if (ch === '\u0060') {
      i += 1;
      break;
    }

    i += 1;
  }

  return i;
}

/**
 * ブロックコメントを読み飛ばし、その生文字列を返す。
 * @param {string} content 対象テキスト全体
 * @param {number} i 開始スラッシュ位置のインデックス
 * @returns {{end:number,raw:string}} 終了位置とブロックコメント文字列
 */
function consumeBlock(content, i) {
  const n = content.length;
  const start = i;
  i += 2;
  // ブロックコメントの終端トークン */ に到達するまで読み進め、コメントの生文字列をそのまま保持する
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';
    // */ が出現した位置をブロックコメントの終わりとみなし、開始位置から終端までを切り出す
    if (ch === '*' && next === '/') {
      const end = i + 2;
      return { end, raw: content.slice(start, end) };
    }

    i += 1;
  }

  return { end: n, raw: content.slice(start) };
}

/**
 * テキスト中に現れるすべてのブロックコメントを抽出する。
 * @param {string} content 対象ファイルの内容
 * @returns {Array<{raw:string,start:number,end:number}>} ブロックコメントの位置と内容一覧
 */
function collectAllBlockComments(content) {
  const out = [];
  const n = content.length;
  let i = 0;
  // ファイル全体を走査し、コメントや文字列を判別しながらブロックコメントのみを抽出する
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';
    // 行コメントの開始を検出した場合はロケール判定対象外として行末まで読み飛ばす
    if (ch === '/' && next === '/') {
      i = consumeLine(content, i + 2);
      continue;
    }

    // ブロックコメントの開始を検出した場合は終端までをまとめて取得し、JSDoc 判定用に保存する
    if (ch === '/' && next === '*') {
      const { end, raw } = consumeBlock(content, i);
      out.push({ raw, start: i, end });
      i = end;
      continue;
    }

    // シングルクォートで始まる文字列リテラルは中身をコメント扱いしないよう終端まで読み飛ばす
    if (ch === '\'') {
      i = consumeQuoted(content, i, '\'');
      continue;
    }

    // ダブルクォートで始まる文字列リテラルも同様に終端まで読み飛ばし、コメント検出から除外する
    if (ch === '"') {
      i = consumeQuoted(content, i, '"');
      continue;
    }

    // バッククォートで始まるテンプレートリテラルはコメント対象外として終端バッククォートまで読み飛ばす
    if (ch === '\u0060') {
      i = consumeTemplate(content, i);
      continue;
    }

    i += 1;
  }

  return out;
}

/**
 * 与えられた文字列が実質的に ASCII 文字のみで構成されているかどうかを判定する。
 * @param {string} s 判定対象文字列
 * @returns {boolean} 非 ASCII 文字を含まない場合 true
 */
function isAsciiOnly(s) {
  // 未定義や空文字列は「実質的な内容が無い」とみなし、ASCII 判定では常に許容とする
  if (!s) return true;
  const visible = s.replace(/\s+/g, '');
  const stripped = visible.replace(/[\p{P}\p{S}]+$/u, '');
  // 空白と記号を除いた結果が空であれば実質的な本文は無いものとして判定をパスさせる
  if (stripped.length === 0) return true;
  return /^[\x00-\x7F]+$/.test(stripped);
}

/**
 * 与えられた文字列がパスまたは URL らしい形式かどうかを判定する。
 * @param {string} s 判定対象文字列
 * @returns {boolean} パスまたは URL とみなせる場合 true
 */
function isPathOrUrl(s) {
  // 空文字や未定義はパス/URL として扱わず、通常のテキストとして後段の判定へ回す
  if (!s) return false;
  const t = s.trim();
  // URL 形式と判定できる文字列はロケール検査の対象外として扱う
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+$/.test(t)) return true;
  // Windows の絶対パス表現であればロケール判定の対象から除外する
  if (/^[A-Za-z]:\\/.test(t)) return true;
  // 相対パスらしい表現もロケール検査ではなくパスとして扱う
  if (/^\.{0,2}[\\/]/.test(t)) return true;
  // 区切り文字と拡張子を含むファイルパスのような文字列もロケール検査対象から除外する
  if (/[\\/]/.test(t) && /\.[A-Za-z0-9]+(?:[?#].*|$)/.test(t)) return true;
  return false;
}

/**
 * 対象ディレクトリ配列から IGNORES を適用した検査対象ファイル一覧を生成する。
 * @returns {string[]} コメントロケール検査の対象とするファイルパス一覧
 */
function enumerateTargetFiles() {
  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  return roots.flatMap(listFilesRecursive).filter((f) => EXT_RX.test(f));
}

/**
 * JSDoc ブロック内の行のうち、ASCII のみとみなされる行のインデックスを収集する。
 * @param {string[]} rawLines ブロックコメントを構成する生の行配列
 * @returns {number[]} ASCII のみと判定された行インデックス配列
 */
function collectAsciiOnlyLineIndexes(rawLines) {
  const indexes = [];
  // ブロック内部の各行を走査し、ASCII のみで構成される本文行のインデックスを収集する
  for (let i = 0; i < rawLines.length; i += 1) {
    const rawLn = rawLines[i] || '';
    // 開始/終了の装飾行は対象外とし、純粋な本文行だけを評価する
    if (/\/\*\*/.test(rawLn) || /^\s*\*\/\s*$/.test(rawLn)) continue;
    const norm = rawLn.replace(/^\s*\*?\s?/, '').trim();
    // 空行・タグ行・パス/URL 行はロケール検査の対象外としてスキップする
    if (norm.length === 0) continue;
    // JSDoc タグ行は本文ではないためロケール違反の判定対象から外す
    if (/^@/.test(norm)) continue;
    // パスや URL のみを記述した行はロケール方針の対象外として扱う
    if (isPathOrUrl(norm)) continue;
    // 残った本文行が ASCII のみで構成されている場合は違反候補としてインデックスを記録する
    if (isAsciiOnly(norm)) indexes.push(i);
  }

  return indexes;
}

/**
 * ブロックコメントがポリシー違反かどうかを判定する。
 * @param {'any'|'all'} strictness 違反判定の厳密度（any: 部分一致で違反, all: 全行 ASCII のみで違反）
 * @param {string[]} rawLines ブロックコメントを構成する生の行配列
 * @param {number[]} asciiOnlyLineIndexes ASCII のみと判定された行インデックス配列
 * @returns {boolean} 違反とみなすべき場合 true
 */
function isBlockViolation(strictness, rawLines, asciiOnlyLineIndexes) {
  // 厳密度 any のときは 1 行でも ASCII のみの本文があれば違反とみなす
  if (strictness === 'any') return asciiOnlyLineIndexes.length > 0;
  // 厳密度 all のときは本文に 1 行も ASCII のみが無ければ即座に非違反と判断する
  if (asciiOnlyLineIndexes.length === 0) return false;
  const normalizedContentLines = rawLines
    .map((rawLn) => (rawLn || '').replace(/^\s*\*?\s?/, '').trim())
    .filter((norm) => norm.length > 0 && !/^@/.test(norm) && !isPathOrUrl(norm));
  return normalizedContentLines.every((norm) => isAsciiOnly(norm));
}

/**
 * 単一ファイルに対してコメントロケール違反検査を実行する。
 * @param {string} fp 検査対象ファイルの絶対パス
 * @param {'any'|'all'} strictness 違反判定の厳密度
 * @returns {Array<{file:string,line:number}>} 検出された違反の位置情報一覧
 */
function analyzeFileForViolations(fp, strictness) {
  let content = '';
  // 検査対象ファイルを読み込み、ロケール違反判定のためのテキスト全文を取得する
  try {
    content = fs.readFileSync(fp, 'utf8');
  } catch {
    return [];
  }

  const blocks = collectAllBlockComments(content);
  const jsdocBlocks = blocks.filter((b) => b.raw.startsWith('/**'));
  // JSDoc ブロックが 1 つも無いファイルはロケール検査の対象外としてスキップする
  if (jsdocBlocks.length === 0) return [];

  const out = [];
  // 抽出した各 JSDoc ブロックについてロケール違反の有無を判定し、違反行を結果リストに集約する
  for (const b of jsdocBlocks) {
    const startLine = (content.slice(0, b.start).match(/\r?\n/g) || []).length + 1;
    const rawLines = b.raw.split(/\r?\n/);
    const asciiOnlyLineIndexes = collectAsciiOnlyLineIndexes(rawLines);
    // ブロック全体がポリシー違反かどうかを判定し、違反でなければ次のブロックへ進む
    const shouldReport = isBlockViolation(strictness, rawLines, asciiOnlyLineIndexes);
    // 違反判定されなかったブロックは報告対象外としてスキップする
    if (!shouldReport) continue;
    // 違反と判定されたブロックについては ASCII のみ行ごとに対応するファイル/行番号を記録する
    for (const idx of asciiOnlyLineIndexes) {
      out.push({ file: path.relative(PROJECT_ROOT, fp), line: startLine + idx });
    }
  }

  return out;
}

/**
 * 検査結果を標準出力または標準エラーへレポートし、終了コードを決定する。
 * @param {Array<{file:string,line:number}>} violations 検出された違反位置一覧
 * @returns {void} 常にプロセス終了を行う（戻り値は使用しない）
 */
function reportResult(violations) {
  // 違反が 1 件も無い場合は OK メッセージを出力し、正常終了コードでプロセスを終了する
  if (violations.length === 0) {
    process.stdout.write('[policy:comment_locale] OK: ASCIIのみのJSDoc行は検出されませんでした\n');
    process.exit(0);
  }

  process.stderr.write(
    '[policy:comment_locale] NG: 日本語ロケールでは「ASCIIのみ」のJSDoc行は禁止です。品質コンテキストのルールに従った言語でのコメントを書くべきであり、文末にマルチバイト文字を追加するなどではなく、全体を該当言語に翻訳してください。\n',
  );
  // 各違反箇所ごとにファイルパスと行番号を整形し、修正対象を特定しやすい形で一覧出力する
  for (const v of violations) {
    const loc = typeof v.line === 'number' ? `${v.file}:${v.line}` : v.file;
    process.stderr.write(
      `${loc}: ASCIIのみのJSDoc行を避け、各行に非ASCII（例: 日本語）を含めてください。品質コンテキストのルールに従った言語でのコメントを書くべきであり、文末にマルチバイト文字を追加するなどではなく、全体を該当言語に翻訳してください。\n`,
    );
  }

  process.exit(1);
}

/**
 * CLI エントリポイント。ロケールと厳密度を決定し、対象ファイル群に対して検査を実行する。
 * @returns {void}
 */
function main() {
  const { lang } = resolveEffectiveLocale();
  const strictness = resolveStrictness();
  // ロケールが ja 系でない環境では本ポリシーの対象外とし、ローカル実行と CI の挙動を一致させるために明示的に SKIP する
  if (lang.toLowerCase() !== 'ja') {
    process.stdout.write('[policy:comment_locale] SKIP: non-ja locale\n');
    process.exit(0);
  }

  const files = enumerateTargetFiles();
  const violations = files.flatMap((fp) => analyzeFileForViolations(fp, strictness));
  reportResult(violations);
}

// ランナー全体のエントリポイントを保護し、想定外の例外が発生した場合でも原因を明示して終了させる
try { main(); } catch (e) {
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  // ランナー自体の致命的な例外はポリシー失敗として扱い、原因メッセージを明示して異常終了する
  process.stderr.write(`[policy:comment_locale] fatal: ${msg}\n`);
  process.exit(2);
}

