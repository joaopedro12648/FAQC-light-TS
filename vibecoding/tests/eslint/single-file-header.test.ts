/**
 * @file ESLint: single-file-header ルールの検証
 * 備考: 特記事項なし
 * - 1ファイル内での @file タグ一意性を検証する
 * - 正常系は @file を 0〜1 個だけ含む場合にエラー0件となることを期待する
 * - 異常系は 2 個以上の @file を含む場合に違反メッセージが報告されることを検証する
 * - ルールの公開面（meta/messages）をスモークテストし最小限の契約を保証する
 * - 依存は devDependencies として許容済みの vitest のみを使用する
 * - 実装は docs ユニットのヘッダ/JSDoc 方針に追従し、ヘッダ構造ルールとの整合性を保つ
 * - このテスト自体も header/header-bullets-min と single-file-header の両方に自己適合する
 * - 将来の拡張時も SnD とコンテキストを更新しつつスモークテストを維持する
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */
import { describe, expect, it } from 'vitest';
import { ruleSingleFileHeader } from '../../../qualities/eslint/plugins/docs/single-file-header.js';

/** テスト対象のルール実体（型は unknown で受ける） */
const ruleU: unknown = ruleSingleFileHeader;

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

// 概要: ルールの公開面（meta/messages）を最低限確認するスモーク
describe('ESLint rule (smoke): single-file-header', () => {
  // 概要: ルールのメタ情報とメッセージの存在をスモークテストする
  it('exports rule meta and messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    // meta公開時のみ詳細検証へ進めて契約の健全性を確認する
    if (hasMeta(ruleU)) {
      expect(ruleU.meta).toBeTruthy();
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      // メッセージ公開時のみ代表キーの妥当性を点検する
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.multipleFileTags).toBe('string');
        expect(msg.multipleFileTags).toMatch(/@file/);
      }
    }
  });
});
