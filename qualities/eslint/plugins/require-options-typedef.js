/**
 * @file JSDoc typedef（Options 形状）を要求する ESLint ルール（ローカルプラグイン）
 * 備考:
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251111/SnD-20251111-jsdoc-typedef-enforcement.md
 */

/**
 * @typedef {Object} RequireOptionsTypedefOptions
 * @property {'off'|'warn'|'error'} [generalJsMode] 一般 JS/MJS への適用レベル（段階導入用）
 */

/**
 * JSDoc ブロックから @typedef と @property を抽出する。
 * @param {import('eslint').SourceCode} sourceCode SourceCode
 * @returns {{typedefs: Array<{name:string, properties:Set<string>}>}} 収集結果
 */
function collectTypedefs(sourceCode) {
  const typedefs = [];
  const comments = sourceCode.getAllComments();
  for (const c of comments) {
    if (c.type !== 'Block') continue;
    const raw = typeof c.value === 'string' ? c.value : '';
    if (!raw.startsWith('*')) continue; // JSDoc 風のみ
    const lines = raw.split(/\r?\n/).map((ln) => ln.replace(/^\s*\*?\s?/, ''));
    // @typedef {Object} NameOptions
    const tdIdx = lines.findIndex((ln) => /@typedef\s+\{Object\}\s+\S+Options\b/.test(ln));
    if (tdIdx === -1) continue;
    const m = lines[tdIdx].match(/@typedef\s+\{Object\}\s+(\S+Options)\b/);
    if (!m) continue;
    const name = m[1];
    const properties = new Set();
    for (const ln of lines.slice(tdIdx + 1)) {
      const pm = ln.match(/@property\s+\{[^}]+\}\s+\[?(\w+)/);
      if (pm) properties.add(pm[1]);
    }

    typedefs.push({ name, properties });
  }

  return { typedefs };
}

/**
 * ESLint プラグイン実装ファイルで meta.schema.properties のキー集合を抽出する。
 * 期待構造: export const <name> = { meta: { schema: [ { properties: { key: {...}, ... } } ] } }
 * @param {import('estree').Program} ast AST
 * @returns {Set<string>} properties のキー集合（未検出時は空セット）
 */
function extractSchemaPropertyKeys(ast) {
  for (const d of getExportedVariableDeclarators(ast)) {
    const keys = extractSchemaKeysFromInit(d.init);
    if (keys.size > 0) return keys;
  }

  return new Set();
}

/**
 * ObjectExpression から指定名の直下 Property.value を ObjectExpression として取得
 * @param {import('estree').ObjectExpression} obj 入力オブジェクト
 * @param {string} name プロパティ名
 * @returns {import('estree').ObjectExpression|null} 値が ObjectExpression のときのみ返す
 */
function getObjectPropertyObjectValue(obj, name) {
  const prop = obj.properties.find(
    (p) => p.type === 'Property' && p.key && p.key.type === 'Identifier' && p.key.name === name
  );
  if (!prop || prop.type !== 'Property') return null;
  return prop.value && prop.value.type === 'ObjectExpression' ? prop.value : null;
}

/**
 * ObjectExpression から配列値の最初の要素（ObjectExpression）を取得
 * @param {import('estree').ObjectExpression} obj 入力オブジェクト
 * @param {string} name 配列プロパティ名
 * @returns {import('estree').ObjectExpression|null} 先頭要素が ObjectExpression の場合のみ
 */
function getFirstArrayElementObject(obj, name) {
  const prop = obj.properties.find(
    (p) => p.type === 'Property' && p.key && p.key.type === 'Identifier' && p.key.name === name
  );
  if (!prop || prop.type !== 'Property') return null;
  const arr = prop.value;
  if (!arr || arr.type !== 'ArrayExpression' || arr.elements.length === 0) return null;
  const first = arr.elements[0];
  return first && first.type === 'ObjectExpression' ? first : null;
}

/**
 * 初期化子から schema.properties のキー集合を抽出
 * @param {import('estree').Expression|null|undefined} init 代入初期化子
 * @returns {Set<string>} properties キー集合
 */
function extractSchemaKeysFromInit(init) {
  const out = new Set();

  const props = resolvePropertiesObjectFromInit(init);
  if (!props) return out;

  for (const p of props.properties) {
    if (p && p.type === 'Property') {
      if (p.key.type === 'Identifier') out.add(p.key.name);
      else if (p.key.type === 'Literal' && typeof p.key.value === 'string') out.add(p.key.value);
    }
  }

  return out;
}

/**
 * init から meta → schema[0] → properties の ObjectExpression を解決
 * @param {import('estree').Expression|null|undefined} init 代入初期化子
 * @returns {import('estree').ObjectExpression|null} properties オブジェクト or null
 */
