/**
 * @file TODO/TICKET 必須チェック
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
 * TODO/FIXME/HACK にチケットID（例: ABC-123）の付与を強制するチェック。
 * @param rootDir リポジトリルート
 * @param cfg ポリシー設定
 * @returns 違反一覧
 */
export const run: CheckFn = (rootDir: string, cfg: PolicyConfig) => {
  const ruleId = 'todo_ticket_required';
  const rule = cfg.checks?.todo_ticket_required;
  if (!rule || !rule.regex) return [];
  const paths = rule.paths && rule.paths.length > 0 ? rule.paths : ['**/*.{ts,tsx,mts,cts}'];
  const files = globFiles(rootDir, paths);
  const regex = new RegExp(rule.regex, 'i');
  const violations: Violation[] = [];

  for (const rel of files) {
    const abs = toAbs(rootDir, rel);
    const text = readText(abs);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const lineText = lines[i];
      if (lineText === undefined) continue;
      if (regex.test(lineText)) {
        violations.push({
          ruleId,
          message: `${rel}:${i + 1} missing ticket for TODO/FIXME/HACK`,
          file: path.normalize(rel),
          line: i + 1
        });
      }
    }
  }
  return violations;
};

 


