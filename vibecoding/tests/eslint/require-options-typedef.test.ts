/**
 * @file ESLint: require-options-typedef ルールの検証（スモーク）
 * 備考:
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-jsdoc-typedef-enforcement.md
 */
import { describe, expect, it } from 'vitest';
import { ruleRequireOptionsTypedef } from '../../../qualities/eslint/plugins/require-options-typedef.js';

const ruleU: unknown = ruleRequireOptionsTypedef;

/**
 * meta を持つかを判定。
 * @param x 対象
 * @returns 判定結果
 */
function hasMeta(x: unknown): x is { meta: unknown } {
  return typeof x === 'object' && x !== null && 'meta' in (x as Record<string, unknown>);
}

/**
 * messages を持つかを判定。
 * @param x 対象
 * @returns 判定結果
 */
function hasMessages(x: unknown): x is { messages: Record<string, string> } {
  return typeof x === 'object' && x !== null && 'messages' in (x as Record<string, unknown>);
}

// 概要: 公開面（meta/messages）の存在をスモーク検証
describe('ESLint rule (smoke): require-options-typedef', () => {
  it('exports rule meta and user-guiding messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    if (hasMeta(ruleU)) {
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.missingTypedef).toBe('string');
        expect(typeof msg.propertiesMismatch).toBe('string');
        expect(typeof msg.generalMissing).toBe('string');
        // 読者志向のガイダンスを含むこと
        expect(msg.missingTypedef).toMatch(/typedef/);
        expect(msg.propertiesMismatch).toMatch(/schema keys/);
      }
    }
  });
});

