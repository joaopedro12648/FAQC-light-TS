/**
 * @file anti_mvp ポリシーのエントリポイント
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { run as bannedTerms } from './checks/banned_terms';
import { run as todoTicketRequired } from './checks/todo_ticket_required';
import type { CheckFn, PolicyConfig, RunnerResult, Violation } from './types';

/**
 * banned_terms 可変構築用型
 */
type MutableBannedTerms = { patterns?: string[]; paths?: string[]; word_boundary?: boolean };
/**
 * todo_ticket_required 可変構築用型
 */
type MutableTodo = { regex?: string; paths?: string[] };

/**
 * 指定ブロックの行を抽出
 * @param lines - 全行
 * @param start - 開始行の正規表現
 * @param end - 終了行（次ブロック開始）の正規表現
 * @returns 抽出したブロック行（開始行の次から終了直前まで）
 */
function sliceBlock(
  lines: readonly string[],
  start: RegExp,
  end: RegExp
): readonly string[] {
  const norm = (s: string) => s.trimEnd();
  const sIdx = lines.findIndex((l) => start.test(norm(l)));
  if (sIdx === -1) return [];
  const after = lines.slice(sIdx + 1);
  const baseLine = lines[sIdx] ?? '';
  const baseIndent = (/^(\s*)/.exec(baseLine)?.[1] ?? '').length;
  const endIdx = findBlockEnd(after, end, baseIndent);
  const eAbs = endIdx === -1 ? lines.length : sIdx + 1 + endIdx;
  return lines.slice(sIdx + 1, eAbs);
}

/**
 * ブロックの終了位置を検出
 * @param after - 開始行以降の行
 * @param end - 明示的終端の正規表現
 * @param baseIndent - 開始行のインデント幅
 * @returns 終了行の相対インデックス（見つからなければ -1）
 */
function findBlockEnd(after: readonly string[], end: RegExp, baseIndent: number): number {
  for (let i = 0; i < after.length; i += 1) {
    const rawLine = after[i] ?? '';
    const ind = (/^(\s*)/.exec(rawLine)?.[1] ?? '').length;
    const trimmed = rawLine.trimEnd();
    if (end.test(trimmed)) return i;
    if (ind <= baseIndent && /^\s*[a-zA-Z0-9_]+:\s*$/.test(trimmed)) return i;
  }

  return -1;
}

/**
 * banned_terms ブロックを抽出
 * @param lines - YAML 行列
 * @returns 抽出結果（なければ undefined）
 */
function parseBannedTerms(lines: readonly string[]): MutableBannedTerms | undefined {
  const block = sliceBlock(lines, /^\s*banned_terms:\s*$/, /^\s*todo_ticket_required:\s*$/);
  if (block.length === 0) return undefined;
  const out: MutableBannedTerms = {};
  let inPatterns = false;
  for (const raw of block) {
    const l = raw.trimEnd();
    if (/^\s*patterns:\s*$/.test(l)) { inPatterns = true; out.patterns = []; continue; }

    const mPat = l.match(/^\s*-\s+"?(.+?)"?\s*$/);
    if (inPatterns && mPat && mPat[1] !== undefined) { out.patterns!.push(mPat[1]); continue; }

    const mWB = l.match(/^\s*word_boundary:\s*(true|false)\s*$/);
  if (mWB) { out.word_boundary = mWB[1] === 'true'; continue; }

  if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * todo_ticket_required ブロックを抽出
 * @param lines - YAML 行列
 * @returns 抽出結果（なければ undefined）
 */
function parseTodo(lines: readonly string[]): MutableTodo | undefined {
  const block = sliceBlock(lines, /^\s*todo_ticket_required:\s*$/, /^\s*banned_terms:\s*$/);
  if (block.length === 0) return undefined;
  const out: MutableTodo = {};
  for (const raw of block) {
    const l = raw.trimEnd();
  const mRegex = l.match(/^\s*regex:\s*"(.+)"\s*$/);
    if (mRegex && mRegex[1] !== undefined) { out.regex = mRegex[1]; continue; }

  if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * banned_terms ノードを型安全に構築
 * @param banned - 可変情報
 * @returns 読み取り専用ノード（または undefined）
 */
type BannedNode = { readonly patterns?: readonly string[]; readonly paths?: readonly string[]; readonly word_boundary?: boolean };

/**
 * banned_terms ノードを型安全に構築
 * @param banned 可変情報
 * @returns 読み取り専用ノード（または undefined）
 */
function buildBannedNode(
  banned: MutableBannedTerms | undefined
): BannedNode | undefined {
  if (!banned) return undefined;
  const out: { patterns?: readonly string[]; paths?: readonly string[]; word_boundary?: boolean } = {};
  if (banned.patterns && banned.patterns.length) out.patterns = banned.patterns.slice();
  if (banned.paths && banned.paths.length) out.paths = banned.paths.slice();
  if (banned.word_boundary !== undefined) out.word_boundary = banned.word_boundary;
  return Object.keys(out).length ? (out as BannedNode) : undefined;
}

/**
 * todo_ticket_required ノードを型安全に構築
 * @param todo - 可変情報
 * @returns 読み取り専用ノード（または undefined）
 */
function buildTodoNode(
  todo: MutableTodo | undefined
): { readonly regex?: string; readonly paths?: readonly string[] } | undefined {
  if (!todo) return undefined;
  const node: { readonly regex?: string; readonly paths?: readonly string[] } = {
    ...(todo.regex !== undefined ? { regex: todo.regex } : {}),
    ...(todo.paths && todo.paths.length ? { paths: todo.paths.slice() } : {})
  };
  return Object.keys(node).length ? node : undefined;
}

/**
 * YAML を最小限パースして PolicyConfig を構築
 * @param repoRoot - リポジトリルート
 * @returns PolicyConfig（必要項目のみ）
 */
function readYamlConfig(repoRoot: string): PolicyConfig {
  const yamlPath = path.join(repoRoot, 'contexts', 'qualities', 'policy', 'anti_mvp', 'anti_mvp_policy.yaml');
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const banned = parseBannedTerms(lines);
  const todo = parseTodo(lines);
  const bannedNode = buildBannedNode(banned);
  const todoNode = buildTodoNode(todo);
  const checks = {
    ...(bannedNode ? { banned_terms: bannedNode } : {}),
    ...(todoNode ? { todo_ticket_required: todoNode } : {})
  } as {
    readonly banned_terms?: { readonly patterns?: readonly string[]; readonly paths?: readonly string[] };
    readonly todo_ticket_required?: { readonly regex?: string; readonly paths?: readonly string[] };
  };
  return { checks } as PolicyConfig;
}

// reserved for future use: formatting is handled by the runner

/**
 * すべてのチェックを実行して結果を返す
 * @param rootDir - リポジトリルート
 * @returns 実行結果
 */
export async function runAll(rootDir: string): Promise<RunnerResult> {
  const cfg = readYamlConfig(rootDir);
  const checks: readonly [string, CheckFn][] = [
    ['banned_terms', bannedTerms],
    ['todo_ticket_required', todoTicketRequired]
  ];

  const allViolations: Violation[] = [];
  for (const [ruleId, fn] of checks) {
    try {
      const vs = await fn(rootDir, cfg);
      for (const v of vs) allViolations.push(v);
    } catch (e) {
      allViolations.push({ ruleId, message: `checker crashed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return { ok: allViolations.length === 0, violations: allViolations };
}

// index.ts はランナーからのみ使用される

