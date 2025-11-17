/**
 * @file FS ユーティリティ（anti_mvp）
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
 * @see vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
// [SPEC:SnD-20251027-anti-mvp-policy-checks] Anti-MVP Policy Checks

import * as fs from 'node:fs';
import * as path from 'node:path';

// 単純なグロブ解決（今回の用途限定）。対応: "src/**/*.ts", "*。*/src/**/*.ts"（必要に応じて拡張）
/**
 * パターンに基づき .ts ファイルの相対パス一覧を収集する。
 * @param rootDir ルートディレクトリ
 * @param patterns 走査パターン配列
 * @returns 相対パス配列
 */
export const globFiles = (rootDir: string, patterns: readonly string[]): string[] => {
  const results: string[] = [];
  // 各パターンを順に評価する
  for (const pattern of patterns) {
    // src 配下の .ts を列挙する
    if (pattern === 'src/**/*.ts') {
      // src 配下専用パターンの処理で走査対象を限定する
      for (const rel of listAllTsUnder(path.join(rootDir, 'src'))) {
        results.push(path.relative(rootDir, rel));
      }
    } else if (pattern === '**/src/**/*.ts') {
      // 任意の src 直下から走査して対象の網羅性を確保する
      for (const rel of listAllTsUnderAnySrc(rootDir)) {
        results.push(path.relative(rootDir, rel));
      }
    } else if (pattern.endsWith('.ts')) {
      // 明示指定された .ts のみを対象に追加する
      const abs = path.join(rootDir, pattern);
      // 明示的に指定された .ts パスのみを対象に安全に追加する
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        results.push(path.relative(rootDir, abs));
      }
    }
  }

  return results;
};

/**
 * ディレクトリ以下の .ts を列挙
 * @param dirAbs - 絶対パスのディレクトリ
 * @returns 絶対パスの .ts ファイル一覧
 */
const listAllTsUnder = (dirAbs: string): string[] => {
  const out: string[] = [];
  // ディレクトリが無ければ空配列を返す
  if (!fs.existsSync(dirAbs)) return out;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  // ディレクトリ配下を走査する
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    // サブディレクトリは再帰して収集する
    if (entry.isDirectory()) {
      // 再帰で得たパスを結果へ追加する
      for (const nested of listAllTsUnder(abs)) out.push(nested);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // 収集対象の .ts を結果へ追加する
      out.push(abs);
    }
  }

  return out;
};

/**
 * ルート以下のあらゆる "src" ディレクトリ直下から .ts を列挙
 * 除外: node_modules, dist, build, coverage, .git, tmp, scripts/tmp
 * @param rootDir - ルートディレクトリ
 * @returns 絶対パスの .ts ファイル一覧
 */
const listAllTsUnderAnySrc = (rootDir: string): string[] => {
  const out: string[] = [];
  const IGNORES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'tmp']);
  const walk = (dirAbs: string) => {
    // 対象ディレクトリが存在しない場合は探索を打ち切る
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    // すべてのエントリを走査して対象を抽出する
    for (const entry of entries) {
      const name = entry.name;
      const abs = path.join(dirAbs, name);
      // ディレクトリ以外は対象外
      if (!entry.isDirectory()) continue;
      // 既知の無視対象は除外して走査対象を絞る
      if (IGNORES.has(name)) continue;
      // 一時スクリプト配下は対象外として走査コストを抑える
      if (name === 'scripts' && fs.existsSync(path.join(abs, 'tmp'))) continue;
      // src 配下の .ts を列挙して収集する
      if (name === 'src') {
        // src 配下の .ts を列挙して結果へ追加する
        for (const file of listAllTsUnder(abs)) out.push(file);
      }

      // 残りの下位ディレクトリも再帰的に探索する
      walk(abs);
    }
  };

  walk(rootDir);
  return out;
};

/**
 * UTF-8 テキストを読み込むユーティリティ。
 * @param absPath 絶対パス
 * @returns 読み込んだ文字列
 */
export const readText = (absPath: string): string => fs.readFileSync(absPath, 'utf8');

/**
 * ルートと相対パスを結合して絶対パスを得る。
 * @param rootDir ルートディレクトリ
 * @param relPath ルートからの相対パス
 * @returns 絶対パス
 */
export const toAbs = (rootDir: string, relPath: string): string => path.join(rootDir, relPath);

