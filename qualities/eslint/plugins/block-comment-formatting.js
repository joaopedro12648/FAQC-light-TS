/**
 * @file 複数行JSDocブロックの先頭行に本文を置かない ESLint ルール（--fix 対応）
 * 備考: 特記事項なし
 * - 先頭行を空行化し、次行から `* ` で本文を開始
 * - 既存のインデント（空白/タブ）を維持
 * - 単一行ブロックコメントは対象外
 * - JSDoc 風（value が * で始まる）ブロックのみ対象
 * - --fix 対応（安全なテキスト置換）
 * - 既存の末尾行や本文は変更しない
 * - 既存の `*` 整形はそのまま維持
 * - サンプル中の閉じコメントは `*\/` でエスケープ
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */

/**
 * 対象が JSDoc 風のブロックコメントかを判定
 * @param {import('eslint').AST.Token | import('estree').Comment} node
 * @returns {boolean}
 */
function isJsDocBlock(node) {
  return node && node.type === 'Block' && typeof node.value === 'string' && node.value.startsWith('*');
}

/**
 * 先頭行に本文が載っているかを検出
 * @param {string} fullText SourceCode から取得したコメント全文（/** ... *\/ を含む）
 * @returns {{hasInlineFirstLine: boolean, inlineText: string, beforeInline: string}}
 */
function detectInlineFirstLine(fullText) {
  // fullText は例えば "/** hoge\n * piyo\n */"
  const firstNewline = fullText.indexOf('\n');
  if (firstNewline === -1) {
    // 1行コメント（単一行）なので対象外
    return { hasInlineFirstLine: false, inlineText: '', beforeInline: '' };
  }
  const afterOpen = fullText.indexOf('/**') === 0 ? fullText.slice(3, firstNewline) : '';
  const hasInline = /\S/.test(afterOpen); // 改行までに非空白がある
  return {
    hasInlineFirstLine: hasInline,
    inlineText: hasInline ? afterOpen.trim() : '',
    beforeInline: hasInline ? afterOpen : '',
  };
}

/**
 * コメント開始位置のインデント文字列を取得
 * @param {string} sourceText 全ソース
 * @param {number} startIdx コメント開始 index
 * @returns {string} 行頭から開始位置までの空白（タブ含む）
 */
function getIndent(sourceText, startIdx) {
  const nl = sourceText.lastIndexOf('\n', startIdx - 1);
  const lineStart = nl === -1 ? 0 : nl + 1;
  return sourceText.slice(lineStart, startIdx);
}

export const ruleBlockCommentFormatting = {
  meta: {
    type: 'layout',
    docs: {
      description: 'For multi-line JSDoc blocks, disallow inline text on the opening line.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveToNextLine: 'Move JSDoc content from the opening line to the next line starting with "* ".',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const text = sourceCode.text;

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        for (const c of comments) {
          if (!isJsDocBlock(c)) continue;

          const full = sourceCode.getText(c);
          const hasNewline = full.includes('\n');
          if (!hasNewline) continue; // 単一行は対象外

          const { hasInlineFirstLine, inlineText } = detectInlineFirstLine(full);
          if (!hasInlineFirstLine) continue;

          const indent = getIndent(text, c.range[0]).replace(/[^\t ]/g, ''); // 非空白混入防止で保守的に

          context.report({
            loc: c.loc,
            messageId: 'moveToNextLine',
            fix(fixer) {
              // 変換: "/** <INLINE>\n" を "/**\n<indent>* <INLINE>\n" にする
              // full = "/**" + afterOpen + remainder
              const openIdx = full.indexOf('/**');
              const firstNewline = full.indexOf('\n');
              if (openIdx !== 0 || firstNewline === -1) return null;

              const before = full.slice(0, 3); // "/**"
              const remainder = full.slice(firstNewline); // "\n * piyo\n */"

              const replacement = `${before}\n${indent}* ${inlineText}${remainder}`;

              return fixer.replaceTextRange(c.range, replacement);
            },
          });
        }
      },
    };
  },
};

export const blockCommentFormattingPlugin = {
  rules: {
    'block-comment-formatting': ruleBlockCommentFormatting,
  },
};


