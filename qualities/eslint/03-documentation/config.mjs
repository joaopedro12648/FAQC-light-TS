/**
 * @file ESLint セクション: ドキュメンテーションとファイル衛生
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
import jsdoc from 'eslint-plugin-jsdoc';
import { FILES_TS, FILES_ALL_CODE } from '../_shared/globs.mjs';
import { headerPlugin } from '../plugins/header-bullets-min.js';
import { blockCommentFormattingPlugin } from '../plugins/block-comment-formatting.js';

export const documentation = [
  // TS/TSX の基本 JSDoc 要件
  {
    files: FILES_TS,
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false
          },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration']
        }
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-file-overview': 'error'
    },
    settings: { jsdoc: { mode: 'typescript' } }
  },

  // リポジトリ全域の export 強化（オブジェクトプロパティ/enum メンバなど）
  {
    files: FILES_TS,
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false
          },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'ExportNamedDeclaration',
            'ExportDefaultDeclaration',
            'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression > Property',
            'ExportDefaultDeclaration > VariableDeclaration > VariableDeclarator > ObjectExpression > Property',
            'ExportNamedDeclaration > TSEnumDeclaration > TSEnumMember',
            'ExportDefaultDeclaration > TSEnumDeclaration > TSEnumMember'
          ]
        }
      ]
    }
  }
  ,
  // ファイル先頭JSDocの箇条書き（Header Checklist）を最低件数で強制
  {
    files: FILES_ALL_CODE,
    plugins: { header: headerPlugin },
    rules: {
      'header/header-bullets-min': [
        'error',
        {
          min: 8,
          message:
            'Header checklist is missing or too short (min: 8 bullet items). Refer to the Quality Gate Context and update the file header comment according to PRE-IMPL.md.'
        }
      ]
    }
  },
  // ブロックコメントの先頭行に本文を置かない（複数行JSDoc対象）
  {
    files: FILES_ALL_CODE,
    plugins: { blockfmt: blockCommentFormattingPlugin },
    rules: {
      'blockfmt/block-comment-formatting': 'error'
    }
  }
];


