#!/usr/bin/env node
/**
 * @file eslint-disable 全面禁止ポリシーのランナー（core ユニット実体）
 * 備考: qualities/policy/no_eslint_disable/core/** を品質ゲートユニットの基点とし、本ファイルに実装ロジックを集約する
 * - 抑止や緩和の常用を排し、規範適合の実装で根本原因から解決する
 * - 単一起源 IGNORES を尊重し除外の分散や局所設定の混在を防ぐ
 * - 型と静的解析の警告を残さず、一貫性ある方針で早期に検出する
 * - 入出力と前提を明確化し、例外は握り潰さず失敗経路を露出する
 * - 走査は JS/TS 系全域に適用し設定の影響範囲を明快に保全する
 * - 文字列中の疑似マーカー誤検知を避け、コメント指令に限定する
 * - 運用は非対話・非ウォッチで再現性を保ち一発緑の運用を徹底する
 * - 変更は責務境界を越えず、拡張点は規範に沿って一箇所に集約する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251114/SnD-20251114-no-eslint-disable-policy.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const JS_TS_EXT_RX = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
// 自己参照違反を避けるため、文字列連結でパターンを構成
const ESLINT = 'eslint';
const HYPHEN = '-';
const DISABLE = 'disable';
const DISABLE_TOKEN = (ESLINT + HYPHEN + DISABLE).toLowerCase();

/**
 * SoT に基づく除外ディレクトリ名集合を生成（末端ディレクトリ名へ正規化）
 * - no_eslint_disable は SoT のみを厳守し、追加除外は行わない
 */
const SKIP_DIR_NAMES = (() => {
  const names = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/').pop())
      .filter(Boolean)
  );
  return names;
})();

