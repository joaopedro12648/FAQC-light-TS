/**
 * @file 制御構造の直前コメント/節コメント検査（短縮版エントリ）
 * - 目的: 分岐・反復・例外処理の「意図」をコメントで明示させる
 * - 対象: if/for/while/do/switch/try/三項
 * - ロケール: 日本語コメント（ASCIIのみ禁止を指定可能）
 * - 実装: ヘルパは分割モジュール（internals/similarity/sections）へ移動
 * - 非目標: ルール緩和や抑止の導入
 * - 完了条件: `npm run check` 緑、既存出力互換
 * - 参照: docs コンテキスト, PRE-IMPL
 * - テスト: 代表ケースのエラーメッセージ互換を維持
 */

import { computeLevenshteinSimilarity } from './common.js';
import {
  buildListeners,
  getLastMeaningfulComment,
  getLinePreview,
  makeRunCommentAndPatternChecks,
  shouldProcessNode,
} from './require-comments-on-control-structures.internals.js';
import { runSectionChecksByKind } from './require-comments-sections.js';
import { runSimilarityByKind } from './require-comments-similarity.js';

/**
 * 分岐コメントオプションの型定義
 * @typedef {Object} BranchCommentOptions
 * @property {Array<'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'>} [targets]
 * @property {string} [requireTagPattern]
 * @property {boolean} [allowBlankLine]
 * @property {boolean} [ignoreElseIf]
 * @property {boolean} [ignoreCatch]
 * @property {boolean} [fixMode]
 * @property {'non-dangling'|'dangling'} [treatChainHeadAs]
 * @property {number} [similarityThreshold]
 * @property {boolean} [enforceMeta]
 * @property {boolean|'fullOnly'} [requireSectionComments]
 * @property {ReadonlyArray<'before-if'|'block-head'|'trailing'>} [sectionCommentLocations]
 * @property {boolean} [allowSectionAsPrevious]
 * @property {boolean} [allowPrepStmts]
 * @property {'always'|'falls-through-only'|boolean} [requireCaseComments]
 */

/**
 * 制御構造直前コメントを要求するルール定義
 * - 直前コメントの存在・パターン・節コメント・類似度を総合検査
 */
