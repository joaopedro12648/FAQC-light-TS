/**
 * @file ESLint/qualities 共通のファイルグロブ定義（core/types/docs 共通）
 * 備考: qualities/eslint/_shared/core/** を L3 エリアの SoT とし、旧パス ../_shared/globs.mjs から移行する
 * - JS/TS 全体に対する files 設定を一元管理しセクションごとの差分を最小限に抑える
 * - qualities/** / scripts/** / vibecoding/** など品質ゲート対象のコード範囲を明示する
 * - PRE-COMMON/コンテキストでは本ファイルを出典として coverage/include を設計し鏡像整合を保つ
 * - 実装側では FILES_JS/FILES_TS/FILES_ALL_CODE を利用してルール適用範囲を明示的に制御する
 * - 追加のロケーションを増やす場合は SnD と context.md に出典を残してから本ファイルへ反映する
 * - L3 構造（core/types/docs）間で同一の SoT を共有し重複定義やドリフトを防ぐ
 * - 将来のディレクトリ再構成時もこのファイルを起点に include パターンを一括更新する
 * - 静的解析警告を減らすこと自体を目的とせず、責務境界とカバレッジの明示を主目的とする
 * @see vibecoding/var/contexts/qualities/eslint/01-module-boundaries/context.md
 * @see vibecoding/var/contexts/qualities/eslint/02-type-safety/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */

/**
 * JS 系ファイルに対する共通グロブ
 * - ESLint JS 設定やローカルプラグインの files に利用する
 */
export const FILES_JS = ['**/*.{js,cjs,mjs}'];
/**
 * TS 系ファイルに対する共通グロブ
 * - TypeScript 系ルールや型安全ポリシーの適用範囲に利用する
 */
export const FILES_TS = ['**/*.{ts,tsx,mts,cts}'];
/**
 * JS/TS を横断して適用するルール向けの統合グロブ
 * - コメント/ドキュメント/複雑度など言語非依存の規律で利用する
 */
export const FILES_ALL_CODE = [...FILES_JS, ...FILES_TS];
