/**
 * @file 制御構造でのコメントチェック（if/for/while/switch/try などを対象）
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251113/SnD-20251113-eslint-if-branch-similarity.md
 */
 
/* 連結ルールの統合版: 旧 'require-comment-previous-line-for-branches.js' を本ファイルへ集約 */
/* 自身の実装ファイルに当ルールが自己適用されるのを防止するための設計配慮は、コード構造とコメント整備で担保する（eslint-disable は使用しない） */
 
/**
 * @typedef {Object} BranchCommentOptions オプション型定義
 * @property {Array<'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'>} [targets] 対象種別（省略時は全種）
 * @property {string} [requireTagPattern] 本文パターン（例: 非ASCIIを要求）
 * @property {boolean} [allowBlankLine] 空行許容（既定: false）
 * @property {boolean} [ignoreElseIf] else if 免除（既定: true）
 * @property {boolean} [ignoreCatch] catch 免除（既定: true）
 * @property {boolean} [fixMode] 不要コメントの報告を有効にする（既定: false／報告のみ）
 * @property {'non-dangling'|'dangling'} [treatChainHeadAs] else-if 連鎖先頭（head）をどう扱うか（既定: 'non-dangling'）
 * @property {number} [similarityThreshold] 類似度のしきい値（既定: 0.75、範囲: 0.6〜1.0）
 * @property {boolean} [enforceMeta] メタ表現検出の有効化（既定: false／無効）
 */
 
/** ノードタイプとキーワードの対応（固定） */
/** @type {Array<[keyof import('eslint').Rule.RuleListener, string]>} 登録対象のペア配列 */
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
 * ルールリスナー集合を構築する（分岐数を抑えて複雑度を低減）。
 * @param {Set<string>} targets 対象キーワード集合
 * @param {boolean} ignoreCatch catch/finally を免除するか（try のみ検査）
 * @param {(node:any,kw:string)=>void} checkFn 検査関数
 * @returns {import('eslint').Rule.RuleListener} リスナー辞書
 */
function buildListeners(targets, ignoreCatch, checkFn) {
  /** @type {import('eslint').Rule.RuleListener} リスナー辞書 */
  const listeners = {};
  // 登録対象のノード種別を走査し、各キーワードに対応するリスナーを生成する
  // 対象ノードを網羅して検査入口の複雑度を分散させる
  for (const [nodeType, kw] of ENTRY_PAIRS) {
    listeners[nodeType] = (n) => {
      // 設定で対象外のキーワードは早期リターンして無駄な検査を避ける
      if (!targets.has(kw)) return;
      // ignoreCatch=true の場合は対象を try のみに絞り、catch/finally の検査コストを避ける
      if (kw === 'try' && ignoreCatch) {
        // この分岐では具体処理は行わず、下流のノード処理へ委譲する（catch/finally は自然に対象外）
      }
 
      checkFn(n, kw);
    };
  }
 
  return listeners;
}
 
/**
 * 直前コメントとしてカウントしない（ESLint ディレクティブ等）かを判定。
 * @param {import('estree').Comment|import('eslint').AST.Token} c コメント（対象候補）
 * @returns {boolean} ディレクティブなら true
 */
function isDirectiveComment(c) {
  // 直前コメントが ESLint/ツール系ディレクティブかを判別し除外対象とする
  // 文字列化の安全確保のため、三項で既定値（空文字）を明示する
  // 三項演算子の採否を明示し、ディレクティブ検出の前処理を短文化する（空文字で安全側へ）
  // 文字列でなければ空文字として処理し誤検出を避ける
  const v = typeof c?.value === 'string' ? c.value.trim() : ''; // 三項: ディレクティブ判定の前処理として原文を安全に抽出する
  // eslint, istanbul, ts-nocheck 等の抑止・ツール系を除外
  return /^eslint[-\s]/i.test(v) || /^istanbul\b/i.test(v) || /^ts-(?:check|nocheck)\b/i.test(v);
}
 
/**
 * 直前の（非ディレクティブ）コメントを取得。
 * @param {import('eslint').SourceCode} src ソースコード（ESLint 提供）
 * @param {any} node 対象ノード（IfStatement など）
 * @returns {any|null} コメント or null
 */
function getLastMeaningfulComment(src, node) {
  // 対象ノード直前側に存在するコメント列から最後の意味のあるコメントを取得する
  // API 存在に応じて三項で配列取得し、無効時は空配列を既定とする意図
  // 三項活用の前行コメント（緩和適用）を採用し、API 非搭載時も落とさない
  // API が無い場合は空配列で安全に扱う
  const arr = typeof src.getCommentsBefore === 'function' ? src.getCommentsBefore(node) : []; // 三項: API存在を確認し直前コメント配列を安全に取得する
  // 直前側のコメント列を後ろから走査し、最後の意味のあるコメントを特定する
  // 後方から走査して直前に最も近い説明コメントを一意に選出する
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const c = arr[i];
    // ディレクティブ以外の説明的コメントのみを直前コメントとして採用する
    if (!isDirectiveComment(c)) return c;
  }
 
  return null;
}
 
/**
 * 直前コメント要件の判定。
 * @param {import('eslint').SourceCode} src ソースコード（ESLint 提供）
 * @param {any} node 対象ノード（IfStatement/ForStatement 等）
 * @param {boolean} allowBlank 空行を許容するか（隙間コードは不可）
 * @returns {{ok:boolean,last:any|null}} 判定
 */
function hasRequiredPreviousComment(src, node, allowBlank) {
  const last = getLastMeaningfulComment(src, node);
  // 直前コメントが存在しない場合は即不適合とする
  if (!last) return { ok: false, last: null };
 
  const nodeLine = node.loc.start.line;
  const lastEndLine = last.loc.end.line;
 
  // 空行を不許可とする既定では直前行のみを許す
  if (!allowBlank) {
    // 直前行のみ許可する設定のためコメントと if の行隣接を厳密に確認する
    return { ok: lastEndLine === nodeLine - 1, last };
  }
 
  // 空行許容だが、コメントとノードの間にコードトークンは不可
  const tokensBetween = src.getTokensBetween(last, node, { includeComments: false });
  // コメントと対象ノードの間に実コードが存在する場合は不適合とする
  const hasCodeBetween = tokensBetween.some(
    (t) => t.loc.start.line > lastEndLine && t.loc.end.line < nodeLine
  );
  return { ok: !hasCodeBetween && lastEndLine < nodeLine, last };
}
 
/**
 * 文字列が指定パターンに適合するか（null は常に true）。
 * @param {string|null} text コメント本文
 * @param {RegExp|null} re 検査パターン（未設定は常に true）
 * @returns {boolean} 適合なら true
 */
function matchesPattern(text, re) {
  // パターン未指定時は常に適合とみなし、指定時のみ厳密に検査する
  if (!re) return true;
  const s = (text || '').trim();
  return re.test(s);
}
 
/**
 * IfStatement 用補助関数群
 */
/**
 * ノードが BlockStatement かを判定する。
 * @param {any} node 対象ノード
 * @returns {boolean} 真偽値を返す
 */
function isBlock(node) {
  return !!node && node.type === 'BlockStatement';
}

/**
 * ノードが IfStatement かを判定する。
 * @param {any} node 対象ノード
 * @returns {boolean} 真偽値を返す
 */
function isIf(node) {
  return !!node && node.type === 'IfStatement';
}

/**
 * if キーワード直前行にコメントがあるか。
 * allowBlank=false の場合は「直前行にコメント」以外は不適合。
 * if キーワード直前の説明コメント有無を検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node IfStatement 対象ノード
 * @param {boolean} allowBlankBeforeIf 直前の空行を許容するか
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果と候補コメント
 */
function hasBeforeIfKeywordCommentStrict(src, node) {
  const ifToken = src.getFirstToken(node);
  // if トークンが取得できない場合は前提不成立として不適合で終了する
  if (!ifToken) return { ok: false, comments: [], used: null };
  const last = getLastMeaningfulComment(src, node);
  // 直前コメントが存在しない場合は要件未充足として不適合で終了する
  if (!last) return { ok: false, comments: [], used: null };
  const okStrict = _isAdjacentToIf(last, ifToken);
  // 厳格隣接の成否に応じて結果を返す
  return okStrict ? { ok: true, comments: [last], used: last } : { ok: false, comments: [last], used: null };
}

/**
 * if 直前コメント（緩和: 空行可・間に実コード不可）を判定する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node IfStatement 対象ノード
 * @returns {{ok:boolean,comments:any[],used:any|null}} 緩和判定の結果（採用コメント含む）
 */
function hasBeforeIfKeywordCommentLoose(src, node) {
  const pair = _getIfTokenAndLastComment(src, node);
  // if キーワードが取得できないなど前提が満たされない場合は早期終了する
  if (!pair) return { ok: false, comments: [], used: null };
  const { last } = pair;
  // コメントと if の間に実コードがある場合は説明コメントとして不適合
  if (!_noCodeBetweenLines(src, last, node)) return { ok: false, comments: [last], used: null };
  const le = last?.loc?.end.line ?? 0;
  const ns = node?.loc?.start.line ?? 0;
  // 直前行または前行（空行許容）でない場合は不適合。緩和モードでも距離は1行以内に制限
  if (!(le < ns)) return { ok: false, comments: [last], used: null };
  return { ok: true, comments: [last], used: last };
}

