/**
 * @file Sanity test for qualities/check-steps.ts shape and contents
 * 備考: 特記事項なし
 * - 関数は短く単一責務で構成し入出力と前提を明確に記す
 * - 値は定数へ集約し意味を付与して可読性と変更容易性を高める
 * - 型は具体化し段階的絞り込みで安全に扱い曖昧な変換を拒否する
 * - 分岐は早期リターンで深さを抑え意図を表現し副作用を限定する
 * - コメントは要旨のみで統一表記とし仕様と実装の差異を残さない
 * - 例外は握り潰さず失敗経路を明示して呼び出し側で処理可能にする
 * - 依存の向きを守り層の境界を越えず公開面を最小化して保護する
 * - 抑止や緩和に頼らず規則へ適合する実装で根本原因から解決する
 * - 静的検査の警告を残さず品質基準に適合し一貫した設計を維持する
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { expect,test } from 'vitest';

import { stepDefs } from '../../qualities/check-steps.ts';

const MIN_STEPS_COUNT = 4;

test('stepDefs should be >=4 length with id, command, args, configRelDir', () => {
  expect(Array.isArray(stepDefs)).toBe(true);
  expect(stepDefs.length).toBeGreaterThanOrEqual(MIN_STEPS_COUNT);
  for (const d of stepDefs) {
    expect(typeof d.id).toBe('string');
    expect(typeof d.command).toBe('string');
    expect(Array.isArray(d.args)).toBe(true);
    expect(typeof d.configRelDir).toBe('string');
  }
});

test('first step should execute policy verifier directly', () => {
  const first = stepDefs[0]!;
  expect(first).toBeDefined();
  expect(first.command).toBe('node');
  expect(first.args[0]).toBe('qualities/policy/anti_mvp/run.mjs');
  expect(first.configRelDir).toBe('policy/anti_mvp');
});

test('build step should exist and call vite build via npm script', () => {
  const build = stepDefs.find((s) => s.id === 'build');
  expect(build).toBeDefined();
  expect(build?.command).toBe('npm');
  expect(build?.args.includes('build')).toBe(true);
});


