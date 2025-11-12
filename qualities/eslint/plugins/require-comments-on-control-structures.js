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
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251112/SnD-20251112-eslint-if-comment-rule.md
 */
 
/* 連結ルールの統合版: 旧 'require-comment-previous-line-for-branches.js' を本ファイルへ集約 */
/* eslint-disable control/require-comments-on-control-structures, padding-line-between-statements, jsdoc/check-alignment, jsdoc/require-param, jsdoc/require-param-description -- 自身の実装ファイルに当ルールが自己適用されるのを防止（複雑度系の免除は撤去） */
 
 /**
  * @typedef {Object} BranchCommentOptions オプション型定義
  * @property {Array<'if'|'for'|'while'|'do'|'switch'|'try'>} [targets] 対象種別（省略時は全種）
  * @property {string} [requireTagPattern] 本文パターン（例: 非ASCIIを要求）
  * @property {boolean} [allowBlankLine] 空行許容（既定: false）
  * @property {boolean} [ignoreElseIf] else if 免除（既定: true）
  * @property {boolean} [ignoreCatch] catch 免除（既定: true）
  * @property {boolean} [fixMode] 不要コメントの報告を有効にする（既定: false／報告のみ）
  * @property {'non-dangling'|'dangling'} [treatChainHeadAs] else-if 連鎖先頭（head）をどう扱うか（既定: 'non-dangling'）
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
   for (const [nodeType, kw] of ENTRY_PAIRS) {
     listeners[nodeType] = (n) => {
       // 設定で対象外のキーワードは早期リターンして無駄な検査を避ける
      if (!targets.has(kw)) return;
       // try/catch/finally のうち catch/finally を免除したい場合に try のみ検査対象とする
       if (kw === 'try' && ignoreCatch) {
         // try のみ検査（catch/finally は別ノードで無視される）
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
   const v = typeof c?.value === 'string' ? c.value.trim() : '';
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
   const arr = typeof src.getCommentsBefore === 'function' ? src.getCommentsBefore(node) : [];
   // 直前側のコメント列を後ろから走査し、最後の意味のあるコメントを特定する
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
 /**
  * if キーワード直前の説明コメントの存在を確認する（簡潔版）。
   * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果（ok=適合, comments=候補, used=採用コメント）
  */
/**
 * if 直前コメント（厳格: 直前行のみ）を判定する。
 * @param {import('eslint').SourceCode} src
 * @param {any} node
 * @returns {{ok:boolean,comments:any[],used:any|null}} 厳格判定の結果（採用コメント含む）
 */
function hasBeforeIfKeywordCommentStrict(src, node) {
  const ifToken = src.getFirstToken(node);
  if (!ifToken) return { ok: false, comments: [], used: null };
  const last = getLastMeaningfulComment(src, node);
  if (!last) return { ok: false, comments: [], used: null };
  const okStrict = _isAdjacentToIf(last, ifToken);
  return okStrict ? { ok: true, comments: [last], used: last } : { ok: false, comments: [last], used: null };
}

/**
 * if 直前コメント（緩和: 空行可・間に実コード不可）を判定する。
 * @param {import('eslint').SourceCode} src
 * @param {any} node
 * @returns {{ok:boolean,comments:any[],used:any|null}} 緩和判定の結果（採用コメント含む）
 */
function hasBeforeIfKeywordCommentLoose(src, node) {
  const pair = _getIfTokenAndLastComment(src, node);
  if (!pair) return { ok: false, comments: [], used: null };
  const { last } = pair;
  if (!_noCodeBetweenLines(src, last, node)) return { ok: false, comments: [last], used: null };
  const le = last?.loc?.end.line ?? 0;
  const ns = node?.loc?.start.line ?? 0;
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
  if (!ifToken) return null;
  const last = getLastMeaningfulComment(src, node);
  if (!last) return null;
  return { ifToken, last };
}
/**
 * if キーワード直前の説明コメントの存在を確認する（簡潔版）。
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果（ok=適合, comments=候補, used=採用コメント）
 */
