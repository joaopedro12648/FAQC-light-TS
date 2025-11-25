/**
 * @file 制御構造コメントルールの内部ヘルパ（コア／日本語）
 * - 目的: ルール本体を max-lines に適合させるためヘルパ群を分割する
 * - 範囲: リスナー構築・コメント取得・分類・簡易検査のユーティリティ
 * - 非目標: 類似度検査・節コメント検査（別モジュールへ移譲）
 * - 契約: 純粋関数・副作用なし・ESM 互換・早期リターンで浅い分岐
 * - 品質: 複雑度<=10、1関数1責務、安定シグネチャ
 * - 国際化: 日本語コメント（ASCIIのみ行は禁止）
 * - 運用: 既存出力と互換、ルール緩和は導入しない
 * - テスト: 代表ケースの挙動不変、型無しでも安全
 */

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
 */

const ENTRY_PAIRS = [
  ['IfStatement', 'if'],
  ['ForStatement', 'for'],
  ['ForOfStatement', 'for'],
  ['ForInStatement', 'for'],
  ['WhileStatement', 'while'],
  ['DoWhileStatement', 'do'],
  ['SwitchStatement', 'switch'],
  ['TryStatement', 'try'],
  ['ConditionalExpression', 'ternary'],
];

/**
 * AST ノード種別ごとのリスナーを生成する
 * @param {Set<string>} targets 対象キーワード集合
 * @param {boolean} ignoreCatch catch を無視するか
 * @param {(n:any, kw:string)=>void} checkFn 検査関数
 * @returns {Record<string, Function>} リスナーマップ
 */
export function buildListeners(targets, ignoreCatch, checkFn) {
  const listeners = {};
  // 対応ノード型ごとにリスナーを作成して登録する
  for (const [nodeType, kw] of ENTRY_PAIRS) {
    listeners[nodeType] = (n) => {
      // 対象外のキーワードはここで除外する
      if (!targets.has(kw)) return;
      // catch/finally を無視する設定のときは try をスキップする
      if (kw === 'try' && ignoreCatch) {
        // 呼び出し側で自然に除外される
      }

      checkFn(n, kw);
    };
  }

  return listeners;
}

/**
 * ルール抑止などのディレクティブコメントかを判定する
 * @param {any} c コメントトークン
 * @returns {boolean} ディレクティブなら true
 */
export function isDirectiveComment(c) {
  const v = typeof c?.value === 'string' ? c.value.trim() : '';
  return /^eslint[-\s]/i.test(v) || /^istanbul\b/i.test(v) || /^ts-(?:check|nocheck)\b/i.test(v);
}

/**
 * 指定ノード直前の有意味コメントを取得する（ディレクティブは除外）
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node 対象ノード
 * @returns {any|null} コメントトークンまたは null
 */
export function getLastMeaningfulComment(src, node) {
  const arr = typeof src.getCommentsBefore === 'function' ? src.getCommentsBefore(node) : [];
  // 直前側から遡って最初の有意味コメントを見つける
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const c = arr[i];
    // ディレクティブは除外して次へ進む
    if (!isDirectiveComment(c)) return c;
  }

  return null;
}

/**
 * 直前コメントが要件を満たすかを検査する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node 対象ノード
 * @param {boolean} allowBlank 空行許容
 * @returns {{ok:boolean,last:any}} 検査結果
 */
export function hasRequiredPreviousComment(src, node, allowBlank) {
  const last = getLastMeaningfulComment(src, node);
  // 直前にコメントが無ければ不適合
  if (!last) return { ok: false, last: null };
  const nodeLine = node.loc.start.line;
  const lastEndLine = last.loc.end.line;
  // 空行を許さない場合は行連続であることを要求する
  if (!allowBlank) {
    return { ok: lastEndLine === nodeLine - 1, last };
  }

  const tokensBetween = src.getTokensBetween(last, node, { includeComments: false });
  const hasCodeBetween = tokensBetween.some(
    (t) => t.loc.start.line > lastEndLine && t.loc.end.line < nodeLine,
  );
  return { ok: !hasCodeBetween && lastEndLine < nodeLine, last };
}

