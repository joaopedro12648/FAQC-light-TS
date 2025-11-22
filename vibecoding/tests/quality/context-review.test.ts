/**
 * @file Tests for context-review.md existence。
 * 備考: 特記事項なし
 * Why: 将来の実装改善のため、各 context.md に対応するレビューがあることを保証する
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/docs/PLAYBOOK/PRE-COMMON.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect,it } from 'vitest';

/** 品質コンテキスト（var/contexts/qualities）のルートパス */
const CONTEXTS_BASE = path.resolve('vibecoding/var/contexts/qualities');

/**
 * context.md を再帰的に探索する
 * @param {string} dir - Root directory to begin the search。
 * @returns {string[]} Absolute paths to discovered context.md files。
 */
function findContextMdFiles(dir: string): string[] {
  const files: string[] = [];
  const stack = [dir];
  
  // 未処理のディレクトリが残る間は探索を継続して対象を収集する
  while (stack.length > 0) {
    const current = stack.pop();
    // 無効参照を検出した場合は探索を打ち切る
    if (!current) break;
    
    let entries;
    // 探索を優先して結果収集を継続し、個別失敗は全体に影響させない
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      // 目録の読み取りに失敗したディレクトリはスキップして後続の探索を続ける（テスト観点で状況だけ標準エラーへ記録する）
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[context-review] warn: failed to read directory; skip and continue traversal :: ${String(current)} :: ${msg}\n`);
      continue;
    }
    
    // 子要素を順に評価して次段処理へ回す
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      // 再帰探索を継続するため、ディレクトリは次段の探索キューに積む
      if (entry.isDirectory()) {
        // 次段の走査対象としてスタックへ push する
        stack.push(fullPath);
      // context.md を検出した場合は結果へ追加する
      } else if (entry.isFile() && entry.name === 'context.md') {
        // 対象の context.md を結果集合へ追加する
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

// 概要: 各 context.md に対応する context-review.md の存在を保証する
describe('context-review.md existence', () => {
  it('each context.md should have a corresponding context-review.md', () => {
    // ベースが無い環境では対象外としてスキップする
    if (!fs.existsSync(CONTEXTS_BASE)) {
      return;
    }

    const contextMdFiles = findContextMdFiles(CONTEXTS_BASE);
    
    // 対象が無い場合は非該当として終了する
    if (contextMdFiles.length === 0) {
      return;
    }
    
    const missingReviews: string[] = [];
    
    // 各 context.md に隣接する review の存在を確認する
    for (const contextMdPath of contextMdFiles) {
      const dir = path.dirname(contextMdPath);
      const reviewPath = path.join(dir, 'context-review.md');
      
      // 対応する review が無い場合のみ不足リストへ追加する
      if (!fs.existsSync(reviewPath)) {
        const relativePath = path.relative(process.cwd(), contextMdPath).replace(/\\/g, '/');
        missingReviews.push(relativePath);
      }
    }
    
    // 不足がある場合は詳細メッセージ付きで失敗させる
    if (missingReviews.length > 0) {
      const message = [
        'context-review.md is missing for the following quality gate context(s).',
        '',
        'Why this fails:',
        '- We require an explicit review (context-review.md) to capture learnings that should inform the next iteration.',
        '- Immediately after you integrated a review into context.md and deleted the review file, this failure is expected until you create a fresh review file.',
        '',
        'What to do now:',
        '- Create context-review.md next to each context.md listed below.',
        '- If you have ideas to minimize token consumption during the "npm run check" phase when implementing a different SnD next time, describe how context.md should be revised and why.',
        '- Make the output self-contained so that context.md can be updated accurately even if the current context is lost.',
        '  If there is nothing applicable, output a single line: "No changes needed for context.md".',
        '',
        'Missing reviews for:',
        ...missingReviews.map((p) => `  - ${p}`)
      ].join('\n');

      expect(missingReviews, message).toEqual([]);
    }
  });
});

