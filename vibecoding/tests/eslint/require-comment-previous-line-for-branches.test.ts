/**
 * @file ESLint: require-comment-previous-line-for-branches ルールの検証（スモーク）
 * 備考: テストの趣旨
 * - ルールの meta/messages の公開面のみ最小確認する（表面の存在検査）
 * - 実挙動はリポジトリ全体の ESLint 実行で担保する（Flat Config 経由）
 * - 単体テストでは ID/文言の一部のみを確認し過不足なく維持する（回帰検知）
 * - 読者志向のメッセージ（形式合わせでなく意図説明）であることを確認
 * - ja 系では ASCII のみ不可というガードが含まれることを確認
 * - 最小限の自己文書化で安定性を高める（余計な依存を含めない）
 * - 依存は devDependencies のみを利用（安定性）
 * - 実行は vitest run に統一（環境依存を排除）
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-eslint-require-comment-before-branches.md
 */
import { describe, expect, it } from 'vitest';
import { ruleRequireCommentPreviousLineForBranches } from '../../../qualities/eslint/plugins/require-comment-previous-line-for-branches.js';

const ruleU: unknown = ruleRequireCommentPreviousLineForBranches;

/**
 * 対象が meta を持つかを判定する。
 * @param x 対象
 * @returns 判定結果
 */
function hasMeta(x: unknown): x is { meta: unknown } {
  return typeof x === 'object' && x !== null && 'meta' in (x as Record<string, unknown>);
}

/**
 * 対象が messages を持つかを判定する。
 * @param x 対象
 * @returns 判定結果
 */
function hasMessages(x: unknown): x is { messages: unknown } {
  return typeof x === 'object' && x !== null && 'messages' in (x as Record<string, unknown>);
}

// テストスイートの意図を説明（直前コメント必須）
// 目的: ルールのメタとメッセージがユーザーガイド的になっていることを確認する
describe('ESLint rule (smoke): require-comment-previous-line-for-branches', () => {
  it('exports rule meta and user-guiding messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    if (hasMeta(ruleU)) {
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.missingComment).toBe('string');
        expect(typeof msg.tagMismatch).toBe('string');
        // 形式合わせではなく「意図説明」を促す文言が含まれること
        expect(msg.missingComment).toMatch(/なぜその分岐\/ループが必要か/);
        // ja 系では ASCII のみ不可という指針が含まれること
        expect(msg.tagMismatch).toMatch(/ASCII のみ不可/);
      }
    }
  });
});