function resolvePropertiesObjectFromInit(init) {
  if (!init || init.type !== 'ObjectExpression') return null;
  const metaObj = getObjectPropertyObjectValue(init, 'meta');
  if (!metaObj) return null;
  const firstSchemaObj = getFirstArrayElementObject(metaObj, 'schema');
  if (!firstSchemaObj) return null;
  const propertiesObj = getObjectPropertyObjectValue(firstSchemaObj, 'properties');
  if (!propertiesObj) return null;

  return propertiesObj;
}

/**
 * export const ... の VariableDeclarator 群を収集する
 * @param {import('estree').Program} program AST
 * @returns {import('estree').VariableDeclarator[]} 収集結果
 */
function getExportedVariableDeclarators(program) {
  /** @type {import('estree').VariableDeclarator[]} */
  const out = [];
  for (const node of program.body) {
    if (
      node &&
      node.type === 'ExportNamedDeclaration' &&
      node.declaration &&
      node.declaration.type === 'VariableDeclaration'
    ) {
      for (const d of node.declaration.declarations || []) {
        if (d && d.type === 'VariableDeclarator') out.push(d);
      }
    }
  }

  return out;
}

/**
 * 一般 JS/MJS のエクスポート関数が「Options 形状」を受けるかを判定し、必要なら true。
 * @param {import('estree').Program} ast AST
 * @returns {boolean} options に関する typedef 要求が必要なら true
 */
function requiresOptionsTypedefForGeneralJs(ast) {
  const nameRx = /^(options|opts|config)$/i;

  /**
   * 第1引数が options/opts/config または ObjectPattern かを判定
   * @param {readonly import('estree').Pattern[]} params 引数配列
   * @returns {boolean} options 形状なら true
   */
  function isOptionsLike(params) {
    const p = params?.[0];
    return Boolean(
      p && (p.type === 'ObjectPattern' || (p.type === 'Identifier' && typeof p.name === 'string' && nameRx.test(p.name)))
    );
  }

  /**
   * export 宣言内の関数/関数式の第1引数が options 形状か判定
   * @param {import('estree').Declaration} decl 宣言
   * @returns {boolean} options 形状なら true
   */
  function checkDeclaration(decl) {
    if (decl.type === 'FunctionDeclaration') return isOptionsLike(decl.params || []);
    if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        const init = d.init;
        if (!init) continue;
        if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
          if (isOptionsLike(init.params || [])) return true;
        }
      }
    }

    return false;
  }

  for (const node of ast.body) {
    if (!node) continue;
    if (node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportDefaultDeclaration') continue;
    if (!node.declaration) continue;
    if (checkDeclaration(node.declaration)) return true;
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
        'Require documenting Options shape via JSDoc typedef and properties. For local ESLint rules, typedef must cover meta.schema.properties.'
    },
    schema: [
      {
        type: 'object',
        properties: {
          generalJsMode: { enum: ['off', 'warn', 'error'] }
        },
        additionalProperties: false
      }
    ],
    messages: {
      missingTypedef:
        'Options typedef is required: add "@typedef {Object} <Name>Options" with properties describing the options contract.',
      propertiesMismatch:
        'Options typedef properties must cover schema keys: missing {{missing}}.',
      generalMissing:
        'Exported function receiving options/opts/config should declare a JSDoc "@typedef {Object} <Name>Options" with at least one @property.',
    }
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const filename = context.getFilename ? context.getFilename() : '';
    const opt = (Array.isArray(context.options) && context.options[0]) || {};
    const generalMode = opt.generalJsMode || 'off';

    const { typedefs } = collectTypedefs(sourceCode);
    const typedefProps = new Set(typedefs.flatMap((t) => Array.from(t.properties)));

    const ast = sourceCode.ast;
    const schemaKeys = extractSchemaPropertyKeys(ast);
    const isPluginFile = /[\\/]qualities[\\/]eslint[\\/]plugins[\\/].+\.js$/i.test(String(filename));

    return {
      'Program:exit'() {
        // 1) ESLint プラグイン実装: schema.properties があるなら typedef 必須 + keys を包含
        if (isPluginFile && schemaKeys.size > 0) {
          if (typedefs.length === 0) {
            context.report({ loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, messageId: 'missingTypedef' });
            return;
          }
          // 欠損キーを列挙

          const missing = Array.from(schemaKeys).filter((k) => !typedefProps.has(k));
          if (missing.length > 0) {
            context.report({
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              messageId: 'propertiesMismatch',
              data: { missing: missing.join(', ') }
            });
          }

          return;
        }

        // 2) 一般 JS/MJS（段階導入用、config で warn/error を選択）
        if (generalMode !== 'off') {
          const needs = requiresOptionsTypedefForGeneralJs(ast);
          if (needs && typedefs.length === 0) {
            context.report({ loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, messageId: 'generalMissing' });
          }
        }
      }
    };
  }
};

/**
 * プラグインエクスポート
 */
export const typedefPlugin = {
  rules: {
    'require-options-typedef': ruleRequireOptionsTypedef,
  },
};

/* 終端 */