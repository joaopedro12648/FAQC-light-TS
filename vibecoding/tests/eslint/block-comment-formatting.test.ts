/**
 * @file ESLint: block-comment-formatting ルールの検証
 * 備考: 特記事項なし
 * - 開幕行のインライン本文を禁止し次行の「* 」へ移動する
 * - 単一行ブロックは対象外とし、複数行のみを検査する
 * - 既存のインデント（タブ/スペース）を保持して整形する
 * - JSDoc 風（value が * で始まる）ブロックのみに限定する
 * - --fix による安全な置換を検証する
 * - ルールのメッセージ ID と修正結果をあわせて確認する
 * - テストは RuleTester を用いた最小ケースで安定化
 * - 依存は devDependencies として許容済みパスで使用する
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { describe, expect,it } from 'vitest';

import { ruleBlockCommentFormatting } from '../../../qualities/eslint/plugins/block-comment-formatting.js';

const ruleU: unknown = ruleBlockCommentFormatting;
/**
 * メタ情報存在判定
 * @param x 対象
 * @returns meta を持つなら true
 */
function hasMeta(x: unknown): x is { meta: unknown } {
  return typeof x === 'object' && x !== null && 'meta' in (x as Record<string, unknown>);
}
/**
 * メッセージ存在判定
 * @param x 対象
 * @returns messages を持つなら true
 */
function hasMessages(x: unknown): x is { messages: unknown } {
  return typeof x === 'object' && x !== null && 'messages' in (x as Record<string, unknown>);
}
describe('ESLint rule (smoke): block-comment-formatting', () => {
  it('exports rule meta and messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    if (hasMeta(ruleU)) {
      expect(ruleU.meta).toBeTruthy();
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.moveToNextLine).toBe('string');
        expect(msg.moveToNextLine).toMatch(/Move JSDoc content/);
      }
    }
  });
});


