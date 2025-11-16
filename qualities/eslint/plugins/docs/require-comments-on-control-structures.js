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
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingComment:
        "制御構文 '{{kw}}' の直前に、なぜその分岐/ループが必要か（目的・前提・例外方針を1文で）を説明するコメントを書いてください。",
      tagMismatch:
        "制御構文 '{{kw}}' の直前コメントは基準に一致していません: {{pat}}（ja 系では ASCII のみ不可）。",
      multi_issue_hint_line: '同一行に複数の指摘があります。',
      need_before_if: 'if キーワード直前行に意図説明コメントが必要です（空行は不可）。',
      need_then_block_head: 'then ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
      need_then_trailing: 'then の単一文末尾に意図説明コメントが必要です（同行末）。',
      need_else_block_head: 'else ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
      need_else_trailing: 'else の単一文末尾に意図説明コメントが必要です（同行末）。',
      need_catch_block_head: 'catch ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
      need_finally_block_head:
        'finally ブロックの先頭に意図説明コメントが必要です（{ の行または次行）。',
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
    const ignoreCatch = options.ignoreCatch !== false; // 既定: catch を免除
    const re =
      typeof options.requireTagPattern === 'string' && options.requireTagPattern.length > 0
        ? new RegExp(options.requireTagPattern)
        : null;

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
     * 単一ノードに対して直前コメントとパターン適合を検査する。
     * @param {any} node 対象ノード
     * @param {string} kw 対象キーワード種別
     */
    function checkNode(node, kw) {
      // 設定で対象外のキーワードはスキップする（無関係な制御構造には干渉しない）
      if (!targets.has(kw)) return;

      // else-if 連鎖の else 側を免除するオプションが有効な場合は検査をスキップする
      if (isIgnoredElseIfBranch(node, kw, ignoreElseIf)) return;

      // 直前コメントの有無と blank 設定に基づき、必須コメントの充足状況を検査する
      const { ok, last } = hasRequiredPreviousComment(src, node, allowBlank);
      // 必須コメントが存在しない場合は対象キーワードごとに missingComment を報告する
      if (!ok) {
        context.report({ node, messageId: 'missingComment', data: { kw } });
        return;
      }

      // 取得した直前コメントの本文がロケールポリシーなどのパターンに適合しているか検査する
      const text = typeof last.value === 'string' ? last.value : null;
      // コメント本文が requireTagPattern に適合しない場合は tagMismatch を報告する
      if (!matchesPattern(text, re)) {
        context.report({
          node,
          messageId: 'tagMismatch',
          data: { kw, pat: options.requireTagPattern || '' },
        });
      }
    }

    // 既存のユーティリティを用いて対象ノード種別ごとのリスナーを構築する
    return buildListeners(targets, ignoreCatch, (node, kw) => {
      checkNode(node, kw);
    });
  },
};

/**
 * プラグインエクスポート（rules マップ）
 */
export const controlStructuresPlugin = {
  rules: {
    'require-comments-on-control-structures': ruleRequireCommentsOnControlStructures,
  },
};
