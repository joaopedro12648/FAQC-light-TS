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
 
 * 対象が JSDoc 風のブロックコメントかを判定する。
 * @param {import('eslint').AST.Token | import('estree').Comment} node コメントトークン（または ESTree コメント）
 * @returns {boolean} 先頭が `*` のブロックコメントなら true
 */
function isJsDocBlock(node) {
  return node && node.type === 'Block' && typeof node.value === 'string' && node.value.startsWith('*');
}

/**
 * 先頭行に本文が載っているかを検出する。
 * @param {string} fullText SourceCode から取得したコメント全文（/** ... *\/ を含む）
 * @returns {{hasInlineFirstLine: boolean, inlineText: string, beforeInline: string}} 検出結果（先頭行本文の有無と抽出文字列）
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
 * コメント開始位置のインデント文字列を取得する。
 * @param {string} sourceText ファイル全体のテキスト
 * @param {number} startIdx コメント開始インデックス（0 起点）
 * @returns {string} 行頭から開始位置までの空白（タブ含む）
 */
function getIndent(sourceText, startIdx) {
  const nl = sourceText.lastIndexOf('\n', startIdx - 1);
  const lineStart = nl === -1 ? 0 : nl + 1;
  return sourceText.slice(lineStart, startIdx);
}

/**
 * 先頭行インライン本文を次行へ移動する整形ルールの実体。
 * @returns {import('eslint').Rule.RuleModule} ルールモジュール
 */
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

/**
 * プラグインエクスポート（rules マップ）
 * @returns {{rules: Record<string, unknown>}} ルール名→実体
 */
export const blockCommentFormattingPlugin = {
  rules: {
    'block-comment-formatting': ruleBlockCommentFormatting,
    'no-empty-comment': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow empty comments (//, /* */, /** */ with no meaningful content).' },
        schema: [],
        messages: {
          emptyLine: 'Empty line comment is not allowed. Add a meaningful comment or remove it.',
          emptyBlock: 'Empty block comment is not allowed. Add a meaningful comment or remove it.',
          emptyJsdoc: 'Empty JSDoc is not allowed. Provide a description or remove it.'
        }
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();
        return {
          Program() {
            const comments = sourceCode.getAllComments();
            for (const c of comments) {
              // Line comment: "//   "
              if (c.type === 'Line') {
                if (typeof c.value === 'string' && c.value.trim().length === 0) {
                  context.report({ loc: c.loc, messageId: 'emptyLine' });
                }

                continue;
              }

              // Block comment (/* ... */ or /** ... */)
              if (c.type === 'Block' && typeof c.value === 'string') {
                const raw = c.value;
                const isJsdoc = raw.startsWith('*');
                // Remove leading "*" on each line and whitespace, then check if anything remains
                const normalized = raw
                  .split(/\r?\n/)
                  .map((ln) => ln.replace(/^\s*\*?/, '').trim())
                  .join('');
                if (normalized.length === 0) {
                  context.report({ loc: c.loc, messageId: isJsdoc ? 'emptyJsdoc' : 'emptyBlock' });
                }
              }
            }
          }
        };
      }
    }
    ,
    'require-describe-comment': {
      meta: {
        type: 'problem',
        docs: { description: 'Require a meaningful comment immediately above each describe(...)/it(...)/test(...) in tests.' },
        schema: [],
        messages: {
          missing: 'Add a concise comment explaining the scope/purpose of this test block.'
        }
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();

/**
 * describe 呼び出しかを判定する（it/test は対象外）。
 * @param {import('estree').Node} node 対象ノード（CallExpression など）
 * @returns {boolean} describe 呼び出しであれば true
 */
        function isDescribeCall(node) {
          return (
            node &&
            node.type === 'CallExpression' &&
            node.callee &&
            node.callee.type === 'Identifier' &&
            node.callee.name === 'describe'
          );
        }

/**
 * コメントが意味を持つかを判定する。
 * @param {any} c コメントオブジェクト
 * @returns {boolean} 空でなければ true（装飾を除去して非空か）
 */
        function isMeaningfulComment(c) {
          if (!c || typeof c.value !== 'string') return false;
          const text = String(c.value).replace(/^\s*\*?\s*/gm, '').trim();
          return text.length > 0;
        }

/**
 * 直前のコメントを取得する。
 * @param {any} node 対象ノード
 * @returns {any|null} もっとも近い直前コメント（存在しなければ null）
 */
        function getLastPrecedingComment(node) {
          const commentsBefore = sourceCode.getCommentsBefore ? sourceCode.getCommentsBefore(node) : [];
          return commentsBefore.length > 0 ? commentsBefore[commentsBefore.length - 1] : null;
        }

/**
 * コメントとノードが空行なしで隣接しているかを判定する。
 * @param {any} last 直前コメント
 * @param {any} node 対象ノード
 * @returns {boolean} 空行が無ければ true
 */
        function isAdjacent(last, node) {
          const between = sourceCode.text.slice(last.range[1], node.range[0]);
          return !/\n\s*\n/.test(between);
        }

        return {
          CallExpression(node) {
            if (!isDescribeCall(node)) return;
            const last = getLastPrecedingComment(node);
            const ok = last && isAdjacent(last, node) && isMeaningfulComment(last);
            if (!ok) {
              context.report({ node, messageId: 'missing' });
            }
          }
        };
      }
    }
  },
};

