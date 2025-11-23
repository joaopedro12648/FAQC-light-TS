/**
 * @file ブロックコメント整形とテスト記述用コメントの検査プラグイン（docs ユニット実体）
 * 備考: ブロックコメントの形とテスト describe 直前の説明コメントを検査し、日本語を主体とした意図説明を強制する
 * - 対象: 複数行ブロックコメントとテスト記述用コメント（JSDoc/通常ブロックの双方を含む）
 * - 目的: コメントの構造と本文位置を揃え、品質コンテキストに沿った可読性と意図開示を保証する
 * - ポリシー: 先頭行は枠線のみとし本文は次行以降へ移動し、空ブロックコメントを禁止する
 * - describe: テストスイート直前に目的・前提・例外方針を 1 行で説明する日本語コメントを要求する
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md に記されたコメント/テスト記述ポリシーに従う
 * - SnD: SnD-20251116-qualities-structure-and-context-granularity を @snd で参照し、docs ユニットの一部として自己記述する
 * - PRE-IMPL: Header Comment Quick Checklist 準拠のヘッダ構造を前提とし、自己違反を残さない
 * - 受入: 本プラグイン自身が blockfmt/control/jsdoc 系ルールに適合し `npm run check` を一発緑で通過していること
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */

/**
 * @typedef {Object} BlockCommentFormattingOptions
 * ブロックコメント整形ルールの挙動を調整するためのオプション群。
 * @property {boolean} [enforceMultiLineOnly] 単一行コメントを対象外とするかどうか（既定: true）
 * @property {boolean} [allowSingleLineJsdoc] 単一行 JSDoc を警告対象から外すかどうか
 */

/**
 * 先頭行に本文を置かないブロックコメント整形ルール。
 * - 対象: 複数行のブロックコメント全般（説明コメントを段落として扱う）
 * - 失敗: 開始行に実際の本文（トリム後テキスト）が含まれている場合（例: 1 行目に説明文を書き、2 行目以降に続きが来る形式）
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleBlockCommentFormatting = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Require multi-line block comments (JSDoc included) to keep the first line body-less and move text to the next line.',
    },
    schema: [],
    messages: {
      // テスト用のメッセージ ID（ヘルパー名をそのまま文言へ反映する）
      moveToNextLine:
        'Move JSDoc content from the opening line to the next line to keep the /** line body-less.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      Program() {
        // ソースコード全体のコメントを走査し、対象ブロックコメントのみを検査する
        for (const comment of sourceCode.getAllComments()) {
          // インラインコメントは対象外とし、ブロックコメントのみを扱う
          if (comment.type !== 'Block') continue;
          const raw = `/*${String(comment.value)}*/`;
          const lines = raw.split(/\r?\n/);
          // 1 行だけのコメントは本ルールの対象外（no-empty-comment 側で扱う）
          if (lines.length === 1) {
            continue;
          }

          // `/*` / `/**` を除いた先頭行の本文を検査する
          const firstBody = lines[0].replace(/^\/\*\*?/, '').trim();
          // 先頭行に本文テキストが残っている場合は整形対象として報告する
          if (firstBody.length > 0) {
            context.report({
              loc: comment.loc,
              messageId: 'moveToNextLine',
            });
          }
        }
      },
    };
  },
};
/**
 * 単一行で表現できる内容を複数行ブロックコメントとして書くことを抑止するルール。
 * - 対象: 複数行ブロックコメントのうち、実質 1 文の説明だけで構成されるコメント
 * - 失敗: 本文を連結した文字列が maxLength 以下かつ文の区切りが 1 つ以下であり、箇条書きや JSDoc タグ行を含まない場合
 * @type {import('eslint').Rule.RuleModule}
 */
export const rulePreferSingleLineBlockComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        '内容が 1 文で済む複数行ブロックコメントを検出し、単一行ブロックコメントまたは行コメントへの統一を促します。',
    },
    schema: [],
    messages: {
      preferSingleLine:
        '単一行で表現できるブロックコメントです。単一行ブロックコメント（/* ... */）または行コメント（// ...）へ統一してください。',
      preferSingleLineAggregated:
        'コメントフォーマット違反が検出されました。npm run fix:comments:singleline を実行してください。',
      preferSingleLineUnfixable:
        '単一行で表現できるブロックコメントですが自動修正対象外です（JSDoc タグ等を含むため）。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * 違反（自動修正可能）の収集配列
     * @type {Array<{loc: import('estree').SourceLocation, range: [number, number]}>}
     */
    const fixableViolations = [];
    /**
     * 違反（自動修正不可）の収集配列
     * @type {Array<{loc: import('estree').SourceLocation, range: [number, number]}>}
     */
    const unfixableViolations = [];
    /**
     * 置換テキスト候補（非重複）
     * @type {Array<{range: [number, number], text: string}>}
     */
    const fixCandidates = [];

    /**
     * コメント本文行（空行除外済み）の行数を数える。
     * @param {import('eslint').AST.Token | import('estree').Comment} comment 対象コメント
     * @returns {number} 空行を除いた本文行数
     */
    function countContentLines(comment) {
      const rawLines = String(comment.value).split(/\r?\n/);
      return rawLines
        .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
        .filter((line) => line.length > 0).length;
    }

    /**
     * コメントが「実質 1 行コメント」かどうかを判定する。
     * @param {import('eslint').AST.Token | import('estree').Comment} comment 対象コメント
     * @returns {boolean} 実質 1 行コメントと見なせる場合 true
     */
    function isEffectivelySingleLine(comment) {
      // 単一行コメントや 1 行ブロックは対象外とし、構造的に複数行のものだけを検査する
      if (comment.type !== 'Block') return false;
      // 物理的に 1 行で完結しているブロックコメントは本ルールの対象外とする
      if (comment.loc.start.line === comment.loc.end.line) return false;

      const lineCount = countContentLines(comment);
      // 空コメントや 2 行以上のコメントは対象外とし、「実質 1 行」のみを違反とする
      return lineCount === 1;
    }

    return {
      Program() {
        // ソースコード全体のコメントを走査し、実質 1 行で済む複数行ブロックコメントのみを検査する
        for (const comment of sourceCode.getAllComments()) {
          // 実質 1 行の複数行ブロックのみを対象とする
          if (!isEffectivelySingleLine(comment)) continue;

          // fixer 候補を抽出（JSDoc タグが含まれるなど安全に直せない場合は unfixable とする）
          const rawLines = String(comment.value).split(/\r?\n/);
          const trimmedLines = rawLines
            .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
            .filter((line) => line.length > 0);

          const isFixable = trimmedLines.length === 1 && !trimmedLines.some((l) => /^@/.test(l));

          // 自動修正可能性で経路分岐し、適用対象と保留対象を明確に分離する
          if (isFixable) {
            // 単一行変換を作成し配列へ追加する
            fixableViolations.push({ loc: comment.loc, range: comment.range });
            const content = trimmedLines[0].replace(/\s+/g, ' ').trim();
            // 元コメントが JSDoc（/** ... */）なら単一行JSDocとして維持し、通常ブロック（/* ... */）はそのままにする
            const originalText = sourceCode.getText(comment);
            const isJsdoc = /^\s*\/\*\*/.test(originalText);
            const open = isJsdoc ? '/**' : '/*';
            const replacement = `${open} ${content} */`;
            fixCandidates.push({ range: comment.range, text: replacement });
          } else {
            // タグ等で変換不可の事例を別配列へ退避する
            unfixableViolations.push({ loc: comment.loc, range: comment.range });
          }
        }
      },
      'Program:exit'() {
        // 自動修正可能な箇所数に応じて報告方針を切り替える
        if (fixableViolations.length === 1) {
          // 単一件の違反は個別報告として明確に提示する
          const v = fixableViolations[0];
          const c = fixCandidates[0];
          context.report({ loc: v.loc, messageId: 'preferSingleLine' });
        } else if (fixableViolations.length > 1) {
          const first = fixableViolations[0];
          context.report({ loc: first.loc, messageId: 'preferSingleLineAggregated' });
        }

        // 自動修正対象外は個別行で報告する
        for (const v of unfixableViolations) {
          context.report({
            loc: v.loc,
            messageId: 'preferSingleLineUnfixable',
          });
        }
      },
    };
  },
};

