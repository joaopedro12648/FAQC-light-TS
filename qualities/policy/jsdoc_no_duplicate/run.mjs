#!/usr/bin/env node
/**
 * @file JSDoc 重複防止ポリシーのランナー
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
 * @see vibecoding/var/contexts/qualities/policy/jsdoc_no_duplicate/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
/**
 * ポリシー: 隣接する重複 JSDoc ブロックを検出（/** ... *\/ の直後に /** ... *\/）
 * 失敗条件: リポジトリ全体の TS/** で重複が見つかった場合に失敗。
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['.'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/**
 * ディレクトリ以下のファイルを再帰的に列挙する。
 * @param {string} dir 起点ディレクトリ（絶対/相対いずれも可）
 * @returns {string[]} 発見したファイルの絶対パス配列
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // スタックが空になるまで深さ優先で走査し、対象ファイルを列挙する
  // 未処理ディレクトリが残る間は深さ優先で探索を継続する
  while (stack.length) {
    const d = stack.pop();
    // 無効な参照は安全側で打ち切る
    if (!d) break;
    let entries;
    // ディレクトリ読み取り失敗時は当該ノードをスキップして継続する
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }

    // 子要素を評価して探索キューと結果集合を更新する
    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);
      // 除外対象ディレクトリは走査から外す
      if (EXCLUDE_DIRS.has(base)) continue;
      // 下位ディレクトリは後続探索へ積む
      if (e.isDirectory()) stack.push(full); // 下位ディレクトリを後続探索へ積む
      else if (e.isFile()) files.push(full);
    }
  }

  return files;
}

/**
 * 重複パターン: JSDoc 終端の直後に別の JSDoc 開始が続く
 * （間に空白/改行は許容）。例: [JSDoc] ... [JSDoc]
 */
const BLOCK_RX = /\/\*\*[\s\S]*?\*\//g;

/**
 * 連続した JSDoc ブロックの重複候補を検出する。
 * @param {string} content ファイル全文
 * @returns {Array<{line:number,snippet:string,key5:string,commonTags:string[],key5Dup:boolean}>} 重複候補一覧
 */
function findDuplicates(content) {
  const blocks = collectBlocks(content);
  return collectAdjacentMatches(content, blocks);
}

/**
 * ファイル中の JSDoc ブロックを抽出する。
 * @param {string} content ファイル全文
 * @returns {Array<{start:number,end:number,line:number,key5:string,tags:string[]}>} 位置情報と要約を含む配列
 */
function collectBlocks(content) {
  const blocks = [];
  let m;
  // JSDoc ブロックの一致を順次走査して位置情報を収集する
  while ((m = BLOCK_RX.exec(content)) !== null) {
    const start = m.index;
    const end = BLOCK_RX.lastIndex;
    const before = content.slice(0, start);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    const raw = m[0] || ''; // 一致しなかった場合の安全な代替を確保する
    const summary = extractSummary(raw);
    const key5 = first5NoSpace(summary);
    const tags = extractTags(raw);
    blocks.push({ start, end, line, key5, tags });
    // 同位置一致の無限ループを避けるため検索位置を進める
    if (m.index === BLOCK_RX.lastIndex) BLOCK_RX.lastIndex++;
  }

  return blocks;
}

/**
 * 連続配置された JSDoc ブロック間で、要約 key5 またはタグ集合が重複する組を収集する。
 * @param {string} content ファイル全文
 * @param {Array<{start:number,end:number,line:number,key5:string,tags:string[]}>} blocks 解析済みブロック
 * @returns {Array<{line:number,snippet:string,key5:string,commonTags:string[],key5Dup:boolean}>} 重複候補一覧
 */
function collectAdjacentMatches(content, blocks) {
  const hits = [];
  // 連続する2ブロックを走査して重複候補を抽出する
  for (let i = 0; i + 1 < blocks.length; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    const between = content.slice(a.end, b.start);
    // 間に可視トークンがある場合は重複対象外とする
    if (!/^[\s]*$/.test(between)) continue;
    const key5Dup = Boolean(a.key5 && b.key5 && a.key5 === b.key5);
    const commonTags = intersectTags(a.tags, b.tags);
    // 要約の一致またはタグ集合の共通がある場合だけ重複候補として扱う
    if (key5Dup || commonTags.length > 0) {

      const snippet = content.slice(a.start, Math.min(b.start + 40, a.start + 120)).replace(/\s+/g, ' ').trim();
      hits.push({ line: a.line, snippet, key5: a.key5, commonTags, key5Dup });
    }
  }

  return hits;
}

/**
 * JSDoc ブロックから要約行（最初の非空行かつタグ行より前）を抽出する。
 * @param {string} raw ブロックコメントの生文字列（/** ～ *\/ を含む）
 * @returns {string} 要約行（見つからなければ空文字）
 */
