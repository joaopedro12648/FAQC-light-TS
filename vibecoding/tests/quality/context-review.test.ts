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
    // 無効な参照を早期に弾き探索の健全性を保つ
    if (!current) break;
    
    let entries;
    // 読み取り失敗時は当該ノードをスキップして探索を継続する
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    
    // 子要素を評価して探索キューと結果集合を更新する
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      // ディレクトリは後続探索へ積み、context.md は結果へ追加する
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === 'context.md') {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

// 概要: 各 context.md に対応する context-review.md の存在を保証する
describe('context-review.md existence', () => {
  it('each context.md should have a corresponding context-review.md', () => {
    // 対象ディレクトリが無ければ非該当として中断する
    if (!fs.existsSync(CONTEXTS_BASE)) {
      // contexts ディレクトリが存在しない場合はスキップ
      return;
    }

    const contextMdFiles = findContextMdFiles(CONTEXTS_BASE);
    
    // context.md が存在しない場合は非該当として扱い失敗にしない
    if (contextMdFiles.length === 0) {
      return;
    }
    
    const missingReviews: string[] = [];
    
    // 各 context.md に隣接する review の有無を点検する
    for (const contextMdPath of contextMdFiles) {
      const dir = path.dirname(contextMdPath);
      const reviewPath = path.join(dir, 'context-review.md');
      
      // レビューが見つからない場合だけ不足リストへ追加する
      if (!fs.existsSync(reviewPath)) {
        const relativePath = path.relative(process.cwd(), contextMdPath).replace(/\\/g, '/');
        missingReviews.push(relativePath);
      }
    }
    
    // 不足が存在する場合に限り詳細メッセージ付きで失敗させる
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