/**
 * if キーワードのトークンと最後の意味のある直前コメントを取得する。
 * いずれかが欠ける場合は null を返す。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node 対象ノード
 * @returns {{ifToken:any,last:any}|null} トークンとコメントの組
 */
function _getIfTokenAndLastComment(src, node) {
  const ifToken = src.getFirstToken(node);
  // if トークンが取得できない場合は検査不能として打ち切る
  if (!ifToken) return null;
  const last = getLastMeaningfulComment(src, node);
  // 意味のある直前コメントが無ければ以降の検査は不要
  if (!last) return null;
  return { ifToken, last };
}

/**
 * if キーワード直前の説明コメントの存在を確認する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} node IfStatement 対象ノード
 * @param {boolean} allowBlankBeforeIf 直前の空行を許容するか
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果（ok=適合, comments=候補, used=採用コメント）
 */
function hasBeforeIfKeywordComment(src, node, allowBlankBeforeIf) {
  // 空行許容か否かで適用ルールを切り替える設計（厳格/緩和の二系統）
  return allowBlankBeforeIf
    ? hasBeforeIfKeywordCommentLoose(src, node) // 分岐理由: 空行許容時は緩和ルールで検査
    : hasBeforeIfKeywordCommentStrict(src, node); // 分岐理由: 空行不許容時は直前行のみを厳格検査
}
 
/**
 * BlockStatement の先頭にコメントがあるか。
 * 条件: `{` の行または次行にコメントがあり、最初の文の開始より前。
 * then/else のブロック先頭に説明コメントがあるかを検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement 検査対象ブロック
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果と候補コメント
 */
function hasBlockHeadComment(src, block) {
  // BlockStatement 以外は本検査の対象外
  if (!isBlock(block)) return { ok: false, comments: [], used: null };
  const firstToken = src.getFirstToken(block); // '{'
  // 先頭文が存在すれば拾い、無ければ null を既定にする（検査準備の明確化）
  // 先頭文が無い場合は null で扱い分岐を簡潔にする
  const firstStmt = Array.isArray(block.body) && block.body.length > 0 ? block.body[0] : null; // 先頭文を抽出（同行末コメント許容時の判定に用いる）
  const afterBrace = _pickAfterBraceHead(src, firstToken, firstStmt);
  // ブレース直後の説明コメントがあれば採用
  if (afterBrace && !isDirectiveComment(afterBrace)) return { ok: true, comments: [afterBrace], used: afterBrace };
  const beforeBrace = _pickBeforeBraceHead(src, firstToken);
  // ブレース同行末の説明コメントがあれば採用
  if (beforeBrace && !isDirectiveComment(beforeBrace)) return { ok: true, comments: [beforeBrace], used: beforeBrace };
  return { ok: false, comments: [], used: null };
}
 
/**
 * 単一 Statement の同行末コメントがあるか（ASIの有無は不問）。
 * 単一文の同行末に意図説明コメントがあるかを検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} stmt 検査対象の文
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果と候補コメント
 */
function hasTrailingComment(src, stmt) {
  // 単一文でない（null または Block）の場合は、同行末コメントの検査対象にしない
  if (!stmt || isBlock(stmt)) return { ok: false, comments: [], used: null };
  // 同行末の after/before コメントを簡潔に選択する
  const after = _pickTrailingAfter(src, stmt);
  // 同行末の after コメントがあれば、それを採用する
  if (after) return { ok: true, comments: [after], used: after };
  const before = _pickTrailingBefore(src, stmt);
  // 同行末の before コメントがあれば、それを採用する
  if (before) return { ok: true, comments: [before], used: before };
  return { ok: false, comments: [], used: null };
}

/**
 * 単一文の後方（同行末）のコメント候補（after）を選ぶ。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} stmt 対象ステートメント
 * @returns {any|null} コメント or null
 */
function _pickTrailingAfter(src, stmt) {
  const tok = src.getTokenAfter(stmt, { includeComments: true });
  // 後続トークンが取得できない場合は同行末コメントは存在しない
  // コメントの有無のみを評価し、構造は変更しない
  if (!tok) return null;
  const isComment = tok.type === 'Block' || tok.type === 'Line';
  // 後続トークンがコメントでない場合は不採用
  if (!isComment) return null;
  // 位置情報が取得できない場合は安全側で不採用
  if (!(tok.loc && stmt?.loc)) return null;
  // 同一行でなければ同行末コメントではない
  if (tok.loc.start.line !== stmt.loc.end.line) return null;
  // ディレクティブは除外し、通常コメントのみ採用する
  return isDirectiveComment(tok) ? null : tok; // 行内説明: ディレクティブは採用しない、通常コメントは採用する
}

/**
 * 単一文の後方（同行末）のコメント候補（before）を選ぶ。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} stmt 対象ステートメント
 * @returns {any|null} コメント or null
 */
function _pickTrailingBefore(src, stmt) {
  const tok = src.getTokenBefore(stmt, { includeComments: true });
  // 直前トークンが取得できない場合は同行末コメントは存在しない
  if (!tok) return null;
  const isComment = tok.type === 'Block' || tok.type === 'Line';
  // 直前トークンがコメントでない場合は不採用
  if (!isComment) return null;
  // 位置情報が取得できない場合は安全側で不採用
  if (!(tok.loc && stmt?.loc)) return null;
  // 同一行でなければ同行末コメントではない
  if (tok.loc.end.line !== stmt.loc.end.line) return null;
  // ディレクティブは除外し、通常コメントのみ採用する
  return isDirectiveComment(tok) ? null : tok; // 行内説明: ディレクティブは採用しない、通常コメントは採用する
}

/**
 * 親の Statement ノードを探索する。
 * @param {any} node 起点ノード
 * @returns {any|null} 直近の Statement ノード
 */
function _getEnclosingStatement(node) {
  // 構造の境界まで親を辿り、直近の Statement を採用する
  let p = node;
  // 直近の Statement/Declaration に到達するまで親を遡る（VariableDeclaration も対象）
  while (p && typeof p.type === 'string' && !/(Statement|Declaration)$/.test(p.type)) {
    p = p.parent;
  }

  return p || null;
}
 
/**
 * ブロック先頭コメントの有無を検査して共通の報告を行う。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメントの報告/提案を有効にするか
 * @param {any} block BlockStatement
 * @param {'need_then_block_head'|'need_else_block_head'|'need_catch_block_head'|'need_finally_block_head'} messageId 報告メッセージID
 * @returns {void}
 */
/**
 * ブロック先頭コメントがある場合の検証と自動修正候補の報告。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメントの報告/提案を有効にするか
 * @param {any} block 対象ブロック（then/else/catch/finally）
 * @param {any} used 採用された説明コメントノード
 * @param {any[]} all 先頭コメント集合（冗長検出に利用）
 */
function _handleHeadOk(src, context, tagRe, fixMode, block, used, all) {
  _extVerifyTagOrReport(src, tagRe, context, block, used, 'if');
  // fixMode のときは冗長な先頭コメントを削除候補として報告（先頭以外）
  if (fixMode && all.length > 1) {
    _extReportRemovable(context, src, block, all.slice(1), 'removable_block_head');
  }
}

/**
 * 先頭コメントが無い場合の同行末コメントの検証と自動修正候補の報告。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメントの報告/提案を有効にするか
 * @param {any} block 対象ブロック（then/else/catch/finally）
 * @param {{used:any,comments:any[]}} tr 採用コメントと候補コメントの集合
 */
function _handleTrailingOk(src, context, tagRe, fixMode, block, tr) {
  _extVerifyTagOrReport(src, tagRe, context, block, tr.used, 'if');
  // fixMode のときは同行末コメントのうち冗長な前方を削除候補として報告
  if (fixMode && tr.comments.length > 1) {
    _extReportRemovable(context, src, block, tr.comments.slice(0, tr.comments.length - 1), 'removable_trailing');
  }
}

/**
 * ブロック先頭/同行末コメントを検査し、必要に応じて報告または自動修正候補を提示する。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメントの報告/提案を有効にするか
 * @param {any} block BlockStatement 検査対象のブロック
 * @param {'need_then_block_head'|'need_else_block_head'|'need_catch_block_head'|'need_finally_block_head'} messageId 報告メッセージID
 */
function _checkBlockHeadAndReport(src, context, tagRe, fixMode, block, messageId) {
  // then/else/catch/finally のブロック先頭に説明コメントがあるかを検査する
  const r = hasBlockHeadComment(src, block);
  // ブロック先頭に意図コメントがある場合はタグ検証し、冗長を整理して終了する
  // 既に説明コメントがある場合は、追加の指摘を行わない
  if (r.ok) {
    _handleHeadOk(src, context, tagRe, fixMode, block, r.used, r.comments);
    return;
  }

  // ブロック先頭が無い場合、先頭ステートメントの同行末コメントを許容（単一文のみ）
  // 先頭文の存在確認を簡潔に評価し、単一文のみ同行末を許容する
  // 先頭文が無い場合は null を採用し後続の分岐を簡潔にする
  const firstStmt = Array.isArray(block.body) && block.body.length > 0 ? block.body[0] : null; // 先頭文が無ければ null（同行末許容の判定簡略化）
  // 単一ステートメントでは同行末コメントで意図説明が可能かを検査する
  if (firstStmt && firstStmt.type !== 'BlockStatement') {
    const tr = hasTrailingComment(src, firstStmt);
    // then/else/catch/finally の最初の単一文に同行末の説明がある場合は採用する
    if (tr.ok) {
      _handleTrailingOk(src, context, tagRe, fixMode, block, tr);
      return;
    }
  }

  context.report({ node: block, messageId });
}

