/**
 * @file 節コメント検査（then/else/catch/finally）分割モジュール（日本語）
 * - 目的: コアから分割し max-lines を満たす
 * - 責務: ブロック先頭/同行末尾の節コメント有無チェック
 * - 契約: 読みやすい早期リターン、ESM 互換
 * - 非目標: 類似度検査（別モジュール）
 * - 出力: 既存の messageId と互換
 * - 設計: 1関数1責務・浅い分岐・早期 return
 * - 国際化: 日本語 JSDoc（ASCIIのみ禁止）
 * - テスト: 代表ケースの互換を維持
 */
import {
  classifyIfStructure,
  getLinePreview,
  hasBlockHeadSectionComment,
  hasTrailingSectionComment,
  shouldCheckSectionCommentsForIf,
} from './require-comments-on-control-structures.internals.js';

/**
 * 節コメント検査に関するオプション型（将来拡張の占位）
 * @typedef {Object} BranchCommentOptions
 * @property {boolean} [requireSectionComments]
 */

/**
 * 節コメント検査を種別ごとに振り分けて実行する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context 実行コンテキスト
 * @param {any} node 対象ノード
 * @param {'if'|'try'} kw 種別
 * @param {boolean} sectionFlag 節コメント検査の有効フラグ
 * @param {Set<string>|Array<string>} sectionLocations 検査対象位置
 * @returns {void}
 */
export function runSectionChecksByKind(src, context, node, kw, sectionFlag, sectionLocations) {
  // if の場合は if 専用の検査へ委譲する
  if (kw === 'if') {
    checkIfSectionComments(src, context, node, sectionFlag, sectionLocations);
    return;
  }

  // try の場合はフラグ有効時のみ検査を行う
  if (kw === 'try' && sectionFlag) {
    checkTrySectionComments(src, context, node, sectionLocations);
  }
}

/**
 * if/then/else に関する節コメントの有無を検査する
 * @param src
 * @param context
 * @param node
 * @param requireSectionComments
 * @param locations
 */
/**
 * if/then/else に関する節コメントの有無を検査する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context 実行コンテキスト
 * @param {any} node IfStatement ノード
 * @param {boolean|'fullOnly'} requireSectionComments 節コメント要求
 * @param {Set<string>} locations 検査対象位置
 * @returns {void}
 */
export function checkIfSectionComments(src, context, node, requireSectionComments, locations) {
  const classification = classifyIfStructure(node);
  // 対象分類でない場合は検査不要
  if (!shouldCheckSectionCommentsForIf(classification, requireSectionComments)) return;
  const considerBlockHead = locations.has('block-head');
  const considerTrailing = locations.has('trailing');
  /**
   * ブロック先頭の節コメント不足を報告する
   * @param {'then'|'else'} kind 種別
   * @param {any} branch 対象ブロック
   * @returns {void}
   */
  function reportBlockBranchIssue(kind, branch) {
    // ブロック先頭の検査が無効または対象が無い場合は戻る
    if (!branch || !considerBlockHead) return;
    const { ok, previewLine } = hasBlockHeadSectionComment(src, branch);
    // 必要な先頭コメントが無いときのみ報告する
    if (!ok) {
      context.report({
        node: branch,
        messageId: kind === 'then' ? 'need_then_block_head' : 'need_else_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  /**
   * 単一文末尾の節コメント不足を報告する
   * @param {'then'|'else'} kind 種別
   * @param {any} branch 対象文
   * @returns {void}
   */
  function reportNonBlockBranchIssue(kind, branch) {
    // 行末の節コメントを検査対象とする（設定有効時）
    if (!branch || !considerTrailing) return;
    const { ok, previewLine } = hasTrailingSectionComment(src, branch);
    // 同行に意図コメントがない場合のみ報告する
    if (!ok) {
      context.report({
        node: branch,
        messageId: kind === 'then' ? 'need_then_trailing' : 'need_else_trailing',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  /**
   * then/else の節コメント検査を分岐して実施する
   * @param {'then'|'else'} kind 種別
   * @param {any} branch 対象
   * @returns {void}
   */
  function checkBranch(kind, branch) {
    // null なら何もしない
    if (!branch) return;
    // ブロックか単一文かで検査を切り替える
    if (branch.type === 'BlockStatement') {
      reportBlockBranchIssue(kind, branch);
      return;
    }

    reportNonBlockBranchIssue(kind, branch);
  }

  // 分類に応じて then/else を検査する
  if (classification === 'non-full-non-dangling-if') {
    checkBranch('then', node.consequent);
    return;
  }

  // 完全非ぶら下がりは then/else 両方を検査する
  if (classification === 'full-non-dangling-if') {
    checkBranch('then', node.consequent);
    checkBranch('else', node.alternate);
    return;
  }

  // ぶら下がりは then のみ（else は次の if に委譲）
  if (classification === 'dangling-if') {
    checkBranch('then', node.consequent);
  }
}

/**
 * try/catch/finally に関する節コメントの有無を検査する
 * @param src
 * @param context
 * @param node
 * @param locations
 */
/**
 * try/catch/finally に関する節コメントの有無を検査する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context 実行コンテキスト
 * @param {any} node TryStatement ノード
 * @param {Set<string>} locations 検査対象位置
 * @returns {void}
 */
export function checkTrySectionComments(src, context, node, locations) {
  const considerBlockHead = locations.has('block-head');
  // ブロック先頭検査が無効なら何もしない
  if (!considerBlockHead) return;
  // catch があれば先頭に意図コメントが必要
  if (node.handler && node.handler.body) {
    const { ok, previewLine } = hasBlockHeadSectionComment(src, node.handler.body);
    // 必要な先頭コメントが無い場合は報告する
    if (!ok) {
      context.report({
        node: node.handler,
        messageId: 'need_catch_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  // finally があれば先頭に意図コメントが必要
  if (node.finalizer) {
    const { ok, previewLine } = hasBlockHeadSectionComment(src, node.finalizer);
    // 必要な先頭コメントが無い場合は報告する
    if (!ok) {
      context.report({
        node: node.finalizer,
        messageId: 'need_finally_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }
}