export const ruleRequireCommentsOnControlStructures = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require an intent-revealing comment immediately above control structures (if/loops/switch/try).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          targets: {
            type: 'array',
            items: { enum: ['if', 'for', 'while', 'do', 'switch', 'try', 'ternary'] },
          },
          requireTagPattern: { type: 'string' },
          allowBlankLine: { type: 'boolean' },
          ignoreElseIf: { type: 'boolean' },
          ignoreCatch: { type: 'boolean' },
          fixMode: { type: 'boolean' },
          treatChainHeadAs: { enum: ['non-dangling', 'dangling'] },
          similarityThreshold: { type: 'number', minimum: 0.25, maximum: 1.0 },
          enforceMeta: { type: 'boolean' },
          requireSectionComments: {
            anyOf: [{ type: 'boolean' }, { enum: ['fullOnly'] }],
          },
          sectionCommentLocations: {
            type: 'array',
            items: { enum: ['before-if', 'block-head', 'trailing'] },
          },
          allowSectionAsPrevious: { type: 'boolean' },
          allowPrepStmts: { type: 'boolean' },
          requireCaseComments: {
            anyOf: [{ type: 'boolean' }, { enum: ['always', 'falls-through-only'] }],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingComment:
        "制御構文 '{{kw}}' の直前に、なぜその分岐/ループが必要か（目的・前提・例外方針を1文で）を説明するコメントを書いてください。 対象行: {{preview}}",
      tagMismatch:
        "制御構文 '{{kw}}' の直前コメントは基準に一致していません: {{pat}}（ja 系では ASCII のみ不可）。 対象行: {{preview}}",
      multi_issue_hint_line: '同一行に複数の指摘があります。',
      need_before_if:
        'if キーワード直前行に意図説明コメントが必要です（空行は不可）。 対象行: {{preview}}',
      need_then_block_head:
        'then ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。 対象行: {{preview}}',
      need_then_trailing:
        'then の単一文末尾に意図説明コメントが必要です（同行末）。 対象行: {{preview}}',
      need_else_block_head:
        'else ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。 対象行: {{preview}}',
      need_else_trailing:
        'else の単一文末尾に意図説明コメントが必要です（同行末）。 対象行: {{preview}}',
      need_catch_block_head:
        'CATCH ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。 対象行: {{preview}}',
      need_finally_block_head:
        'finally ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。 対象行: {{preview}}',
      meta_like_comment: 'メタ表現のコメントは不可です。',
      removable_before_if: 'Redundant comment before "if" (removable by rule).',
      removable_block_head: 'Redundant comment at block head (then/else) (removable by rule).',
      removable_trailing: 'Redundant trailing comment after statement (removable by rule).',
      similar_try_catch: 'try/catch のコメントが類似し過ぎています。',
      similar_try_finally: 'try/finally のコメントが類似し過ぎています。',
      similar_if_then: 'if/then のコメントが類似し過ぎています。',
      similar_if_else: 'if/else のコメントが類似し過ぎています。',
      need_before_switch:
        'switch 文の直前に、この分岐の目的を説明するコメントを書いてください。',
      need_case_head:
        'case/default の直後（同行末尾または次行）に、この分岐条件の意味がわかるコメントを書いてください。',
      need_ternary_comment:
        '三項演算子の直前行または同行末に、式の意図を説明するコメントが必要です。',
    },
  },
  /**
   * ルール本体のリスナーを生成する（設定オプションに従い検査を行う）
   * @param {import('eslint').Rule.RuleContext} context ルール実行コンテキスト
   * @returns {{[k:string]: Function}} AST リスナー
   */
  create: (context) => {
    const src = context.getSourceCode();
    const rawOptions = (context.options && context.options[0]) || {};
    const norm = normalizeBranchCommentOptions(rawOptions);

    const runCommentAndPatternChecks = makeRunCommentAndPatternChecks(
      src,
      context,
      norm.allowBlank,
      norm.re,
      rawOptions,
    );

    const checkNode = makeCheckNode(
      src,
      context,
      runCommentAndPatternChecks,
      norm,
    );

    return buildListeners(norm.targets, norm.ignoreCatch, checkNode);
  },
};

/** プラグインエクスポート（rules マップ） */
export const controlStructuresPlugin = {
  rules: {
    'require-comments-on-control-structures': ruleRequireCommentsOnControlStructures,
  },
};

/**
 * 分岐コメントオプションを正規化して扱いやすい形へ変換する（日本語ロケール準拠）
 * @param {import('./require-comments-on-control-structures.js').BranchCommentOptions} options オプション入力（未設定可）
 * @returns {{
 * targets: ReadonlySet<'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'>, 対象キーワード集合
 * allowBlank: boolean, 空行許容フラグ
 * ignoreElseIf: boolean, else if を無視するか
 * ignoreCatch: boolean, catch を無視するか
 * re: RegExp|null, パターン要求の正規表現（未指定なら null）
 * sectionFlag: boolean|'fullOnly'|undefined, 節コメント要求のモード
 * sectionLocations: ReadonlySet<'before-if'|'block-head'|'trailing'>, 節コメントの許容位置
 * threshold: number, 類似度の閾値
 * requireCase: 'off'|'always'|'falls-through-only' case/default のコメント要求モード
 * }} 戻り値オブジェクトの項目説明
 */
