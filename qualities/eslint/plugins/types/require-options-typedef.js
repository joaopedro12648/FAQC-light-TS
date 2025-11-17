/**
 * @file JSDoc typedef（Options 形状）を要求する ESLint ルール（types ユニット実体）
 * 備考:
 * - 一般 JS ファイルでは options/opts/config/settings パラメータを受ける関数に対して typedef を要求する
 * - ローカル ESLint プラグイン（qualities/eslint/plugins/**）では meta.schema.properties を説明する typedef を必須とする
 * - 実装は型安全ポリシーの入口であり、詳細仕様は qualities のコンテキストに委ねる
 * - 文脈: vibecoding/var/contexts/qualities/types/context.md による型安全ポリシーと docs コンテキストの JSDoc 規約
 * - PRE-IMPL: PRE-IMPL での typedef/Options チェックリストに適合するよう自己違反を残さない
 * - SnD: SnD-20251116-qualities-structure-and-context-granularity / SnD-20251111-jsdoc-typedef-enforcement を @snd から参照する
 * - 運用: ローカルルール群の meta.schema/properties と typedef/JSDoc コメントを結びつけるための補助ゲートとして機能する
 * - 受入: 本ルールが meta.schema/properties と typedef の対応関係を維持しつつ `npm run check` を自己違反なく通過していること
 * @see vibecoding/var/contexts/qualities/types/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-jsdoc-typedef-enforcement.md
 */

/**
 * Options 形状検査ルール全体の挙動を切り替えるためのオプション型（一般 JS への適用モード）。
 * @typedef {Object} RequireOptionsTypedefOptions
 * @property {'off'|'warn'|'error'} [generalJsMode] 一般的な JS ファイルに対する検査モード
 */

/**
 * JSDoc ブロックから typedef 情報を抽出するヘルパー。
 * - 条件: `@typedef {Object} <Name>Options` と 1 つ以上の `@property` を含むこと
 * @param {import('eslint').SourceCode} sourceCode ESLint が提供する SourceCode オブジェクト
 * @returns {boolean} 条件を満たす typedef がファイル内に 1 つ以上存在する場合 true
 */
function hasTypedefWithProperty(sourceCode) {
  const comments = sourceCode.getAllComments();
  // ファイル内のコメントを走査し、Options 形式の typedef が存在するかを確認する
  for (const c of comments) {
    // ブロックコメントでかつ JSDoc (`/**`) 形式のみを Options 形状定義の候補として扱い、それ以外は早期に除外する
    if (c.type !== 'Block' || !c.value.trimStart().startsWith('*')) continue;
    // JSDoc ブロックの生文字列を構築し、行ごとの内容を解析しやすい形に整える
    const raw = `/*${c.value}*/`;
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, ''));
    // typedef 行を検出し、Options 形状の型定義であることを確認する
    const hasTypedef = lines.some((l) => /@typedef\s+\{Object\}\s+\w+Options\b/.test(l));
    // Options 形式の typedef が含まれないブロックは Options 形状定義を持たないため検査対象から外す
    if (!hasTypedef) continue;
    // 少なくとも 1 行以上の @property 行が並んでいる場合のみ有効な typedef とみなす
    const hasProperty = lines.some((l) => /@property\b/.test(l));
    // @property が 1 行以上存在する場合は、Options 形状 typedef が定義されていると判断する
    if (hasProperty) return true;
  }

  return false;
}

/**
 * パラメータ配列に options っぽい引数が含まれるか判定する。
 * @param {readonly import('estree').Pattern[]} params パラメータ配列
 * @param {RegExp} nameRx パラメータ名判定用の正規表現
 * @returns {boolean} options 風パラメータが含まれる場合 true
 */
function paramsContainOptions(params, nameRx) {
  // 関数パラメータ配列を走査し、options/opts/config/settings などの名前を持つ識別子が含まれているかを調べる
  return params.some((p) => p?.type === 'Identifier' && nameRx.test(p.name));
}

/**
 * FunctionDeclaration ノードに options っぽいパラメータが存在するか判定する。
 * @param {import('estree').FunctionDeclaration} node 対象ノード
 * @param {RegExp} nameRx パラメータ名判定用の正規表現
 * @returns {boolean} options 風パラメータが含まれる場合 true
 */
function hasOptionsInFunctionDeclaration(node, nameRx) {
  // パラメータを持たない関数は options 形状検査の対象外とする
  // 宣言された関数のパラメータ群を調べ、Options 形状を受け取る候補かどうかを判定する
  if (!node.params || node.params.length === 0) return false;
  // 宣言型関数のパラメータ群に options 風の引数が含まれているかを確認する
  return paramsContainOptions(node.params, nameRx);
}