/**
 * try/catch/finally 検査（catch/finally のブロック先頭コメントを要求）。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメントの報告/提案を有効にするか
 * @param {any} node TryStatement 対象ノード
 * @param {boolean} ignoreCatch true の場合は catch/finally の検査をスキップ
 * @returns {void}
 */
function _extCheckTry(src, context, tagRe, fixMode, node, ignoreCatch) {
  // 不正対象や免除指定時は早期終了して誤検査や冗長処理を避ける
  if (!node || node.type !== 'TryStatement' || ignoreCatch) return;
  // catch
  // 例外時の扱いを明確にするため、catch の先頭に意図コメントを要求する
  // catch ブロックが存在する場合は先頭コメントの有無を検査する
  if (node.handler && node.handler.body) {
    _checkBlockHeadAndReport(src, context, tagRe, fixMode, node.handler.body, 'need_catch_block_head');
  }

  // finally
  // 必ず実行される後処理の意図を共有するため、finally の先頭に意図コメントを要求する
  // finally ブロックが存在する場合は先頭コメントの有無を検査する
  if (node.finalizer) {
    _checkBlockHeadAndReport(src, context, tagRe, fixMode, node.finalizer, 'need_finally_block_head');
  }
}

/**
 * コメント本文テキスト（元ソース）を取得する（JSDoc 判定用）。
 * コメントノードから元ソースの文字列を取得する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} c コメントノード
 * @returns {string} コメントの原文
 */
function getCommentSourceText(src, c) {
  // 範囲情報がある場合は高速かつ安全に原文を抽出する（失敗時はフォールバックに委ねる）
  // 想定外範囲では try/catch でフォールバックへ退避する
  try {
    // 範囲指定の配列であれば高速に原文を抽出する
    if (Array.isArray(c.range) && c.range.length === 2) {
      return String(src.text.slice(c.range[0], c.range[1]) || '');
    }
  } catch {
    // 例外時は安全側でフォールバックし、JSDoc 判定の誤検知を防ぐ
  }
  // 値が無い場合は空文字として埋め、後段の判定を安定させる

  const v = typeof c?.value === 'string' ? c.value : ''; // 取得失敗時は空文字を採用して安全にフォールバック（同行末コメント）
  return `/*${v}*/`;
}
 
/**
 * JSDoc かどうかを判定する。
 * コメントが JSDoc 形式かを判定する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} c コメントノード
 * @returns {boolean} 真偽値を返す
 */
function isJSDoc(src, c) {
  const s = getCommentSourceText(src, c);
  return /^\/\*\*[\s\S]*\*\/$/.test(s);
}
 
/**
 * 余剰コメントを removable として報告する（共通化）。
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト（report の呼び出しに使用）
 * @param {import('eslint').SourceCode} src ソースコード（JSDoc/ディレクティブ判定に使用）
 * @param {any} node 対象ノード（報告位置の基準）
 * @param {any[]} extras 余剰とみなすコメントノード配列
 * @param {string} messageId 報告メッセージID
 * @returns {void}
 */
function _extReportRemovable(context, src, node, extras, messageId) {
  // 余剰コメント候補を走査し、JSDoc/ディレクティブ以外を削除候補として報告する
  for (const extra of extras) {
    // 空要素は除外（解析残渣を無視）
    if (!extra) continue;
    // eslintディレクティブやJSDocは保持対象とし、removableから除外する
    if (!isDirectiveComment(extra) && !isJSDoc(src, extra)) {
      context.report({ node, loc: extra.loc, messageId });
    }
  }
}

/**
 * 類似度判定用の正規化（NFKC→小文字化→空白/句読点/記号の除去）。
 * @param {string} s 入力文字列
 * @returns {string} 正規化後の文字列
 */
function _normalizeForSimilarity(s) {
  // 正規化処理の失敗時も安全にフォールバックする
  try {
    return String(s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\p{P}\p{S}\s]+/gu, '');
  } catch {
    // 例外時は簡易正規化へフォールバック（意図: 類似度計算の一貫性確保）
    return String(s || '').toLowerCase().replace(/[^a-z0-9\u0080-\uFFFF]+/g, '');
  }
}

/**
 * Levenshtein 距離（2行DP）
 * @param {string} a 比較対象の文字列A
 * @param {string} b 比較対象の文字列B
 * @returns {number} 距離（編集距離: 0 は完全一致）
 */
function _levenshtein(a, b) {
  // 早期判定（完全一致または空文字）で計算を省略し、性能を確保する
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  // 片方が空のときは距離を他方の長さとする（挿入/削除のみ）
  if (n === 0) return m;
  // 片方が空のときは距離を他方の長さとする（挿入/削除のみ）
  if (m === 0) return n;
  // 2 行 DP を用いて距離を計算する（メモリは O(m)）
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  // 初期化ループで 0..m を設定し、列の基底条件とする
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  // 各行の先頭セルを初期化し、挿入・削除・置換の最小コストを逐次更新する
  // DP 行ループ: 各行の先頭で基底条件を設定してから列を走査する
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    // 距離DPの列走査: 挿入/削除/置換の最小コストを評価する（計算中核）
    for (let j = 1; j <= m; j += 1) {
      // 置換コストは同一文字なら 0、異なれば 1 とする
      // 同一文字は置換0、異なる場合は1のコストで比較する
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const ins = curr[j - 1] + 1;
      const del = prev[j] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = Math.min(ins, del, sub);
    }

    const tmp = prev; prev = curr; curr = tmp;
  }

  return prev[m];
}

/**
 * 類似度比（distance/maxLen）を計算する。
 * @param {string} aNorm 正規化済み文字列A
 * @param {string} bNorm 正規化済み文字列B
 * @returns {{ratio:number,distance:number,maxLen:number}} 比率と内部値
 */
function _calcDistanceRatio(aNorm, bNorm) {
  // 最大長が 0 のときは安全側で 0 として扱う（報告対象外の短文は上位で除外する）
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const distance = _levenshtein(aNorm, bNorm);
  // 0除算を避けつつ距離を最大長で正規化して比率を求める
  const ratio = maxLen > 0 ? distance / maxLen : 0;
  return { ratio, distance, maxLen };
}

/**
 * 類似度比較の対象にできるだけの長さかを判定する（短文除外）。
 * @param {string} aNorm 正規化後A
 * @param {string} bNorm 正規化後B
 * @returns {boolean} 両者とも十分な長さなら true
 */
function _shouldCompareLen(aNorm, bNorm) {
  // ノイズを抑制するため、短文（<10）は比較対象から除外する
  return aNorm.length >= 10 && bNorm.length >= 10;
}

/**
 * try vs catch/finally の類似度がしきい値以下なら報告する。
 * @param {import('eslint').Rule.RuleContext} ctx ルールコンテキスト
 * @param {any} targetNode 報告対象のノード（catch.body または node.finalizer）
 * @param {'catch'|'finally'} side 比較側の種類
 * @param {string} tryNorm 正規化後の try コメント
 * @param {string} sideNorm 正規化後の比較側コメント
 * @param {string} rawTryText 生の try コメント
 * @param {string} rawSideText 生の比較側コメント
 * @param {number} threshold しきい値
 * @returns {void}
 */
function _reportTrySimilarityIfNeeded(ctx, targetNode, side, tryNorm, sideNorm, rawTryText, rawSideText, threshold) {
  // 比率が閾値以下なら「役割の重複が読める」と判断し、詳細を片側ごとに報告する
  const { ratio, distance, maxLen } = _calcDistanceRatio(tryNorm, sideNorm);
  // 重複疑いの判定: 閾値を下回る場合にのみ通知へ進めてノイズを抑制する
  // 比率が基準以下なら「重複の疑いあり」と見なし報告フローへ遷移する
  if (ratio <= threshold) {
    // 片側の責務に応じて伝える観点を切り替え、読者が非対称性を理解できるようにする
    if (side === 'catch') {
      // 例外経路では「try の目的」と「例外時の扱い」の差を明確にし、重複時は改善を促す
      ctx.report({
        node: targetNode,
        messageId: 'similar_try_catch',
        data: {
          ratio: ratio.toFixed(2),
          threshold: threshold.toFixed(2),
          distance: String(distance),
          maxLen: String(maxLen),
          tryComment: rawTryText.trim(),
          catchComment: rawSideText.trim()
        }
      });
    } else {
      // 比較側が finally の場合は後処理の重複として扱う（条件の意味）
      // 後処理として実行する内容の意図を先頭で示す（ブロック先頭）
      // クリーンアップ意図の重複を具体的な値と共に報告する（行動）
      // finally 側では後処理の重複を明確化して報告する
      ctx.report({
        node: targetNode,
        messageId: 'similar_try_finally',
        data: {
          ratio: ratio.toFixed(2),
          threshold: threshold.toFixed(2),
          distance: String(distance),
          maxLen: String(maxLen),
          tryComment: rawTryText.trim(),
          finallyComment: rawSideText.trim()
        }
      });
    }
  }
}

