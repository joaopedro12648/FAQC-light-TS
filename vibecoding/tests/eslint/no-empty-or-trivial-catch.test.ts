/**
 * @file ESLint: no-empty-or-trivial-catch ルールの検証
 * 備考: 特記事項なし
 * - catch ブロック内に関数呼び出しまたは throw を最低 1 つ要求する
 * - ランナー実装から ESLint ルールへ移行したポリシーの振る舞いを最小限スモークする
 * - OK ケースではロガー呼び出しや再throw を含む catch を許容する
 * - NG ケースでは空 catch や何も処理を行わない catch を検出する
 * - 実挙動は RuleTester ベースのハーネスで最小限のパターンを検証する
 * - docs/core コンテキストに記載された no_empty_catch ポリシーの構文レベル要件に追随する
 * - テスト全体として例外処理ポリシーの意図をコメントで明示し、将来の拡張時のリグレッション防止に役立てる
 * - 依存: vitest と ESLint ルールハーネスに依存しつつ、最小限のスモークで契約面を固定する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251128/SnD-20251128-no-empty-catch-to-eslint-rule.md
 */
import { describe, expect, it } from 'vitest';
import { coreCatchHandlingPlugin } from '../../../qualities/eslint/plugins/core/no-empty-or-trivial-catch.js';
import { createTsRuleTester } from '../framework/eslintRuleHarness';

/** テスト対象のルール実体（型は unknown で受ける） */
const ruleU: unknown = (coreCatchHandlingPlugin as { rules: Record<string, unknown> }).rules[
  'no-empty-or-trivial-catch'
];

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
describe('ESLint rule (smoke): core/no-empty-or-trivial-catch', () => {
  it('exports rule meta and user-guiding messages', () => {
    expect(typeof ruleU).toBe('object');
    expect(hasMeta(ruleU)).toBe(true);
    // meta公開時のみ詳細検証へ進めて契約の健全性を確認する
    if (hasMeta(ruleU)) {
      const meta = (ruleU as { meta: unknown }).meta;
      expect(hasMessages(meta)).toBe(true);
      // メッセージ公開時のみ代表キーの妥当性を点検する
      if (hasMessages(meta)) {
        const msg = (meta as { messages: Record<string, string> }).messages;
        expect(typeof msg.noHandling).toBe('string');
      }
    }
  });
});

// 概要: 代表的な OK/NG ケースを RuleTester で検証する
describe('ESLint rule (behavior): core/no-empty-or-trivial-catch', () => {
  it('reports empty/trivial catch and allows catch with call or throw', () => {
    const tester = createTsRuleTester();
    const ruleForTester = (coreCatchHandlingPlugin as { rules: Record<string, unknown> }).rules[
      'no-empty-or-trivial-catch'
    ] as never;

    tester.run('core/no-empty-or-trivial-catch', ruleForTester, {
      valid: [
        {
          // OK: ロガー呼び出しを含む catch
          code: `
            export async function doSomethingOk() {
              try {
                throw new Error('boom');
              } catch (e) {
                logger.error(e);
              }
            }
          `,
        },
        {
          // OK: 再throw のみを含む catch（allowRethrowOnly の既定値で許容）
          code: `
            export async function doSomethingRethrow() {
              try {
                throw new Error('boom');
              } catch (e) {
                throw e;
              }
            }
          `,
        },
      ],
      invalid: [
        {
          // NG: 完全な empty catch
          code: `
            export async function doSomethingNg() {
              try {
                throw new Error('boom');
              } catch (e) {
              }
            }
          `,
          errors: [{ messageId: 'noHandling' }],
        },
        {
          // NG: 代入のみで関数呼び出しや throw を含まない catch
          code: `
            export async function doSomethingAssignOnly() {
              let flag = false;
              try {
                throw new Error('boom');
              } catch (e) {
                flag = true;
              }
            }
          `,
          errors: [{ messageId: 'noHandling' }],
        },
      ],
    });
  });
});

