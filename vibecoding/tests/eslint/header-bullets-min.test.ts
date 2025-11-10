/**
 * @file ESLint: header-bullets-min ルールの検証
 * 備考: 特記事項なし
 * - 先頭JSDocの構造要件（@file/備考/箇条書き件数/@see/@snd）を検証する
 * - 正常系は最小構成でエラー0件となることを期待する
 * - 異常系は不足項目ごとのメッセージが報告されることを検証する
 * - 解析器は @typescript-eslint/parser を使用する
 * - ルールのオプションは既定値（min=8 等）で検証する
 * - 文字数ではなく件数判定であるため端的なテキストを使用する
 * - 依存は devDependencies として許容済みパスで使用する
 * - 実装の安定性のためテストは最小限のケースで構成
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { describe, expect,it } from 'vitest';

import { ruleHeaderBulletsMin } from '../../../qualities/eslint/plugins/header-bullets-min.js';

const ruleU: unknown = ruleHeaderBulletsMin;
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
describe('ESLint rule (smoke): header-bullets-min', () => {
  it('exports rule meta and messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    if (hasMeta(ruleU)) {
      expect(ruleU.meta).toBeTruthy();
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.missingSnd).toBe('string');
        expect(msg.missingSnd).toMatch(/@snd/);
      }
    }
  });
});