/**
 * コメント本文がパターンに一致するかを判定する
 * @param {string} text 本文
 * @param {RegExp|null} re 検証パターン
 * @returns {boolean} 一致すれば true
 */
export function matchesPattern(text, re) {
  // 必須タグが未設定なら検証は不要とする
  if (!re) return true;
  const s = (text || '').trim();
  return re.test(s);
}

/**
 * 行番号からプレビュー文字列を取得する（長い場合は省略）
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {number} line 行番号
 * @returns {string} プレビュー
 */
export function getLinePreview(src, line) {
  const lines = Array.isArray(src.lines) ? src.lines : [];
  const idx = Math.max(0, line - 1);
  const raw = lines[idx] || '';
  const trimmed = raw.trim();
  // 過度に長いと読みづらいため適度に省略する
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

/**
 * If 文の構造を分類する（dangling/full/non-full）
 * @param {any} node IfStatement
 * @returns {'non-full-non-dangling-if'|'dangling-if'|'full-non-dangling-if'|null} 区分
 */
export function classifyIfStructure(node) {
  // If 以外は対象外
  if (!node || node.type !== 'IfStatement') return null;
  const hasAlternate = node.alternate != null;
  const isDangling = node.alternate && node.alternate.type === 'IfStatement';
  // else 無しなら非完全
  if (!hasAlternate) return 'non-full-non-dangling-if';
  // else-if 連鎖ならぶら下がり
  if (isDangling) return 'dangling-if';
  return 'full-non-dangling-if';
}

/**
 * If の分類とフラグから節コメント検査の要否を判定する
 * @param {'non-full-non-dangling-if'|'dangling-if'|'full-non-dangling-if'|null} classification 分類
 * @param {boolean|'fullOnly'} flag 検査フラグ
 * @returns {boolean} 検査が必要なら true
 */
export function shouldCheckSectionCommentsForIf(classification, flag) {
  // フラグ無効や分類未確定なら検査不要とする
  if (!flag || !classification) return false;
  // fullOnly の場合はフルブロックでない単独 if だけを対象外とする
  if (flag === 'fullOnly') return classification !== 'non-full-non-dangling-if';
  return true;
}

/**
 * ブロック先頭に意図コメントがあるかを検査する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement（対象ブロック）
 * @returns {{ok:boolean,previewLine:number}} 結果とプレビュー行
 */
export function hasBlockHeadSectionComment(src, block) {
  /**
   * 直前行の意味あるコメントを取得する
   * @param {any} stmt ステートメント
   * @returns {any|null} 見つかればコメントノード
   */
  function getLastBefore(stmt) {
    return getLastMeaningfulComment(src, stmt);
  }

  /**
   * ブロック内部で最初の意味あるコメントを探す
   * @param {any} blk 対象ブロック
   * @returns {any|null} 最初に見つかったコメント
   */
  function findFirstMeaningfulCommentInBlock(blk) {
    const inside = typeof src.getCommentsInside === 'function' ? src.getCommentsInside(blk) : [];
    const foundInside = (inside || []).find((c) => !isDirectiveComment(c)) || null;
    const tokens = src.getTokens(blk, { includeComments: true }) || [];
    return foundInside || tokens.find((t) => (t.type === 'Block' || t.type === 'Line') && !isDirectiveComment(t)) || null;
  }

  /**
   * ノードの開始行を安全に取得する
   * @param {any} n ノード
   * @param {number} fb 代替行
   * @returns {number} 行番号
   */
  function getStartLineSafe(n, fb) {
    return n && n.loc && n.loc.start && typeof n.loc.start.line === 'number' ? n.loc.start.line : fb;
  }

  const body = Array.isArray(block && block.body) ? block.body : [];
  const firstStmt = body[0];
  const fallbackLine = getStartLineSafe(block, 1);
  const firstLine = getStartLineSafe(firstStmt, null);
  // ブロックが空でない場合は先頭直前コメントの有無を確認する
  if (firstLine != null) {
    // 先頭文の直前に意味のあるコメントが無ければ不足として扱う
    if (!getLastBefore(firstStmt)) {
      return { ok: false, previewLine: firstLine };
    }

    return { ok: true, previewLine: firstLine };
  }

  const selected = findFirstMeaningfulCommentInBlock(block);
  const preview = getStartLineSafe(selected, fallbackLine);
  return selected ? { ok: true, previewLine: preview } : { ok: false, previewLine: fallbackLine };
}

/**
 * 同一行末尾に意図コメントがあるかを検査する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} statement 対象ステートメント
 * @returns {{ok:boolean,previewLine:number}} 結果とプレビュー行
 */
export function hasTrailingSectionComment(src, statement) {
  // 位置情報が無ければ同行検査ができないため不適合とする
  if (!statement.loc || !statement.loc.end) {
    return { ok: false, previewLine: 1 };
  }

  const endLine = statement.loc.end.line;
  const commentsAfter = src.getCommentsAfter(statement) || [];
  // 同行にある最初の有意味コメントの有無を確認する
  for (const c of commentsAfter) {
    // 位置情報のないコメントは無視する
    if (!c.loc || !c.loc.start) continue;
    // 行が変わった時点で検査を打ち切る
    if (c.loc.start.line !== endLine) break;
    // ディレクティブでないコメントがあれば適合とみなす
    if (!isDirectiveComment(c)) {
      return { ok: true, previewLine: endLine };
    }
  }

  return { ok: false, previewLine: endLine };
}

/**
 * ブロック先頭の意図コメント本文を取得する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement
 * @returns {string} コメント本文または空
 */
export function getBlockHeadCommentText(src, block) {
  const first = (Array.isArray(block?.body) && block.body[0]) || null;
  const c = first ? getLastMeaningfulComment(src, first) : null;
  return typeof c?.value === 'string' ? c.value : '';
}

/**
 * 同行末尾の意図コメント本文を取得する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} statement ステートメント
 * @returns {string} コメント本文または空
 */
export function getTrailingSameLineCommentText(src, statement) {
  const endLine = statement?.loc?.end?.line;
  const after = src.getCommentsAfter(statement) || [];
  const found = after.find(
    (c) => c.loc && c.loc.start && c.loc.start.line === endLine && !isDirectiveComment(c),
  );
  return typeof found?.value === 'string' ? found.value : '';
}

/**
 * ブロック／単一文に応じて節コメント本文を取得する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} branch ブロックまたは文
 * @returns {string} コメント本文または空
 */
export function getSectionTextGlobal(src, branch) {
  // 対象が無い場合は空文字を返す
  if (!branch) return '';
  // ブロックか単一文かで取得方法を切り替える
  if (branch.type === 'BlockStatement') {
    return getBlockHeadCommentText(src, branch);
  }

  return getTrailingSameLineCommentText(src, branch);
}

/**
 * else-if 連鎖の else 側かつ無効設定のときに検査を無視する
 * @param {any} node ノード
 * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
 * @param {boolean} enabled 有効時のみ無視するか
 * @returns {boolean} 無視すべき場合は true
 */
export function isIgnoredElseIfBranchGlobal(node, kw, enabled) {
  // if 以外や無効設定時は無視対象にならない
  if (kw !== 'if' || !enabled) return false;
  // 親が無い場合は対象外として早期に終了する
  if (!node || !node.parent) return false;
  return node.parent.type === 'IfStatement' && node.parent.alternate === node;
}

/**
 * 直前コメントの存在・パターン適合・代替可否をまとめて検査する関数を生成する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {boolean} allowBlank 空行を許容するか
 * @param {RegExp|null} re 必須タグパターン（null で未要求）
 * @param {BranchCommentOptions} options 追加オプション
 * @returns {(node:any,kw:string)=>string|null} プレビュー文字列を返す関数（指摘時は null）
 */
export function makeRunCommentAndPatternChecks(src, context, allowBlank, re, options) {
  /**
   * コメント充足、節代替、準備行代替の可否を判定する
   * @param {any} node ノード
   * @param {string} kw 種別
   * @returns {{ok:boolean,allowBySection:boolean,allowByPrep:boolean,preview:string,last:any}} 判定結果
   */
  function computeAllowFlags(node, kw) {
    const { ok, last } = hasRequiredPreviousComment(src, node, allowBlank);
    const preview = node && node.loc && node.loc.start ? getLinePreview(src, node.loc.start.line) : '';
    const allowBySection = options.allowSectionAsPrevious && hasAcceptableSectionAsFallback(node, kw);
    const allowByPrep = options.allowPrepStmts && areOnlyPrepStatementsBetweenGlobal(src, node, last);
    return { ok, allowBySection, allowByPrep, preview, last };
  }

  /**
   * 種別ごとに節コメント本文を抽出する
   * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
   * @param {any} node ノード
   * @returns {string} 本文または空
   */
  function extractSectionTextForKw(kw, node) {
    // 種別に応じて抽出対象のブランチ（コメント）を選択する
    switch (kw) {
      case 'if': // if 文の処理
        return getSectionTextGlobal(src, node && node.consequent);
      case 'for': // for 文の処理（フォールスルー）
        // for文の場合は本体ブロックの先頭コメントを取得
      case 'while': // while 文の処理（フォールスルー）
        // while文の場合は本体ブロックの先頭コメントを取得
      case 'do': // do-while 文の処理
        return getSectionTextGlobal(src, node && node.body);
      default: // その他の場合
        return '';
    }
  }

  /**
   * 検証に用いる本文を直前コメントまたは節コメントから選択する
   * @param {boolean} ok 直前コメントが充足しているか
   * @param {any} last 直前コメント
   * @param {boolean} allowBySection 節コメント代替可
   * @param {string} kw 種別
   * @param {any} node ノード
   * @returns {string|null} 検証本文または null
   */
  function selectValidationText(ok, last, allowBySection, kw, node) {
    // 直前コメントが有効な場合はそれを検証対象として選ぶ
    if (ok && last && typeof last.value === 'string') return last.value;
    // 直前コメントが無い場合でも節コメントを代替として採用できる
    if (allowBySection) return extractSectionTextForKw(kw, node);
    return null;
  }

  /**
   * 必要に応じてタグパターン検証を行う
   * @param {boolean} shouldValidateText 検証要否
   * @param {string|null} validationText 検証対象本文
   * @param {any} node ノード
   * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
   * @returns {void}
   */
  function validateTagIfNeeded(shouldValidateText, validationText, node, kw) {
    // 検証対象のときのみパターン適合性を確認する
    if (shouldValidateText && !matchesPattern(validationText, re)) {
      context.report({
        node,
        messageId: 'tagMismatch',
        data: { kw, pat: options.requireTagPattern || '', preview: getLinePreview(src, node.loc.start.line) },
      });
    }
  }

  /**
   * if の then 節から節コメント本文を抽出する
   * @param {any} node IfStatement
   * @returns {string} コメント本文または空
   */
  function sectionTextForIf(node) {
    const br = node && node.consequent;
    // then 節が無ければ何も検証しない
    if (!br) return '';
    return br.type === 'BlockStatement'
      ? getBlockHeadCommentText(src, br)
      : getTrailingSameLineCommentText(src, br);
  }

  /**
   * ループの本体から節コメント本文を抽出する
   * @param {any} node ループ文
   * @returns {string} コメント本文または空
   */
  function sectionTextForLoop(node) {
    const body = node && node.body;
    // 本体が無ければ何も検証しない
    if (!body) return '';
    return body.type === 'BlockStatement'
      ? getBlockHeadCommentText(src, body)
      : getTrailingSameLineCommentText(src, body);
  }

  /**
   * 直前コメントの代替として節コメントを許容できるかを判定する
   * @param {any} node 対象ノード
   * @param {'if'|'for'|'while'|'do'} kw 種別
   * @returns {boolean} 許容できるなら true
   */
  function hasAcceptableSectionAsFallback(node, kw) {
    // if の then 節コメントがパターンに一致する場合は代替可
    if (kw === 'if') return Boolean(sectionTextForIf(node) && matchesPattern(sectionTextForIf(node), re));
    // ループ本体の節コメントがパターンに一致する場合は代替可
    if (kw === 'for' || kw === 'while' || kw === 'do') return Boolean(sectionTextForLoop(node) && matchesPattern(sectionTextForLoop(node), re));
    return false;
  }

  /**
   * ノードに対する検査本体
   * @param {any} node 対象ノード
   * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
   * @returns {string|null} 直前行プレビュー（指摘時は null）
   */
  return (node, kw) => {
    const { ok, allowBySection, allowByPrep, preview, last } = computeAllowFlags(node, kw);
    // 直前コメントも節代替も準備行も無い場合は不足として報告する
    if (!ok && !allowBySection && !allowByPrep) {
      context.report({ node, messageId: 'missingComment', data: { kw, preview } });
      return null;
    }

    const validationText = selectValidationText(ok, last, allowBySection, kw, node);
    const shouldValidateText = ok || allowBySection;
    validateTagIfNeeded(shouldValidateText, validationText, node, kw);
    return preview;
  };
}

/**
 * ターゲット／設定に応じて検査対象ノードかを判定する
 * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
 * @param {Set<string>} targets 対象セット
 * @param {any} node ノード
 * @param {boolean} ignoreElseIf else-if 無視
 * @returns {boolean} 検査すべきなら true
 */
export function shouldProcessNode(kw, targets, node, ignoreElseIf) {
  // 対象外の種別を除外して不要な検査を避ける
  if (!targets.has(kw)) return false;
  // else-if 連鎖の else 側は設定に従って除外する
  if (isIgnoredElseIfBranchGlobal(node, kw, ignoreElseIf)) return false;
  return true;
}

/**
 * 直前コメントとノードの間が「準備用の宣言/代入のみ」かを判定する
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node ノード
 * @param {any} last 直前コメント
 * @returns {boolean} 許容できるなら true
 */
export function areOnlyPrepStatementsBetweenGlobal(src, node, last) {
  // 位置情報が無ければ検査不能のため不許可
  if (!node?.loc) return false;
  /**
   * 直前候補の行番号を後方探索で見つける
   * @returns {number} 候補行（見つからなければ 0）
   */
  function findNearestMeaningfulLineCommentLine() {
    const lines = Array.isArray(src.lines) ? src.lines : [];
    const nodeLine = node.loc.start.line;
    // 近傍の通常コメント行を後方探索して直前候補を特定する
    for (let ln = nodeLine - 1; ln >= Math.max(1, nodeLine - 10); ln -= 1) {
      const t = (lines[ln - 1] || '').trim();
      // ディレクティブを除外し通常の行コメントのみを対象にする
      if (/^\/\/(?!\s*(?:eslint|istanbul|ts-(?:check|nocheck))\b)/i.test(t)) {
        return ln;
      }
    }

    return 0;
  }

  /**
   * 指定範囲が宣言/代入のみで構成されるか検査する
   * @param {number} startLine 開始行
   * @param {number} endLine 終了行
   * @returns {boolean} 条件を満たすなら true
   */
  function isOnlyPrepStatementsBetween(startLine, endLine) {
    const lines = Array.isArray(src.lines) ? src.lines : [];
    // 宣言/代入のみが並ぶ準備行かどうかを検査する
    for (let ln = startLine + 1; ln <= endLine - 1; ln += 1) {
      const raw = lines[ln - 1] || '';
      const t = raw.trim();
      // 空行だけの並びは準備行とは見なさない
      if (t.length === 0) return false;
      const isDecl = /^\s*(?:const|let|var)\s+/.test(t);
      const isAssign = /^\s*[A-Za-z_$][\w.$\[\]]*\s*=\s*.+;?$/.test(t);
      // 宣言でも代入でもないコードが間にある場合は不適合
      if (!isDecl && !isAssign) return false;
    }

    return true;
  }

  const startLine =
    last?.loc && last.loc.end && typeof last.loc.end.line === 'number'
      ? last.loc.end.line
      : findNearestMeaningfulLineCommentLine();
  // 直前候補が見つからない場合は代替可否も否定する
  if (!startLine) return false;
  const endLine = node.loc.start.line;
  return isOnlyPrepStatementsBetween(startLine, endLine);
}

