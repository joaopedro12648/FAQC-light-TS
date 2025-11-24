/**
 * @file PRE-COMMON 補助: ファイル走査と引数処理ユーティリティ
 * - 目的: context.md 生成系スクリプトの共通ヘルパ
 * - 入出力: パス配列とPOSIX化、include引数解釈
 * - 方針: 例外は握り潰さず、読み取り不能は警告の上で継続
 * - 設計: 純粋関数を基本とし、副作用は最小限に限定
 * - 環境: Node.js の fs/path API に依存
 * - コメント: 日本語・意図説明、ASCIIのみの行は避ける
 * - 品質: ヘッダ箇条書きは8行以上（チェック用）
 * - 受入: ログ出力と戻り値の一貫性を維持し、失敗時も安定動作
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * ディレクトリ以下の全ファイルパスを再帰的に列挙する
 * @param dir 起点ディレクトリ
 * @returns ファイルパス配列（絶対/結合済み）
 */
export function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // 深さ優先で未訪問ディレクトリを辿る
  while (stack.length) {
    const cur = stack.pop();
    // 取り出し失敗時は安全に抜ける
    if (!cur) break;
    let entries: fs.Dirent[] | undefined;
    // ディレクトリの内容を読み取り、失敗時は当該ディレクトリのみスキップする
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) {
      // 読み取り不能の理由を短く記録する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[context-md-rubric] warn: skip unreadable directory while listing :: ${cur} :: ${msg}\n`);
      continue;
    }

    // ディレクトリはスタックへ、ファイルは結果へ追加する
    for (const e of entries) {
      const full = path.join(cur, e.name);
      // 子ディレクトリは後段の探索対象として積む（深さ優先）
      if (e.isDirectory()) {
        // 次回 tick で探索できるように積む
        stack.push(full);
      // 通常ファイルのみ列挙対象にする
      } else if (e.isFile()) {
        // 対象ファイルを結果配列へ追加する（順次処理）
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * バックスラッシュをスラッシュへ置換してPOSIXパスへ正規化する
 * @param p 入力パス
 * @returns POSIX 形式のパス
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 簡易glob文字列から正規表現を生成する（**,* に対応）
 * @param glob グロブ文字列
 * @returns 生成された正規表現
 */
export function globToRegex(glob: string): RegExp {
  const posix = toPosix(glob.trim());
  const doubled = posix.replace(/\*\*/g, '§DOUBLESTAR§');
  const escaped = doubled.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withSingles = escaped.replace(/\*/g, '[^/]*');
  const finalBody = withSingles.replace(/§DOUBLESTAR§/g, '.*');
  return new RegExp(`^${finalBody}$`, 'i');
}

/**
 * --include 引数を解釈して context.md のPOSIXパス配列を返す
 * @param argv 引数配列
 * @returns POSIX 化した include パターン配列
 */
export function parseIncludeArgs(argv: string[]): string[] {
  const out: string[] = [];
  // 位置/値形式の include 指定を順に解析する
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    // 値直付け形式の --include を処理する
    if (a.startsWith('--include=')) {
      const body = a.slice('--include='.length).trim();
      // 空でなければカンマ区切りで分解して取り込む
      if (body) out.push(...body.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }

    // 値を次引数で受ける --include を処理する
    if (a === '--include') {
      const nxt = argv[i + 1] ?? '';
      // 次引数が値なら取り込んでスキップする
      if (nxt && !nxt.startsWith('-')) {
        out.push(...nxt.split(',').map((s) => s.trim()).filter(Boolean));
        i += 1;
      }

      continue;
    }

    // オプションでない裸引数は include と見なす
    if (!a.startsWith('-')) {
      out.push(...a.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }

  return out.map((raw) => {
    let p = raw;
    // qualities/ から var/contexts へのエイリアス展開
    if (/^qualities\//i.test(p)) {
      p = p.replace(/^qualities\//i, 'vibecoding/var/contexts/qualities/');
    }

    // ディレクトリ指定は配下の context.md を対象化する
    if (p.endsWith('/')) return `${p}**/context.md`;
    // すでに context.md の場合はそのまま返す
    if (/\/context\.md$/i.test(p)) return p;
    // 拡張子もワイルドカードも無い場合は context.md を補う
    if (!/\*/.test(p) && !/\.md$/i.test(p)) return `${p}/context.md`;
    return p;
  });
}