function normalizeBranchCommentOptions(options) {
  const targets =
    options.targets && options.targets.length > 0
      ? new Set(options.targets)
      : new Set(['if', 'for', 'while', 'do', 'switch', 'try', 'ternary']);

  const allowBlank = Boolean(options.allowBlankLine);
  const ignoreElseIf = options.ignoreElseIf !== false;
  const ignoreCatch = options.ignoreCatch !== false;

  let re = null;
  // タグパターンが指定されていれば正規表現を構築する
  if (typeof options.requireTagPattern === 'string' && options.requireTagPattern.length > 0) {
    re = new RegExp(options.requireTagPattern);
  }

  const sectionFlag = options.requireSectionComments;
  const sectionLocationsRaw =
    Array.isArray(options.sectionCommentLocations) && options.sectionCommentLocations.length > 0
      ? options.sectionCommentLocations
      : ['before-if', 'block-head', 'trailing'];
  const sectionLocations = new Set(sectionLocationsRaw);

  const threshold =
    typeof options.similarityThreshold === 'number'
      ? Math.min(1, Math.max(0.25, options.similarityThreshold))
      : 0.75;

  const requireCase = normalizeRequireCase(options.requireCaseComments);

  return {
    targets,
    allowBlank,
    ignoreElseIf,
    ignoreCatch,
    re,
    sectionFlag,
    sectionLocations,
    threshold,
    requireCase,
  };
}

/**
 * case コメント要求モードの正規化（日本語ロケール準拠）
 * @param {boolean|'always'|'falls-through-only'|undefined} val 入力値
 * @returns {'off'|'always'|'falls-through-only'} 正規化結果
 */
function normalizeRequireCase(val) {
  // 許容される文字列の場合はそのまま返す
  if (val === 'always' || val === 'falls-through-only') return val;
  // 真の場合は 'always' と解釈する
  if (val === true) return 'always';
  return 'off';
}

/**
 * case ラベルの直後のコメントを取得する（日本語ロケール準拠）
 * @param {import('eslint').SourceCode} src 解析中ソースコード
 * @param {any} c SwitchCase ノード
 * @returns {readonly any[]} case ラベルの直後のコメント配列
 */
function getCaseLabelCommentsAfter(src, c) {
  const caseLine = c?.loc?.start?.line;
  // case ラベルの行番号が取得できない場合は空配列を返す
  if (!caseLine) return [];

  // case ラベルの直後のコメントを取得（同行末尾または次行）
  // getCommentsAfter は case ノード全体の後を取得するため、代わりに
  // case ラベルの開始行と次の行のコメントを直接取得する
  const allComments = src.getAllComments();
  const caseLabelComments = allComments.filter((cm) => {
    if (!cm.loc || !cm.loc.start) return false;
    const commentLine = cm.loc.start.line;
    // 同行末尾コメントまたは次行コメント
    return commentLine === caseLine || commentLine === caseLine + 1;
  });

  // case ブロック内の最初のステートメントの位置を取得
  const firstStmt = c.consequent && c.consequent.length > 0 ? c.consequent[0] : null;
  const firstStmtLine = firstStmt?.loc?.start?.line;

  // case ラベルの直後のコメントのみを対象とする（最初のステートメントより前）
  return caseLabelComments.filter((cm) => {
    // 最初のステートメントが無い場合は全てのコメントを対象とする
    if (!firstStmtLine) return true;
    const commentLine = cm.loc.start.line;
    return commentLine < firstStmtLine;
  });
}

/**
 * Switch の case/default 先頭にコメントが必要か判定し、必要なら報告する（日本語ロケール準拠）
 * @param {import('eslint').SourceCode} src 解析中ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルール実行コンテキスト
 * @param {any} switchNode SwitchStatement ノード
 * @param {'off'|'always'|'falls-through-only'} requireCase case コメント要求モード
 * @param {boolean} allowBlank 空行を許容するか
 * @param {RegExp|null} re パターン要求の正規表現
 */