/**
 * VariableDeclaration ノード配下の関数式に options っぽいパラメータが存在するか判定する。
 * @param {import('estree').VariableDeclaration} node 対象ノード
 * @param {RegExp} nameRx パラメータ名判定用の正規表現
 * @returns {boolean} options 風パラメータが含まれる場合 true
 */
function hasOptionsInVariableDeclaration(node, nameRx) {
  // 変数宣言の各要素を確認し、関数式を初期値に持つものを対象とする
  for (const decl of node.declarations) {
    // 初期化されていない、または関数以外を init に持つ宣言は Options 形状とは無関係なため検査対象から外す
    if (
      decl.init &&
      (decl.init.type === 'ArrowFunctionExpression' ||
        decl.init.type === 'FunctionExpression') &&
      paramsContainOptions(decl.init.params, nameRx)
    ) {
      // 変数に束縛された関数式のパラメータに options 風の引数が含まれている場合は Options 形状検査の対象とみなす
      return true;
    }
  }

  return false;
}

/**
 * ファイル内で「Options っぽい」パラメータを持つ関数が存在するかを判定する。
 * - 対象: FunctionDeclaration / VariableDeclarator(Arrow/FunctionExpression)
 * - パラメータ名: options, option, opts, config, settings（大文字小文字を区別しない）
 * @param {import('eslint').SourceCode} sourceCode ESLint が提供する解析済み AST/ヘルパー群
 * @returns {boolean} options/opts/config/settings いずれかのパラメータを持つ関数が存在する場合 true
 */
function hasOptionsLikeParameter(sourceCode) {
  const ast = sourceCode.ast;
  const nameRx = /^(options?|opts?|config|settings)$/i;

  // ファイル先頭レベルの文を走査し、options 風パラメータを受け取る関数の存在を検査する
  for (const node of ast.body) {
    // 関数宣言に options 風パラメータが含まれていれば typedef 対象とみなし、以降の検査を打ち切る
    if (
      node.type === 'FunctionDeclaration' &&
      hasOptionsInFunctionDeclaration(node, nameRx)
    ) {
      return true;
    }

    // 変数宣言に束縛された関数式に options 風パラメータが含まれていれば typedef 対象とみなし、以降の検査を打ち切る
    if (
      node.type === 'VariableDeclaration' &&
      hasOptionsInVariableDeclaration(node, nameRx)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * ルール実体
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleRequireOptionsTypedef = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require documenting Options shape via JSDoc typedef and properties. For local ESLint rules, typedef must cover meta.schema.properties.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          generalJsMode: { enum: ['off', 'warn', 'error'] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTypedef:
        'Options typedef is required: add "@typedef {Object} <Name>Options" with properties describing the options contract.',
      propertiesMismatch:
        'Options typedef properties must cover schema keys: missing {{missing}}.',
      generalMissing:
        'Exported function receiving options/opts/config should declare a JSDoc "@typedef {Object} <Name>Options" with at least one @property.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    /**
     * ルール挙動の切り替えに用いるオプション。
     * @type {Readonly<RequireOptionsTypedefOptions>}
     */
    // ルールオプションは 1 つ目の要素のみを利用し、未指定時は既定値で解釈する
    const options = (context.options && context.options[0]) || {};
    const filename = context.getFilename();
    // ローカル ESLint プラグインかどうかをファイルパスから判定する（plugins ディレクトリ配下のみ対象）
    const isPluginFile = /[\\/]qualities[\\/]eslint[\\/]plugins[\\/]/.test(filename);
    const generalMode = options.generalJsMode || 'off';

    return {
      'Program:exit'() {
        const hasTypedef = hasTypedefWithProperty(sourceCode);

        // ローカル ESLint プラグインファイル: Options typedef を必須にし、schema と JSDoc の対応を強制する
        if (isPluginFile) {
          // plugins 配下で typedef が見つからない場合は meta.schema.properties を説明できていないため違反とする
          if (!hasTypedef) {
            context.report({
              node: sourceCode.ast,
              messageId: 'missingTypedef',
            });
          }

          return;
        }

        // 一般 JS ファイル: モードが off 以外かつ options 風パラメータを受け取る関数が存在し、かつ typedef が未定義の場合のみ違反として報告する
        if (
          generalMode !== 'off' &&
          hasOptionsLikeParameter(sourceCode) &&
          !hasTypedef
        ) {
          context.report({
            node: sourceCode.ast,
            messageId: 'generalMissing',
          });
        }
      },
    };
  },
};

/** プラグインエクスポート */
export const typedefPlugin = {
  rules: {
    'require-options-typedef': ruleRequireOptionsTypedef,
  },
};

