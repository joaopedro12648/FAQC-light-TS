/**
 * @file PRE-COMMON レビュー衝突検出とガイダンス出力
 * - 目的: context.md と context-review.md の整合を検査し、統合手順を案内
 * - 検出: 隣接する review を見つけて衝突として扱う
 * - ガイダンス: 統合手順を明示して exit=2 で通知
 * - 依存: var/contexts のミラーが前提
 * - 設計: 走査は副作用なし、通知のみを行う
 * - 安全: 読み取り不能ディレクトリはスキップして継続
 * - 表記: ログ出力は repo 相対の POSIX パス
 * - 出力: 衝突時は統合ガイダンスを標準出力に提示
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizePathForOutput } from './utils.ts';

/**
 * var/contexts/qualities/** 配下で context.md と隣接する context-review.md の組を収集する。
 * @param outputBase var 側のベースディレクトリ
 * @returns ファイルペアの配列
 */
export function findContextReviewPairs(outputBase: string): Array<{ contextMd: string; reviewMd: string }> {
  // 出力ベースが存在しない場合は衝突対象なし
  if (!fs.existsSync(outputBase)) return [];
  const files = listFilesRecursive(outputBase);
  const contextMds = files.filter((f) => path.basename(f) === 'context.md');
  const pairs: Array<{ contextMd: string; reviewMd: string }> = [];
  // 各 context.md の隣に review があれば対として収集する
  for (const contextMd of contextMds) {
    const reviewMd = path.join(path.dirname(contextMd), 'context-review.md');
    // 隣接する review が存在するときのみ収集する
    if (fs.existsSync(reviewMd)) {
      pairs.push({ contextMd, reviewMd });
    }
  }

  return pairs;
}

/**
 * レビュー衝突の統合ガイダンスを標準出力へ整形して出力する。
 * @param repoRoot リポジトリのルート
 * @param pairs 衝突しているファイルペア
 */
export function emitReviewConflictMessages(repoRoot: string, pairs: Array<{ contextMd: string; reviewMd: string }>): void {
  // ペアごとに統合手順をガイダンスとして出力する
  for (const { contextMd, reviewMd } of pairs) {
    const ctx = normalizePathForOutput(path.relative(repoRoot, contextMd));
    const rev = normalizePathForOutput(path.relative(repoRoot, reviewMd));
    const msg = [
      `A review file exists for the quality gate context file ${ctx}.`,
      `Review file: ${rev}.`,
      '',
      `[Required action per .cursorrules: "quality gate context update"]`,
      `- Do NOT create an "incorporate" section or paste the review verbatim.`,
      `- Scope: This review applies ONLY to its sibling context file (${ctx}). Do not use it to update any other context.md in other directories.`,
      `- Read and digest the review, then update ${ctx} itself by:`,
      `  - refining rules/thresholds and scope,`,
      `  - adding OK/NG minimal examples, decisions, and anti-patterns,`,
      `  - refreshing citations to qualities/** (relative path + excerpt/value) to match current settings,`,
      `  - integrating into existing sections (Where/What/How/Rubric); keep ${ctx} canonical.`,
      `- After integrating, delete ${rev} and re-run: npm run -s check:pre-common.`,
      `  (It will keep failing with exit=2 while any context-review.md exists. Success prints "<StartAt> <hash>" with exit=0.)`,
      `- No relaxations or bypasses (see "no_relaxation" policy). This failure enforces synthesis, not copy-paste.`
    ].join('\n');
    process.stdout.write(`${msg}\n`);
  }
}

/**
 * PRE-COMMON の実行前提が満たされた場合にのみ、レビュー衝突を検出して exit=2 を返す。
 * @param repoRoot ルートディレクトリ
 * @param outputBase var 側ベース
 * @param mappings 生成・更新対象の対応表
 * @param rubricViolation ルーブリック違反の有無
 */
export function handleReviewConflicts(repoRoot: string, outputBase: string, mappings: Array<{ srcDir: string; destDir: string }>, rubricViolation: boolean): void {
  // 再生成対象がある・rubric 違反がある場合はレビュー衝突チェックをスキップする
  if (mappings.length !== 0 || rubricViolation) {
    return;
  }

  const reviewPairs = findContextReviewPairs(outputBase);
  // レビュー衝突があれば統合手順を出力して exit=2 とする
  if (reviewPairs.length > 0) {
    emitReviewConflictMessages(repoRoot, reviewPairs);
    process.exit(2);
  }
}

/**
 * ディレクトリ配下のファイルを再帰的に列挙する。
 * @param dir 走査起点
 * @returns ファイルパスの配列
 */
function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // ディレクトリを深さ優先で辿り、構造の全体像を把握するために反復処理を行う
  while (stack.length) {
    const cur = stack.pop();
    // 取り出し失敗時は安全に抜けて走査を継続する
    if (!cur) break;
    let entries: fs.Dirent[] | undefined;
    // I/O 境界の例外はここで吸収し、走査を中断させない
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (error) {
      // 読み取り不能なディレクトリは警告ログを出しつつ検査対象から除外し、他の経路の走査を継続する
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[pre-common:review] warn: skip unreadable directory :: ${cur} :: ${msg}\n`);
      continue;
    }

    // 取得したエントリを列挙し、次に辿るディレクトリと検査対象ファイルを振り分ける
    for (const e of entries) {
      const full = path.join(cur, e.name);
      // ファイルシステムのエントリ種類に応じて処理を分岐する
      if (e.isDirectory()) {
        // ディレクトリならスタックへ積む
        stack.push(full);
      } else if (e.isFile()) {
        // ファイルなら結果リストへ追加
        files.push(full);
      }
    }
  }

  return files;
}

