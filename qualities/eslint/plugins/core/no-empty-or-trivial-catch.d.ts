/**
 * @file ESLint プラグイン型定義: core/no-empty-or-trivial-catch
 * 備考: core ユニットの例外ハンドリングルール（no-empty-or-trivial-catch）用の型を宣言する
 * - 対象: TryStatement の CatchClause に対する最小限のハンドリング保証ポリシー
 * - 目的: JS 実装で提供される RuleModule/プラグインオブジェクトを unknown で受けつつ、テスト側から型エラーなく参照できるようにする
 * - 入出力: ルール実体とプラグインオブジェクトを unknown として公開し、利用側で必要に応じて具体化する
 * - 依存関係: 実体は同階層の JS ファイルおよび ESLint API に委ねる
 * - 文脈: vibecoding/var/contexts/qualities/core/context.md に記載された no_empty_catch ポリシーの ESLint ルール移行
 * - 対応SnD: vibecoding/var/SPEC-and-DESIGN/202511/20251128/SnD-20251128-no-empty-catch-to-eslint-rule.md
 * - テスト: vibecoding/tests/eslint/no-empty-or-trivial-catch.test.ts から参照されることを前提とする
 * - 受入: `npm run check` 実行時に本ファイル自身がヘッダ/JSDoc/制御構造コメント規約へ自己適合していること
 */

/**
 * core/no-empty-or-trivial-catch ルール本体のエクスポート。
 * 実体は core ユニットの JS 実装側で提供される。
 */
export const ruleNoEmptyOrTrivialCatch: unknown;

/**
 * no-empty-or-trivial-catch 系ルールをまとめた ESLint プラグインオブジェクトのエクスポート。
 * 実体は core ユニットの JS 実装側で提供される。
 */
export const coreCatchHandlingPlugin: unknown;

