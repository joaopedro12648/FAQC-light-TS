/**
 * @file ESLint RuleTester の薄いハーネス
 * 備考: 特記事項なし
 * - ESLint v9 の RuleTester を TypeScript/ESM で扱いやすく包む
 * - 解析器は @typescript-eslint/parser を既定で使用する
 * - ルール単体の検証に特化し、外部設定へ依存しない
 * - ルールの create をそのまま渡せるよう最小限の抽象化に留める
 * - 失敗時のメッセージ比較は ID/文字列の両方に対応する
 * - ハーネス自体はリポジトリの ESLint 設定に影響を与えない
 * - 数値/設定は定数化しマジックナンバーを避ける
 * - テスト専用ユーティリティとして import 境界を明確化する
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/eslint/plugins/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { RuleTester } from 'eslint';

const ECMA_VERSION = 2022;

/**
 * RuleTester（TypeScript 解析）を生成
 * @returns {RuleTester} RuleTester インスタンス
 */
export function createTsRuleTester(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: ECMA_VERSION,
        sourceType: 'module',
      },
    },
  });
}