/**
 * 空ブロックコメント禁止ルール。
 * - 対象: すべてのブロックコメント
 * - 失敗: 本文行から装飾文字（* や空白）を除いた結果、意味のあるテキストが 1 行も無い場合
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleNoEmptyBlockComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow empty block comments that contain no meaningful text.',
    },
    schema: [],
    messages: {
      emptyBlock: '意味のあるテキストを含まないブロックコメントは削除するか本文を記述してください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      Program() {
        // ソースコード全体のコメントを走査し、空ブロックコメントの有無を検査する
        for (const comment of sourceCode.getAllComments()) {
          // 対象外のコメント種別は早期リターンでスキップする
          if (comment.type !== 'Block') continue;
          const raw = `/*${String(comment.value)}*/`;
          const trimmedLines = raw
            .replace(/^\/\*\*?/, '')
            .replace(/\*\/$/, '')
            .split(/\r?\n/)
            .map((l) => l.replace(/^\s*\*?\s?/, '').trim());

          const hasContent = trimmedLines.some((l) => l.length > 0 && !/^@/.test(l));
          // 本文行が 1 行も存在しないブロックコメントは違反として報告する
          if (!hasContent) {
            context.report({
              loc: comment.loc,
              messageId: 'emptyBlock',
            });
          }
        }
      },
    };
  },
};

/**
 * ブロックコメント内部の空行を禁止するルール。
 * - 対象: JSDoc/通常ブロックコメントの本文行全体
 * - 失敗: 装飾文字（* や空白）を除いた本文行の中に空行が 1 行でも含まれている場合
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleNoBlankLinesInBlockComment = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Disallow blank lines inside block comments so that all content and tag lines appear consecutively without empty separators.',
    },
    schema: [],
    messages: {
      noBlankLines:
        'ブロックコメント内部に空行があります。本文行とタグ行の間に空行を挟まず連続した行として記述してください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * ブロックコメント内部に空行が含まれるかどうかを判定する。
     * - 先頭と末尾の装飾上の空行は許容し、最初と最後の本文行の内側だけを見る。
     * - comment.value（区切り記号を除いた内部文字列）を対象に、簡易スキャナと同等のロジックを適用する。
     * @param {import('eslint').AST.Token | import('estree').Comment} comment 対象コメント
     * @returns {boolean} 本文行の内側に空行が存在する場合 true、存在しない場合 false
     */
    function hasBlankLines(comment) {
      const rawLines = String(comment.value).split(/\r?\n/);
      const trimmed = rawLines.map((line) => line.replace(/^\s*\*?\s?/, '').trim());

      let firstContentIndex = -1;
      let lastContentIndex = -1;
      // 最初と最後の本文行を特定し、装飾上の空行（外縁）は検査対象から除外する
      for (let i = 0; i < trimmed.length; i++) {
        // 本文と見なせる行のみを最初/最後インデックス計算に使用する
        if (trimmed[i].length > 0) {
          // 最初に見つかった本文行のインデックスを確定する（1回のみ）
          if (firstContentIndex === -1) {
            firstContentIndex = i;
          }

          lastContentIndex = i;
        }
      }

      // 本文行が存在しない（全て空行）場合は違反ではないため早期終了する
      // 先頭/末尾以外にも本文が無いケースを除外して誤検出を防ぐ
      if (firstContentIndex === -1 || lastContentIndex === -1) {
        return false;
      }

      // 本文領域の内側に空文字行（空行）が存在すれば違反とみなす
      for (let i = firstContentIndex + 1; i < lastContentIndex; i++) {
        // 本文の連続性を壊す空行を検出する
        if (trimmed[i].length === 0) {
          return true;
        }
      }

      return false;
    }

    return {
      Program() {
        // ソースコード全体のコメントを走査し、ブロックコメント内部の空行を検査する
        for (const comment of sourceCode.getAllComments()) {
        // 対象外のコメント種別（Line）は検査コスト削減のため除外する
          if (comment.type !== 'Block') continue;

          // 本文内に空行が無いコメントは違反ではないため報告しない
          if (!hasBlankLines(comment)) continue;

          context.report({
            loc: comment.loc,
            messageId: 'noBlankLines',
          });
        }
      },
    };
  },
};

/**
 * describe 直前コメント必須ルール。
 * - 対象: テストスイートを表す describe 呼び出し
 * - 失敗: 直前行にテスト群の目的や前提を説明するコメントが存在しない場合
 * （ESLint ディレクティブのみがある状態は説明コメントとはみなさない）
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleRequireDescribeComment = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require an intent-revealing comment immediately above top-level describe blocks in tests.',
    },
    schema: [],
    messages: {
      missingDescribeComment:
        'describe ブロックの直前に、このテスト群の目的・前提・例外方針を 1 行で説明するコメントを書いてください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * describe 系呼び出しかどうかを判定するユーティリティ。
     * @param {import('estree').Node} node 判定対象ノード
     * @returns {boolean} describe 呼び出しであれば true
     */
    function isDescribeCall(node) {
      // CallExpression 以外は describe とみなさず即座に除外する
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      // グローバル describe(...) 呼び出しかどうかを判定する
      if (callee.type === 'Identifier' && callee.name === 'describe') return true;
      // オブジェクトメソッド形式の describe 呼び出しかどうかを判定する
      if (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'describe'
      ) {
        return true;
      }

      return false;
    }

    /**
     * 対象ノード直前に意味のある説明コメントがあるかを判定する。
     * @param {import('estree').Node} node 判定対象ノード
     * @returns {boolean} 説明コメントが直前行に存在する場合 true
     */
    function hasMeaningfulLeadingComment(node) {
      const comments = sourceCode.getCommentsBefore(node);
      // 直前にコメントが無い場合は説明コメント無しとみなす
      if (!comments || comments.length === 0) return false;
      const last = comments[comments.length - 1];
      const text = typeof last.value === 'string' ? last.value.trim() : '';
      // 直前コメントが静的解析ツールの設定指令のみの場合は、説明コメントとしては扱わない
      if (/^(?:eslint|istanbul|ts-(?:check|nocheck))[-\s]/i.test(text)) return false;

      const lineDiff = node.loc.start.line - last.loc.end.line;
      // コメントと describe 呼び出しの間に空行を挟まず直前行のみを認める
      return lineDiff === 1;
    }

    return {
      CallExpression(node) {
        // トップレベル describe のみ対象とし、その他の関数呼び出しは早期リターンで除外する
        if (!isDescribeCall(node)) return;
        // 式文のトップレベルに無い describe は説明コメント必須の対象外とし、ネストスイートは自由度を残す
        if (node.parent && node.parent.type !== 'ExpressionStatement') return;
        // 直前行に意味のある説明コメントが無い describe 呼び出しに対してのみ違反を報告する
        if (!hasMeaningfulLeadingComment(node)) {
          context.report({
            node,
            messageId: 'missingDescribeComment',
          });
        }
      },
    };
  },
};

/**
 * プラグインエクスポート。
 * - block-comment-formatting: ブロックコメント整形ルール
 * - no-empty-comment: 空ブロックコメント禁止ルール
 * - require-describe-comment: describe 直前コメント必須ルール
 * - prefer-single-line-block-comment: 単一行で済む内容の多行ブロックコメントを抑止するルール
 * - no-blank-lines-in-block-comment: ブロックコメント内部の空行を禁止するルール
 */
export const blockCommentFormattingPlugin = {
  rules: {
    'block-comment-formatting': ruleBlockCommentFormatting,
    'no-empty-comment': ruleNoEmptyBlockComment,
    'require-describe-comment': ruleRequireDescribeComment,
    'prefer-single-line-block-comment': rulePreferSingleLineBlockComment,
    'no-blank-lines-in-block-comment': ruleNoBlankLinesInBlockComment,
  },
};

