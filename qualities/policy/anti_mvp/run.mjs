#!/usr/bin/env node
/**
 * @file Anti-MVP ポリシーチェッカーの薄いランナー
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
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
// [SPEC:SnD-20251027-anti-mvp-policy-checks] Anti-MVP Policy Checks
import fs from 'node:fs';
import path from 'node:path';

// 複雑度を抑えるためのヘルパー
const sliceBlock = (lines, start, end) => {
  const sIdx = lines.findIndex((l) => start.test(l.trimEnd()));
  if (sIdx === -1) return [];
  const after = lines.slice(sIdx + 1);
  const baseIndent = ((/^(\s*)/.exec(lines[sIdx]) || [,''])[1] || '').length;
  let eIdx = lines.length;
  for (let i = 0; i < after.length; i += 1) {
    const raw = after[i];
    const ind = ((/^(\s*)/.exec(raw) || [,''])[1] || '').length;
    if (end.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }

    if (ind <= baseIndent && /^\s*[a-zA-Z0-9_]+:\s*$/.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }
  }

  return lines.slice(sIdx + 1, eIdx);
};

const parseBanned = (lines) => {
  const block = sliceBlock(lines, /^\s*banned_terms:\s*$/, /^\s*todo_ticket_required:\s*$/);
  if (!block.length) return undefined;
  const out = {};
  let inPatterns = false;
  for (const raw of block) {
    const l = raw.trimEnd();
    if (/^\s*patterns:\s*$/.test(l)) { inPatterns = true; out.patterns = []; continue; }

    const mPat = l.match(/^\s*-\s+"?(.+?)"?\s*$/);
    if (inPatterns && mPat) { out.patterns.push(mPat[1]); continue; }

    const mWB = l.match(/^\s*word_boundary:\s*(true|false)\s*$/);
    if (mWB) { out.word_boundary = mWB[1] === 'true'; continue; }

    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

const parseTodo = (lines) => {
  const block = sliceBlock(lines, /^\s*todo_ticket_required:\s*$/, /^\s*banned_terms:\s*$/);
  if (!block.length) return undefined;
  const out = {};
  for (const raw of block) {
    const l = raw.trimEnd();
    const mRegex = l.match(/^\s*regex:\s*"(.+)"\s*$/);
    if (mRegex) { out.regex = mRegex[1]; continue; }

    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

/**
 * ポリシー設定 YAML を読み込み、ランナー用の構造体へ変換する。
 * @param {string} repoRoot リポジトリルート
 * @returns {{checks: Record<string, unknown>}} 解析済み設定オブジェクト
 */
function readYamlConfig(repoRoot) {
  const yamlPath = path.join(repoRoot, 'qualities', 'policy', 'anti_mvp', 'anti_mvp_policy.yaml');
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const cfg = { checks: {} };
  const banned = parseBanned(lines);
  const todo = parseTodo(lines);
  if (banned) cfg.checks.banned_terms = banned;
  if (todo) cfg.checks.todo_ticket_required = todo;
  return cfg;
}

/**
 * ルート配下の TS/TSX ファイル一覧を再帰的に収集する。
 * @param {string} rootDir 走査起点のディレクトリ
 * @returns {string[]} ルートからの相対パス配列
 */
function listAllTsFiles(rootDir) {
  const out = [];
  const IGNORES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
  const TS_EXT_RX = /\.(ts|tsx|mts|cts)$/i;
  /**
   * ディレクトリ配下を深さ優先で走査して TS/TSX を収集する。
   * @param {string} dirAbs 絶対パスのディレクトリ
   * @returns {void}。
   */
  function walk(dirAbs) {
    if (!fs.existsSync(dirAbs)) return;
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const name = entry.name;
      const abs = path.join(dirAbs, name);
      if (entry.isDirectory()) {
        if (IGNORES.has(name)) continue;
        walk(abs);
      } else if (entry.isFile() && TS_EXT_RX.test(name)) {
        out.push(path.relative(rootDir, abs));
      }
    }
  }

  walk(rootDir);
  return out;
}

/**
 * 禁止語チェックを実行し、違反一覧を返す。
 * @param {string} rootDir リポジトリルート
 * @param {{checks?: {banned_terms?: {patterns?: string[], word_boundary?: boolean}}}} cfg 設定
 * @returns {Array<{ruleId:string,message:string,file:string,line:number}>} 違反一覧
 */
function bannedTermsCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.banned_terms;
  if (!rule || !rule.patterns || rule.patterns.length === 0) return [];
  const files = listAllTsFiles(rootDir);
  const escaped = rule.patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joined = escaped.join('|');
  const body = rule.word_boundary ? `\\b(?:${joined})\\b` : `(?:${joined})`;
  const regex = new RegExp(body, 'i');
  const violations = [];
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const m = regex.exec(lines[i]);
      if (m) {
        const found = m[0] ?? '';
        violations.push({ ruleId: 'banned_terms', message: `${rel}:${i + 1} contains "${found}"`, file: rel, line: i + 1 });
      }
    }
  }

  return violations;
}

/**
 * TODO/TICKET 必須チェックを実行し、違反一覧を返す。
 * @param {string} rootDir リポジトリルート
 * @param {{checks?: {todo_ticket_required?: {regex?: string}}}} cfg 設定
 * @returns {Array<{ruleId:string,message:string,file:string,line:number}>} 違反一覧
 */
function todoTicketRequiredCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.todo_ticket_required;
  if (!rule || !rule.regex) return [];
  const files = listAllTsFiles(rootDir);
  const regex = new RegExp(rule.regex, 'i');
  const violations = [];
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (regex.test(lines[i])) violations.push({ ruleId: 'todo_ticket_required', message: `${rel}:${i + 1} missing ticket for TODO/FIXME/HACK`, file: rel, line: i + 1 });
    }
  }

  return violations;
}

// 実行: 2チェックのみ（複雑度を抑制）
/**
 * すべてのチェックを順次実行し、結果を集約する。
 * @param {string} rootDir リポジトリルート
 * @returns {Promise<{ok:boolean,violations:Array<{ruleId:string,message:string,file?:string,line?:number}>}>} 実行結果
 */
async function runAll(rootDir) {
  const cfg = readYamlConfig(rootDir);
  const violations = [];
  try {
    for (const v of bannedTermsCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    violations.push({ ruleId: 'banned_terms', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  try {
    for (const v of todoTicketRequiredCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    violations.push({ ruleId: 'todo_ticket_required', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * エントリポイント
 * @returns {Promise<void>} 非同期実行
 */
async function main() {
  const repoRoot = process.cwd();
  const { ok, violations } = await runAll(repoRoot);
  if (!ok) {
    for (const v of violations) {
      process.stderr.write(`anti-mvp ❌ ${v.ruleId}: ${v.message}\n`);
    }

    process.exit(1);
  }

  process.stdout.write('anti-mvp ✅ no violations\n');
}

main().catch((e) => {
  process.stderr.write(`anti-mvp ❌ runner error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

