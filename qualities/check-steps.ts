/**
 * @file 品質ゲート実行手順ユーティリティ
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */

/**
 * ゲート実行ステップのタプル型。[command, args]
 */
export type StepTuple = readonly [command: string, args: readonly string[]];

/**
 * 1:1 定義（キー結合なし）。configRelDir は `qualities/` からの相対パス。
 */
/**
 * 実行モードの種別。
 * - 'both': 実ゲート・診断の両方で実行
 * - 'gate': 実ゲートのみで実行
 * - 'diagnostics': PRE-COMMON 診断のみで実行
 */
export type RunMode = 'both' | 'gate' | 'diagnostics';

/**
 * 実行スコープ。
 * - 'ci': CI/本番ゲート用の既定スコープ
 * - 'preflight': 実装中の軽量チェック用
 * - 'both': ci と preflight の双方に該当
 * - 'diagnostics': PRE-COMMON 診断専用（preflight/check 双方の対象外）
 */
export type RunScope = 'ci' | 'preflight' | 'both' | 'diagnostics';

/**
 * ゲート実行ステップの定義。
 * commands/args は実行コマンド、configRelDir は `qualities/` 配下のユニット相対ディレクトリ。
 * relatedUnitDirs は診断抑止などで複数ユニットに紐づける際に使用する（指定時は優先）。
 */
export type StepDef = Readonly<{
  id: string;
  command: string;
  args: ReadonlyArray<string>;
  configRelDir: string; // 設定ディレクトリ（空文字は設定不要）
  relatedUnitDirs?: ReadonlyArray<string>; // 診断抑止などで参照する追加ユニット群
  runMode: RunMode; // 実ゲート/診断の実行モード
  runScope?: RunScope; // 実行スコープ（省略時は 'ci' と解釈）
}>;

/**
 * 登録された品質ゲート実行ステップ一覧。
 * - 診断/実ゲートの順序と対象を定義する規範的リスト
 */
/**
 * ゲート実行ステップ定義（実行順序は優先度を反映）
 * - policies → typecheck → lint → build/test の順序と対象を定義
 */
export const stepDefs: ReadonlyArray<StepDef> = [
  // Policies (explicitly listed; no aggregator)
  { id: 'policy:anti_mvp', command: 'node', args: ['qualities/policy/anti_mvp/run.mjs'], configRelDir: 'policy/anti_mvp', runMode: 'both', runScope: 'both' },
  { id: 'policy:no_eslint_disable', command: 'node', args: ['qualities/policy/no_eslint_disable/run.mjs'], configRelDir: 'policy/no_eslint_disable', runMode: 'both', runScope: 'both' },
  { id: 'policy:jsdoc_no_duplicate', command: 'node', args: ['qualities/policy/jsdoc_no_duplicate/run.mjs'], configRelDir: 'policy/jsdoc_no_duplicate', runMode: 'both', runScope: 'both' },
  { id: 'policy:no_unknown_double_cast', command: 'node', args: ['qualities/policy/no_unknown_double_cast/run.mjs'], configRelDir: 'policy/no_unknown_double_cast', runMode: 'both', runScope: 'both' },
  { id: 'policy:no_relaxation', command: 'node', args: ['qualities/policy/no_relaxation/run.mjs'], configRelDir: 'policy/no_relaxation', runMode: 'both', runScope: 'both' },
  { id: 'policy:comment_locale', command: 'node', args: ['qualities/policy/comment_locale/run.mjs'], configRelDir: 'policy/comment_locale', runMode: 'both', runScope: 'both' },
  { id: 'typecheck',     command: 'npm',  args: ['run', 'typecheck', '--silent'],        configRelDir: 'tsconfig', runMode: 'both', runScope: 'both' },
  // 実ゲート用の lint（1回）
  { id: 'lint',          command: 'npm',  args: ['run', 'lint', '--silent'],             configRelDir: 'eslint', runMode: 'gate', runScope: 'both' },
  // 診断専用の lint（1回だが、5ユニットへの対応関係を持つ）
  { id: 'lint:diagnostics', command: 'npm', args: ['run', 'lint', '--silent'], configRelDir: 'eslint', relatedUnitDirs: [
    'eslint/01-module-boundaries',
    'eslint/02-type-safety',
    'eslint/03-documentation',
    'eslint/04-complexity-and-magic',
    'eslint/05-environment-exceptions'
  ], runMode: 'diagnostics', runScope: 'diagnostics' },
  { id: 'build',         command: 'npm',  args: ['run', 'build', '--silent'],            configRelDir: '', runMode: 'both' },
  { id: 'test',          command: 'npm',  args: ['test', '--silent'],                    configRelDir: '', runMode: 'both' },
] as const;

