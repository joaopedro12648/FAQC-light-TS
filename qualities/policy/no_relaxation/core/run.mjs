#!/usr/bin/env node
/**
 * @file 緩和禁止ポリシーのランナー（core ユニット実体）
 * 備考: qualities/policy/no_relaxation/core/** を core ユニットの代表ディレクトリとし、本ファイルに実装ロジックを集約する
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */
/**
 * ポリシー: リポジトリ全体の TS/** における品質ゲート緩和を禁止
 * 概要: `eslint-disable` や TS の無効化プラグマを検出する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const TS_EXT_RX = /\.(ts|tsx|mts|cts)$/i;
/**
 * SoT に基づく除外ディレクトリ名集合を生成（末端ディレクトリ名へ正規化）
 * no_relaxation は tests 系を追加で除外する
 */
const SKIP_DIR_NAMES = (() => {
  const names = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/').pop())
      .filter(Boolean)
  );
  names.add('tests');
  names.add('_tests');
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
    // 配下のエントリ一覧を取得して探索を継続する
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      // 読み取り失敗は当該ノードのみ除外し走査を続行するが、スキップしたパスと理由を標準エラーへ記録する
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_relaxation] warn: skip unreadable directory while walking :: ${path.relative(PROJECT_ROOT, d)} :: ${msg}\n`,
      );
      continue;
    }

    // エントリを順に評価し、対象のみを次段処理へ回す
    for (const e of entries) {
      const full = path.join(d, e.name);
      // ディレクトリに遭遇したら子要素の探索を続行する
      if (e.isDirectory()) {
        // 除外対象のディレクトリは走査から外す
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        // 次の探索対象としてスタックへ積む
        stack.push(full);
      } else if (e.isFile()) {
        // 対象ファイルを結果集合へ追加する
        files.push(full);
      }
    }
  }

  return files;
}

const patterns = [
  /\/\*\s*eslint-disable[^*]*\*\//i,
  /\/\/\s*eslint-disable[^\n]*/i,
  /@ts-ignore\b/i,
  /@ts-nocheck\b/i
];

/**
 * ファイルを走査して緩和ディレクティブの出現箇所を収集する。
 * @param {string} fp 走査対象ファイルのパス
 * @returns {Array<{line:number,text:string}>} ヒット行の配列
 */
function scanFile(fp) {
  let content = '';
  // ファイル本文を読み込み緩和ディレクティブの出現を解析する
  try {
    content = fs.readFileSync(fp, 'utf8');
  } catch (e) {
    // 読み取り失敗は検査対象から除外して空配列を返すが、スキップ理由を標準エラーへ記録する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `[policy:no_relaxation] warn: skip unreadable file while scanning :: ${path.relative(PROJECT_ROOT, fp)} :: ${msg}\n`,
    );
    return [];
  }

  const hits = [];
  // 禁止ディレクティブのパターン集合を走査して一致した行位置を収集する
  for (const rx of patterns) {
    // 対象パターンがファイル全体に含まれる場合のみ行単位で精査する
    if (rx.test(content)) {
      const lines = content.split(/\r?\n/g);
      // 各行を検査して一致箇所を収集する
      lines.forEach((line, i) => {
        // 該当ディレクティブの一致行を検出し、行番号付きのヒットとして記録する
        // この節に新たな条件を付与することは禁止する
        if (rx.test(line)) hits.push({ line: i + 1, text: line.trim() });
      });
    }
  }

  return hits;
}

/**
 * エントリポイント。
 * ルート配下の TS 系ファイルを全走査し、緩和ディレクティブの有無を検査する。
 */
function main() {
  const violations = [];
  const files = listFilesRecursive(PROJECT_ROOT).filter((f) => TS_EXT_RX.test(f));
  // 対象ファイルを順に検査して緩和ディレクティブの出現を収集する
  for (const fp of files) {
    const hits = scanFile(fp);
    // ヒットが存在するファイルのみ違反として記録する
    if (hits.length > 0) {
      violations.push({ file: path.relative(PROJECT_ROOT, fp), hits });
    }
  }

  // 違反が無ければ正常終了としてメッセージを出力する
  if (violations.length === 0) {
    process.stdout.write('[policy:no_relaxation] OK: no relaxations found in TS/**\n');
    process.exit(0);
  }

  process.stderr.write('[policy:no_relaxation] NG: relaxations found in TS/**\n');
  // 違反ファイルと該当行を列挙して改善箇所を提示する
  for (const v of violations) {
    // 各ファイル内のヒット行を順に表示する
    for (const h of v.hits) {
      process.stderr.write(`${v.file}:${h.line}: ${h.text}\n`);
    }
  }

  process.exit(1);
}

// エントリポイント: 実行時の想定外例外を捕捉し異常終了コードを返す
try {
  main();
} catch (e) {
  // 実行時の致命的例外はメッセージを出力して異常終了とする
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  process.stderr.write(`[policy:no_relaxation] fatal: ${msg}\n`);
  process.exit(2);
}

