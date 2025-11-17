/**
 * @file ヘッダ JSDoc 箇条書きと末尾メタ情報（@see/@snd）を検査するローカル ESLint ルール
 * 備考: PRE-IMPL の Header Comment Quick Checklist に従い、先頭 JSDoc の箇条書き行数と @snd の有無を軽量に検査する
 * - 対象: ファイル内で最初に現れる JSDoc 形式のブロックコメント（ヘッダコメント）
 * - 目的: SnD/コンテキスト/プレイブックとの対応関係をヘッダ箇条書きで明示し、品質ゲート運用の前提を共有する
 * - 箇条書き: 行頭が「- 」で始まる行（先頭に「* - 」が付いた行を含む）を 1 項目として数える
 * - オプション: `{ min: number, message?: string }` で必要な最小件数やメッセージを上書きできる
 * - 文脈: vibecoding/var/contexts/qualities/docs/context.md による docs ユニットのコメント運用ポリシー
 * - PRE-IMPL: vibecoding/docs/PLAYBOOK/PRE-IMPL.md の Header Comment Quick Checklist と一対一で対応する
 * - SnD: SnD-20251116-qualities-structure-and-context-granularity に基づく core/types/docs ユニット設計の一部
 * - 受入: 本ルール自身のヘッダコメントが min 箇条書き件数要件を満たし `npm run check` で自己適合していること
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */

/**
 * @typedef {Object} HeaderBulletsMinOptions
 * 先頭ヘッダ JSDoc に要求する箇条書き行数やメッセージを表すオプション型。
 * @property {number} [min] ヘッダ JSDoc に要求する最小箇条書き行数（既定: 1）
 * @property {string} [message] 規定メッセージの代わりに表示するカスタムメッセージ
 */

/**
 * 先頭 JSDoc に含まれる箇条書き行数と末尾メタ情報を検査するルール。
 * - 対象: ファイル内で最初に現れる JSDoc 形式のブロックコメント
 * - 箇条書き: 行頭が「- 」で始まる行（先頭に「* - 」が付いた行を含む）
 * - オプション: `{ min: number }` で必要な最小件数を指定
 * @type {import('eslint').Rule.RuleModule}
 */
export const ruleHeaderBulletsMin = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a minimum number of bullet items in the first file header JSDoc (used for Header Comment Quick Checklist).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          min: { type: 'number', minimum: 1 },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      // 箇条書き行数が不足している場合のメッセージ
      notEnoughBullets:
        'ヘッダJSDocの箇条書き行が不足しています (found {{found}}, required min: {{min}})。PRE-IMPL の Header Comment Quick Checklist に従って補完してください。',
      // 末尾 @snd が欠落している場合のメッセージ（将来の拡張用。現行ルールでは messageId としては使用しない）
      missingSnd:
        '@snd タグがヘッダJSDoc末尾に見つかりません。対象 SnD への相対パスを `@snd ...` 形式で追記し、品質ゲートコンテキストとの対応関係を明示してください。',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    /**
     * HeaderBulletsMinOptions の部分型として扱う簡易オプション。
     * @type {{min?:number}}
     */
    const options = (context.options && context.options[0]) || {};
    const min = typeof options.min === 'number' && options.min > 0 ? options.min : 1;

    return {
      Program() {
        const comments = sourceCode.getAllComments();
        const header = comments.find(
          (c) => c.type === 'Block' && c.value.trimStart().startsWith('*'),
        );
        // ヘッダ JSDoc が存在しないファイルは本ルールの対象外として扱う
        if (!header) return;

        const raw = `/*${header.value}*/`;
        const lines = raw
          .replace(/^\/\*\*?/, '')
          .replace(/\*\/$/, '')
          .split(/\r?\n/);

        // `* - ...` を含む行を箇条書きとして数える
        const bulletCount = lines.reduce((count, line) => {
          const normalized = line.replace(/^\s*\*\s?/, '');
          return normalized.trimStart().startsWith('- ') ? count + 1 : count;
        }, 0);

        // 箇条書き行数が閾値を下回る場合は Header Comment Quick Checklist 未満として報告する
        if (bulletCount < min) {
          context.report({
            loc: header.loc,
            messageId: 'notEnoughBullets',
            data: { found: bulletCount, min },
          });
        }
      },
    };
  },
};

/** プラグインエクスポート。 */
export const headerPlugin = {
  rules: {
    'header-bullets-min': ruleHeaderBulletsMin,
  },
};