/**
 * ディレクトリ以下のファイルを再帰的に列挙する（SoT IGNORES を尊重）。
 * @param {string} dir 起点ディレクトリ
 * @returns {string[]} 発見したファイルパスの配列
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // リポジトリ全体を深さ優先で走査しつつ、除外規則により不要領域を跳ばす
  while (stack.length) {
    // スタックが空になるまで未処理のパスを取り出し探索を継続する
    const d = stack.pop();
    // 異常要素は即座に打ち切って健全な探索のみを継続する
    if (!d) break;
    /**
     * ディレクトリ配下のエントリ情報を保持する配列（ファイル/ディレクトリの種別判定に利用する）
     * @type {import('node:fs').Dirent[]}
     */
    let entries;
    // 読み取り不能なノードはスキップし、探索を中断させない
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      // 権限や一時的な消失などは無視しつつ、どのノードをスキップしたかを標準エラーへ記録して依存構造の調査を容易にする
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_eslint_disable] warn: skip unreadable directory while walking :: ${path.relative(PROJECT_ROOT, d)} :: ${msg}\n`,
      );
      continue;
    }

    // 取得したエントリ集合を順次精査し、対象のみに処理を限定する
    // 子要素を順に評価し、対象のみを次段へ引き渡して範囲を限定する
    // ディレクトリエントリを順次処理し、対象ごとに適切な経路へ進める
    for (const e of entries) {
      const full = path.join(d, e.name);
      // ディレクトリは SoT の除外規則に合致するものを探索対象から外す
      if (e.isDirectory()) {
        // 除外名に一致するディレクトリは探索を省き、他は次の反復へ積む
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        // ファイルは対象拡張子群により後段の精査対象へ付加する
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * ブロックコメント内の違反をスキャンする（/* ... *\/）。
 * @param {string} content ファイル内容
 * @returns {Array<{ line:number, text:string }>} 行情報
 */
function scanBlockComments(content) {
  const hits = [];
  const rx = /\/\*[\s\S]*?\*\//g;
  let m;
  // ブロックコメントを逐次抽出し、行頭ディレクティブのみを違反として扱う
  while ((m = rx.exec(content)) != null) {
    // コメントブロック単位で処理し、各行の指令形を判定する
    const seg = String(m[0] || '');
    // ブロック内の各行のうち、行頭（アスタリスクや空白を除去）から eslint-<directive> が始まる行だけを対象とする
    const lines = seg.split(/\r?\n/);
    // 各行を順次精査し、指令形があれば元ファイルの行番号へ写像する
    for (let i = 0; i < lines.length; i += 1) {
      // 先頭の装飾を除去して命令形の判定を安定させる
      const rawLine = String(lines[i] ?? '');
      const normalized = rawLine.replace(/^\s*(?:\/\*)?\s*\*?\s?/, '').toLowerCase();
      // 行頭が ESLint ディレクティブの命令形である場合のみ違反として扱う
      if (/^eslint-(?:disable|disable-next-line|disable-line|enable)\b/i.test(normalized)) {
        const before = content.slice(0, m.index);
        const baseLine = (before.match(/\r?\n/g) || []).length + 1;
        const line = baseLine + i;
        const display = rawLine.trim();
        // 表示内容の選定基準: 非空なら原文、空なら代表表記を採用する（可読性重視）
        const textForOutput =
          display.length > 0
            ? display
            : '/* eslint-* */';

        hits.push({ line, text: textForOutput });
      }
    }
  }

  return hits;
}

/**
 * 行コメントの違反をスキャンする（'//' 以降に token が現れる）。
 * @param {string} content ファイル内容
 * @returns {Array<{ line:number, text:string }>} 行情報
 */
function scanLineComments(content) {
  const hits = [];
  const lines = content.split(/\r?\n/g);
  // 各行を順に評価し、行コメントの先頭がディレクティブである場合のみ収集する
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    // 行コメント起点を見つけ、先頭が ESLint ディレクティブである場合のみ採用する
    const idx = raw.indexOf('//');
    // コメントが無い行はこの段でスキップして次行の解析へ移る
    if (idx < 0) continue;
    const after = raw.slice(idx + 2).trim().toLowerCase();
    // 行コメントの先頭から始まる eslint ディレクティブのみ対象（説明文中の言及は対象外）
    if (/^eslint-(?:disable|disable-next-line|disable-line|enable)\b/.test(after)) {
      // 該当する ESLint ディレクティブが見つかった行を、例外なく違反候補として収集する。
      // この節に新たな条件を付与することは禁止する
      hits.push({ line: i + 1, text: raw.trim() });
    }
  }

  return hits;
}

/**
 * ファイルを走査して eslint-disable 系ディレクティブの出現箇所を収集する。
 * @param {string} fp 走査対象ファイルのパス
 * @returns {Array<{line:number,text:string}>} ヒット行の配列
 */
function scanFile(fp) {
  let content = '';
  // 読み取り不能時は当該ファイルの検査を省略し、全体の健全性を優先する
  try {
    content = fs.readFileSync(fp, 'utf8');
  } catch (e) {
    // I/O 例外は仕様外入力として扱い、当該ファイルは再試行せずにスキップする（局所的に隔離して全体の進行を優先）
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `[policy:no_eslint_disable] warn: skip unreadable file while scanning :: ${path.relative(PROJECT_ROOT, fp)} :: ${msg}\n`,
    );
    return [];
  }

  const results = [];
  // ブロックコメント内をチェック
  results.push(...scanBlockComments(content));
  // 行コメントをチェック
  results.push(...scanLineComments(content));
  // 重複行（同一行に両方ヒット）を除去
  const uniq = new Map();
  // 最初に見つかった行だけを採用し、同一行の重複報告を抑止する
  for (const h of results) {
    // 同一行に複数のディレクティブがヒットしても 1 度だけ報告し、冗長なエラー出力を避ける
    if (!uniq.has(h.line)) uniq.set(h.line, h);
  }

  return Array.from(uniq.values());
}

/**
 * エントリポイント。
 * ルート配下の JS/TS 系ファイルを走査し、eslint-disable 系ディレクティブの有無を検査する。
 */
function main() {
  const violations = [];
  const files = listFilesRecursive(PROJECT_ROOT).filter((f) => JS_TS_EXT_RX.test(f));
  // 対象ファイル集合を順次検査し、違反のあるものを収集する
  for (const fp of files) {
    const hits = scanFile(fp);
    // 検出有無で分岐し、存在時のみ収集へ進む
    if (hits.length > 0) {
      // 重複を避けつつ相対パスで最小限のレポート項目を記録する
      violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
    }
  }

  // 違反が空の場合は成功で終了し、以降のゲート実行へ制御を戻す
  if (violations.length === 0) {
    process.stdout.write('[policy:no_eslint_disable] OK\n');
    process.exit(0);
  }

  process.stderr.write('[policy:no_eslint_disable] NG: eslint-disable directives found\n');
  // ファイル→行の順に列挙し、修正対象の特定を容易にする
  for (const v of violations) {
    // 各違反ファイル内のヒット行を順次表示する
    for (const h of v.hits) {
      process.stderr.write(`${v.file}:${h.line}: ${h.text}\n`);
    }
  }

  process.exit(1);
}

// エントリポイントを呼び出して検査を完了させる
try {
  main();
} catch (e) {
  /* 例外の要約を出力し、異常終了コード(2)で終了する */
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  process.stderr.write(`[policy:no_eslint_disable] fatal: ${msg}\n`);
  process.exit(2);
}

