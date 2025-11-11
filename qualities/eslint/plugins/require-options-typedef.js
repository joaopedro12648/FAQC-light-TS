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
  // 全コメントを調べ typedef 情報を抽出する
  for (const c of comments) {
    // ブロックコメントのみを解析対象に限定して誤検知を防ぐ
    if (c.type !== 'Block') continue;
    const raw = typeof c.value === 'string' ? c.value : '';
    // JSDoc形式のコメントに限定して@typedef/@property検出の精度を保つ
    if (!raw.startsWith('*')) continue; // JSDoc 風のみ
    const lines = raw.split(/\r?\n/).map((ln) => ln.replace(/^\s*\*?\s?/, ''));
    // @typedef {Object} NameOptions
    const tdIdx = lines.findIndex((ln) => /@typedef\s+\{Object\}\s+\S+Options\b/.test(ln));
    // typedef 宣言が無い場合は以降の解析を打ち切って無駄を避ける
    if (tdIdx === -1) continue;
    const m = lines[tdIdx].match(/@typedef\s+\{Object\}\s+(\S+Options)\b/);
    // 正規表現で名前が取得できない異常ケースはスキップする
    if (!m) continue;
    const name = m[1];
    const properties = new Set();
    // @property 行からプロパティ名を収集する
    for (const ln of lines.slice(tdIdx + 1)) {
      const pm = ln.match(/@property\s+\{[^}]+\}\s+\[?(\w+)/);
      // @property が検出された行のみを対象に集合へ登録する
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
  // エクスポート変数宣言を走査し schema 情報を探索する
  for (const d of getExportedVariableDeclarators(ast)) {
    const keys = extractSchemaKeysFromInit(d.init);
    // 最初に検出した schema.properties を採用して不要な探索を避ける
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
  // 該当プロパティが存在しない/型不一致のときは安全に打ち切る
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
  // 配列でない/空配列の場合は解析不能として終了する
  if (!prop || prop.type !== 'Property') return null;
  const arr = prop.value;
  // 最初の要素が存在しないケースを除外して堅牢性を高める
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
  // properties オブジェクトが未検出の場合は空集合を返して後段を単純化する
  if (!props) return out;

  // schema.properties のキーを列挙して集合化する
  for (const p of props.properties) {
    // Property ノードのみを対象にする
    if (p && p.type === 'Property') {
      // Identifier キーを集合へ追加する
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
  // 期待構造ではない初期化子は早期に除外して安全に探索する
  if (!init || init.type !== 'ObjectExpression') return null;
  const metaObj = getObjectPropertyObjectValue(init, 'meta');
  // meta セクションが無い場合は探索を終了して想定外構造への誤解析を防ぐ
  if (!metaObj) return null;
  const firstSchemaObj = getFirstArrayElementObject(metaObj, 'schema');
  // schema 配列の先頭要素が不在のときは打ち切る
  if (!firstSchemaObj) return null;
  const propertiesObj = getObjectPropertyObjectValue(firstSchemaObj, 'properties');
  // properties が無い場合は探索を終了して以降の処理を単純化する
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
  // プログラム直下の宣言からエクスポートされた定数宣言を収集する
  for (const node of program.body) {
    // エクスポートされた変数宣言に限定して解析対象を抽出する
    if (
      node &&
      node.type === 'ExportNamedDeclaration' &&
      node.declaration &&
      node.declaration.type === 'VariableDeclaration'
    ) {
      // 変数宣言の各宣言子を走査して対象を抽出する
      for (const d of node.declaration.declarations || []) {
        // 宣言子が変数宣言である場合のみ収集する
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
    // 関数宣言の第1引数が options 形状かを判定する
    if (decl.type === 'FunctionDeclaration') return isOptionsLike(decl.params || []);
    // 変数宣言を対象に関数式/アロー関数の引数形状を確認する
    if (decl.type === 'VariableDeclaration') {
      // 変数宣言内の関数式/アロー関数の引数形状を確認する
      for (const d of decl.declarations) {
        const init = d.init;
        // 初期化子が無い宣言は除外して無駄な判定を避ける
        if (!init) continue;
        // 関数系初期化子に限定し引数が options 形状なら要求対象とする
        if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
          // 第1引数が options 形状なら typedef を要求対象とする
          if (isOptionsLike(init.params || [])) return true;
        }
      }
    }

    return false;
  }

  // エクスポート宣言のみを対象に走査する
  for (const node of ast.body) {
    // 未定義ノードは安全にスキップする
    if (!node) continue;
    // export 以外を除外し不要な解析を避ける
    if (node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportDefaultDeclaration') continue;
    // 再エクスポート等の宣言不在ケースを除外する
    if (!node.declaration) continue;
    // 該当宣言が options 形状を受ける場合に typedef 要求を有効化する
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
        // ESLint プラグイン実装に対して typedef の厳格な整合性を求める
        // ローカルプラグイン実装では schema.properties と typedef の整合性を厳密検査する
        if (isPluginFile && schemaKeys.size > 0) {
          // typedef が無い場合は即時に不足を報告する
          if (typedefs.length === 0) {
            context.report({ loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, messageId: 'missingTypedef' });
            return;
          }
          // 欠損キーを列挙

          const missing = Array.from(schemaKeys).filter((k) => !typedefProps.has(k));
          // schema キー集合を typedef が包含していない場合に不足を明確化する
          if (missing.length > 0) {
            context.report({
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              messageId: 'propertiesMismatch',
              data: { missing: missing.join(', ') }
            });
          }

          return;
        }

        // 一般 JS に段階導入する際のモードに応じて検査を有効化する
        if (generalMode !== 'off') {
          const needs = requiresOptionsTypedefForGeneralJs(ast);
          // options 形状を受けるが typedef が無い一般 JS に対して報告する
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