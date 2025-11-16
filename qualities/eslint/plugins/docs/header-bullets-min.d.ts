/**
 * @file ESLint プラグイン型定義: header-bullets-min
 * 備考: 先頭 JSDoc ヘッダの箇条書き最小行数を検査するローカルルールの型を宣言する
 * - 対象: ファイル先頭のヘッダ JSDoc（PRE-IMPL Header Comment Quick Checklist の対象）
 * - 目的: ヘッダコメントに十分な箇条書き情報を持たせ、品質ゲート運用に必要な文脈を欠落させない
 * - 入出力: JS 実装で提供される RuleModule/プラグインオブジェクトを unknown で受けつつ利用側で具体化する
 * - オプション: min/message などの設定値は JS 側の meta.schema と typedef で説明される
 * - 依存関係: 実体は同階層の JS 実装と ESLint コアに委ねる
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md によるヘッダコメントポリシー
 * - 対応SnD: SnD-20251116-qualities-structure-and-context-granularity による docs ユニット設計
 * - 受入: Header Comment Quick Checklist を満たすヘッダ構造が本ファイル自身でも維持されていること
 */
/**
 * header-bullets-min ルール本体のエクスポート。
 * 実体は docs ユニットの JS 実装側で提供される。
 */
export const ruleHeaderBulletsMin: unknown;
/**
 * header-bullets-min を含む ESLint プラグインオブジェクトのエクスポート。
 * 実体は docs ユニットの JS 実装側で提供される。
 */
export const headerPlugin: unknown;

