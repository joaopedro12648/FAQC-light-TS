#!/usr/bin/env node
/**
 * @file コメント言語のロケール整合チェック（ja系ロケール時はASCIIのみのヘッダJSDocを禁止）
 * 備考:
 * - 目的: ロケールが ja（ja, ja-JP, など）の場合、各ファイルの先頭JSDocが ASCII のみで構成されていれば失敗とする
 * - 対象: JS/TS（*.{js,cjs,mjs,ts,tsx,mts,cts}）
 * - 例外: ヘッダJSDocが存在しない/検出できない場合は他ルールに委ねる（本ポリシーでは不検出＝スキップ）
 * - ロケール判定: CLI引数(--locale=xx) > 環境変数(CHECK_LOCALE) > OS/Nodeロケール
 * - 表記: 1つでも非ASCII文字（例: 日本語）が含まれていればOK
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
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
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
  while (stack.length) {
    const d = stack.pop();
    if (!d) break;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }

    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);
      if (EXCLUDE_DIRS.has(base)) continue;
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(full);
    }
  }

  return files;
}

/**
 * すべてのブロックコメント（/* ... *\/ および /** ... *\/）を抽出する。
 * @param {string} content ファイル全文
 * @returns {Array<{raw:string,start:number,end:number}>} 抽出したブロックコメント配列
 */
function collectAllBlockComments(content) {
  const out = [];
  const rx = /\/\*[\s\S]*?\*\//g;
  let m;
  while ((m = rx.exec(content)) !== null) {
    const raw = m[0] || '';
    out.push({ raw, start: m.index, end: rx.lastIndex });
    if (m.index === rx.lastIndex) rx.lastIndex++;
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
  if (!s) return true;
  // 可視文字領域に着目（空白や改行は無視）
  const visible = s.replace(/\s+/g, '');
  if (visible.length === 0) return true;
  return /^[\x00-\x7F]+$/.test(visible);
}

/**
 * エントリポイント。
 */
function main() {
  const { lang } = resolveEffectiveLocale();
  const strictness = resolveStrictness();
  // ja 系以外は何もしない（成功扱い）
  if (lang.toLowerCase() !== 'ja') {
    process.stdout.write('[policy:comment_locale] SKIP: non-ja locale\n');
    process.exit(0);
  }

  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const files = roots.flatMap(listFilesRecursive).filter((f) => EXT_RX.test(f));

  const violations = [];
  for (const fp of files) {
    let content = '';
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; }

    const blocks = collectAllBlockComments(content);
    // 対象は JSDoc 風（/** で開始）のみ
    const jsdocBlocks = blocks.filter((b) => b.raw.startsWith('/**'));
    if (jsdocBlocks.length === 0) continue;

    // 厳格度: 'all' は全JSDocに非ASCIIを要求、'any' は少なくとも1つのJSDocが非ASCIIならOK
    const asciiOnlyFlags = jsdocBlocks.map((b) => isAsciiOnly(normalizeBlockText(b.raw)));
    const violate =
      strictness === 'all'
        ? asciiOnlyFlags.some((f) => f === true) // どれか1つでもASCII-onlyなら違反
        : asciiOnlyFlags.every((f) => f === true); // 全てASCII-onlyなら違反（1つでも非ASCIIがあればOK）

    if (violate) {
      violations.push({ file: path.relative(PROJECT_ROOT, fp) });
    }
  }

  if (violations.length === 0) {
    process.stdout.write('[policy:comment_locale] OK: 日本語ロケール下で全ブロックコメントに非ASCIIが含まれています\n');
    process.exit(0);
  }

  process.stderr.write('[policy:comment_locale] NG: 日本語ロケールでは、すべてのJSDocブロックを日本語で記述してください（ASCIIのみは不可）\n');
  for (const v of violations) {
    process.stderr.write(`${v.file}: 日本語ロケール下ではJSDocブロックを日本語で書いてください\n`);
  }

  process.exit(1);
}

try { main(); } catch (e) {
  process.stderr.write(`[policy:comment_locale] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}
