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

/** @returns {string[]} */
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
 * 重複パターン: JSDoc 終端の直後に別の JSDoc 開始が続く
 * （間に空白/改行は許容）。例: [JSDoc] ... [JSDoc]
 */
const BLOCK_RX = /\/\*\*[\s\S]*?\*\//g;

/** @param {string} content */
function findDuplicates(content) {
  const blocks = collectBlocks(content);
  return collectAdjacentMatches(content, blocks);
}

function collectBlocks(content) {
  const blocks = [];
  let m;
  while ((m = BLOCK_RX.exec(content)) !== null) {
    const start = m.index;
    const end = BLOCK_RX.lastIndex;
    const before = content.slice(0, start);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    const raw = m[0] || '';
    const summary = extractSummary(raw);
    const key5 = first5NoSpace(summary);
    blocks.push({ start, end, line, key5 });
    if (m.index === BLOCK_RX.lastIndex) BLOCK_RX.lastIndex++;
  }
  return blocks;
}

function collectAdjacentMatches(content, blocks) {
  const hits = [];
  for (let i = 0; i + 1 < blocks.length; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    const between = content.slice(a.end, b.start);
    if (!/^[\s]*$/.test(between)) continue;
    if (a.key5 && b.key5 && a.key5 === b.key5) {
      const snippet = content.slice(a.start, Math.min(b.start + 40, a.start + 120)).replace(/\s+/g, ' ').trim();
      hits.push({ line: a.line, snippet, key5: a.key5 });
    }
  }
  return hits;
}

function extractSummary(raw) {
  // 先頭の /** と末尾の */、および各行先頭の * を除去
  const body = raw.replace(/^\/\*\*/,'').replace(/\*\/$/, '');
  const lines = body.split(/\n/).map((l) => l.replace(/^\s*\*\s?/, '').trim());
  for (const l of lines) {
    if (l.length === 0) continue;
    // @tag 行に到達したら終了
    if (l.startsWith('@')) break;
    return l;
  }
  return '';
}

function first5NoSpace(s) {
  if (!s) return '';
  const normalized = s.replace(/\s+/g, '');
  return normalized.slice(0, 5);
}

function main() {
  const targets = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const files = targets.flatMap(listFilesRecursive).filter((f) => /\.(ts|tsx|mts|cts)$/i.test(f));
  const violations = [];
  for (const fp of files) {
    let content = '';
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; }
    const hits = findDuplicates(content);
    if (hits.length > 0) {
      violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
    }
  }
  if (violations.length === 0) {
    process.stdout.write('[policy:jsdoc_no_duplicate] OK: no adjacent JSDoc duplicates (matching first 5 non-whitespace chars)\n');
    process.exit(0);
  }
  process.stderr.write('[policy:jsdoc_no_duplicate] NG: adjacent JSDoc duplicates detected (first 5 non-whitespace chars match)\n');
  for (const v of violations) {
    for (const h of v.hits) {
      process.stderr.write(`${v.file}:${h.line}: duplicate JSDoc (key='${h.key5}') -> ${h.snippet}\n`);
    }
  }
  process.exit(1);
}

try { main(); } catch (e) {
  process.stderr.write(`[policy:jsdoc_no_duplicate] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}