/**
 * if vs then/else の類似度がしきい値以下なら報告する。
 * @param {import('eslint').Rule.RuleContext} ctx ルールコンテキスト
 * @param {any} targetNode then/else 側の対象ノード
 * @param {'then'|'else'} side 比較側
 * @param {string} ifNorm 正規化後 if
 * @param {string} sideNorm 正規化後 then/else
 * @param {string} rawIf 生の if コメント
 * @param {string} rawSide 生の then/else コメント
 * @param {number} threshold しきい値
 * @returns {void}
 */
function _reportIfSimilarityIfNeeded(ctx, targetNode, side, ifNorm, sideNorm, rawIf, rawSide, threshold) {
  // 正規化距離の比率が閾値以下なら、役割が重複している可能性が高いとみなす
  const { ratio, distance, maxLen } = _calcDistanceRatio(ifNorm, sideNorm);
  // 閾値未満なら重複疑いとして詳細レポートへ進む
  if (ratio <= threshold) {
    // 比較対象側の種別に応じて出力メッセージIDを切り替える（非対称性を維持）
    let messageId;
    // 成立側と非成立側の説明を別々に詳述する
    if (side === 'then') {
      // then 側の重複を指摘する報告種別を選ぶ
      messageId = 'similar_if_then';
    } else {
      // else 側の重複を指摘する報告種別を選ぶ
      messageId = 'similar_if_else';
    }

    // 可読性のための空行

    // レポート用データを整形し、片側の説明を適切なキーに格納する
    const data = {
      ratio: ratio.toFixed(2),
      threshold: threshold.toFixed(2),
      distance: String(distance),
      maxLen: String(maxLen),
      ifComment: rawIf.trim()
    };
    // レポート payload に格納するキー名の選定処理（片側のみを登録）
    if (side === 'then') {
      // 成立側の説明を記録してレポートに含める
      data.thenComment = rawSide.trim();
    } else {
      // 非成立側の説明を記録してレポートに含める
      data.elseComment = rawSide.trim();
    }

    // 類似度指摘を出力する（同一行の重複指摘はラッパー側で調整）
    ctx.report({ node: targetNode, messageId, data });
  }
}

/**
 * ブロック先頭 or 単一文末尾の採用コメントを取得（無ければ null）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement
 * @returns {any|null} 採用コメントノード
 */
function _extractUsedCommentForBlock(src, block) {
  // 比較対象となるブロックが無い場合は検査を打ち切る
  if (!block) return null;
  const r = hasBlockHeadComment(src, block);
  // 先頭コメントが採用可能ならそれを返す
  if (r.ok) return r.used || null;
  const firstStmt = Array.isArray(block.body) && block.body.length > 0 ? block.body[0] : null; // 先頭文が無ければ null とし、同行末採用の可否判断を単純化する
  // 単一文が無い/ネストブロックのみの場合は対象外として終了する
  if (!firstStmt || firstStmt.type === 'BlockStatement') return null;
  const tr = hasTrailingComment(src, firstStmt);
  // 採用可否に応じて最終的なコメントノードを返す（前行コメント）
  return tr.ok ? tr.used || null : null; // 行内説明: 単一文の同行末に説明があれば採用し、無ければ null
}

/**
 * ブロックまたは単一文の採用コメントを取得する（後段の類似度検査用）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} nodeOrBlock BlockStatement または単一 Statement
 * @returns {any|null} 採用コメントノード
 */
function _extractUsedCommentForStatementOrBlock(src, nodeOrBlock) {
  // 比較対象が未定義のときは以降の検査を避ける
  if (!nodeOrBlock) return null;
  // ブロックであればブロック用の抽出手続きへ委譲する
  if (isBlock(nodeOrBlock)) {
    return _extractUsedCommentForBlock(src, nodeOrBlock);
  }

  const tr = hasTrailingComment(src, nodeOrBlock);
  return tr.ok ? tr.used || null : null; // 行内説明: 単一文の同行末説明を採用し、無ければ null
}

/**
 * SwitchCase ラベル直前の説明コメント（厳格: 直前行のみ）を判定する。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {any} node SwitchCase 対象ノード
 * @returns {{ok:boolean,used:any|null}} 判定
 */
function _hasLeadingCommentForCaseStrict(src, node) {
  // 対象が SwitchCase でなければ本検査の対象外
  if (!node || node.type !== 'SwitchCase') return { ok: false, used: null };
  const last = getLastMeaningfulComment(src, node);
  // 直前に説明が無い場合は不足扱い
  if (!last) return { ok: false, used: null };
  const ok = Boolean(last?.loc && node?.loc && last.loc.end.line === node.loc.start.line - 1);
  return ok ? { ok: true, used: last } : { ok: false, used: null }; // 行内説明: 厳格隣接が真なら採用、偽なら不足として扱う
}

/**
 * 三項演算子（ConditionalExpression）に対する直前行または同行末コメントの存在チェック。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node ConditionalExpression 対象ノード
 * @param {boolean} fixMode 冗長コメント（同行末の重複など）の報告/整理を有効にするか
 * @returns {void}
 */
/**
 * 三項（前行・同行末の両立時）を処理し、必要に応じて冗長を報告する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node 対象ノード（ConditionalExpression）
 * @param {{ok:boolean,last:any}|null} prev 前行コメント判定
 * @param {{ok:boolean,used:any}|null} tr 同行末コメント判定
 * @param {boolean} fixMode 冗長整理を有効化するか
 * @returns {boolean} 処理した場合は true（呼び出し元で終了）
 */
function _ternaryTryHandleBoth(src, context, tagRe, node, prev, tr, fixMode) {
  // 前行と同行末の両方に説明がある場合は前行を採用し、同行末は冗長として扱う
  if (!(prev && prev.ok && tr && tr.ok)) return false;
  _extVerifyTagOrReport(src, tagRe, context, node, prev.last, '?:');
  // fixMode の場合は冗長な同行末を削除候補として報告する
  if (fixMode && tr.used) {
    context.report({ node, loc: tr.used.loc, messageId: 'removable_trailing' });
  }

  return true;
}

/**
 * 三項（片方のみ適合時）を処理して採用する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node 対象ノード（ConditionalExpression）
 * @param {{ok:boolean,last:any}|null} prev 前行コメント判定
 * @param {{ok:boolean,used:any}|null} tr 同行末コメント判定
 * @returns {boolean} 処理した場合は true
 */
function _ternaryTryHandleSingle(src, context, tagRe, node, prev, tr) {
  // 片方だけ説明がある場合はその片方を採用する
  if (prev && prev.ok) {
    _extVerifyTagOrReport(src, tagRe, context, node, prev.last, '?:');
    return true;
  }

  // 直前説明が取れない場合は同行末の説明を採用候補として評価する
  if (tr && tr.ok) {
    _extVerifyTagOrReport(src, tagRe, context, node, tr.used, '?:');
    return true;
  }

  return false;
}

/**
 * 三項の親 Statement に付与された説明の採用を試みる。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node 対象ノード（ConditionalExpression）
 * @returns {boolean} 採用できた場合は true
 */
function _ternaryTryHandleParentStatement(src, context, tagRe, node) {
  // 三項が式文の一部であれば、その式文に付与された説明も評価する
  const stmt = _getEnclosingStatement(node);
  // 親 Statement が無い場合は採用元が無いため終了する
  if (!stmt) return false;
  const prevStmt = hasRequiredPreviousComment(src, stmt, false);
  // 式文の直前に説明があればそれを採用する
  if (prevStmt.ok) {
    _extVerifyTagOrReport(src, tagRe, context, node, prevStmt.last, '?:');
    return true;
  }

  const trStmt = hasTrailingComment(src, stmt);
  // 式文の同行末に説明があればそれを採用する
  if (trStmt.ok) {
    _extVerifyTagOrReport(src, tagRe, context, node, trStmt.used, '?:');
    return true;
  }

  return false;
}

/**
 * 三項演算子に対する説明コメントの検査（前行/同行末/親Statementを順に採用）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node ConditionalExpression 対象ノード
 * @param {boolean} fixMode 冗長コメント整理を有効にするか
 * @returns {void}
 */
function _extCheckTernary(src, context, tagRe, node, fixMode) {
  // 三項演算子の検査対象でなければ早期終了（不適合を広げないためのガード）
  if (!node || node.type !== 'ConditionalExpression') return;
  // 直前行コメント（空行不可）と同行末コメントを両方チェックし、どちらか片方で適合とする
  const prev = hasRequiredPreviousComment(src, node, false);
  const tr = hasTrailingComment(src, node);
  // 両方ある場合は冗長方針の適用を試みる
  if (_ternaryTryHandleBoth(src, context, tagRe, node, prev, tr, fixMode)) return;
  // 片方だけある場合の採用を試みる
  if (_ternaryTryHandleSingle(src, context, tagRe, node, prev, tr)) return;
  // 親 Statement の前行/同行末コメントの採用を試みる
  if (_ternaryTryHandleParentStatement(src, context, tagRe, node)) return;
  // どの採用も成立しなければ不足として報告する
  context.report({ node, messageId: 'need_ternary_comment' });
}

/**
 * switch 文に対するヘッドおよび各 case/default 直前コメントの検査。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {any} node SwitchStatement 対象ノード
 * @returns {void}
 */