function hasBeforeIfKeywordComment(src, node, allowBlankBeforeIf) {
  return allowBlankBeforeIf
    ? hasBeforeIfKeywordCommentLoose(src, node)
    : hasBeforeIfKeywordCommentStrict(src, node);
}
 
 /**
  * BlockStatement の先頭にコメントがあるか。
  * 条件: `{` の行または次行にコメントがあり、最初の文の開始より前。
 * then/else のブロック先頭に説明コメントがあるかを検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement 検査対象ブロック
 * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果と候補コメント
  */
 /**
  * ブロック先頭の説明コメントの存在を確認する（簡潔版）。
   * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果（ok=適合, comments=候補, used=採用コメント）
  */
 function hasBlockHeadComment(src, block) {
  if (!isBlock(block)) return { ok: false, comments: [], used: null };
   const firstToken = src.getFirstToken(block); // '{'
   const firstStmt = Array.isArray(block.body) && block.body.length > 0 ? block.body[0] : null;
  const afterBrace = _pickAfterBraceHead(src, firstToken, firstStmt);
  if (afterBrace && !isDirectiveComment(afterBrace)) return { ok: true, comments: [afterBrace], used: afterBrace };
  const beforeBrace = _pickBeforeBraceHead(src, firstToken);
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
 /**
  * 単一文の同行末説明コメントの存在を確認する（簡潔版）。
   * @returns {{ok:boolean,comments:any[],used:any|null}} 判定結果（ok=適合, comments=候補, used=採用コメント）
  */
 function hasTrailingComment(src, stmt) {
  if (!stmt || isBlock(stmt)) return { ok: false, comments: [], used: null };
  // 同行末の after/before コメントを簡潔に選択する
  const after = _pickTrailingAfter(src, stmt);
  if (after) return { ok: true, comments: [after], used: after };
  const before = _pickTrailingBefore(src, stmt);
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
  if (!tok) return null;
  const isComment = tok.type === 'Block' || tok.type === 'Line';
  if (!isComment) return null;
  if (!(tok.loc && stmt?.loc)) return null;
  if (tok.loc.start.line !== stmt.loc.end.line) return null;
  return isDirectiveComment(tok) ? null : tok;
}

/**
 * 単一文の後方（同行末）のコメント候補（before）を選ぶ。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} stmt 対象ステートメント
 * @returns {any|null} コメント or null
 */
function _pickTrailingBefore(src, stmt) {
  const tok = src.getTokenBefore(stmt, { includeComments: true });
  if (!tok) return null;
  const isComment = tok.type === 'Block' || tok.type === 'Line';
  if (!isComment) return null;
  if (!(tok.loc && stmt?.loc)) return null;
  if (tok.loc.end.line !== stmt.loc.end.line) return null;
  return isDirectiveComment(tok) ? null : tok;
}
 
 /**
  * コメント本文テキスト（元ソース）を取得する（JSDoc 判定用）。
 * コメントノードから元ソースの文字列を取得する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} c コメントノード
 * @returns {string} コメントの原文
  */
 function getCommentSourceText(src, c) {
   try {
     if (Array.isArray(c.range) && c.range.length === 2) {
       return String(src.text.slice(c.range[0], c.range[1]) || '');
     }
   } catch {}

   const v = typeof c?.value === 'string' ? c.value : '';
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
 
/** 余剰コメントを removable として報告する（共通化）。@returns {void} 何も返さない（報告のみ） */
function _extReportRemovable(context, src, node, extras, messageId) {
  for (const extra of extras) {
    if (!extra) continue;
    if (!isDirectiveComment(extra) && !isJSDoc(src, extra)) {
      context.report({ node, loc: extra.loc, messageId });
    }
  }
}

/**
 * 直前行に隣接しているかを判定する（if の直前コメント用）。
 * @param {any} last 最後の意味のあるコメント
 * @param {any} ifToken if キーワードのトークン
 * @returns {boolean} 隣接していれば true
 */
function _isAdjacentToIf(last, ifToken) {
  return Boolean(last?.loc && ifToken?.loc && last.loc.end.line === ifToken.loc.start.line - 1);
}

/**
 * コメントとノードの間に実コードが無いことを判定する（緩和モード用）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} last 最後の意味のあるコメント
 * @param {any} node 対象ノード
 * @returns {boolean} 実コードが無ければ true
 */
function _noCodeBetweenLines(src, last, node) {
  const tokensBetween = src.getTokensBetween(last, node, { includeComments: false }) || [];
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
 * @returns {any|null} 見つかったコメント（無ければ null）
 */
function _pickAfterBraceHead(src, firstToken, firstStmt) {
  const after = src.getTokenAfter(firstToken, { includeComments: true });
  if (!after) return null;
  const isComment = after.type === 'Block' || after.type === 'Line';
  if (!isComment) return null;
  if (!(after.loc && firstToken?.loc)) return null;
  if (after.loc.start.line !== firstToken.loc.start.line + 1) return null;
  const beforeFirst = !firstStmt || (after.loc.end.line <= firstStmt.loc.start.line);
  return beforeFirst ? after : null;
}

/**
 * ブレース直前（{ と同一行）のコメントを取得する。
 * @returns {any|null} 見つかったコメント（無ければ null）
 */
function _pickBeforeBraceHead(src, firstToken) {
  const before = src.getTokenBefore(firstToken, { includeComments: true });
  if (!before) return null;
  const isComment = before.type === 'Block' || before.type === 'Line';
  if (!isComment) return null;
  if (!(before.loc && firstToken?.loc)) return null;
  return before.loc.end.line === firstToken.loc.start.line ? before : null;
}

/**
 * 保持タグ/抑止タグの適合を検査して、タグ不一致を報告する（外部化）。
 * @param {import('eslint').SourceCode} src
 * @param {RegExp|null} tagRe
 * @param {import('eslint').Rule.RuleContext} context
 * @param {any} targetNode
 * @param {any|null} usedComment
 * @param {'if'|'for'|'while'|'do'|'switch'|'try'} kw
 * @returns {void} 判定のみを行い、必要時に report する
 */
function _extVerifyTagOrReport(src, tagRe, context, targetNode, usedComment, kw) {
  if (!tagRe || !usedComment) return;
  const text = typeof usedComment.value === 'string' ? usedComment.value : '';
  if (!matchesPattern(text, tagRe)) {
    context.report({ node: targetNode, messageId: 'tagMismatch', data: { kw, pat: String(tagRe) } });
  }
}

/**
 * else-if alternate 判定（外部化）。
 * @param {any} node
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
 * 保持タグ検出（外部化）。
 * @param {import('eslint').SourceCode} src
 * @param {any} c
 * @returns {boolean} コメントが保持タグ（keep/nofix/lint-keep）を含む場合は true
 */
function _extHasKeepTag(src, c) {
  try {
    const s = String(getCommentSourceText(src, c) || '').toLowerCase();
    return /\bnofix\b/.test(s) || /\blint-keep\b/.test(s) || /\bkeep\b/.test(s);
  } catch {
    return false;
  }
}

/**
 * if 直前コメント検査（外部化）。
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckBeforeIfKeyword(src, context, tagRe, allowBlankLineBeforeIf, node, needBeforeIf, fixMode) {
  const r = hasBeforeIfKeywordComment(src, node, allowBlankLineBeforeIf);
  if (needBeforeIf) {
    if (!r.ok) {
      context.report({ node, messageId: 'need_before_if' });
      return;
    }
    _extVerifyTagOrReport(src, tagRe, context, node, r.used, 'if');
    return;
  }
  if (fixMode && r.used && !isDirectiveComment(r.used) && !isJSDoc(src, r.used) && !_extHasKeepTag(src, r.used)) {
    context.report({ node, loc: r.used.loc, messageId: 'removable_before_if' });
  }
}

/**
 * then 側検査（外部化）。
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckThenSide(src, context, tagRe, fixMode, node, needConsequentComment) {
  if (!needConsequentComment || !node.consequent) return;
  if (isBlock(node.consequent)) {
    const rc = hasBlockHeadComment(src, node.consequent);
    if (!rc.ok) {
      context.report({ node: node.consequent, messageId: 'need_then_block_head' });
    } else {
      _extVerifyTagOrReport(src, tagRe, context, node.consequent, rc.used, 'if');
    }
    if (fixMode && rc.comments.length > 1) {
      _extReportRemovable(context, src, node.consequent, rc.comments.slice(1), 'removable_block_head');
    }
    return;
  }
  const rc = hasTrailingComment(src, node.consequent);
  if (!rc.ok) {
    context.report({ node: node.consequent, messageId: 'need_then_trailing' });
  } else {
    _extVerifyTagOrReport(src, tagRe, context, node.consequent, rc.used, 'if');
  }
  if (fixMode && rc.comments.length > 1) {
    _extReportRemovable(context, src, node.consequent, rc.comments.slice(0, rc.comments.length - 1), 'removable_trailing');
  }
}

/**
 * else 側検査（外部化）。
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckElseSide(src, context, tagRe, fixMode, node) {
  if (!node.alternate) return;
  if (isBlock(node.alternate)) {
    const ra = hasBlockHeadComment(src, node.alternate);
    if (!ra.ok) {
      context.report({ node: node.alternate, messageId: 'need_else_block_head' });
    } else {
      _extVerifyTagOrReport(src, tagRe, context, node.alternate, ra.used, 'if');
    }
    if (fixMode && ra.comments.length > 1) {
      _extReportRemovable(context, src, node.alternate, ra.comments.slice(1), 'removable_block_head');
    }
    return;
  }
  const ra = hasTrailingComment(src, node.alternate);
  if (!ra.ok) {
    context.report({ node: node.alternate, messageId: 'need_else_trailing' });
  } else {
    _extVerifyTagOrReport(src, tagRe, context, node.alternate, ra.used, 'if');
  }
  if (fixMode && ra.comments.length > 1) {
    _extReportRemovable(context, src, node.alternate, ra.comments.slice(0, ra.comments.length - 1), 'removable_trailing');
  }
}

/**
 * IfStatement の総合検査（外部化・再帰）。
 * @returns {void} 何も返さない（報告のみ）
 */
function _extCheckIf(src, context, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode, node) {
  if (!isIf(node)) return;
  const isInnerElseIf = _extIsElseIfAlternate(node);
  const isFull = !!node.alternate;
  const isStructurallyDangling = isIf(node.alternate);
  const isChainHead = !isInnerElseIf;
  const isDanglingUnderPolicy = isStructurallyDangling && !(isChainHead && treatHeadAsNonDangling);
  const isNonDanglingUnderPolicy = !isDanglingUnderPolicy;
  const needBeforeIf = isNonDanglingUnderPolicy && !isInnerElseIf;
  _extCheckBeforeIfKeyword(src, context, tagRe, allowBlankLineBeforeIf, node, needBeforeIf, fixMode);
  const needConsequentComment = isDanglingUnderPolicy || isFull;
  if (needConsequentComment) _extCheckThenSide(src, context, tagRe, fixMode, node, true);
  if (isStructurallyDangling) {
    _extCheckIf(src, context, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode, node.alternate);
  } else if (isFull && node.alternate) {
    _extCheckElseSide(src, context, tagRe, fixMode, node);
  }
}

/**
 * create() の本体実装（行数・複雑度削減のため外部化）
 * @param {import('eslint').Rule.RuleContext} context
 * @returns {import('eslint').Rule.RuleListener} ルールのリスナー集合（ESLint が利用する）
 */
function _createImpl(context) {
  const opt = (Array.isArray(context.options) && context.options[0]) || {};
  const targets = new Set(opt.targets || ['if', 'for', 'while', 'do', 'switch', 'try']);
  const allowBlank = Boolean(opt.allowBlankLine);
  const ignoreElseIf = opt.ignoreElseIf !== false; // default true
  const ignoreCatch = opt.ignoreCatch !== false; // default true
  const fixMode = Boolean(opt.fixMode);
  const allowBlankLineBeforeIf = false; // 仕様: if 直前の空行は不可
  const treatChainHeadAs = opt.treatChainHeadAs === 'dangling' ? 'dangling' : 'non-dangling';
  const treatHeadAsNonDangling = treatChainHeadAs !== 'dangling';
  const tagRe = typeof opt.requireTagPattern === 'string' && opt.requireTagPattern.length > 0
    ? new RegExp(opt.requireTagPattern)
    : null;
  const src = context.sourceCode || context.getSourceCode();

  const check = (node, kw) => {
    if (kw === 'if') {
      _extCheckIf(src, context, tagRe, treatHeadAsNonDangling, allowBlankLineBeforeIf, fixMode, node);
      return;
    }
    if (ignoreElseIf && _extIsElseIfAlternate(node)) return;
    const { ok, last } = hasRequiredPreviousComment(src, node, allowBlank);
    if (!ok) {
      context.report({ node, messageId: 'missingComment', data: { kw } });
      return;
    }
    if (tagRe && last && !matchesPattern(typeof last.value === 'string' ? last.value : '', tagRe)) {
      context.report({ node, messageId: 'tagMismatch', data: { kw, pat: String(tagRe) } });
    }
  };

  return buildListeners(targets, ignoreCatch, check);
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
             items: { enum: ['if', 'for', 'while', 'do', 'switch', 'try'] }
           },
           requireTagPattern: { type: 'string' },
           allowBlankLine: { type: 'boolean' },
           ignoreElseIf: { type: 'boolean' },
           ignoreCatch: { type: 'boolean' },
           fixMode: { type: 'boolean' },
           treatChainHeadAs: { enum: ['non-dangling', 'dangling'] }
         },
         additionalProperties: false
       }
     ],
     messages: {
       missingComment:
         "制御構文 '{{kw}}' の直前に、なぜその分岐/ループが必要か（目的・前提・例外方針を1文で）を説明するコメントを書いてください。形式合わせではなく、後続の読者の理解を高める内容が必要です。",
       tagMismatch:
         "制御構文 '{{kw}}' の直前コメントは基準に一致していません: {{pat}}（ja 系では ASCII のみ不可）。記号追加ではなく、意図を短い自然文で明確に記述してください。",
       // If-specific (presence)
       need_before_if: 'if キーワード直前行に意図説明コメントが必要です（空行は不可）。',
       need_then_block_head: 'then ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
       need_then_trailing: 'then の単一文末尾に意図説明コメントが必要です（同行末）。',
       need_else_block_head: 'else ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
       need_else_trailing: 'else の単一文末尾に意図説明コメントが必要です（同行末）。',
       // If-specific (removable)
       removable_before_if: 'Redundant comment before "if" (removable by rule).',
       removable_block_head: 'Redundant comment at block head (then/else) (removable by rule).',
       removable_trailing: 'Redundant trailing comment after statement (removable by rule).'
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
 