/**
 * @file ESLint ルール: catch ブロックの最低限のハンドリング保証（no-empty-or-trivial-catch）
 * 備考:
 * - 対象: TryStatement の CatchClause（JS/TS 共通）
 * - 条件: catch ブロック内に関数呼び出し（CallExpression/NewExpression）または throw 文が 1 つ以上存在することを要求する
 * - 目的: 例外を握り潰す empty/trivial な catch を禁止し、ロガー呼び出しや再 throw など最低限の処理を強制する
 * - 受入: `npm run lint --silent` および `npm run check` 実行時に core/no-empty-or-trivial-catch の違反が 0 件であること
 * - 非目標: 「意味のある処理」の内容（ログメッセージやステータス設計）の妥当性までは判定しない
 * - 依存: ESLint v9 / Flat Config / core ユニットの例外ハンドリングポリシーに準拠
 * - 関連: vibecoding/var/contexts/qualities/core/context.md （no_empty_catch ポリシーの ESLint ルール移行）
 * - テスト: vibecoding/tests/eslint/no-empty-or-trivial-catch.test.ts で OK/NG パターンを RuleTester 経由で検証する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251128/SnD-20251128-no-empty-catch-to-eslint-rule.md
 */
/**
 * no-empty-or-trivial-catch ルールのオプション。
 * - allowRethrowOnly: 再 throw のみを含む catch を許容するかどうか（既定: true）
 * - allowedCallPatterns: 「意味のある処理」とみなす関数呼び出しのパターン（将来拡張用）
 * @typedef {Object} NoEmptyOrTrivialCatchOptions
 * @property {boolean} [allowRethrowOnly] 再 throw のみの catch を許容するかどうか（既定: true）
 * @property {string[]} [allowedCallPatterns] 意味のある処理とみなす関数呼び出しのパターン（将来拡張用、現状は情報用途）
 */

/**
 * ルール実体。
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleNoEmptyOrTrivialCatch = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require each catch block to contain at least one call expression or throw statement to avoid silently swallowing exceptions.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowRethrowOnly: { type: 'boolean' },
          allowedCallPatterns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noHandling:
        'catch ブロック内にはロガー呼び出しやレポート、throw などの処理を少なくとも 1 つ含めてください（例外を握り潰さないようにします）。',
    },
  },
  create(context) {
    /**
     * ルールオプション。
     * @type {Readonly<NoEmptyOrTrivialCatchOptions>}
     */
    const options = (context.options && context.options[0]) || {};
    const allowRethrowOnly = options.allowRethrowOnly !== false;
    /**
     * catch 節ごとのハンドリング状況を保持するマップ。
     * @type {WeakMap<import('estree').CatchClause, { hasCallOrNew: boolean; hasThrow: boolean }>}
     */
    const handlingByCatch = new WeakMap();
    /** 収集したすべての CatchClause ノード集合。 */
    const allCatches = new Set();
    /** 現在解析中のファイルに対する SourceCode インスタンス。 */
    const sourceCode =
      (context.sourceCode) ||
      context.getSourceCode();

    /**
     * 現在のノードが属する catch 節にハンドリング種別を記録する。
     * @param {import('estree').Node} node 対象ノード
     * @param {'call'|'throw'} kind 検出したハンドリング種別
     * @returns {void}
     */
    function markHandling(node, kind) {
      const ancestors = sourceCode.getAncestors(node);
      // 祖先ノードを後ろから走査し、最も内側の CatchClause を見つけて対応するフラグを更新する
      for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        const anc = ancestors[i];
        // CatchClause が見つかった場合は現在のノードが属する catch 節としてハンドリング情報に反映する
        if (anc && anc.type === 'CatchClause') {
          const existing =
            handlingByCatch.get(anc) || { hasCallOrNew: false, hasThrow: false };
          if (kind === 'call') {
            // call パスでは「関数呼び出しあり」のフラグだけを更新する
            existing.hasCallOrNew = true;
          } else {
            // throw パスでは「再throw あり」のフラグだけを更新する
            existing.hasThrow = true;
          }

          handlingByCatch.set(anc, existing);
          break;
        }
      }
    }

    return {
      /**
       * すべての catch 節を収集する。
       * @param {import('estree').CatchClause} node 対象 catch 節
       * @returns {void}
       */
      CatchClause(node) {
        allCatches.add(node);
      },
      CallExpression(node) {
        markHandling(node, 'call');
      },
      NewExpression(node) {
        markHandling(node, 'call');
      },
      ThrowStatement(node) {
        markHandling(node, 'throw');
      },
      'Program:exit'() {
        // 収集したすべての catch 節について、関数呼び出しまたは throw を含んでいるかを最終判定する
        for (const node of allCatches) {
          const block = node.body;
          const info = handlingByCatch.get(node) || {
            hasCallOrNew: false,
            hasThrow: false,
          };
          const hasMeaningful =
            info.hasCallOrNew || (allowRethrowOnly && info.hasThrow);
          const isEmpty = !block || !block.body || block.body.length === 0;

          // 意味のある処理が存在しない catch や完全な空ブロックは例外握り潰しとして報告する
          if (!hasMeaningful || isEmpty) {
            context.report({ node, messageId: 'noHandling' });
          }
        }
      },
    };
  },
};

/** プラグインエクスポート */
export const coreCatchHandlingPlugin = {
  rules: {
    'no-empty-or-trivial-catch': ruleNoEmptyOrTrivialCatch,
  },
};

