#!/usr/bin/env node
/**
 * @file CI pre-implementation quality gate。
 * 目的: 変更に対して SPEC の quality_refresh_hash_before_impl を要求し、SPEC未更新のアプリ変更をブロック
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
 * @see vibecoding/var/contexts/qualities/policy/no_relaxation/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * コマンドを同期実行する（失敗時は空文字を返す安全運転）。
 * @param {string} cmd 実行するシェルコマンド
 * @returns {string} 標準出力（trim 済み）。失敗時は空文字。
 */
function run(cmd) {
  // サブプロセス失敗時も処理継続するため空文字でフォールバックする
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  } catch (e) {
    // 取得に失敗した場合は空文字を返して後続のフォールバックへ委ねる
    return '';
  }
}

/**
 * 変更ファイル一覧を取得する（CI で一般的な差分範囲を順に試行）。
 * @returns {string[]} 変更された（または作業ツリーで変更検出された）パスの配列
 */
function getChangedFiles() {
  // 代表的な CI の差分範囲を試し、段階的にフォールバックする
  const attempts = [
    'git diff --name-only --diff-filter=ACMRTUXB origin/main...HEAD',
    'git diff --name-only --diff-filter=ACMRTUXB $(git merge-base origin/main HEAD)..HEAD',
    'git diff --name-only --diff-filter=ACMRTUXB HEAD~1..HEAD',
  ];
  // 差分取得手段を順に試し最初に成功した結果を採用する
  for (const cmd of attempts) {
    const out = run(cmd);
    // 最初に成功した差分範囲の結果を採用して余計な走査を避ける
    if (out) return Array.from(new Set(out.split('\n').filter(Boolean)));
  }

  // 最後の手段として、作業ツリーの変更を確認する（CI では空の可能性あり）
  const wt = run('git ls-files -m -o --exclude-standard');
  return wt ? Array.from(new Set(wt.split('\n').filter(Boolean))) : [];
}

/**
 * ファイル読み込み（失敗時は空文字を返す）。
 * @param {string} p ファイルパス
 * @returns {string} ファイル内容（UTF-8）。失敗時は空文字。
 */
function readFileSafe(p) {
  // 読み込み失敗時も処理継続するため空文字でフォールバックする
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    // 読み取りに失敗した場合は空文字を返して後続の判定を続ける
    return '';
  }
}

/**
 * Markdown 文字列から YAML フロントマター部分を抽出する。
 * @param {string} md Markdown 文字列
 * @returns {string} フロントマターの中身（区切り線を除く）。無ければ空文字。
 */
function extractFrontMatter(md) {
  const m = md.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]/);
  return m ? m[1] : '';
}

/**
 * フロントマターから `quality_refresh_hash_before_impl` の値を抽出する。
 * @param {string} frontMatter 抽出済みフロントマター文字列
 * @returns {string} `<StartAt> <hash>` 形式の値。見つからなければ空文字。
 */
function getQualityRefreshHashBeforeImpl(frontMatter) {
  // front matter が空なら欠落扱いとして空文字を返す
  if (!frontMatter) return '';
  // YAML フロントマターの行を捕捉: quality_refresh_hash_before_impl: "<StartAt> <hash>"
  const m = frontMatter.match(/\bquality_refresh_hash_before_impl\s*:\s*["']?([^\r\n"']+)/);
  return m ? m[1].trim() : '';
}

/**
 * `<StartAt> <sha256>` 形式の妥当性を検証する。
 * @param {string} value 値
 * @returns {boolean} 妥当であれば true
 */
function isValidStartAtHash(value) {
  // ISO8601 UTC + 空白 + 64 桁の 16 進数
  return /^\d{4}-\d{2}-\d{2}T[^\s]+Z\s+[0-9a-f]{64}$/.test(value);
}

/** エントリポイント。SPEC の pre-impl ハッシュ有無を検査し、欠落時は失敗させる。 */
function main() {
  const changed = getChangedFiles();
  const codeChanged = changed.filter((p) => /^(apps|src)\//.test(p));
  const specChanged = changed.filter((p) => /^vibecoding\/var\/SPEC-and-DESIGN\/.*\.md$/.test(p));

  const errors = [];

  // アプリコードが変更された場合、少なくとも 1 つの SPEC ファイルの更新を要求する
  if (codeChanged.length > 0 && specChanged.length === 0) {

    errors.push(
      'App code changed without SPEC update. Update the relevant SPEC-and-DESIGN and record pre_impl.'
    );
  }

  // 変更された各 SPEC について、quality_refresh_hash_before_impl の存在と妥当性を検証する
  for (const specPath of specChanged) {
    const abs = path.resolve(specPath);
    const content = readFileSafe(abs);
    const fm = extractFrontMatter(content);
    const atHash = getQualityRefreshHashBeforeImpl(fm);
    // SPEC の pre-impl ハッシュが欠落/不正な場合はエラーとして記録する
    if (!isValidStartAtHash(atHash)) {
      errors.push(
        `Missing or invalid quality_refresh_hash_before_impl in front matter for SPEC: ${specPath}`
      );
    }
  }

  // 収集したエラーが存在する場合は失敗として詳細を出力する
  if (errors.length > 0) {

    process.stderr.write(`\nPRE-IMPL check failed:\n- ${  errors.join('\n- ')  }\n`);
    process.stderr.write('\nSee vibecoding/docs/PLAYBOOK/PRE-IMPL.md\n');
    process.exit(1);
  }

  process.stdout.write('PRE-IMPL check passed.\n');
}

main();

