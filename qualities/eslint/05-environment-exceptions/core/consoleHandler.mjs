/**
 * @file consoleHandler ディレクティブ検証（環境例外: console 使用の厳格運用）
 * 備考: 特記事項なし
 * - 先頭JSDocに consoleHandler タグを付与したファイルのみ console.warn/error を許可する
 * - リポジトリ全体で consoleHandler タグは1ファイルのみ（重複はエラー）
 * - no-console は warn/error を許容し log/info 等は従来通り禁止とする
 * - タグ未設定での warn/error 使用は本ルールでエラーとして検出する
 * - 解析は AST ベースで行い MemberExpression(console.warn/error) を対象とする
 * - ファイルレベル JSDoc（最初の Block コメント, startsWith('*')）のみをタグ検出対象とする
 * - 実装は Flat Config/Esm を前提に副作用を最小化し可読性を重視する
 * - ルールメッセージやコメントは本リポのロケール（ja-JP）に合わせる
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251120/SnD-20251120-console-handler-directive.md
 */

// タグ付与ファイル一覧（実行プロセス内の一時状態）
const filesWithConsoleHandlerTag = new Set();

/**
 * @typedef {Object} ConsoleHandlerOptions
 * 本ルールのオプション型。許可するメソッドを明示的に指定できます。
 * @property {Array<'warn'|'error'>} [allowMethods] 許可する console メソッド（既定: ['warn','error']）
 */

/**
 * 先頭のファイルレベル JSDoc に @consoleHandler が含まれるかを判定する。
 * @param {import('eslint').Rule.RuleContext} context ルール実行のコンテキスト
 * @returns {boolean} ファイルレベル JSDoc にタグが存在する場合は true
 */
function hasConsoleHandlerTag(context) {
  const source = context.getSourceCode();
  const firstBlock = source
    .getAllComments()
    .find((c) => c.type === 'Block' && typeof c.value === 'string' && c.value.trimStart().startsWith('*'));
  // ファイルレベル JSDoc が無い場合はタグも存在し得ないため早期に終了する
  if (!firstBlock) return false;
  const raw = `/*${firstBlock.value}*/`;
  return /@consoleHandler\b/.test(raw);
}

/**
 * console.* 呼び出しのうち warn/error を検出するユーティリティ。
 * @param {import('estree').CallExpression} node 対象の呼び出し式ノード
 * @returns {'warn'|'error'|null} warn/error のいずれか、該当なしは null
 */
function getConsoleWarnOrError(node) {
  // 複雑度を抑えるため console.* 呼び出しの判定を段階分割する
  if (!isConsoleMemberCall(node)) return null;
  const prop = node.callee.property;
  // 識別子プロパティ以外（計算済み/文字列等）は対象外
  if (!prop || prop.type !== 'Identifier') return null;
  const name = prop.name;
  return name === 'warn' || name === 'error' ? name : null;
}

/**
 * 対象ノードが console.* 形式のメンバー呼び出しかを判定する。
 * @param {import('estree').CallExpression | null | undefined} node 呼び出し式ノード
 * @returns {boolean} console.* 呼び出しであれば true
 */
function isConsoleMemberCall(node) {
  // CallExpression 以外は対象外
  if (!node || node.type !== 'CallExpression') return false;
  // メンバー呼び出し（console.*）以外は対象外
  if (!node.callee || node.callee.type !== 'MemberExpression') return false;
  const obj = node.callee.object;
  // console オブジェクト以外は対象外
  return !!obj && obj.type === 'Identifier' && obj.name === 'console';
}

/**
 * @description @consoleHandler ディレクティブの検証ルール本体。
 * - 役割: ファイルレベル JSDoc のタグ検証と warn/error 使用制御
 * - 一意性: タグの付与は1ファイルのみ（重複はエラー）
 */
export const ruleConsoleHandler = {
  meta: {
    type: 'problem',
    docs: {
      description: '@consoleHandler ディレクティブの検証と使用制御（warn/error のみ対象）',
      category: 'Best Practices'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowMethods: {
            type: 'array',
            items: { enum: ['warn', 'error'] },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      multipleConsoleHandlers:
        'リポジトリ全体で @consoleHandler は1ファイルのみ許可されています。現在 {{count}} ファイルで使用: {{files}}',
      warnOrErrorRequiresTag:
        'console.{{method}} を使用するにはファイル先頭の JSDoc に @consoleHandler を付与してください。'
    }
  },
  create(context) {
    const filename = context.getFilename();
    const tagged = hasConsoleHandlerTag(context);
    const rawOpt = Array.isArray(context.options?.[0]?.allowMethods) ? context.options[0].allowMethods : undefined;
    const allowed = rawOpt && rawOpt.length > 0 ? rawOpt : ['warn', 'error'];

    return {
      Program() {
        // タグがあるファイルを一意性チェックの対象として登録する
        if (tagged) {
          filesWithConsoleHandlerTag.add(filename);
          // 2件目以降の登録時点で一意性違反とみなして報告する
          if (filesWithConsoleHandlerTag.size > 1) {
            const files = Array.from(filesWithConsoleHandlerTag);
            context.report({
              loc: { line: 1, column: 0 },
              messageId: 'multipleConsoleHandlers',
              data: { count: files.length, files: files.join(', ') }
            });
          }
        }
      },
      CallExpression(node) {
        const method = getConsoleWarnOrError(node);
        // warn/error 以外（log/info 等）は本ルールの対象外
        if (!method || !allowed.includes(method)) return;
        // タグの無いファイルでの warn/error 使用は禁止（ディレクティブ付与を促す）
        if (!tagged) {
          context.report({
            node,
            messageId: 'warnOrErrorRequiresTag',
            data: { method }
          });
        }
      }
    };
  }
};

// プラグインエクスポート（Flat Config 用）
/**
 * @fileoverview Flat Config 用コンテナプラグイン
 * - ルールID: env/console-handler
 * - 用途: @consoleHandler ディレクティブの一意性検証と warn/error 使用制御
 */
export const consoleHandlerPlugin = {
  rules: {
    'console-handler': ruleConsoleHandler
  }
};

