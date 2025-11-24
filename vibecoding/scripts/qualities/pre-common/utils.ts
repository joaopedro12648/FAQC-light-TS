/**
 * @file PRE-COMMON 補助ユーティリティ（入出力・走査・整形）
 * - 目的: 自動チェックで使用する基本的な I/O とフォーマッタを提供
 * - 入出力: ファイルの読み書き、ディレクトリ走査、コマンド実行
 * - 設計: 副作用を限定し、例外は捕捉して警告ログを出す
 * - 整形: ASCII セーフ整形と長文の切り詰めを提供
 * - 安全: 読み取り不能・削除不能などの局所失敗は致命にしない
 * - 依存: Node.js の fs/path/child_process API
 * - 適用: PRE-COMMON 自動化スクリプトからのみ利用される前提
 * - 検証: 単体で実行可能（副作用はローカルファイルのみ）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FORMAT_CAP = 8000;
const ASCII_PRINTABLE_MIN = 32;
const ASCII_PRINTABLE_MAX = 126;

/**
 * ファイルが存在する場合のみ読み込み、存在しない/読み取り不能なら null を返す。
 * @param filePath 対象パス
 * @returns 文字列または null
 */
export function readFileIfExists(filePath: string): string | null {
  // 例外を境界で吸収して利用側に null を返し、フローを中断させない
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    // 読み取り不能は致命ではないため警告のみで継続する
    process.stderr.write(`[pre-common-auto-check] warn: readFileIfExists failed; treat as not existing :: ${filePath}\n`);
    return null;
  }
}

/**
 * ディレクトリを作成してからファイルを書き込む。
 * @param filePath 出力先パス
 * @param content 書き込む内容
 */
export function writeFileEnsured(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * 現在時刻を ISO UTC 文字列で返す。
 * @returns {string} ISO UTC 文字列
 */
export function toIsoUtcNow(): string {
  return new Date().toISOString();
}

/**
 * ログ出力用にパス区切りを POSIX へ正規化する。
 * @param p 入力パス
 * @returns 正規化後のパス
 */
export function normalizePathForOutput(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * ディレクトリ配下のファイルを深さ優先で列挙する。
 * @param dir 起点ディレクトリ
 * @returns ファイルパス配列
 */
export function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // 深さ優先でディレクトリを辿り、ファイル一覧を構築する
  while (stack.length > 0) {
    const current = stack.pop();
    // 取り出し失敗時は探索を停止して整合を保つ
    if (!current) break;
    let entries: fs.Dirent[] | undefined;
    // エントリの読み取りに失敗しても走査全体は継続する
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      // 読み取り不能ディレクトリは警告の上スキップし、探索を継続する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[pre-common-auto-check] warn: listFilesRecursive skipped unreadable directory :: ${current} :: ${msg}\n`);
      continue;
    }

    // ディレクトリはスタックへ、ファイルは結果へ追加する
    for (const e of entries) {
      const full = path.join(current, e.name);
      // 後で探索するためディレクトリを積む
      if (e.isDirectory()) {
        // 子ディレクトリを次の探索対象として積む
        stack.push(full);
      // ファイルは結果配列に加える
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * 外部コマンドを同期実行して結果を返す。
 * @param command コマンド
 * @param args 引数
 * @param cwd 作業ディレクトリ
 * @returns status/stdout/stderr
 */
export function runCommand(command: string, args: string[], cwd?: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(command, args, { encoding: 'utf8', shell: true, cwd });
  const status = typeof res.status === 'number' ? res.status : 1;
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  return { status, stdout, stderr };
}

/**
 * 長い文字列を上限長で切り詰める。
 * @param s 入力文字列
 * @param cap 上限
 * @returns 切り詰め済み文字列
 */
export function formatCap(s: string, cap = DEFAULT_FORMAT_CAP): string {
  // 空文字のときは切り詰め不要のためそのまま返す
  if (!s) return '';
  // 上限以下であれば省略記号を付けずに返す
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}\n... (truncated)\n`;
}

/**
 * ログの安全性のために非 ASCII を置換する。
 * @param s 入力文字列
 * @returns ASCII セーフな文字列
 */
export function toAsciiPrintable(s: string): string {
  const replaced = s
    .replace(/[✓✔✅]/g, '[OK]')
    .replace(/[✗❌]/g, '[NG]');
  let out = '';
  // 各文字を走査し、許容外の文字を置換する
  for (const ch of replaced) {
    const code = ch.codePointAt(0);
    // 印字可能な ASCII と改行・復帰・タブのみを許可する
    if (code !== undefined && ((code >= ASCII_PRINTABLE_MIN && code <= ASCII_PRINTABLE_MAX) || ch === '\n' || ch === '\r' || ch === '\t')) {
      // 許可対象はそのまま出力へ追加する
      out += ch;
    } else {
      // 非許可文字は '?' に置換してログの可搬性を保つ
      out += '?';
    }
  }

  return out;
}

