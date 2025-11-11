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
import eslintComments from 'eslint-plugin-eslint-comments';
import jsdoc from 'eslint-plugin-jsdoc';
import { FILES_ALL_CODE, FILES_JS, FILES_TS } from '../_shared/globs.mjs';
import { blockCommentFormattingPlugin } from '../plugins/block-comment-formatting.js';
import { headerPlugin } from '../plugins/header-bullets-min.js';
import { branchesPlugin } from '../plugins/require-comment-previous-line-for-branches.js';
import { typedefPlugin } from '../plugins/require-options-typedef.js';

/**
 * ドキュメント/コメント規律（JSDoc・ヘッダ・ESLintディレクティブ）に関する設定断片。
 * - JS/TS 全域に JSDoc の基本要件とファイル概要を適用
 * - トップヘッダの構造要件と describe 直前コメントを強制
 * @returns Flat Config 配列
 */
export const documentation = [
  // TS/TSX の基本 JSDoc 要件
  {
    files: FILES_ALL_CODE,
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
            // 全域適用: すべての enum メンバーに JSDoc を要求
            'TSEnumDeclaration > TSEnumMember'
          ]
        }
      ],
      // JSDoc 整形の厳格化（途切れ/ズレを検出）
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/require-param': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-file-overview': 'error'
    },
    settings: { jsdoc: { mode: 'typescript' } }
  },

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
      'blockfmt/block-comment-formatting': 'error',
      'blockfmt/no-empty-comment': 'error'
    }
  },
  // 分岐/ループ直前コメント必須（ロケール整合: ja 系では非ASCIIを要求）
  {
    // リポジトリ全体へ適用（IGNORES は eslint.config の IGNORES に準拠）
    files: FILES_ALL_CODE,
    plugins: { branches: branchesPlugin },
    rules: {
      // requireTagPattern は実行環境のロケールに同期（--locale > CHECK_LOCALE > OS）
      'branches/require-comment-previous-line-for-branches': [
        'error',
        {
          allowBlankLine: false,
          ignoreElseIf: true,
          ignoreCatch: true,
          // ja 系なら少なくとも1文字の非ASCIIを要求。それ以外は未設定（無効化）が望ましいが、ここでは動的に切替。
          requireTagPattern: (() => {
            const envLocale = (process.env.CHECK_LOCALE || '').trim();
            const lang = (envLocale || Intl.DateTimeFormat().resolvedOptions().locale || '').split(/[-_]/)[0] || '';
            return lang.toLowerCase() === 'ja' ? '[^\\x00-\\x7F]' : '';
          })()
        }
      ]
    }
  },
  // ESLint ディレクティブコメントの説明必須・過剰抑止禁止
  {
    files: FILES_ALL_CODE,
    plugins: { 'eslint-comments': eslintComments },
    rules: {
      'eslint-comments/require-description': 'error',
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/no-unlimited-disable': 'error'
    }
  }
  ,
  // describe コメント必須（グローバル適用、ルール内で describe のみ対象）
  {
    files: FILES_ALL_CODE,
    plugins: { blockfmt: blockCommentFormattingPlugin },
    rules: { 'blockfmt/require-describe-comment': 'error' }
  },
  // プロダクトコードのトップレベル const に JSDoc を要求（src/** のみ）
  {
    files: FILES_ALL_CODE,
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
            // エクスポートされた const（JSDoc は export 文の直上に付与する）
            'ExportNamedDeclaration[declaration.type="VariableDeclaration"]'
          ]
        }
      ]
    },
    settings: { jsdoc: { mode: 'typescript' } }
  }
  ,
  // リポジトリ全体に Options typedef を適用（一般 JS/MJS 対象、グローバル ignores は eslint.config.mjs の IGNORES に従う）
  {
    files: FILES_JS,
    plugins: { typedef: typedefPlugin },
    rules: {
      'typedef/require-options-typedef': ['error', { generalJsMode: 'error' }]
    }
  }
  ,
  // JS ローカルプラグインに Options typedef を要求（meta.schema.properties を包含）
  {
    files: ['qualities/eslint/plugins/**/*.js'],
    plugins: { typedef: typedefPlugin },
    rules: {
      'typedef/require-options-typedef': ['error', { generalJsMode: 'off' }]
    }
  }
];