function checkCaseHeadCommentsIfNeeded(src, context, switchNode, requireCase, allowBlank, re) {
  // case 検査対象がなければ直ちに終了する
  if (requireCase === 'off' || !Array.isArray(switchNode?.cases)) return;

  // 各 case を順に検査する
  for (const c of switchNode.cases) {
    // falls-through-only の条件に合致する case は除外する
    if (shouldSkipCaseByFallsThrough(requireCase, c)) continue;

    const after = getCaseLabelCommentsAfter(src, c);
    const hasTrailingSameLine = hasTrailingCommentSameLine(after, c);
    const hasNextLine = hasNextLineComment(after, c);

    const patternOk = isCommentPatternSatisfied(re, hasTrailingSameLine, hasNextLine, after, c);

    // 直後（同行末 or 次行）コメントが無いかパターン不一致なら指摘する
    if (!(hasTrailingSameLine || hasNextLine) || !patternOk) {
      reportMissingCaseHead(src, context, c, switchNode);
    }
  }
}

/**
 * falls-through-only 設定時に当該 case をスキップすべきか判定する（日本語ロケール準拠）
 * @param {'off'|'always'|'falls-through-only'} requireCase モード
 * @param {any} c SwitchCase ノード
 * @returns {boolean} スキップすべきなら true
 */
function shouldSkipCaseByFallsThrough(requireCase, c) {
  return (
    requireCase === 'falls-through-only' && Array.isArray(c.consequent) && c.consequent.length > 0
  );
}

/**
 * 直前コメントが許容位置（直上行／空行許容時は前方行）にあるか判定する（日本語ロケール準拠）
 * Note: caseコメントの直後必須化に伴い、本関数は使用されなくなるが、他用途の可能性を考慮し残置するか検討。
 * 現状のロジックでは case 以外には使われていないため、コメントアウトまたは削除が適切だが、
 * 将来的な拡張性を考慮し、一旦は未使用関数として警告されるのを防ぐために削除する。
 */
/* function hasPreviousCommentOnAllowedLine(prev, c, allowBlank) { ... } */

/**
 * 同一行のトレーリングコメントが存在するかを判定する（日本語ロケール準拠）
 * @param {readonly any[]} after 当該ノード以降のコメント配列
 * @param {any} c SwitchCase ノード
 * @returns {boolean} 同一行にコメントがあれば true
 */
function hasTrailingCommentSameLine(after, c) {
  return after.some((cm) => cm.loc && cm.loc.start && c.loc && cm.loc.start.line === c.loc.start.line);
}

/**
 * 次の行にコメントが存在するかを判定する（日本語ロケール準拠）
 * @param {readonly any[]} after 当該ノード以降のコメント配列
 * @param {any} c SwitchCase ノード
 * @returns {boolean} 次行にコメントがあれば true
 */
function hasNextLineComment(after, c) {
  // 直後のトークン（ステートメント等）がある場合、それより前にあるコメントのみを対象とすべきだが、
  // getCommentsAfter はノード直後のコメントを返してくれるため、行判定だけで概ね機能する。
  // ただし、case ブロック内の最初の文より前にあることが望ましい。
  // ここでは単純に「case ラベル行の次の行にコメントがあるか」を判定する。
  return after.some((cm) => cm.loc && cm.loc.start && c.loc && cm.loc.start.line === c.loc.start.line + 1);
}

/**
 * 最終的にパターン適合を判定する（日本語ロケール準拠）
 * @param {RegExp|null} re コメント内容に要求する正規表現
 * @param {boolean} hasTrailingSameLine 同行コメントの有無
 * @param {boolean} hasNextLine 次行コメントの有無
 * @param {readonly any[]} after 当該ノード以降のコメント配列
 * @param {any} c SwitchCase ノード
 * @returns {boolean} パターンに適合するなら true
 */
function isCommentPatternSatisfied(re, hasTrailingSameLine, hasNextLine, after, c) {
  // パターン未指定なら適合扱いとする
  if (!re) return true;
  // コメントが無ければ適合扱いとする（有無判定は呼び出し元で行う）
  if (!(hasTrailingSameLine || hasNextLine)) return true;
  
  const trailing = getTrailingCommentSameLine(after, c);
  const nextLine = getNextLineComment(after, c);
  const text = extractEffectiveCommentText(trailing, hasTrailingSameLine, nextLine, hasNextLine);
  return re.test((text || '').trim());
}

