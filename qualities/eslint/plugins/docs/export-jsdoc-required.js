/**
 * @file リポジトリ全体の公開 export に JSDoc を必須とするローカル ESLint ルール
 * 備考: docs ユニットの ESLint 設定から使用し、公開 API として利用される export に対して JSDoc の有無を検査する
 * - 対象: `export const` / `export function` / `export class` など、トップレベルの ExportNamedDeclaration
 * - 非対象: 再エクスポート（`export { foo } from '...';`）や型専用 export（TypeScript の `export type` 等）
 * - 目的: qualities/eslint を含むリポジトリ全体の公開 API に対し、責務や引数・戻り値を JSDoc で明示し、後続 SnD/LLM 実装の参照性を高める
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md の JSDoc/コメント方針と本 SnD（export JSDoc global policy）に従う
 * - 受入: リポジトリ全体の公開 export に JSDoc 不足が存在しない状態で `npm run check` を一発緑で通過していること
 * - 設定: includeNames / excludeNames により特定の export 名のみを対象/除外できる
 * - 実装: トップレベル ExportNamedDeclaration を走査し、直前の JSDoc ブロックコメントの有無を静的に検査する
 * - 注意: 必要に応じて includeNames / excludeNames で段階的適用を行い、大量違反を回避する
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251128/SnD-20251128-export-jsdoc-global.md
 */

/**
 * @typedef {Object} ExportJsdocRequiredOptions
 * 公開 export に対する JSDoc 検査の挙動を制御するためのオプション。
 * @property {string[]} [includeNames] 検査対象とする export 名のホワイトリスト（省略時は全て対象）
 * @property {string[]} [excludeNames] 検査から除外する export 名のリスト
 */

/**
 * 直前に JSDoc ブロックコメントが存在するかどうかを判定する。
 * - Block コメントのうち、`/**` で始まるものだけを JSDoc と見なす
 * - 対象ノード直前のコメント列のみを検査し、最も近いものを JSDoc として使用する
 * @param {import('eslint').SourceCode} sourceCode 対象ファイルの SourceCode
 * @param {import('estree').Node} node 対象ノード
 * @returns {boolean} 直前に JSDoc が存在すれば true
 */
function hasJsdocAbove(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  // 直前にコメントが存在しない場合は JSDoc 不足とは判定せずに終了する
  if (!comments || comments.length === 0) return false;
  const last = comments[comments.length - 1];
  // 直前コメントがブロックコメントでない場合は JSDoc と見なさず検査対象外とする
  if (last.type !== 'Block') return false;
  const raw = sourceCode.getText(last);
  return raw.trimStart().startsWith('/**');
}

/**
 * トップレベルの ExportNamedDeclaration かどうかを判定する。
 * - Program 直下にある ExportNamedDeclaration のみを「公開 export」とみなす
 * @param {import('estree').Node} node 判定対象ノード
 * @returns {boolean} トップレベル公開 export であれば true
 */
function isTopLevelExport(node) {
  return (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration != null &&
    node.parent != null &&
    node.parent.type === 'Program'
  );
}

/**
 * 単一の名前付き宣言（function/class）から export 名を抽出する。
 * @param {import('estree').FunctionDeclaration | import('estree').ClassDeclaration} decl 対象宣言
 * @returns {string[]} 抽出した export 名（0 または 1 要素）
 */
function getNamedDeclarationNames(decl) {
  // 識別子名を持たない宣言は公開 export として扱えないため対象外とする
  if (!decl.id || decl.id.type !== 'Identifier') {
    return [];
  }

  return [decl.id.name];
}

/**
 * VariableDeclaration から export 名を抽出する。
 * - `export const a = 1, b = 2;` のような複数宣言にも対応する
 * @param {import('estree').VariableDeclaration} decl 対象宣言
 * @returns {string[]} 抽出した export 名の配列
 */
function getVariableDeclarationNames(decl) {
  const names = [];
  const declarations = Array.isArray(decl.declarations) ? decl.declarations : [];
  // 各宣言から識別子名だけを抽出し、公開 export 名の一覧として扱う
  for (const d of declarations) {
    // 識別子を持たない宣言は公開名を持たないためスキップする
    if (d.id && d.id.type === 'Identifier') {
      names.push(d.id.name);
    }
  }

  return names;
}

/**
 * ExportNamedDeclaration から export 名の配列を抽出する。
 * - function/class/const いずれも識別子名を抽出する
 * - マルチ宣言 `export const a = 1, b = 2;` の場合は全ての識別子名を返す
 * @param {import('estree').ExportNamedDeclaration} node 対象の export 宣言
 * @returns {string[]} 抽出した export 名の配列
 */
function getExportedNames(node) {
  const decl = node.declaration;
  // 宣言を伴わない export 文（再エクスポートなど）は本ルールの対象外とする
  if (!decl) return [];

  // 関数/クラス export は宣言名を 1 件だけ抽出する
  if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
    return getNamedDeclarationNames(decl);
  }

  // const などの変数宣言による export は複数名をまとめて抽出する
  if (decl.type === 'VariableDeclaration') {
    return getVariableDeclarationNames(decl);
  }

  return [];
}

/**
 * オプション（includeNames/excludeNames）に基づき、検査対象とするかどうかを判定する。
 * - excludeNames に含まれる名前が 1 つでもあれば検査対象外
 * - includeNames が指定されている場合は、そのいずれかに一致する名前を持つときのみ対象
 * @param {string[]} names 対象 export 名の配列
 * @param {ExportJsdocRequiredOptions} options ルールオプション
 * @returns {boolean} 検査対象とする場合 true
 */
function shouldCheckExport(names, options) {
  // export 名が取得できない場合は公開 export として扱わず検査をスキップする
  if (!names || names.length === 0) return false;

  const include = Array.isArray(options.includeNames) ? options.includeNames : null;
  const exclude = Array.isArray(options.excludeNames) ? options.excludeNames : null;

  // 除外リストに含まれる export 名がある場合はポリシー対象外として扱う
  if (exclude && names.some((n) => exclude.includes(n))) {
    return false;
  }

  // includeNames が指定されている場合は、少なくとも 1 件が対象名に含まれるものだけを検査する
  if (include && !names.some((n) => include.includes(n))) {
    return false;
  }

  return true;
}

/**
 * 公開 export に対して JSDoc を必須とするルール本体。
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleExportJsdocRequired = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require JSDoc comments for top-level public exports (export const/function/class) across the repository.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          includeNames: {
            type: 'array',
            items: { type: 'string' },
          },
          excludeNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingJsdoc:
        '公開 export には JSDoc を付与してください（概要・引数・戻り値を日本語で記述し、docs コンテキストと SnD のポリシーに整合させてください）。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    /**
     * ルールオプションを読み取るためのローカル変数。
     * @type {ExportJsdocRequiredOptions}
     */
    const options = (context.options && context.options[0]) || {};

    return {
      ExportNamedDeclaration(node) {
        // トップレベル以外の export は公開 API とみなさず、本ルールの対象外とする
        if (!isTopLevelExport(node)) return;

        const names = getExportedNames(node);
        // オプション指定により検査対象から外れる export はスキップする
        if (!shouldCheckExport(names, options)) return;

        // 直前に JSDoc が存在する場合は要件を満たしているため違反としない
        if (hasJsdocAbove(sourceCode, node)) return;

        context.report({
          node,
          messageId: 'missingJsdoc',
        });
      },
    };
  },
};

/** プラグインエクスポート。 */
export const exportJsdocPlugin = {
  rules: {
    'export-jsdoc-required': ruleExportJsdocRequired,
  },
};

