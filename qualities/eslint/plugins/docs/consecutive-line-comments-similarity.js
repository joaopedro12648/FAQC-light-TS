/**
 * @file 連続行コメントの類似度検査（docs ユニット）
 * - 目的: 連続する行コメントの内容が「似すぎ」ている場合に警告し、単一行化や差別化を促す
 * - 対象: .ts/.tsx/.js/.jsx（.d.ts 除外想定、ESLint 経由で与えられる SourceCode.lines を使用）
 * - 手法: Levenshtein 正規化類似度（computeLevenshteinSimilarity）で閾値判定
 * - 出力: 連続コメントペアごとに ESLint エラーを報告
 * - 運用: 日本語ロケール準拠（ASCII のみ禁止）、ヘッダ箇条書き/空行/直前コメントの自己適合
 * - 互換: 既存ルール/設定を壊さず、単体で追加可能な docs プラグイン
 * - 将来: ブロックコメント対応・グルーピング/auto-fix 提案は別 SnD で検討
 * - 設定: similarityThreshold（0.6〜1.0、既定 0.75）をサポート
 */

import { computeLevenshteinSimilarity } from './common.js';

/**
 * ルールオプション型。
 * @typedef {Object} ConsecutiveCommentsOptions
 * @property {number} [similarityThreshold] 類似度のしきい値（既定: 0.75、範囲: 0.25〜1.0）
 */

/**
 * 1 行コメントかどうかを簡易判定する。
 * @param {string} line 対象行
 * @returns {boolean} 行コメントなら true
 */
function isLineComment(line) {
  // 「意図」: 先頭空白の後ろに // がある行をコメントとみなす（JSDoc/ブロックは対象外）
  return /^\s*\/\/(.*)$/.test(line);
}

/**
 * コメント本文を抽出する（先頭 // と空白を除去）。
 * @param {string} line 対象行
 * @returns {string} コメント本文
 */
function extractCommentText(line) {
  // 「意図」: 類似度の比較対象はコメント本文のみとし、前置記号は除去
  return String(line || '').replace(/^\s*\/\/\s?/, '');
}

/**
 * 連続行のコメントペアを列挙する。
 * @param {ReadonlyArray<string>} lines ソースコード行配列
 * @returns {Array<{aIdx:number,bIdx:number,aText:string,bText:string}>} 連続コメントペア
 */
function listConsecutiveCommentPairs(lines) {
  // 連続コメントペアの抽出結果を格納する作業配列
  const out = [];
  // 「意図」: 1 回の前から後ろへの走査で O(n) でペア抽出
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    // 連続 2 行が行コメントである場合のみ対象
    if (isLineComment(a) && isLineComment(b)) {
      out.push({
        aIdx: i,
        bIdx: i + 1,
        aText: extractCommentText(a),
        bText: extractCommentText(b),
      });
    }
  }

  return out;
}

/**
 * ルール実体
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleConsecutiveLineCommentsSimilarity = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect overly similar consecutive line comments and require consolidation or differentiation.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          similarityThreshold: { type: 'number', minimum: 0.25, maximum: 1.0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      consecutive_similar:
        '連続するコメントが類似しています。一行にまとめるか、お互いを類似しないコメントに修正してください。',
    },
  },
  create: (context) => {
    const src = context.getSourceCode();
    const options = (context.options && context.options[0]) || {};
    const threshold =
      typeof options.similarityThreshold === 'number'
        ? Math.min(1, Math.max(0.25, options.similarityThreshold))
        : 0.75;

    // 「意図」: ファイル全体を1度だけ走査して連続コメントペアを抽出
    const pairs = listConsecutiveCommentPairs(Array.isArray(src.lines) ? src.lines : []);

    // 「意図」: 類似度がしきい値以上（似すぎ）なら、下側の行（b 行）位置で報告
    for (const p of pairs) {
      // 直近ペアの本文を正規化して類似度を計算
      const s = computeLevenshteinSimilarity(p.aText, p.bText);
      // 類似度がしきい値以上のときのみ報告する
      if (s >= threshold) {
        // 「意図」: b 行の開始位置に紐づけてわかりやすく通知する
        const line = Math.max(0, p.bIdx);
        const loc = {
          start: { line: line + 1, column: 1 },
          end: { line: line + 1, column: 1 },
        };
        context.report({ loc, messageId: 'consecutive_similar' });
      }
    }

    // AST ベースのイベントは不要。即時検査型として空リスナーを返す
    return {};
  },
};

/** プラグインエクスポート（rules マップ） */
export const consecutiveLineCommentsPlugin = {
  rules: {
    'consecutive-line-comments-similarity': ruleConsecutiveLineCommentsSimilarity,
  },
};

