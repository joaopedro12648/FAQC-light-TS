/**
 * @file docs 向け ESLint プラグインの共通ユーティリティ（日本語ロケール準拠）
 * - 目的: ルール間で再利用するテキスト比較ユーティリティを提供する
 * - 品質: 日本語ロケールのコメント方針に適合し、ASCII のみを避ける
 * - 安全: 例外を投げずに 0..1 の範囲で類似度を返す
 * - I/O: 入力は文字列、出力は 0..1 の数値（1 が完全一致）
 * - 正規化: 前後空白除去と連続空白圧縮を前処理として実施する
 * - 実装: 空間効率の高い 1 次元 DP による Levenshtein 距離
 * - パフォーマンス: O(mn) 時間・O(n) 空間（m<=n を想定した一般ケース）
 * - 用途: 制御構造コメントの類似度検査やメタコメント検出の補助
 */

/**
 * Levenshtein 計算時の事前正規化や厳密度を制御するためのオプション型。
 * @typedef {Object} LevenshteinOptions
 * @property {boolean} [collapseWhitespace=true] 連続空白を 1 個に圧縮するか
 * @property {boolean} [trim=true] 比較前に前後空白を除去するか
 * @property {boolean} [caseSensitive=true] 大文字小文字を区別するか
 */

/**
 * 2つの文字列の正規化済み Levenshtein 類似度（0..1）を計算する。
 * - 比較前に前後空白を除去し、連続空白を 1 個へ圧縮する
 * - 正規化後どちらかが空なら 0 を返す
 * @param {string} a 比較元文字列
 * @param {string} b 比較先文字列
 * @returns {number} 類似度（[0,1]）
 */
export function computeLevenshteinSimilarity(a, b) {
  // 正規化前処理によりノイズ的な空白差で類似度が不当に下がることを避ける
  const sa = (a || '').trim().replace(/\s+/g, ' ');
  const sb = (b || '').trim().replace(/\s+/g, ' ');
  // どちらかが空なら類似であると判断できないため 0 を返す
  if (!sa || !sb) return 0; // 空入力時に例外や 1 を返さない（安全側）
  const m = sa.length;
  const n = sb.length;
  // 1D DP (space-optimized Levenshtein)
  // DP 初期化ではコスト配列を第二軸（b）で確保し、各列の編集距離を表現する
  const dp = Array(n + 1)
    .fill(0)
    .map((_, j) => j);
  // 外側ループは先頭 i 文字までの編集距離を段階的に更新する
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    // 内側ループは置換・挿入・削除の最小コストを選択する
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }

  const dist = dp[n];
  return 1 - dist / Math.max(m, n);
}

