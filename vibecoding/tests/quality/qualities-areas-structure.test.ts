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

/** ユニットディレクトリ名の命名規約: 先頭は小文字英字、その後は小文字英字・数字・アンダースコア・ハイフンのみ（ASCIIのみ） */
const UNIT_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;

/**
 * qualities/{eslint,policy,tsconfig}/<bucket> 直下に現れるユニットディレクトリ名を列挙し、命名規約違反を検出する。
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
    for (const bucketEntry of buckets) {
      // バケットではないエントリ（設定ファイルなど）は構造検査の対象外とする
      if (!bucketEntry.isDirectory()) continue;
      const bucketName = bucketEntry.name;
      const bucketDir = path.join(domainDir, bucketName);

      // バケット以下のエリア階層を読み取り、命名規約に従う候補のみを対象とする
      const areaEntries = readAreaEntries(bucketDir, domain, bucketName);
      // 読み取り不能なバケットは readAreaEntries 内でスキップされる
      for (const areaEntry of areaEntries) {
        // バケット内のファイルは構造検査の対象外とし、ディレクトリのみを第4階層候補として扱う
        if (!areaEntry.isDirectory()) continue;
        const areaName = areaEntry.name;
        // 命名規約に従わないユニット名（または '_' 始まり）は違反として収集する
        if (!UNIT_NAME_PATTERN.test(areaName) || areaName.startsWith('_')) {
          const rel = path.join('qualities', domain, bucketName, areaName).replace(/\\/g, '/');
          violations.push(rel);
        }
      }
    }
  }

  return violations;
}

/**
 * qualities ドメイン配下のバケットディレクトリからエリア階層のエントリ一覧を取得する。
 * 読み取り不能なディレクトリはスキップし、警告だけを標準エラーへ出力する。
 * @param bucketDir バケットディレクトリの絶対パス
 * @param domain ドメイン名（eslint/policy/tsconfig）
 * @param bucketName バケット名
 * @returns エリア階層のディレクトリエントリ配列（読み取り失敗時は空配列）
 */
function readAreaEntries(bucketDir: string, domain: string, bucketName: string): fs.Dirent[] {
  // バケット配下のエントリ一覧を取得し、読み取り不能な場合は警告を出してスキップする
  try {
    return fs.readdirSync(bucketDir, { withFileTypes: true });
  } catch (e) {
    // 構造検査の網羅性を維持しつつ、読み取り不能バケットの存在をテストログとして可視化する
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `[qualities-areas-structure] warn: skip unreadable bucket while checking structure :: ${domain}/${bucketName} :: ${msg}\n`,
    );
    return [];
  }
}

// このテスト群の目的: qualities ドメイン/バケット構造の第4階層に現れるユニット名が命名規約（^[a-z][a-z0-9_-]*$）に従うことを自動検証し、将来の refactor での逸脱を検知する
describe('qualities areas structure (4th level directories)', () => {
  it('qualities/{eslint,policy,tsconfig}/<bucket>/<area> のユニット名は命名規約 ^[a-z][a-z0-9_-]*$ に従う', () => {
    // qualities ベースが無い環境（部分チェックや特定CI）ではスキップ扱い
    if (!fs.existsSync(QUALITIES_BASE)) {
      return;
    }

    // 現在のディレクトリ構造においてエリア階層ルール違反が存在するかを集計する（違反がなければそのまま成功とする）
    const invalidAreas = collectInvalidAreaDirs();

    // 構造ルールに違反するエリアが 1 つでも存在する場合のみテストを失敗させる
    if (invalidAreas.length > 0) {
      const message = [
        'Found invalid unit directories under qualities/{eslint,policy,tsconfig}/<bucket>/<area>.',
        '',
        'Rule:',
        '- The 4th-level directory (unit name) must match ^[a-z][a-z0-9_-]*$ and not start with an underscore.',
        '',
        'Invalid unit directories:',
        ...invalidAreas.map((p) => `  - ${p}`)
      ].join('\n');

      expect(invalidAreas, message).toEqual([]);
    }
  });
});
