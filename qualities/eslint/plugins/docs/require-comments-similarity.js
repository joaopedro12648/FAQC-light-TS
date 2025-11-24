/**
 * @file 類似度検査（if/try の節コメント）分割モジュール（日本語）
 * - 目的: コアから切り離し max-lines に適合させる
 * - 責務: then/else/catch/finally と直前コメントの類似度検査
 * - 契約: 純粋関数・副作用なし・ESM 互換
 * - 品質: 複雑度を抑制し読みやすさを優先
 * - 非目標: セクション検査（別モジュール）
 * - 出力: 既存 messageId と互換
 * - 国際化: 日本語 JSDoc（ASCIIのみ禁止）
 * - テスト: 代表ケースの互換を維持
 */
import { getSectionTextGlobal } from './require-comments-on-control-structures.internals.js';

/**
 * 類似度検査に関するオプション型（将来拡張の占位）
 * @typedef {Object} BranchCommentOptions
 * @property {number} [similarityThreshold]
 */

/**
 * 種別ごとの類似度検査を実行する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context コンテキスト
 * @param {any} node 対象ノード
 * @param {string} kw 種別（if/try）
 * @param {string} prevText 直前コメント本文
 * @param {number} threshold 類似度しきい値
 * @param {(a:string,b:string)=>number} similarityFn 類似度関数
 */
export function runSimilarityByKind(src, context, node, kw, prevText, threshold, similarityFn) {
  // if の場合は then/else の類似度を個別に検査する
  if (kw === 'if') {
    runIfSimilarity(src, context, node, prevText, threshold, similarityFn);
    return;
  }

  // try の場合は catch/finally の類似度を検査する
  if (kw === 'try') {
    runTrySimilarity(src, context, node, prevText, threshold, similarityFn);
  }
}

/**
 * if/then/else の類似度検査を実行する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {any} node IfStatement ノード
 * @param {string} prevText 直前コメント本文
 * @param {number} threshold 類似度しきい値（0..1）
 * @param {(a:string,b:string)=>number} similarityFn 類似度関数
 */
function runIfSimilarity(src, context, node, prevText, threshold, similarityFn) {
  const thenText = getSectionTextGlobal(src, node.consequent);
  // then が十分に類似する場合は指摘を報告する
  if (thenText && similarityFn(prevText, thenText) >= threshold) {
    context.report({ node: node.consequent || node, messageId: 'similar_if_then' });
  }

  // else があり入れ子でない場合は else も検査する
  if (node.alternate && node.alternate.type !== 'IfStatement') {
    const elseText = getSectionTextGlobal(src, node.alternate);
    // else が十分に類似する場合は指摘を報告する
    if (elseText && similarityFn(prevText, elseText) >= threshold) {
      context.report({ node: node.alternate, messageId: 'similar_if_else' });
    }
  }
}

/**
 * try/catch/finally の類似度検査を実行する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {any} node TryStatement ノード
 * @param {string} prevText 直前コメント本文
 * @param {number} threshold 類似度しきい値（0..1）
 * @param {(a:string,b:string)=>number} similarityFn 類似度関数
 */
function runTrySimilarity(src, context, node, prevText, threshold, similarityFn) {
  // catch がある場合は直前と catch 節の類似を検査する
  if (node.handler && node.handler.body) {
    const ct = getSectionTextGlobal(src, node.handler.body);
    // catch が十分に類似する場合は指摘を報告する
    if (ct && similarityFn(prevText, ct) >= threshold) {
      context.report({ node: node.handler, messageId: 'similar_try_catch' });
    }
  }

  // finally がある場合は直前と finally 節の類似を検査する
  if (node.finalizer) {
    const ft = getSectionTextGlobal(src, node.finalizer);
    // finally が十分に類似する場合は指摘を報告する
    if (ft && similarityFn(prevText, ft) >= threshold) {
      context.report({ node: node.finalizer, messageId: 'similar_try_finally' });
    }
  }
}