function _extCheckSwitch(src, context, tagRe, node) {
  // switch 以外のノードは対象外とし早期終了
  if (!node || node.type !== 'SwitchStatement') return;
  // ヘッド（switch キーワード）直前
  const head = hasRequiredPreviousComment(src, node, false);
  // switch キーワード直前に説明があるかを検査する
  if (!head.ok) {
    // 説明が無い場合は不足を報告する
    context.report({ node, messageId: 'need_before_switch' });
  } else {
    // タグ基準の適合性を検査し、結果に応じて処理を進める
    _extVerifyTagOrReport(src, tagRe, context, node, head.last, 'switch');
  }

  // 各 case/default（単一 case のみの switch は除外）
  // cases は配列でなければ空配列として扱い、以降の反復で安全に処理する
  const cases = Array.isArray(node.cases) ? node.cases : [];
  // 単一 case の switch は対象外（説明重複の回避）
  if (cases.length <= 1) return;
  // 各 case/default に説明コメントがあるか厳格に検査する
  for (const cs of cases) {
    const r = _hasLeadingCommentForCaseStrict(src, cs);
    // ラベル直前の説明が無い場合は不足を報告する
    if (!r.ok) {
      // 直前行に説明を要求する不足指摘を出す
      context.report({ node: cs, messageId: 'need_case_head' });
    } else {
      // タグ基準の適合性を検査し、結果を反映する
      _extVerifyTagOrReport(src, tagRe, context, cs, r.used, 'switch');
    }
  }
}

/* 類似度チェックの分岐は明確性を優先し単純な直列構造で保持する（複雑度は構造分割で吸収し、eslint-disable は使用しない） */
/**
 * try と catch/finally のコメント類似度を検査して必要に応じて報告する。
 * セーフガード: 正規化後の長さが双方とも 10 以上のときのみ評価。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} ctx ルールコンテキスト
 * @param {any} node TryStatement 対象ノード
 * @param {string} tryText try側コメント原文（判定基準）
 * @param {number} threshold 閾値（0.6〜0.9）
 * @returns {void}
 */
function _extCheckTrySimilarity(src, ctx, node, tryText, threshold) {
  const tryNorm = _normalizeForSimilarity(tryText);
  // 短文は比較対象外とし、ノイズを抑制する
  if (tryNorm.length < 10) return;
  // catch/finally は共通の手続きで比較し、分岐を圧縮する
  const _block = {
    catch: node && node.handler ? node.handler.body : null,
    finally: node ? node.finalizer : null
  };
  /**
   * 内部: 片側の比較と報告
   * @param {'catch'|'finally'} side 比較側
   */
  const _compareSide = (side) => {
    const sideBlock = _block[side];
    // 比較対象ブロックが無ければこの側の評価は不要のため直ちに終了する
    if (!sideBlock) return;
    const c = _extractUsedCommentForBlock(src, sideBlock);
    // 説明コメントが抽出できなければ比較は成立しないため以降を打ち切る
    if (!c || typeof c.value !== 'string') return;
    const sideNorm = _normalizeForSimilarity(c.value);
    // 短文の比較はノイズとなるため十分な長さのときだけ類似度を評価する
    if (_shouldCompareLen(tryNorm, sideNorm)) {
      // 最低長を満たした場合に限り、正規化した文字列で距離比を評価し報告する
      _reportTrySimilarityIfNeeded(ctx, sideBlock, side, tryNorm, sideNorm, tryText, String(c.value || ''), threshold);
    }
  };

  _compareSide('catch');
  _compareSide('finally');
}
/* 類似度チェックのための一時的な複雑度免除は撤去（ルール適用下で保守する） */

/* if/then・if/else 類似度チェックの分岐は直列で保持する（複雑度は関数分割で管理し、eslint-disable は使用しない） */
/**
 * if と then/else のコメント類似度を検査し、必要に応じて報告する。
 * セーフガード: 正規化後の長さが双方とも 10 以上のときのみ評価。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} ctx ルールコンテキスト
 * @param {any} node IfStatement 対象ノード
 * @param {string} ifText if 直前コメント原文（基準）
 * @param {number} threshold 閾値（0.6〜1.0）
 * @returns {void}
 */
function _extCheckIfSimilarity(src, ctx, node, ifText, threshold) {
  const ifNorm = _normalizeForSimilarity(ifText);
  // 短文は比較対象外とし、ノイズを抑制する
  if (ifNorm.length < 10) return;
  // then/else は共通の手続きで比較し、分岐を圧縮する
  const _side = {
    then: node ? node.consequent : null,
    else: node && !isIf(node.alternate) ? node.alternate : null
  };
  const _compare = (side) => {
    const target = _side[side];
    // 比較対象が存在しなければこの側の評価は不要とし、早期に処理を終える
    if (!target) return;
    const c = _extractUsedCommentForStatementOrBlock(src, target);
    // 採用可能な説明が無ければ比較不能なので、この側はスキップする
    if (!c || typeof c.value !== 'string') return;
    const norm = _normalizeForSimilarity(c.value);
    // 比較に足る長さを満たした場合のみ類似度を判定して報告する
    if (_shouldCompareLen(ifNorm, norm)) {
      _reportIfSimilarityIfNeeded(ctx, target, side, ifNorm, norm, ifText, String(c.value || ''), threshold);
    }
  };

  _compare('then');
  _compare('else');
}
/* 複雑度免除の一時化は撤去（ルール適用下で表現する） */

/**
 * 直前行に隣接しているかを判定する（if の直前コメント用）。
 * @param {any} last 最後の意味のあるコメント（候補）
 * @param {any} ifToken if キーワードのトークン（対象）
 * @returns {boolean} 隣接していれば true
 */
function _isAdjacentToIf(last, ifToken) {
  return Boolean(last?.loc && ifToken?.loc && last.loc.end.line === ifToken.loc.start.line - 1);
}

/**
 * コメントとノードの間に実コードが無いことを判定する（緩和モード用）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} last 最後の意味のあるコメント（候補）
 * @param {any} node 対象ノード（制御構造）
 * @returns {boolean} 実コードが無ければ true
 */
function _noCodeBetweenLines(src, last, node) {
  const tokensBetween = src.getTokensBetween(last, node, { includeComments: false }) || [];
  // 行間に実コードが一切ない場合は、そのコメントを直前説明として採用可能と判断して早期終了する
  if (tokensBetween.length === 0) return true;
  const le = last?.loc?.end.line ?? 0;
  const ns = node?.loc?.start.line ?? Number.MAX_SAFE_INTEGER;
  return tokensBetween.every((t) => {
    const s = t?.loc?.start.line ?? 0;
    const e = t?.loc?.end.line ?? 0;
    return !(s > le && e < ns);
  });
}

/**
 * ブロック先頭候補（{ の次行）のコメントを取得する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} firstToken ブロックの最初のトークン（{）
 * @param {any|null} firstStmt 最初の文（存在しない場合は null）
 * @returns {any|null} 見つかったコメント（無ければ null）
 */
function _pickAfterBraceHead(src, firstToken, firstStmt) {
  const after = src.getTokenAfter(firstToken, { includeComments: true });
  // 取得失敗時は候補自体が無いため即時に不成立として終了する
  if (!after) return null;
  const isComment = after.type === 'Block' || after.type === 'Line';
  // コメント以外は先頭説明の候補にならないため、この時点で不採用とする
  if (!isComment) return null;
  // 位置情報が欠ける場合は先頭説明の評価ができないため安全側で不採用
  if (!(after.loc && firstToken?.loc)) return null;
  // ブレース直後の行に無ければ先頭説明とは見なさない（位置の一貫性を優先）
  if (after.loc.start.line !== firstToken.loc.start.line + 1) return null;
  const beforeFirst = !firstStmt || (after.loc.end.line <= firstStmt.loc.start.line);
  return beforeFirst ? after : null; // 行内説明: 先頭文より前に位置する場合のみブロックヘッドとして採用
}

/**
 * ブレース直前（{ と同一行）のコメントを取得する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} firstToken ブロックの最初のトークン（{）
 * @returns {any|null} 見つかったコメント（無ければ null）
 */
function _pickBeforeBraceHead(src, firstToken) {
  const before = src.getTokenBefore(firstToken, { includeComments: true });
  // 取得失敗時は候補自体が無いため即時に不成立として終了する
  if (!before) return null;
  const isComment = before.type === 'Block' || before.type === 'Line';
  // コメント以外は先頭説明の候補にならないため、この時点で不採用とする
  if (!isComment) return null;
  // 位置情報が欠ける場合は安全側で不採用（ブレース同行末の条件を厳密化）
  if (!(before.loc && firstToken?.loc)) return null;
  return before.loc.end.line === firstToken.loc.start.line ? before : null; // 行内説明: ブレース同行末のコメントのみ採用
}

/**
 * 保持タグ/抑止タグの適合を検査して、タグ不一致を報告する（外部化）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {any} targetNode 報告対象ノード
 * @param {any|null} usedComment 検査対象の説明コメント
 * @param {'if'|'for'|'while'|'do'|'switch'|'try'} kw キーワード（報告文言向け）
 * @returns {void} 判定のみを行い、必要時に report する
 */