/**
 * 同一行のトレーリングコメントを取得する（日本語ロケール準拠）
 * @param {readonly any[]} after 当該ノード以降のコメント配列
 * @param {any} c SwitchCase ノード
 * @returns {any|undefined} 見つかればコメントノード
 */
function getTrailingCommentSameLine(after, c) {
  return after.find((cm) => cm.loc && cm.loc.start && c.loc && cm.loc.start.line === c.loc.start.line);
}

/**
 * 次行のコメントを取得する（日本語ロケール準拠）
 * @param {readonly any[]} after 当該ノード以降のコメント配列
 * @param {any} c SwitchCase ノード
 * @returns {any|undefined} 見つかればコメントノード
 */
function getNextLineComment(after, c) {
  return after.find((cm) => cm.loc && cm.loc.start && c.loc && cm.loc.start.line === c.loc.start.line + 1);
}

/**
 * 有効なコメント本文を抽出する（日本語ロケール準拠）
 * @param {any|undefined} trailing 同一行のコメントノード
 * @param {boolean} hasTrailingSameLine 同一行コメントの有無
 * @param {any|undefined} nextLine 次行のコメントノード
 * @param {boolean} hasNextLine 次行コメントの有無
 * @returns {string} コメント本文（なければ空）
 */
function extractEffectiveCommentText(trailing, hasTrailingSameLine, nextLine, hasNextLine) {
  // 同行コメントがあればそれを採用する
  if (hasTrailingSameLine && trailing && typeof trailing.value === 'string') return trailing.value;
  // 次行コメントがあればそれを採用する
  if (hasNextLine && nextLine && typeof nextLine.value === 'string') return nextLine.value;
  return '';
}

/**
 * 欠落した case 先頭コメントを報告する（日本語ロケール準拠）
 * @param {import('eslint').SourceCode} src 解析中ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルール実行コンテキスト
 * @param {any} c SwitchCase ノード
 * @param {any} switchNode SwitchStatement ノード
 * @returns {void} なし
 */
function reportMissingCaseHead(src, context, c, switchNode) {
  const line = c?.loc?.start?.line || switchNode.loc.start.line;
  context.report({
    node: c,
    messageId: 'need_case_head',
    data: { preview: getLinePreview(src, line) },
  });
}

/**
 * ノード検査関数を生成する（日本語ロケール準拠）
 * @param {import('eslint').SourceCode} src 解析中ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルール実行コンテキスト
 * @param {(node:any, kw:any)=>string|null} runCommentAndPatternChecks 直前コメント/パターン検査
 * @param {ReturnType<typeof normalizeBranchCommentOptions>} norm 正規化済みオプション
 * @returns {(node:any, kw:any)=>void} リスナー用の検査関数
 */
function makeCheckNode(src, context, runCommentAndPatternChecks, norm) {
  return (node, kw) => {
    // 対象外ノードは早期に終了する
    if (!shouldProcessNode(kw, norm.targets, node, norm.ignoreElseIf)) return;

    const preview = runCommentAndPatternChecks(node, kw);
    // 直前コメント/節コメントが未充足なら以降をスキップする
    if (preview === null) return;

    const prevCommentNode = getLastMeaningfulComment(src, node);
    const prevText = typeof prevCommentNode?.value === 'string' ? prevCommentNode.value : '';
    // 直前コメントがある場合のみ類似度検査を行う
    if (prevText) {
      runSimilarityByKind(src, context, node, kw, prevText, norm.threshold, computeLevenshteinSimilarity);
    }

    runSectionChecksByKind(src, context, node, kw, norm.sectionFlag, norm.sectionLocations);

    // switch の場合は case 先頭コメントも検査する
    if (kw === 'switch') {
      checkCaseHeadCommentsIfNeeded(src, context, node, norm.requireCase, norm.allowBlank, norm.re);
    }
  };
}
