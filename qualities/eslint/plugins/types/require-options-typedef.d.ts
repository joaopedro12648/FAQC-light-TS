/**
 * @file ESLint プラグイン型定義: require-options-typedef
 * 備考: options 形状を JSDoc typedef で明示させるローカルルールの型を宣言する
 * - 対象: options/opts/config/settings などのオプション引数を受ける関数やローカル ESLint ルール
 * - 目的: options の形状と meta.schema.properties の対応関係を typedef/JSDoc で説明させる
 * - 入出力: JS 実装で提供される RuleModule/プラグインオブジェクトを unknown で受けつつ利用側で具体化する
 * - オプション: generalJsMode などの挙動切り替えは JS 側の typedef で説明される
 * - 文脈: vibecoding/var/contexts/qualities/types/context.md による型安全ポリシー
 * - 関連: vibecoding/var/contexts/qualities/docs/context.md による JSDoc 運用ポリシー
 * - 対応SnD: SnD-20251116-qualities-structure-and-context-granularity による types ユニット設計
 * - 受入: `npm run check` 時に typedef/コメント/制御構造コメント規約へ自己適合した状態を保つこと
 */
/**
 * options typedef 要求ルール本体のエクスポート。
 * 実体は types ユニットの JS 実装側で提供される。
 */
export const ruleRequireOptionsTypedef: unknown;
/**
 * require-options-typedef を含む ESLint プラグインオブジェクトのエクスポート。
 * 実体は types ユニットの JS 実装側で提供される。
 */
export const typedefPlugin: unknown;

