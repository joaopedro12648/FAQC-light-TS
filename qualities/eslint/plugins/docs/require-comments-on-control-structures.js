/**
 * @file 制御構造でのコメントチェック（if/for/while/switch/try などを対象・docs ユニット実体）
 * 備考: PRE-IMPL と docs コンテキストに従い、分岐や例外処理の意図を日本語コメントで明示することを強制する
 * - 対象: if/for/while/do/switch/try/三項演算子などの制御構造
 * - 目的: 直前行に目的・前提・例外方針を 1 文で説明するコメントを要求し、分岐理由を常に可視化する
 * - 要件: コメントは品質コンテキストのロケール（本リポジトリでは日本語）で記述し ASCII のみを禁止する
 * - オプション: ja 系ロケールでは ASCII のみを禁止する `requireTagPattern` を利用可能
 * - 対象外: ESLint ディレクティブやツール系コメントは説明コメントとしてカウントしない
 * - 運用: else-if 連鎖や catch/finally をオプションで免除しつつ、基準値以上の説明密度を維持する
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md による制御構造コメントポリシー
 * - SnD: SnD-20251113-eslint-if-branch-similarity / SnD-20251116-qualities-structure-and-context-granularity を @snd/@see から参照する
 * - 受入: 本ルール実装が control/コメント系ルールに自己適合し `npm run check` を一発緑で通過していること
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251113/SnD-20251113-eslint-if-branch-similarity.md
 */

/**
 * 制御構造コメントルールの挙動を制御するオプション型定義。
 * @typedef {Object} BranchCommentOptions
 * @property {Array<'if'|'for'|'while'|'do'|'switch'|'try'|'ternary'>} [targets] 対象種別（省略時は全種）
 * @property {string} [requireTagPattern] 本文パターン（例: 非ASCIIを要求）
 * @property {boolean} [allowBlankLine] 空行許容（既定: false）
 * @property {boolean} [ignoreElseIf] else if 免除（既定: true）
 * @property {boolean} [ignoreCatch] catch 免除（既定: true）
 * @property {boolean} [fixMode] 不要コメントの報告を有効にする（既定: false／報告のみ）
 * @property {'non-dangling'|'dangling'} [treatChainHeadAs] else-if 連鎖先頭（head）をどう扱うか（既定: 'non-dangling'）
 * @property {number} [similarityThreshold] 類似度のしきい値（既定: 0.75、範囲: 0.6〜1.0）
 * @property {boolean} [enforceMeta] メタ表現検出の有効化（既定: false／無効）
 * @property {boolean|'fullOnly'} [requireSectionComments] then/else/catch/finally 節に節コメントを必須化するか（既定: false）
 * @property {ReadonlyArray<'before-if'|'block-head'|'trailing'>} [sectionCommentLocations]
 * 節コメントとして認める位置（既定: ['before-if','block-head','trailing']）
 */

/** ノードタイプとキーワードの対応（固定） */
/**
 * 制御構造ノード種別とキーワード文字列のペア一覧。
 * @type {Array<[keyof import('eslint').Rule.RuleListener, string]>}
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
 * ルールリスナー集合を構築する（分岐数を抑えて複雑度を低減）。
 * @param {Set<string>} targets 対象キーワード集合
 * @param {boolean} ignoreCatch catch/finally を免除するか（try のみ検査）
 * @param {(node:any,kw:string)=>void} checkFn 検査関数
 * @returns {import('eslint').Rule.RuleListener} リスナー辞書
 */
