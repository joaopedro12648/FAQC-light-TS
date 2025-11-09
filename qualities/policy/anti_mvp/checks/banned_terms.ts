/**
 * @file 禁止語チェック（MVP/フォールバック等）
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

import * as path from 'node:path';
import { globFiles, readText, toAbs } from '../fs-utils';
import type { CheckFn, PolicyConfig, Violation } from '../types';

/**
 * 正規表現を組み立てる（安全にエスケープ）
 * @param patterns - 検出対象の単語/フレーズ配列
 * @param wordBoundary - 単語境界での厳密一致を有効化するか
 * @returns 大文字小文字を無視していずれかにマッチする正規表現
 */
function buildPatternRegex(patterns: readonly string[], wordBoundary: boolean): RegExp {
  const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joined = escaped.join('|');
  const body = wordBoundary ? `\\b(?:${joined})\\b` : `(?:${joined})`;
  return new RegExp(body, 'i');
}

/**
 * 1ファイル内の行を走査し、該当箇所を違反として収集する
 * @param relPath - ルートからの相対パス
 * @param lines - ファイル本文の行配列
 * @param regex - 検出用正規表現
 * @param ruleId - ルールID
 * @returns 収集した違反一覧
 */
function collectViolations(
  relPath: string,
  lines: readonly (string | undefined)[],
  regex: RegExp,
  ruleId: string
): Violation[] {
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i];
    if (lineText === undefined) continue;
    const m = regex.exec(lineText);
    if (m) {
      const found = m[1] ?? '';
      out.push({ ruleId, message: `${relPath}:${i + 1} contains "${String(found)}"`, file: path.normalize(relPath), line: i + 1 });
    }
  }
  return out;
}

/**
 * 禁止語ポリシーの実行エントリ。
 * @param rootDir 走査のルートディレクトリ
 * @param cfg ポリシー設定
 * @returns 違反一覧（なければ空配列）
 */
export const run: CheckFn = (rootDir: string, cfg: PolicyConfig) => {
  const ruleId = 'banned_terms';
  const rule = cfg.checks?.banned_terms;
  if (!rule || !rule.patterns || rule.patterns.length === 0) return [];
  const paths = rule.paths && rule.paths.length > 0 ? rule.paths : ['**/*.{ts,tsx,mts,cts}'];
  const files = globFiles(rootDir, paths as readonly string[]);
  const regex = buildPatternRegex(rule.patterns as readonly string[], Boolean(rule.word_boundary));
  let all: Violation[] = [];
  for (const rel of files) {
    const abs = toAbs(rootDir, rel);
    const lines = readText(abs).split(/\r?\n/);
    all = all.concat(collectViolations(rel, lines, regex, ruleId));
  }

  return all;
};



