/**
 * @file テンポラリ作業ディレクトリとファイルユーティリティ
 * 備考: 特記事項なし
 * - 各テスト専用の一時ディレクトリを作成/削除する
 * - 最小限の API で読み書きに集中し、分散を避ける
 * - Windows/CI でのパス差異を吸収し、常に path.join を使用する
 * - 後始末（cleanup）を徹底しリークを防止する
 * - 生成するファイルは UTF-8 で保存する
 * - 例外時も安全に呼び出し側へ制御を返す
 * - 高頻度操作は同期 API で単純化し信頼性を優先する
 * - エラーは呼び出し側で扱えるよう抑制しない
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 一時ディレクトリを作成してパスを返す
 * @param {string} [prefix] ディレクトリ名の接頭辞
 * @returns {string} 作成したディレクトリの絶対パス
 */
export function createTmpDir(prefix = 'vc-tests-'): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

/**
 * ディレクトリを再帰的に作成
 * @param {string} dir 対象ディレクトリ
 * @returns {void}。
 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * テキストファイルを書き込む（UTF-8）
 * @param {string} fp ファイルパス
 * @param {string} content 内容
 * @returns {void}。
 */
export function writeTextFile(fp: string, content: string): void {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, content, { encoding: 'utf8' });
}

/**
 * ファイルをコピー（上書き）
 * @param {string} src 参照元
 * @param {string} dest 出力先
 * @returns {void}。
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * ディレクトリを再帰削除（存在しなくても成功扱い）
 * @param {string} dir 対象ディレクトリ
 * @returns {void}。
 */
export function cleanupDir(dir: string): void {
  // 後始末失敗を局所化しテスト全体の継続性を確保する
  try {
    // 深い削除
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // 後始末失敗はテスト継続のため握り潰し、CI 安定性を優先する
    /* 削除失敗はテスト継続のため無視する（副作用の漏れはない） */
    // noop（CI の一時的失敗を許容）
  }
}

