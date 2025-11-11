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
  
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
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
    if (!fs.existsSync(CONTEXTS_BASE)) {
      // contexts ディレクトリが存在しない場合はスキップ
      return;
    }

    const contextMdFiles = findContextMdFiles(CONTEXTS_BASE);
    
    // context.md が存在しない場合は非該当として扱い、失敗にしない
    if (contextMdFiles.length === 0) {
      return;
    }
    
    const missingReviews: string[] = [];
    
    for (const contextMdPath of contextMdFiles) {
      const dir = path.dirname(contextMdPath);
      const reviewPath = path.join(dir, 'context-review.md');
      
      if (!fs.existsSync(reviewPath)) {
        const relativePath = path.relative(process.cwd(), contextMdPath).replace(/\\/g, '/');
        missingReviews.push(relativePath);
      }
    }
    
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