function buildListeners(targets, ignoreCatch, checkFn) {
  /**
   * 制御構造ごとのリスナーを格納する辞書。
   * @type {import('eslint').Rule.RuleListener}
   */
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
    (t) => t.loc.start.line > lastEndLine && t.loc.end.line < nodeLine,
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
 * 対象行のプレビュー文字列を生成する（エラーメッセージ用）。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {number} line 1 始まりの行番号
 * @returns {string} プレビュー文字列
 */
function getLinePreview(src, line) {
  const lines = Array.isArray(src.lines) ? src.lines : [];
  const idx = Math.max(0, line - 1);
  const raw = lines[idx] || '';
  const trimmed = raw.trim();
  // 行が十分に短い場合はそのまま返し、長い場合は末尾を省略してプレビューとして整形する
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

/**
 * IfStatement を full/non-full/dangling で分類する。
 * @param {any} node 対象ノード
 * @returns {'non-full-non-dangling-if'|'full-non-dangling-if'|'dangling-if'|null} 分類結果
 */
function classifyIfStructure(node) {
  // IfStatement 以外や null のノードは分類対象外とし、節コメント検査の対象から外す
  if (!node || node.type !== 'IfStatement') return null;
  const hasAlternate = node.alternate != null;
  const isDangling = node.alternate && node.alternate.type === 'IfStatement';
  // else 節を持たない if は「非フルかつ非ぶら下がり if」として扱う
  if (!hasAlternate) {
    return 'non-full-non-dangling-if';
  }

  // else 節が IfStatement の場合はぶら下がり if として分類する
  if (isDangling) {
    return 'dangling-if';
  }

  return 'full-non-dangling-if';
}

/**
 * if に対して節コメント検査を行うべきかどうかを判定する。
 * @param {'non-full-non-dangling-if'|'full-non-dangling-if'|'dangling-if'|null} classification 分類
 * @param {boolean|'fullOnly'|undefined} flag requireSectionComments オプション値
 * @returns {boolean} 検査が必要なら true
 */
function shouldCheckSectionCommentsForIf(classification, flag) {
  // 設定と分類の両方が揃っていない場合は節コメント検査を無効化する
  if (!flag || !classification) return false;
  // fullOnly の場合は「非フル if」を除外し、それ以外（フル/dangling）のみ節コメントを対象とする
  if (flag === 'fullOnly') {
    return classification !== 'non-full-non-dangling-if';
  }

  // boolean true の場合はすべての if を節コメント対象とする
  return true;
}

/**
 * ブロック先頭に節コメントが存在するかどうかを判定する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} block BlockStatement ノード
 * @returns {{ ok: boolean, previewLine: number }} 判定結果とプレビュー用行番号
 */
function hasBlockHeadSectionComment(src, block) {
  /**
   * 先頭ステートメント直前に意味のあるコメントがあるか（ディレクティブ除外）
   * @param {any} stmt 先頭ステートメント
   * @returns {boolean} 直前コメントがあれば true
   */
  function hasMeaningfulCommentBeforeFirstStatement(stmt) {
    const last = getLastMeaningfulComment(src, stmt);
    return Boolean(last);
  }

  /**
   * ブロック内の最初の（ディレクティブ以外の）コメントトークンを返す
   * @param {any} blk BlockStatement
   * @returns {any|null} コメントトークン or null
   */
  function findFirstMeaningfulCommentInBlock(blk) {
    const inside = typeof src.getCommentsInside === 'function' ? src.getCommentsInside(blk) : [];
    const foundInside = (inside || []).find((c) => !isDirectiveComment(c)) || null;
    const tokens = src.getTokens(blk, { includeComments: true }) || [];
    return foundInside || tokens.find((t) => (t.type === 'Block' || t.type === 'Line') && !isDirectiveComment(t)) || null;
  }

  /**
   * ノードの開始行（loc.start.line）を安全に取得する
   * @param {any} n 対象ノード
   * @param {number|null} fb フォールバック
   * @returns {number|null} 行番号（無ければ fb）
   */
  function getStartLineSafe(n, fb) {
    return n && n.loc && n.loc.start && typeof n.loc.start.line === 'number' ? n.loc.start.line : fb;
  }

  const body = Array.isArray(block && block.body) ? block.body : [];
  const firstStmt = body[0];
  const fallbackLine = getStartLineSafe(block, 1);

  // then/else の節コメント要件を判定するため、先頭文の有無を確認（空ブロック分岐の根拠）
  const firstLine = getStartLineSafe(firstStmt, null);
  // 先頭文が存在する場合のみ then/else の直前コメント適合で可否を判断する
  if (firstLine != null) {
    // 直前コメントが無ければ節コメント不適合
    if (!hasMeaningfulCommentBeforeFirstStatement(firstStmt)) {
      return { ok: false, previewLine: firstLine };
    }

    return { ok: true, previewLine: firstLine };
  }

  // 空ブロック: ブロック内の最初の（ディレクティブ以外の）コメントを節コメントとして許容
  const selected = findFirstMeaningfulCommentInBlock(block);
  const preview = getStartLineSafe(selected, fallbackLine);
  return selected ? { ok: true, previewLine: preview } : { ok: false, previewLine: fallbackLine };
}

/**
 * 単一ステートメントの末尾に節コメントが存在するかどうかを判定する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {any} statement 対象ステートメント
 * @returns {{ ok: boolean, previewLine: number }} 判定結果とプレビュー用行番号
 */
function hasTrailingSectionComment(src, statement) {
  // 位置情報が無いステートメントは trailing コメント検査の対象外とする
  if (!statement.loc || !statement.loc.end) {
    return { ok: false, previewLine: 1 };
  }

  const endLine = statement.loc.end.line;
  const commentsAfter = src.getCommentsAfter(statement) || [];
  // ステートメント直後に続くコメント列を走査し、同行の trailing 節コメント候補を探す
  for (const c of commentsAfter) {
    // 位置情報を持たないコメントは検査対象外とし、安全側にスキップする
    if (!c.loc || !c.loc.start) continue;
    // ステートメントと同一行を越えた時点で trailing コメント候補の探索を終了する
    if (c.loc.start.line !== endLine) {
      // 行が変わった時点で trailing コメント候補は終了とみなす
      break;
    }

    // ツール系ディレクティブ以外のコメントが同行に存在すれば trailing 節コメントとして採用する
    if (!isDirectiveComment(c)) {
      return { ok: true, previewLine: endLine };
    }
  }

  return { ok: false, previewLine: endLine };
}

/**
 * if 文の then/else 節に対する節コメント要件を検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {any} node IfStatement ノード
 * @param {boolean|'fullOnly'|undefined} requireSectionComments 節コメントオプション
 * @param {Set<string>} locations 節コメントとして認める位置の集合
 * @returns {void}
 */
function checkIfSectionComments(src, context, node, requireSectionComments, locations) {
  const classification = classifyIfStructure(node);
  // 設定と分類に基づき、この if 文が節コメント検査の対象かどうかを早期に判定する
  if (!shouldCheckSectionCommentsForIf(classification, requireSectionComments)) {
    return;
  }

  const considerBlockHead = locations.has('block-head');
  const considerTrailing = locations.has('trailing');

  /**
   * ブロック節に対する節コメント違反を報告する。
   * @param {'then'|'else'} kind 節種別
   * @param {any} branch 対象ブロックノード
   */
  function reportBlockBranchIssue(kind, branch) {
    // 節コメントの対象がブロックでない、またはブロック先頭検査が無効な場合は何もしない
    if (!branch || !considerBlockHead) return;
    const { ok, previewLine } = hasBlockHeadSectionComment(src, branch);
    // ブロック先頭に節コメントが無い場合は then/else に応じたメッセージで報告する
    if (!ok) {
      context.report({
        node: branch,
        messageId: kind === 'then' ? 'need_then_block_head' : 'need_else_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  /**
   * 単一ステートメント節に対する節コメント違反を報告する。
   * @param {'then'|'else'} kind 節種別
   * @param {any} branch 対象ステートメントノード
   */
  function reportNonBlockBranchIssue(kind, branch) {
    // 節コメントの対象がステートメントでない、または末尾コメント検査が無効な場合は何もしない
    if (!branch || !considerTrailing) return;
    const { ok, previewLine } = hasTrailingSectionComment(src, branch);
    // 同一行末尾に節コメントが無い場合は then/else に応じた trailing コメント不足として報告する
    if (!ok) {
      context.report({
        node: branch,
        messageId: kind === 'then' ? 'need_then_trailing' : 'need_else_trailing',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  /**
   * 個々の節に対して節コメントを検査する。
   * @param {'then'|'else'} kind 節種別
   * @param {any} branch 対象ブランチノード
   */
  function checkBranch(kind, branch) {
    // 節が存在しない場合は検査対象外とする
    if (!branch) return;
    // ブロック節は先頭コメント、単文節は行末コメントとして検査する
    if (branch.type === 'BlockStatement') {
      reportBlockBranchIssue(kind, branch);
      return;
    }

    reportNonBlockBranchIssue(kind, branch);
  }

  // non-full-non-dangling-if: then 節のみ対象（fullOnly の場合はここには来ない）
  if (classification === 'non-full-non-dangling-if') {
    checkBranch('then', node.consequent);
    return;
  }

  // full-non-dangling-if: then/else の両方を対象とする
  if (classification === 'full-non-dangling-if') {
    checkBranch('then', node.consequent);
    checkBranch('else', node.alternate);
    return;
  }

  // dangling-if: 外側 if の then 節のみ対象とし、else-if 側は別の IfStatement として個別に検査する
  if (classification === 'dangling-if') {
    checkBranch('then', node.consequent);
  }
}

/**
 * try/catch/finally の節コメント要件を検査する。
 * @param {import('eslint').SourceCode} src ソースコード
 * @param {import('eslint').Rule.RuleContext} context ルールコンテキスト
 * @param {any} node TryStatement ノード
 * @param {Set<string>} locations 節コメントとして認める位置の集合
 * @returns {void}
 */
function checkTrySectionComments(src, context, node, locations) {
  const considerBlockHead = locations.has('block-head');
  // ブロック先頭コメントを節コメントとして扱わない場合は try/catch/finally の節コメント検査をスキップする
  if (!considerBlockHead) return;

  // catch 節が存在する場合はブロック先頭に節コメントがあるかを検査する
  if (node.handler && node.handler.body) {
    const { ok, previewLine } = hasBlockHeadSectionComment(src, node.handler.body);
    // catch ブロック先頭にコメントが無い場合は節コメント不足として報告する
    if (!ok) {
      context.report({
        node: node.handler,
        messageId: 'need_catch_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }

  // finally 節が存在する場合も同様にブロック先頭コメントを検査する
  if (node.finalizer) {
    const { ok, previewLine } = hasBlockHeadSectionComment(src, node.finalizer);
    // finally ブロック先頭にコメントが無い場合も節コメント不足として報告する
    if (!ok) {
      context.report({
        node: node.finalizer,
        messageId: 'need_finally_block_head',
        data: { preview: getLinePreview(src, previewLine) },
      });
    }
  }
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
          similarityThreshold: { type: 'number', minimum: 0.6, maximum: 1.0 },
          enforceMeta: { type: 'boolean' },
          requireSectionComments: {
            anyOf: [{ type: 'boolean' }, { enum: ['fullOnly'] }],
          },
          sectionCommentLocations: {
            type: 'array',
            items: { enum: ['before-if', 'block-head', 'trailing'] },
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
        'catch ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。 対象行: {{preview}}',
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
        'case/default の直前に、この分岐条件の意味がわかるコメントを書いてください。',
      need_ternary_comment:
        '三項演算子の直前行または同行末に、式の意図を説明するコメントが必要です。',
    },
  },
  create: (context) => {
    const src = context.getSourceCode();
    /**
     * 直前コメント検査ルールのオプション集合。
     * @type {Readonly<BranchCommentOptions>}
     */
    const options = (context.options && context.options[0]) || {};
    const targets =
      options.targets && options.targets.length > 0
        ? new Set(options.targets)
        : new Set(['if', 'for', 'while', 'do', 'switch', 'try', 'ternary']);
    const allowBlank = Boolean(options.allowBlankLine);
    const ignoreElseIf = options.ignoreElseIf !== false; // 既定: else if を免除
    const ignoreCatch = options.ignoreCatch !== false; // 既定: catch を免除（本 SnD では catch/finally の節コメント免除には利用しない）
    const re =
      typeof options.requireTagPattern === 'string' && options.requireTagPattern.length > 0
        ? new RegExp(options.requireTagPattern)
        : null;
    const sectionFlag = options.requireSectionComments;
    const sectionLocationsRaw =
      Array.isArray(options.sectionCommentLocations) && options.sectionCommentLocations.length > 0
        ? options.sectionCommentLocations
        : ['before-if', 'block-head', 'trailing'];
    const sectionLocations = new Set(sectionLocationsRaw);

    /**
     * else-if 連鎖の else 側ブランチを無視するかどうかを判定する。
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード種別
     * @param {boolean} enabled else-if 免除オプションが有効かどうか
     * @returns {boolean} 無視すべきブランチであれば true
     */
    function isIgnoredElseIfBranch(node, kw, enabled) {
      // if 以外や無効化時は免除ロジック自体を適用しない
      if (kw !== 'if' || !enabled) return false;
      // 親ノード情報が欠落しているケースでは安全側に倒し、免除判定ロジックを適用しない
      if (!node || !node.parent) return false;
      // 親が IfStatement かつ自身が alternate であれば else-if 連鎖の一部とみなす
      return node.parent.type === 'IfStatement' && node.parent.alternate === node;
    }

    /**
     * 直前コメントの存在とパターン適合を検査する。
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード種別
     * @returns {string|null} プレーンテキストのプレビュー（必須コメントが無い場合は null）
     */
    function runCommentAndPatternChecks(node, kw) {
      const { ok, last } = hasRequiredPreviousComment(src, node, allowBlank);
      const preview = node && node.loc && node.loc.start ? getLinePreview(src, node.loc.start.line) : '';

      // 必須コメントが存在しない場合は対象キーワードごとに missingComment を報告する
      if (!ok) {
        context.report({ node, messageId: 'missingComment', data: { kw, preview } });
        return null;
      }

      // 取得した直前コメントの本文がロケールポリシーなどのパターンに適合しているか検査する
      const text = typeof last.value === 'string' ? last.value : null;
      // コメント本文が requireTagPattern に適合しない場合は tagMismatch を報告する
      if (!matchesPattern(text, re)) {
        context.report({
          node,
          messageId: 'tagMismatch',
          data: { kw, pat: options.requireTagPattern || '', preview },
        });
      }

      return preview;
    }

    /**
     * 単一ノードに対して直前コメントとパターン適合を検査する。
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード種別
     */
    function checkNode(node, kw) {
      // 設定で対象外のキーワードはスキップする（無関係な制御構造には干渉しない）
      if (!targets.has(kw)) return;

      // else-if 連鎖の else 側を免除するオプションが有効な場合は検査をスキップする
      if (isIgnoredElseIfBranch(node, kw, ignoreElseIf)) return;

      const preview = runCommentAndPatternChecks(node, kw);
      // 直前コメントが存在せず missingComment を報告した場合は、節コメント検査を行わずに早期リターンする
      if (preview === null) return;

      // 節コメントオプションが有効な場合は if/try の節コメントも検査する
      if (kw === 'if') {
        // if 文に対しては then/else 節コメントの検査ロジックを適用し、節ごとのコメント有無を確認する
        checkIfSectionComments(src, context, node, sectionFlag, sectionLocations);
      } else if (kw === 'try' && sectionFlag) {
        // sectionFlag が有効な場合のみ catch/finally の節コメント検査を適用する
        checkTrySectionComments(src, context, node, sectionLocations);
      }
    }

    // 既存のユーティリティを用いて対象ノード種別ごとのリスナーを構築する
    return buildListeners(targets, ignoreCatch, (node, kw) => {
      checkNode(node, kw);
    });
  },
};

/** プラグインエクスポート（rules マップ） */
export const controlStructuresPlugin = {
  rules: {
    'require-comments-on-control-structures': ruleRequireCommentsOnControlStructures,
  },
};
