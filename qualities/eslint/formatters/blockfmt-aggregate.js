/**
 * @file ESLint フォーマッタ: blockfmt/prefer-single-line-block-comment 集約表示
 * - 目的: リポジトリ横断の検出を 1 行に集約してノイズを抑える
 * - 適用: fix なしプレビュー用（自動修正はルール側で対応）
 * - 出力: "<filePath>:<line>:<column>  <severity>  <ruleId>  <message>"
 * - 品質: 日本語ロケール、JSDoc 記述、制御コメント整備
 * - 依存: ESLint v9 の loadFormatter（パス指定）で default export を想定
 * - 複雑度: 関数を小さく分割し循環的複雑度 <= 10 を維持
 * - 例外: このファイルは default export を必要とするため import/no-default-export を設定側で免除
 * - 追加: 類似コメント抑止のため連続コメントは統合
 */

const TARGET_RULE_ID = 'blockfmt/prefer-single-line-block-comment';
const AGGREGATED_MESSAGE =
  'コメントフォーマット違反が検出されました。npm run fix:comments:singleline を実行してください。';

/**
 * 1件の Lint メッセージを整形する。
 * @param {string} filePath 対象ファイルパス
 * @param {import('eslint').LintMessage} msg Lint メッセージ
 * @returns {string} 整形済み1行
 */
function formatLine(filePath, msg) {
  // 出力形式を統一して CI ログの可読性を高める
  const sev = msg.severity === 2 ? 'error' : 'warn';
  const loc = `${filePath}:${msg.line ?? 1}:${msg.column ?? 1}`;
  const rule = msg.ruleId ? msg.ruleId : '';
  return `${loc}  ${sev}  ${rule}  ${msg.message}`;
}

/**
 * フォーマット本体。集約メッセージは 1 行、その他は原則逐次。
 * @param {Array<import('eslint').LintResult>} results 実行結果
 * @returns {string} 整形テキスト
 */
export default function formatter(results) {
  /**
   * 整形済み行の蓄積配列
   * @type {Array<string>}
   */
  const lines = [];
  let hasAggregated = false;

  // ファイルごとに走査して行単位の出力を作成する
  for (const res of results) {
    // 各ファイル内のメッセージを順に処理する
    for (const msg of res.messages) {
      const isTarget = msg.ruleId === TARGET_RULE_ID;
      const isAggregated = isTarget && msg.message === AGGREGATED_MESSAGE;

      // 既に集約済みの要約は抑制して重複表示を避ける
      if (isAggregated) {
        hasAggregated = true;
        continue;
      }

      lines.push(formatLine(res.filePath, msg));
    }
  }

  // 集約メッセージが存在する場合は先頭に 1 行だけ追加する
  if (hasAggregated) {
    lines.unshift(`${TARGET_RULE_ID}: ${AGGREGATED_MESSAGE}`);
  }

  return lines.join('\n') + (lines.length ? '\n' : '');
}

