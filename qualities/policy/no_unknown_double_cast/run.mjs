#!/usr/bin/env node
/**
 * @file 二重キャスト禁止ポリシーのランナー
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
 * @see vibecoding/var/contexts/qualities/policy/no_unknown_double_cast/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['.'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

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

const RX = /as\s+unknown\s+as/g;

function scan(content) {
  const hits = [];
  let m;
  while ((m = RX.exec(content)) !== null) {
    const before = content.slice(0, m.index);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    const snippet = content.slice(m.index, m.index + 40).replace(/\s+/g, ' ').trim();
    hits.push({ line, snippet });
    if (m.index === RX.lastIndex) RX.lastIndex++;
  }
  return hits;
}

function main() {
  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const files = roots.flatMap(listFilesRecursive).filter((f) => /\.(ts|tsx|mts|cts)$/.test(f));
  const violations = [];
  for (const fp of files) {
    let content = '';
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; }
    const hits = scan(content);
    if (hits.length) violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
  }
  if (violations.length === 0) {
    process.stdout.write('[policy:no_unknown_double_cast] OK: no "as unknown as" found\n');
    process.exit(0);
  }
  process.stderr.write('[policy:no_unknown_double_cast] NG: "as unknown as" double cast detected\n');
  for (const v of violations) for (const h of v.hits) process.stderr.write(`${v.file}:${h.line}: ${h.snippet}\n`);
  process.exit(1);
}

try { main(); } catch (e) {
  process.stderr.write(`[policy:no_unknown_double_cast] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}


