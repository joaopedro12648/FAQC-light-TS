/**
 * @file ESLint: prefer-single-line-block-comment ルールの検証
 * 備考: 特記事項なし
 * - 実質 1 行で表現できる複数行ブロックコメントを検出する
 * - 長文や箇条書き・JSDoc タグを含むコメントは対象外とする
 * - ルールの meta/schema/messages と代表的な OK/NG ケースを確認する
 * - 解析器は @typescript-eslint/parser を使用する
 * - 依存は devDependencies として許容済みパスで使用する
 * - 実挙動は RuleTester ベースのハーネスで最小限のパターンを検証する
 * - docs コンテキストと SnD で定義されたコメント構造ポリシーに追随する
 * - RuleTester の OK/NG ケースでコメント構造ルールの誤検出を防止する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251117/SnD-20251117-eslint-single-line-block-comments.md
 */
import { describe, expect, it } from 'vitest';
import { blockCommentFormattingPlugin } from '../../../qualities/eslint/plugins/docs/block-comment-formatting.js';
import { createTsRuleTester } from '../framework/eslintRuleHarness';

/** テスト対象のルール実体（型は unknown で受ける） */
const ruleU: unknown = (blockCommentFormattingPlugin as { rules: Record<string, unknown> }).rules[
  'prefer-single-line-block-comment'
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
describe('ESLint rule (smoke): prefer-single-line-block-comment', () => {
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
        expect(typeof msg.preferSingleLine).toBe('string');
        expect(msg.preferSingleLine).toMatch(/単一行/);
      }
    }
  });
});

// 概要: 代表的な OK/NG ケースを RuleTester で検証する
describe('ESLint rule (behavior): prefer-single-line-block-comment', () => {
  it('reports only effectively single-line multi-line block comments', () => {
    const tester = createTsRuleTester();
    const ruleForTester = (blockCommentFormattingPlugin as { rules: Record<string, unknown> }).rules[
      'prefer-single-line-block-comment'
    ] as never;

    tester.run('blockfmt/prefer-single-line-block-comment', ruleForTester, {
      valid: [
        {
          // 説明文が複数文に分かれており 1 行へ収まらない長文コメントは対象外
          code: `
            /**
             * このモジュールはユーザー情報を読み込みます。
             * 追加でキャッシュの整合性を検証し、問題があればログを出力します。
             * さらに内部メトリクスの集計を行い、管理画面に集約された統計情報を提供します。
             */
            const value = 1;
          `,
        },
        {
          // 箇条書きを含むコメントは対象外
          code: `
            /*
             * - 1 行目
             * - 2 行目
             */
            const value = 2;
          `,
        },
        {
          // JSDoc タグを含むコメントは ignoreJsdocTags により対象外
          code: `
            /**
             * ユーザーを取得する。
             * @param id ユーザーID
             */
            function fetchUser(id: string) {
              return id;
            }
          `,
        },
      ],
      invalid: [
        {
          // 空行を除く実質 1 行だけの multi-line ブロックコメントは違反
          code: '/*\n * このコメントは短い説明です。\n */\nconst value = 3;\n',
          errors: [{ messageId: 'preferSingleLine' }],
        },
      ],
    });
  });
});
