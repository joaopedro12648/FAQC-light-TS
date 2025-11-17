/**
 * @file qualities/** のエリア階層（core/types/docs）の構造チェック
 * 備考: ドメインやバケットが増減しても「第4階層は core/docs/types のみ」というルールを保証する
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
 * @see vibecoding/var/contexts/qualities/types/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-COMMON.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/** qualities ルートディレクトリの絶対パス */
const QUALITIES_BASE = path.resolve('qualities');

/** 第4階層で許可されるエリア名集合 */
const ALLOWED_AREAS = new Set<string>(['core', 'docs', 'types']);

/**
 * qualities/{eslint,policy,tsconfig}/<bucket> 直下に現れるエリア名を列挙する。
 * @returns 違反パスの一覧（空配列ならルール順守）
 */
function collectInvalidAreaDirs(): string[] {
  const violations: string[] = [];
  const domains = ['eslint', 'policy', 'tsconfig'] as const;

  // 各ドメイン配下を走査し、第4階層のエリア名を検査する
  for (const domain of domains) {
    const domainDir = path.join(QUALITIES_BASE, domain);
    // ドメインディレクトリが存在しない場合はスキップ（将来の構成変更に備える）
    if (!fs.existsSync(domainDir)) continue;
    // ドメイン直下のバケットごとに area 階層を確認し、構造ルールから外れるものを検出する
    const buckets = fs.readdirSync(domainDir, { withFileTypes: true });

    // ドメイン配下の各バケットについて第4階層のエリア名を調査する
    // 各バケットについて、エリア階層ごとの構造ルール逸脱を検査する
    for (const bucketEntry of buckets) {
      // バケットではないエントリ（設定ファイルなど）は構造検査の対象外とする
      if (!bucketEntry.isDirectory()) continue;
      const bucketName = bucketEntry.name;
      const bucketDir = path.join(domainDir, bucketName);
      // バケット配下のエリア階層を読み取り、core/docs/types 以外が無いか検査するための一覧を取得する
      // バケット配下のディレクトリ一覧を取得し、core/docs/types 以外が無いかを調べる（eslint/policy/tsconfig すべてに同じ構造規則を適用する）
      let areaEntries: fs.Dirent[];
      // 読み取りに失敗したバケットは一時的な不整合とみなし、構造検査の対象から除外して他バケットの確認を優先する
      try {
        areaEntries = fs.readdirSync(bucketDir, { withFileTypes: true });
      } catch {
        // 読み取り不能な場合は当該バケットのみ除外し、他の検査を継続する
        continue;
      }

      // 第4階層のディレクトリ名を列挙して違反を抽出する（構造レベルでのリークや例外フォルダを防ぐ）
      for (const areaEntry of areaEntries) {
        // ファイルは検査対象外とし、ディレクトリのみを第4階層の候補として扱う
        if (!areaEntry.isDirectory()) continue;
        // 第4階層のエリア名が許容された集合から外れている場合だけ構造ルール違反として検出し、後続のリファクタ時に修正対象を明確にする
        const areaName = areaEntry.name;
        // 許可されていないエリア名が見つかった場合にだけ違反リストへ追加し、構造ルールからの逸脱を 1 箇所に集約して検知する
        if (!ALLOWED_AREAS.has(areaName)) {
          const rel = path
            .join('qualities', domain, bucketName, areaName)
            .replace(/\\/g, '/');
          violations.push(rel);
        }
      }
    }
  }

  return violations;
}

// このテスト群の目的: qualities ドメイン/バケット構造の第4階層が core/docs/types だけであることを自動検証し、将来の refactor での逸脱を検知する
describe('qualities areas structure (4th level directories)', () => {
  it('qualities/{eslint,policy,tsconfig}/<bucket>/<area> は core/docs/types のみに限定される', () => {
    // qualities ベースが存在しない環境（部分チェックなど）ではスキップ扱い
    // リポジトリ構成によっては qualities 自体が存在しない CI/job もあるため、その場合はスキップする
    if (!fs.existsSync(QUALITIES_BASE)) {
      return;
    }

    // 現在のディレクトリ構造においてエリア階層ルール違反が存在するかを集計する（違反がなければそのまま成功とする）
    const invalidAreas = collectInvalidAreaDirs();

    // 構造ルールに違反するエリアが 1 つでも存在する場合のみテストを失敗させる
    if (invalidAreas.length > 0) {
      const message = [
        'Found invalid area directories under qualities/{eslint,policy,tsconfig}/<bucket>/<area>.',
        '',
        'Rule:',
        '- The 4th-level directory (area) must be one of: core, docs, types.',
        '',
        'Invalid area directories:',
        ...invalidAreas.map((p) => `  - ${p}`)
      ].join('\n');

      expect(invalidAreas, message).toEqual([]);
    }
  });
});