function _extVerifyTagOrReport(src, tagRe, context, targetNode, usedComment, kw) {
  // タグ基準の検査が無効、または検査対象の説明が無い場合は何もしない
  if (!usedComment) return;
  const text = typeof usedComment.value === 'string' ? usedComment.value : ''; // 文字列でなければ空文字へフォールバックし、検査を安定化
  // 追加検査: メタ表現（then:/else:/このifは/ルールに合わせて 等）の禁止
  const metaEnabled = !!(Array.isArray(context.options) && context.options[0] && context.options[0].enforceMeta);
  // メタ表現の検出は、将来的にオプションを有効化したときのみ実施する（現状は既定で無効）
  // if (metaEnabled && _isMetaLikeIntentComment(text)) {
  //   context.report({ node: targetNode, loc: usedComment.loc, messageId: 'meta_like_comment' });
  //   return;
  // }
  // タグ基準が設定されている場合のみ検査
  // ロケール基準（例: 非 ASCII 必須）に適合しない場合は違反を報告する
  if (tagRe && !matchesPattern(text, tagRe)) {
    context.report({ node: targetNode, messageId: 'tagMismatch', data: { kw, pat: String(tagRe) } });
  }
}

/**
 * メタ表現に近いコメントかを判定する。
 * - 目的: 「ルールに合わせた体裁」や接頭語だけのラベルを排除し、自然文の意図説明を促す
 * - 方針: 先頭のラベル/定型句や中身の無い終止のみを簡易検出（日本語の厳密判定は行わない）
 * @param {string} raw コメント原文
 * @returns {boolean} メタ表現と判断した場合は true
 */