function extractSummary(raw) {
  // 先頭の /** と末尾の */、および各行先頭の * を除去
  const body = raw.replace(/^\/\*\*/,'').replace(/\*\/$/, '');
  const lines = body.split(/\n/).map((l) => l.replace(/^\s*\*\s?/, '').trim());
  // 行を順に評価して最初の本文行を要約として抽出する
  for (const l of lines) {
    // 空行はスキップして有効な本文のみを対象にする
    if (l.length === 0) continue;
    // @tag 行に到達したら終了
    if (l.startsWith('@')) break;
    return l;
  }

  return '';
}

/**
 * 空白を除去した先頭5文字をキーとして取り出す。
 * @param {string} s 入力文字列
 * @returns {string} 先頭5文字（足りなければ短い文字列）
 */
function first5NoSpace(s) {
  // 空文字は要約不可なので空のキーを返す
  if (!s) return '';
  const normalized = s.replace(/\s+/g, '');
  return normalized.slice(0, 5);
}

/**
 * JSDoc ブロックからタグ名の集合を抽出（厳しめ: 出現するタグ名が1つでも共通なら重複扱い）
 * 例: @param, @returns, @deprecated, @example, @file など
 * @param {string} raw ブロックコメントの生文字列（/** ～ *\/ を含む）
 * @returns {string[]} ソート済みユニークタグ名（小文字）
 */
function extractTags(raw) {
  const body = raw.replace(/^\/\*\*/,'').replace(/\*\/$/, '');
  const lines = body.split(/\n/).map((l) => l.replace(/^\s*\*\s?/, '').trim());
  const tags = new Set();
  // 各行を走査してタグ行のみを収集する
  for (const l of lines) {
    // タグ行以外は対象外として読み飛ばす
    if (!l.startsWith('@')) continue;
    const m = l.match(/^@([A-Za-z][\w-]*)/);
    // 抽出に成功したタグ名のみ集合へ追加する
    if (m && m[1]) tags.add(m[1].toLowerCase());
  }

  return Array.from(tags).sort();
}

/**
 * 2つのタグ配列の共通要素（昇順・ユニーク）
 * @param {string[]} a 配列 A（小文字タグ名）
 * @param {string[]} b 配列 B（小文字タグ名）
 * @returns {string[]} 共通タグの昇順ユニーク配列
 */
function intersectTags(a, b) {
  // いずれかが空集合なら共通要素は存在しない
  if (!a?.length || !b?.length) return [];
  const sb = new Set(b);
  const out = [];
  // 片方の集合を走査して共通するタグのみを収集する
  for (const t of a) {
    // 集合に存在する場合だけ結果へ追加する
    if (sb.has(t)) out.push(t);
  }

  out.sort();
  return Array.from(new Set(out));
}

/**
 * エントリポイント。重複 JSDoc の検査を行い、結果に応じて終了コードを返す。
 * @returns {void} 成功時は 0、検出時は 1、致命時は 2 でプロセス終了
 */
function main() {
  const targets = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const files = targets.flatMap(listFilesRecursive).filter((f) => /\.(ts|tsx|mts|cts)$/i.test(f));
  const violations = [];

  // 各ファイルを読み込み重複候補の検査結果を集約する
  // 対象ファイルを順に検査して違反の有無を集約する
  for (const fp of files) {
    let content = '';

    // 読み取り失敗時は当該ファイルをスキップして処理を継続する
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; } // 読み取り不能なファイルは検査対象から除外する

    const hits = findDuplicates(content);
    // 重複候補が見つかった場合のみ違反リストへ追加する
    if (hits.length > 0) {

      violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
    }
  }

  // 違反が一件も無い場合は成功として即時に終了する
  if (violations.length === 0) {

    process.stdout.write('[policy:jsdoc_no_duplicate] OK: no adjacent JSDoc duplicates (no key5 match and no tag overlap)\n');
    process.exit(0);
  }

  process.stderr.write('[policy:jsdoc_no_duplicate] NG: adjacent JSDoc duplicates detected (key5 match or tag overlap)\n');
  // 収集した違反をファイル単位・候補単位で報告する
  for (const v of violations) {
    // 各候補の概要を整形してstderrへ出力する
    for (const h of v.hits) {
      const reason = h.key5Dup ? `key5='${h.key5}'` : `tags=[${h.commonTags.join(',')}]`;
      process.stderr.write(`${v.file}:${h.line}: duplicate JSDoc (${reason}) -> ${h.snippet}\n`);
    }
  }

  process.exit(1);
}

// エントリポイント実行時の致命エラーを捕捉して終了コードを明確化する
try { main(); } catch (e) {
  process.stderr.write(`[policy:jsdoc_no_duplicate] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}

