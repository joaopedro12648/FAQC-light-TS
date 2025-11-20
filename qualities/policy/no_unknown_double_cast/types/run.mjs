#!/usr/bin/env node
/**
 * @file 二重キャスト禁止ポリシーのランナー（types ユニット実体）
 * 備考: qualities/policy/no_unknown_double_cast/types/** を types ユニットの代表ディレクトリとし、本ファイルに実装ロジックを集約する
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * @see vibecoding/var/contexts/qualities/types/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['.'];

/**
 * SoT に基づく除外ディレクトリ名集合を生成（末端ディレクトリ名へ正規化）
 * - 二重キャスト検出も SoT IGNORES のみを尊重し、個別除外は行わない
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
 * ディレクトリ以下のファイルを再帰的に列挙する。
 * @param {string} dir 起点ディレクトリ
 * @returns {string[]} 発見したファイルパスの配列
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // スタックが空になるまでディレクトリを深さ優先で走査する
  while (stack.length) {
    const d = stack.pop();
    // 無効値に遭遇した場合は探索を中断する
    if (!d) break;
    let entries;
    // 配下のエントリ一覧を取得して探索キューへ展開する
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      // 読み取り失敗は当該ディレクトリのみ除外して継続するが、パスと理由を標準エラーへ記録する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_unknown_double_cast] warn: skip unreadable directory while walking :: ${path.relative(PROJECT_ROOT, d)} :: ${msg}\n`,
      );
      continue;
    }

    // エントリを順に評価し、対象のみを次段処理へ回す
    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);

      // 除外集合に一致する名前は走査対象に含めず、以降の探索から除外する
      if (e.isDirectory()) {
        // SoT で定義された除外ディレクトリ名に一致する場合は配下の二重キャスト検査を行わず走査から除外する
        if (SKIP_DIR_NAMES.has(base)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }

  return files;
}

const RX = /as\s+unknown\s+as/g;

/**
 * 二重キャスト表現 `as unknown as` のヒット位置を抽出する。
 * @param {string} content ファイル全文
 * @returns {Array<{line:number,snippet:string}>} ヒット行と抜粋の配列
 */
function scan(content) {
  const hits = [];
  let m;
  // ファイル全体を走査し二重キャスト表現の出現位置を抽出する
  while ((m = RX.exec(content)) !== null) {
    const before = content.slice(0, m.index);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    const snippet = content.slice(m.index, m.index + 40).replace(/\s+/g, ' ').trim();
    hits.push({ line, snippet });
    // ゼロ幅一致に伴う無限ループを避けるため検索位置を1文字進める
    if (m.index === RX.lastIndex) RX.lastIndex++;
  }

  return hits;
}

/**
 * エントリポイント。
 * ルート配下の TS 系ファイルを走査し、二重キャストの有無を検査する。
 */
function main() {
  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const files = roots.flatMap(listFilesRecursive).filter((f) => /\.(ts|tsx|mts|cts)$/.test(f));
  const violations = [];
  // 対象ファイルを順に検査し二重キャストの発生を収集する
  for (const fp of files) {
    let content = '';
    // ファイル本文を読み込み二重キャストの有無を解析する
    try {
      content = fs.readFileSync(fp, 'utf8');
    } catch (e) {
      // 読み取り失敗は検査対象から除外して継続するが、対象ファイルと理由を標準エラーへ記録する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_unknown_double_cast] warn: skip unreadable file while scanning :: ${path.relative(PROJECT_ROOT, fp)} :: ${msg}\n`,
      );
      continue;
    }

    const hits = scan(content);
    // 検出結果がある場合のみ違反一覧へ追加して改善対象を明確にする
    if (hits.length) violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
  }

  // 違反が無ければ正常終了としてメッセージを出力する
  if (violations.length === 0) {
    process.stdout.write('[policy:no_unknown_double_cast] OK: no "as unknown as" found\n');
    process.exit(0);
  }

  process.stderr.write('[policy:no_unknown_double_cast] NG: "as unknown as" double cast detected\n');
  // 違反の各ファイルを順に取り出し、検出行の抜粋を詳細出力する
  for (const v of violations) {
    // 各違反ファイル内の該当箇所を列挙して報告する
    for (const h of v.hits) {
      process.stderr.write(`${v.file}:${h.line}: ${h.snippet}\n`);
    }
  }

  process.exit(1);
}

// エントリポイント: 実行時の致命エラーを捕捉して終了コードを明確化する
try {
  main();
} catch (e) {
  // 実行時の致命的例外はメッセージを出力して異常終了とする
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  process.stderr.write(`[policy:no_unknown_double_cast] fatal: ${msg}\n`);
  process.exit(2);
}