function _isMetaLikeIntentComment(raw) {
  const s = String(raw || '').trim();
  // 内容が空のときは実体が無く判断不能のためメタ扱いにする
  if (s.length === 0) return true;
  const headMeta = /^(then|else)\s*:/i.test(s) || /^この\s*(if|for|while|switch)\s*は/.test(s);
  const ruleMeta = /(ルールに(合わせて|より|準拠)|コメントを置く)/.test(s);
  const bareOutcome = /^(成功時|失敗時|処理します?)[。.\s]*$/u.test(s);
  // 内容語の存在ヒューリスティック（目的/理由/結果を示しやすい語）
  const intentHints = /(ため|ように|ので|結果|避ける|抑える|維持|改善|削減)/.test(s);
  // 単語数が極端に少ない（2語以下）の短文
  const fewTokens = s.replace(/[/*]/g, '').trim().split(/\s+/).filter(Boolean).length <= 2;
  // 先頭ラベル/ルール言及/中身のない終止、かつ意図語が無い短文をメタとみなす
  return (headMeta || ruleMeta || bareOutcome || fewTokens) && !intentHints;
}

/**
 * else-if alternate 判定（外部化）。
 * @param {any} node IfStatement ノード
 * @returns {boolean} else-if の alternate（親の alternate が自分）なら true
 */
function _extIsElseIfAlternate(node) {
  return (
    node &&
    node.type === 'IfStatement' &&
    node.parent &&
    node.parent.type === 'IfStatement' &&
    node.parent.alternate === node
  );
}

/**
 * ぶら下がり（dangling）扱いかを計算する（外部化）。
 * @param {boolean} isStructurallyDangling 連鎖継続（alternate が If）か
 * @param {boolean} isChainHead 連鎖先頭か
 * @param {boolean} treatHeadAsNonDangling 先頭非ぶら下がり扱いポリシーか
 * @returns {boolean} ポリシー上のぶら下がりなら true
 */
function _computeDanglingUnderPolicy(isStructurallyDangling, isChainHead, treatHeadAsNonDangling) {
  return isStructurallyDangling && !(isChainHead && treatHeadAsNonDangling);
}

/**
 * if 直前コメントが必要か（外部化）。
 * @param {boolean} isNonDanglingUnderPolicy ポリシー上の非ぶら下がりか
 * @param {boolean} isInnerElseIf 連鎖内の else-if か
 * @returns {boolean} 必要なら true
 */
function _computeNeedBeforeIf(isNonDanglingUnderPolicy, isInnerElseIf) {
  return isNonDanglingUnderPolicy && !isInnerElseIf;
}

/**
 * then 側コメントが必要か（外部化）。
 * @param {boolean} isDanglingUnderPolicy ポリシー上のぶら下がりか
 * @param {boolean} isFull alternate を持つか
 * @param {boolean} isInnerElseIf 連鎖内の else-if か
 * @returns {boolean} 必要なら true
 */
function _computeNeedConsequentComment(isDanglingUnderPolicy, isFull, isInnerElseIf) {
  return isDanglingUnderPolicy || isFull || isInnerElseIf;
}

/**
 * 保持タグ検出（外部化）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} c コメントノード
 * @returns {boolean} コメントが保持タグ（keep/nofix/lint-keep）を含む場合は true
 */
function _extHasKeepTag(src, c) {
  // 例外方針: コメント抽出の失敗を許容し安全側に倒す（保持タグ判定はベストエフォート）
  try { // 文字列抽出時の例外を捕捉し、false へフォールバックする
    const s = String(getCommentSourceText(src, c) || '').toLowerCase();
    return /\bnofix\b/.test(s) || /\blint-keep\b/.test(s) || /\bkeep\b/.test(s);
  } catch {
    // 例外時は保持タグ無しとみなし、誤った削除提案を避ける
    return false;
  }
}

/**
 * if 直前コメント検査（外部化）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} allowBlankLineBeforeIf if 直前の空行許容フラグ
 * @param {any} node IfStatement 対象ノード
 * @param {boolean} needBeforeIf if 直前コメントが必要かどうか
 * @param {boolean} fixMode 冗長コメント報告を有効にするか
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckBeforeIfKeyword(src, context, tagRe, allowBlankLineBeforeIf, node, needBeforeIf, fixMode) {
  const r = hasBeforeIfKeywordComment(src, node, allowBlankLineBeforeIf);
  // この if は「直前コメントが必要か」を条件に分岐する（要否の判断基準）
  // 当該 if に直前説明が必要な場合のみ、存在検査とタグ基準の検証を行う
  if (needBeforeIf) {
    // 説明が見つからなければ不足を報告して処理を終了する
    if (!r.ok) {
      context.report({ node, messageId: 'need_before_if' });
      return;
    }

    _extVerifyTagOrReport(src, tagRe, context, node, r.used, 'if');
    return;
  }

  // 成立時の後処理: fixMode のとき余剰な直前説明があれば整理候補として報告する
  if (fixMode && r.used && !isDirectiveComment(r.used) && !isJSDoc(src, r.used) && !_extHasKeepTag(src, r.used)) {
    context.report({ node, loc: r.used.loc, messageId: 'removable_before_if' });
  }
}

/**
 * then 側検査（外部化）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメント報告を有効にするか
 * @param {any} node IfStatement 対象ノード
 * @param {boolean} needConsequentComment then 側に説明コメントが必要か
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckThenSide(src, context, tagRe, fixMode, node, needConsequentComment) {
  // then 側に説明コメントが不要、または対象が無い場合は直ちに終了する
  if (!needConsequentComment || !node.consequent) return;
  // ブロック構造ならヘッド検査、単一文なら同行末の説明を検査する
  if (isBlock(node.consequent)) {
    // then 側のブロック: 先頭コメントの検査・タグ検証・冗長整理を実行する
    const rc = hasBlockHeadComment(src, node.consequent);
    // 先頭に説明が無い場合は不足として報告する
    if (!rc.ok) {
      // then ブロックの先頭: この分岐で取る処置（不足を通知）を明示する
      context.report({ node: node.consequent, messageId: 'need_then_block_head' });
    } else {
      // then ブロックの先頭: タグ基準への適合性を検査する
      _extVerifyTagOrReport(src, tagRe, context, node.consequent, rc.used, 'if');
    }

    // コメントが複数ある場合のみ整理を有効化し、ノイズを抑える
    if (fixMode && rc.comments.length > 1) {
      // 先頭以外の重複コメントは削除候補として報告する
      _extReportRemovable(context, src, node.consequent, rc.comments.slice(1), 'removable_block_head');
    }

    return;
  }

  // then が単一文のときは同行末コメントを許容し、説明の重複は整理する
  const rc = hasTrailingComment(src, node.consequent);
  // 行内の説明が確認できないケースはアラート経路へ遷移する
  if (!rc.ok) {
    // then ブロックの先頭: 単一文の同行末説明が無いため不足を通知する
    context.report({ node: node.consequent, messageId: 'need_then_trailing' });
  } else {
    // then ブロックの先頭: 単一文の同行末説明のタグ基準を検査する
    _extVerifyTagOrReport(src, tagRe, context, node.consequent, rc.used, 'if');
  }

  // 同行末の候補が複数ある場合のみ整理を有効化する
  if (fixMode && rc.comments.length > 1) {
    _extReportRemovable(context, src, node.consequent, rc.comments.slice(0, rc.comments.length - 1), 'removable_trailing');
  }
}

/**
 * else 側検査（外部化）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} fixMode 冗長コメント報告を有効にするか
 * @param {any} node IfStatement 対象ノード
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckElseSide(src, context, tagRe, fixMode, node) {
  // else 側が存在しない場合はこの側の検査は不要
  if (!node.alternate) return;
  // ブロック構造ならヘッド検査を行い、単一文なら同行末の説明を検査する
  if (isBlock(node.alternate)) {
    // else 側のブロック: 先頭コメントの検査・タグ検証・冗長整理を実行する
    const ra = hasBlockHeadComment(src, node.alternate);
    // 先頭に説明が無い場合は不足として報告する
    if (!ra.ok) {
      // else ブロックの先頭: 不成立時の方針が読めないため不足を通知する
      context.report({ node: node.alternate, messageId: 'need_else_block_head' });
    } else {
      // else ブロックの先頭: タグ基準への適合性を検査する
      _extVerifyTagOrReport(src, tagRe, context, node.alternate, ra.used, 'if');
    }

    // コメントが複数ある場合のみ整理を有効化し、ノイズを抑える
    if (fixMode && ra.comments.length > 1) {
      // 先頭以外の重複コメントは削除候補として報告する
      _extReportRemovable(context, src, node.alternate, ra.comments.slice(1), 'removable_block_head');
    }

    return;
  }

  // else が単一文のときは同行末コメントを許容し、説明の重複は整理する
  const ra = hasTrailingComment(src, node.alternate);
  // 行内の説明が確認できないケースはアラート経路へ遷移する
  if (!ra.ok) {
    // else ブロックの先頭: 単一文の同行末説明が無いため不足を通知する
    context.report({ node: node.alternate, messageId: 'need_else_trailing' });
  } else {
    // else ブロックの先頭: 単一文の同行末説明のタグ基準を検査する
    _extVerifyTagOrReport(src, tagRe, context, node.alternate, ra.used, 'if');
  }

  // 同行末の候補が複数ある場合のみ整理を有効化する
  if (fixMode && ra.comments.length > 1) {
    _extReportRemovable(context, src, node.alternate, ra.comments.slice(0, ra.comments.length - 1), 'removable_trailing');
  }
}

/**
 * IfStatement の総合検査（外部化・再帰）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {RegExp|null} tagRe タグ検証用のパターン
 * @param {boolean} treatHeadAsNonDangling 連鎖先頭を非ぶら下がり扱いにするか
 * @param {boolean} allowBlankLineBeforeIf if 直前の空行許容フラグ
 * @param {boolean} fixMode 冗長コメント報告を有効にするか
 * @param {number} similarityThreshold 類似度のしきい値
 * @param {any} node IfStatement 対象ノード
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckIf(src, context, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode, similarityThreshold, node) {
  // 対象が if でない場合は検査を行わず、誤検査を防止する
  // if でない場合は以降の検査を行わない
  if (!isIf(node)) return;
  const isInnerElseIf = _extIsElseIfAlternate(node);
  const isFull = !!node.alternate;
  const isStructurallyDangling = isIf(node.alternate);
  const isChainHead = !isInnerElseIf;
  const isDanglingUnderPolicy = _computeDanglingUnderPolicy(isStructurallyDangling, isChainHead, treatHeadAsNonDangling);
  const isNonDanglingUnderPolicy = !isDanglingUnderPolicy;
  const needBeforeIf = _computeNeedBeforeIf(isNonDanglingUnderPolicy, isInnerElseIf);

  // if キーワード直前のコメントの有無を検査し、必要に応じて不足を報告する
  _extCheckBeforeIfKeyword(src, context, tagRe, allowBlankLineBeforeIf, node, needBeforeIf, fixMode);
  const needConsequentComment = _computeNeedConsequentComment(isDanglingUnderPolicy, isFull, isInnerElseIf);
  // then 側に説明コメントが必要な場合にのみ検査を実施する
  // then 側は役割説明の具体化が重要なため、必要時のみ検査を実施する
  if (needConsequentComment) _extCheckThenSide(src, context, tagRe, fixMode, node, true);
  // else-if 連鎖は再帰的にたどり、連鎖内の要件を検査する
  // 連鎖継続時はこの節での判定を打ち切り、次段の if へ処理を引き継ぐ
  if (isStructurallyDangling) {
    // 連鎖の途中では次の if へ委譲して評価する
    _extCheckIf(src, context, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode, similarityThreshold, node.alternate);
    return;
  }

  // else 側（存在時）の説明コメントの有無を検査する
  // else が存在する場合は else 側の検査を実施する
  if (isFull) _extCheckElseSide(src, context, tagRe, fixMode, node);
  // 類似度チェック（if 直前コメントが取得できた場合のみ）
  const rIf = hasBeforeIfKeywordComment(src, node, allowBlankLineBeforeIf);
  // if 直前コメントが取得できた場合にのみ then/else の類似度を評価する
  // 比較は十分な情報が取れた場合のみ実施する
  if (rIf && rIf.used && typeof rIf.used.value === 'string') {
    _extCheckIfSimilarity(src, context, node, rIf.used.value, similarityThreshold);
  }
}

/**
 * create() の本体実装（行数・複雑度削減のため外部化）
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @returns {import('eslint').Rule.RuleListener} ルールのリスナー集合（ESLint が利用する）
 */
/**
 * report を1行1回に抑制し、同一行の複数指摘には行ヒントを付与するラッパー context を生成する。
 * @param {import('eslint').Rule.RuleContext} context 既存のルールコンテキスト（差し替え対象）
 * @returns {{ ctx: import('eslint').Rule.RuleContext, reportOnce: (args: any) => void }} ラップされた context と reportOnce
 */
function _buildReportContext(context) {
  // 重複レポート抑止（同一 loc・同一 messageId は1度のみ）。同一行の複数指摘には行ヒントを追加。
  const seen = new Set();
  const lineToIds = new Map();
  const hintedLines = new Set();
  const origReport = context.report.bind(context);
  const _pickLoc = (args) => args.loc || (args.node && args.node.loc) || null;
  const _stringifyLoc = (loc) => {
    // 位置情報が無い場合はダミー座標で表現して以降の計算を安定化する
    if (!loc) return '-1:-1--1:-1';
    const s = loc.start || {};
    const e = loc.end || {};
    // 三項で未定義時の既定値を明示（座標のロバスト性を確保）
    // 未定義座標は負数で表現し、ダミー値で一意化する（直列比較の安定化）
    const sl = typeof s.line === 'number' ? s.line : -1; // 欠損時は -1 で埋めて座標の一貫性を保つ
    const sc = typeof s.column === 'number' ? s.column : -1; // 欠損列は -1 で代替
    const el = typeof e.line === 'number' ? e.line : -1; // 終了行の欠損も -1
    const ec = typeof e.column === 'number' ? e.column : -1; // 終了列の欠損も -1
    return `${sl}:${sc}-${el}:${ec}`;
  };

  const _lineKey = (loc) => {
    const s = loc && loc.start;
    return String(typeof s?.line === 'number' ? s.line : -1); // 行キーは欠損時 -1 とし、map のキーとして常に定義
  };

  const reportOnce = (args) => {
    const loc = _pickLoc(args);
    const locKey = `${args.messageId}:${_stringifyLoc(loc)}`;
    // 同一位置・同一IDの重複報告は抑止してノイズを減らす
    if (seen.has(locKey)) return;
    seen.add(locKey);
    origReport(args);
    const lineKey = _lineKey(loc);
    const set = lineToIds.get(lineKey) || new Set();
    const hadOther = set.size >= 1 && !set.has(args.messageId);
    set.add(args.messageId);
    lineToIds.set(lineKey, set);
    // 同一行に別IDが混在する場合はヒント行を1回だけ追加する
    if (hadOther && !hintedLines.has(lineKey)) {
      hintedLines.add(lineKey);
      origReport({ node: args.node, loc: loc || args.node?.loc, messageId: 'multi_issue_hint_line' });
    }
  };

  // ラッパー context（report のみ差し替え）
  const ctx = Object.create(context, { report: { value: reportOnce } });
  return { ctx, reportOnce };
}

/**
 * 検査関数を生成する（if 特化の分岐は外部関数へ委譲）。
 * @param {import('eslint').SourceCode} src ソースコードアクセス
 * @param {import('eslint').Rule.RuleContext} ctx ラップ済みコンテキスト（reportOnce 反映）
 * @param {{allowBlank:boolean, ignoreElseIf:boolean, tagRe:RegExp|null, treatHeadAsNonDangling:boolean, allowBlankLineBeforeIf:boolean, fixMode:boolean}} opts オプション辞書
 * @returns {(node:any, kw:string) => void} 検査関数
 */
function _createCheck(src, ctx, opts) {
  const { allowBlank, ignoreElseIf, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode } = opts;
  // 入口関数は分岐の振り分けに特化し、詳細は外部関数へ委譲する（複雑度は構造分割で担保）
  return (node, kw) => {
    // 制御構造の種類に応じて専用の検査へディスパッチする
    return void _dispatchCheck(src, ctx, opts, node, kw);
  };
}

/**
 * ディスパッチャ: 制御構造種別ごとの検査入口。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} ctx ラップ済みコンテキスト
 * @param {{allowBlank:boolean, ignoreElseIf:boolean, tagRe:RegExp|null, treatHeadAsNonDangling:boolean, allowBlankLineBeforeIf:boolean, fixMode:boolean, similarityThreshold:number, ignoreCatch:boolean}} opts オプション
 * @param {any} node 対象ノード
 * @param {'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'} kw 種別
 * @returns {void}
 */
function _dispatchCheck(src, ctx, opts, node, kw) {
  // ルール別の検査を一元的に振り分け、複雑度を下げるためにマップ方式を採用する
  const HANDLERS = {
    if: () => _extCheckIf(src, ctx, opts.tagRe, opts.treatHeadAsNonDangling, opts.allowBlankLineBeforeIf, opts.fixMode, opts.similarityThreshold, node),
    ternary: () => _extCheckTernary(src, ctx, opts.tagRe, node, opts.fixMode),
    switch: () => _extCheckSwitch(src, ctx, opts.tagRe, node),
    try: () => {
      // try 直前に説明が無い場合は不足を報告して検査を打ち切る
      const { ok, last } = hasRequiredPreviousComment(src, node, opts.allowBlank);
      // 直前説明が存在しない場合は不足として報告し、この分岐の検査を終了する
      if (!ok) {
        ctx.report({ node, messageId: 'missingComment', data: { kw } });
        return;
      }

      // try 直前コメントにメタ表現が無いか検査
      _extVerifyTagOrReport(src, opts.tagRe, ctx, node, last, 'try');
      _extCheckTry(src, ctx, opts.tagRe, opts.fixMode, node, opts.ignoreCatch);
      // 類似度検査は catch/finally を対象に必要時のみ実施する
      // catch/finally を評価対象とする場合のみ try 類似度を検査する
      if (!opts.ignoreCatch && last) {
        const tryText = typeof last.value === 'string' ? last.value : ''; // 文字列以外は空文字として扱い、類似度検査を安定化
        _extCheckTrySimilarity(src, ctx, node, tryText, opts.similarityThreshold);
      }
    },
    default: () => {
      // ぶら下がり連鎖の else-if を無視するポリシーなら、連鎖内は早期 return する
      if (opts.ignoreElseIf && _extIsElseIfAlternate(node)) return;
      // 直前説明が見当たらない制御構造は不足として扱う（空行不可）
      const { ok, last } = hasRequiredPreviousComment(src, node, opts.allowBlank);
      // 直前説明が存在しない場合は不足として報告し、この分岐の検査を終了する
      if (!ok) {
        ctx.report({ node, messageId: 'missingComment', data: { kw } });
        return;
      }

      // メタ表現/タグ基準の検査を共通手続きで実施
      _extVerifyTagOrReport(src, opts.tagRe, ctx, node, last, kw);
    }
  };
  const fn = (HANDLERS[kw] || HANDLERS.default);
  fn();
}

/**
 * create() の本体実装（設定解釈とリスナー構築のみ）
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @returns {import('eslint').Rule.RuleListener} ルールのリスナー集合
 */
function _createImpl(context) {
  const opt = (Array.isArray(context.options) && context.options[0]) || {};
  const targets = new Set(opt.targets || ['if', 'for', 'while', 'do', 'switch', 'try', 'ternary']);
  // requireTagPattern の有無に応じて正規表現を構築（未設定は null）
  const patternRe = (() => {
    // パターン文字列が与えられた場合のみ正規表現を生成する（未設定は null）
    const hasPattern = typeof opt.requireTagPattern === 'string' && opt.requireTagPattern.length > 0;
    // 三項で構築の有無を分岐（テキスト→正規表現／null）
    return hasPattern ? new RegExp(opt.requireTagPattern) : null;
  })();
  const opts = {
    allowBlank: Boolean(opt.allowBlankLine),
    ignoreElseIf: opt.ignoreElseIf !== false, // default true
    ignoreCatch: opt.ignoreCatch !== false, // default true
    fixMode: Boolean(opt.fixMode),
    allowBlankLineBeforeIf: false, // 仕様: if 直前の空行は不可
    // treatChainHeadAs が 'dangling' でない場合は非ぶら下がり扱い（簡潔化）
    treatHeadAsNonDangling: opt.treatChainHeadAs !== 'dangling', // 既定: 連鎖先頭は非ぶら下がり扱い
    similarityThreshold: (() => {
      // 数値入力が無い場合は既定閾値を用いて検査の一貫性を保つ
      const v = typeof opt.similarityThreshold === 'number' ? opt.similarityThreshold : 0.75; // 未設定時は既定閾値を採用
      if (Number.isNaN(v)) return 0.75;
      return Math.min(1.0, Math.max(0.6, v));
    })(),
    tagRe: patternRe
  };
  const src = context.sourceCode || context.getSourceCode();
  const { ctx } = _buildReportContext(context);
  const check = _createCheck(src, ctx, opts);
  return buildListeners(targets, opts.ignoreCatch, check);
}

/**
 * ルール実体
 * @type {import('eslint').Rule.RuleModule} ルールモジュール定義
 */
export const ruleRequireCommentsOnControlStructures = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
         'Require an intent-revealing comment immediately above control structures (if/loops/switch/try).'
    },
    schema: [
      {
        type: 'object',
        properties: {
          targets: {
            type: 'array',
            items: { enum: ['if', 'for', 'while', 'do', 'switch', 'try', 'ternary'] }
          },
          requireTagPattern: { type: 'string' },
          allowBlankLine: { type: 'boolean' },
          ignoreElseIf: { type: 'boolean' },
          ignoreCatch: { type: 'boolean' },
          fixMode: { type: 'boolean' },
          treatChainHeadAs: { enum: ['non-dangling', 'dangling'] },
          similarityThreshold: { type: 'number', minimum: 0.6, maximum: 1.0 }
          ,
          enforceMeta: { type: 'boolean' }
        },
        additionalProperties: false
      }
    ],
    messages: {
      missingComment:
        "制御構文 '{{kw}}' の直前に、なぜその分岐/ループが必要か（目的・前提・例外方針を1文で）を説明するコメントを書いてください。形式合わせではなく、後続の読者の理解を高める内容が必要です。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。",
      tagMismatch:
         "制御構文 '{{kw}}' の直前コメントは基準に一致していません: {{pat}}（ja 系では ASCII のみ不可）。記号追加ではなく、意図を短い自然文で明確に記述してください。",
      // Multi-issue hint (same line has multiple different messageIds)
      multi_issue_hint_line:
        '同一行に複数の指摘があります。異なる観点の指摘は重複させず、必要なコメントは1つに統合して記述してください。二重コメントはコメントの意図とは逆にプログラムの可読性を低めます。',
      // If-specific (presence)
      need_before_if: 'if キーワード直前行に意図説明コメントが必要です（空行は不可）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      need_then_block_head: 'then ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      need_then_trailing: 'then の単一文末尾に意図説明コメントが必要です（同行末）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      need_else_block_head: 'else ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      need_else_trailing: 'else の単一文末尾に意図説明コメントが必要です（同行末）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このif/for/while/switchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      // Try-specific (presence)
      need_catch_block_head: 'catch ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このcatchの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      need_finally_block_head: 'finally ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。構造名の繰り返しや『意図は〜』等の定型句は禁止。『このfinallyの意図は〜』のような書き出しも禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則的には1文で。',
      // If-specific (removable)
      meta_like_comment: 'メタ表現のコメントは不可です（例: "then:"/"else:"/「このifは…」/「ルールに合わせて…」）。処理の目的・理由・結果のいずれかを、日本語の自然文1文で具体的に記述してください。',
      removable_before_if: 'Redundant comment before "if" (removable by rule).',
      removable_block_head: 'Redundant comment at block head (then/else) (removable by rule).',
      removable_trailing: 'Redundant trailing comment after statement (removable by rule).',
      // Try similarity
      similar_try_catch:
        'try/catch のコメントが類似し過ぎています (距離/長さ={{ratio}} ≤ {{threshold}})。役割が重複しています。try は「目的」、catch は「例外時のハンドリング方針」を具体化してください。 詳細: distance={{distance}}, maxLen={{maxLen}} / 該当: try="{{tryComment}}", catch="{{catchComment}}"',
      similar_try_finally:
        'try/finally のコメントが類似し過ぎています (距離/長さ={{ratio}} ≤ {{threshold}})。役割が重複しています。try は「目的」、finally は「必ず実行される後処理/クリーンアップ」を具体化してください。 詳細: distance={{distance}}, maxLen={{maxLen}} / 該当: try="{{tryComment}}", finally="{{finallyComment}}"',
      // If similarity
      similar_if_then:
        'if/then のコメントが類似し過ぎています (距離/長さ={{ratio}} ≤ {{threshold}})。役割が重複しています。if 直前は「判断軸/前提」、then は「成立時に採る行動」を具体化してください。 ただし「判断軸」「処置」といったメタな文言はコメント自体には利用しないこと。 詳細: distance={{distance}}, maxLen={{maxLen}} / 該当: if="{{ifComment}}", then="{{thenComment}}"',
      similar_if_else:
        'if/else のコメントが類似し過ぎています (距離/長さ={{ratio}} ≤ {{threshold}})。役割が重複しています。if 直前は「判断軸/前提」、else は「不成立時の方針/フォールバック」を具体化してください。 ただし「判断軸」「処置」といったメタな文言はコメント自体には利用しないこと。 詳細: distance={{distance}}, maxLen={{maxLen}} / 該当: if="{{ifComment}}", else="{{elseComment}}"'
      ,
      // Switch-specific (presence)
      need_before_switch:
        'switch 文の直前に、この分岐の目的を説明するコメントを書いてください。構造名の繰り返しや「意図は〜」等の定型句は禁止。処理の具体的目的・前提・例外・読者が見落としやすいポイントを原則1文で。',
      need_case_head:
        'case/default の直前に、この分岐条件の意味がわかるコメントを書いてください。定型句は禁止。条件の出典や境界条件を簡潔に示してください。',
      // Ternary-specific
      need_ternary_comment:
        '三項演算子の直前行または同行末に、式の意図を説明するコメントが必要です。構造名の繰り返しや「意図は〜」等の定型句は禁止。成立/不成立それぞれの意味が読み取れるように記述してください。'
    }
  },
  create: (context) => _createImpl(context)
};
 
/**
 * プラグインエクスポート（rules マップ）
 */
export const controlStructuresPlugin = {
  rules: {
    'require-comments-on-control-structures': ruleRequireCommentsOnControlStructures
  }
};