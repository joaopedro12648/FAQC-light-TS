/**
 * @file anti_mvp ポリシー型定義
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

/** YAML の checks セクションのうち、使用する部分のみを表す */
export type PolicyConfig = {
  readonly checks: {
    readonly banned_terms?: {
      readonly patterns?: readonly string[];
      readonly paths?: readonly string[];
      readonly word_boundary?: boolean;
    };
    readonly todo_ticket_required?: {
      readonly regex?: string;
      readonly paths?: readonly string[];
    };
  };
};

/** 1件の違反を表す */
export type Violation = {
  readonly ruleId: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
};

/** 各チェック関数の型 */
export type CheckFn = (
  rootDir: string,
  cfg: PolicyConfig
) => Promise<readonly Violation[]> | readonly Violation[];

/** ランナーの集約結果 */
export type RunnerResult = {
  readonly ok: boolean;
  readonly violations: readonly Violation[];
};


