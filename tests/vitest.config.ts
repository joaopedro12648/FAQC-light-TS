/**
 * @file Vitest 設定（ESM）
 * - 目的: テスト実行環境の共通設定を定義する
 * - 適用: tests/** 配下の .test.ts を対象とする
 * - 実行: vitest run --config tests/vitest.config.ts
 * - 規範: Node 環境での単体テストを基本とする
 * - 前提: 本プロジェクトでは UI ビルドはゲート外（build 実行は省略）
 * - 例外: 設定ファイルは default export を許容（テスト用オーバーライド）
 * - 入力: テストファイル（tests 配下の *.test.ts）
 * - 出力: テスト結果（標準出力）
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*/*.test.ts'],
    environment: 'node',
  },
});

