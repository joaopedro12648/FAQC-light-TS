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

// 単純なグロブ解決（今回の用途に限定して実装）
// 対応: "src/**/*.ts", "**/src/**/*.ts"（必要に応じて拡張）
/**
 * パターンからファイル一覧を取得（今回の用途に合わせた限定実装）
 * @param rootDir - ルートディレクトリ
 * @param patterns - 走査パターン配列（例: src/deep/path/file.ts）
 * @returns 相対パスの配列
 */
export const globFiles = (rootDir: string, patterns: readonly string[]): string[] => {
  const results: string[] = [];
  for (const pattern of patterns) {
    if (pattern === 'src/**/*.ts') {
      for (const rel of listAllTsUnder(path.join(rootDir, 'src'))) {
        results.push(path.relative(rootDir, rel));
      }
    } else if (pattern === '**/src/**/*.ts') {
      for (const rel of listAllTsUnderAnySrc(rootDir)) {
        results.push(path.relative(rootDir, rel));
      }
    } else if (pattern.endsWith('.ts')) {
      const abs = path.join(rootDir, pattern);
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
  if (!fs.existsSync(dirAbs)) return out;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      for (const nested of listAllTsUnder(abs)) out.push(nested);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
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
    if (!fs.existsSync(dirAbs)) return;
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      const abs = path.join(dirAbs, name);
      if (entry.isDirectory()) {
        if (IGNORES.has(name)) continue;
        if (name === 'scripts' && fs.existsSync(path.join(abs, 'tmp'))) continue;
        if (name === 'src') {
          for (const file of listAllTsUnder(abs)) out.push(file);
        }
        walk(abs);
      }
    }
  };
  walk(rootDir);
  return out;
};

/**
 * テキスト読み込み（UTF-8）
 * @param absPath - 絶対パス
 * @returns 読み込んだ文字列
 */
export const readText = (absPath: string): string => fs.readFileSync(absPath, 'utf8');

/**
 * ルートと相対から絶対パスを得る
 * @param rootDir - ルート
 * @param relPath - ルートからの相対
 * @returns 絶対パス
 */
export const toAbs = (rootDir: string, relPath: string): string => path.join(rootDir, relPath);


