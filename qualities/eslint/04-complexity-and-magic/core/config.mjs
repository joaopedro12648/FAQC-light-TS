/**
 * @file ESLint セクション: 複雑度・可読性・マジックナンバー
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import tseslint from '@typescript-eslint/eslint-plugin';
import { FILES_ALL_CODE, FILES_TS } from '../../_shared/core/globs.mjs';

/**
 * 複雑度・可読性・マジックナンバーに関する設定断片。
 * - 関数長やネストの上限、空行規律などを全域で適用する
 * @returns Flat Config 配列
 */
export const complexityAndMagic = [
  // 複雑度・サイズ・ネストのガード（JS/TS 共通）
  {
    files: FILES_ALL_CODE,
    rules: {
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 80, skipComments: true, skipBlankLines: true }],
      'max-nested-callbacks': ['error', 3],
      // Indentation / tabs-spaces hygiene
      indent: ['error', 2, { SwitchCase: 1 }],
      'no-mixed-spaces-and-tabs': 'error',
      // Readable Code（一般則）
      'no-nested-ternary': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-useless-return': 'error',
      'no-useless-constructor': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
      'dot-notation': 'error',
      'logical-assignment-operators': ['error', 'always', { enforceForIfStatements: true }],
      'grouped-accessor-pairs': ['error', 'getBeforeSet'],
      // Spacing / Empty lines（読みやすさの統一）
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: ['function', 'block-like'], next: '*' }
      ],
      'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 1, maxEOF: 1 }]
    }
  },

  // リポジトリ全域のマジックナンバー規制（TS系）
  {
    files: FILES_TS,
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          detectObjects: true,
          enforceConst: true
        }
      ]
    }
  },

  // 定数定義の例外を廃止（統一基準を適用）
];

