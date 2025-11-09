#!/usr/bin/env node
/**
 * @file 緩和禁止ポリシーのランナー
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
 * @see vibecoding/var/contexts/qualities/policy/no_relaxation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
/**
 * ポリシー: リポジトリ全体の TS/** における品質ゲート緩和を禁止
 * 概要: `eslint-disable` や TS の無効化プラグマを検出する。
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const TS_EXT_RX = /\.(ts|tsx|mts|cts)$/i;
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

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
      if (e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

const patterns = [
  /\/\*\s*eslint-disable[^*]*\*\//i,
  /\/\/\s*eslint-disable[^\n]*/i,
  /@ts-ignore\b/i,
  /@ts-nocheck\b/i
];

/** @param {string} fp */
function scanFile(fp) {
  const content = fs.readFileSync(fp, 'utf8');
  const hits = [];
  for (const rx of patterns) {
    if (rx.test(content)) {
      const lines = content.split(/\r?\n/g);
      lines.forEach((line, i) => {
        if (rx.test(line)) hits.push({ line: i + 1, text: line.trim() });
      });
    }
  }
  return hits;
}

function main() {
  const violations = [];
  const files = listFilesRecursive(PROJECT_ROOT).filter((f) => TS_EXT_RX.test(f));
  for (const fp of files) {
    const hits = scanFile(fp);
    if (hits.length > 0) {
      violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
    }
  }
  if (violations.length === 0) {
    process.stdout.write('[policy:no_relaxation] OK: no relaxations found in TS/**\n');
    process.exit(0);
  }
  process.stderr.write('[policy:no_relaxation] NG: relaxations found in TS/**\n');
  for (const v of violations) {
    for (const h of v.hits) {
      process.stderr.write(`${v.file}:${h.line}: ${h.text}\n`);
    }
  }
  process.exit(1);
}

try { main(); } catch (e) {
  process.stderr.write(`[policy:no_relaxation] fatal: ${String((e?.message) || e)}\n`);
  process.exit(2);
}


