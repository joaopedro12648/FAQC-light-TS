#!/usr/bin/env node
/**
 * @file Anti-MVP ポリシーチェッカーの薄いランナー
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
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../_shared/ignores.mjs';

// 複雑度を抑えるためのヘルパー
const sliceBlock = (lines, start, end) => {
  const sIdx = lines.findIndex((l) => start.test(l.trimEnd()));
  // 開始位置が見つからなければ空配列を返す
  if (sIdx === -1) return [];
  const after = lines.slice(sIdx + 1);
  const baseIndent = ((/^(\s*)/.exec(lines[sIdx]) || [,''])[1] || '').length;
  let eIdx = lines.length;
  // ブロックの終端または同レベル次セクションに到達するまで前進する
  for (let i = 0; i < after.length; i += 1) {
    const raw = after[i];
    const ind = ((/^(\s*)/.exec(raw) || [,''])[1] || '').length;
    // 終端パターンに一致したら切り出しを終了する
    if (end.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }

    // 同レベルの別セクション開始を検知したらブロック境界とみなす
    if (ind <= baseIndent && /^\s*[a-zA-Z0-9_]+:\s*$/.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }
  }

  return lines.slice(sIdx + 1, eIdx);
};

const parseBanned = (lines) => {
  const block = sliceBlock(lines, /^\s*banned_terms:\s*$/, /^\s*todo_ticket_required:\s*$/);
  // 設定ブロックが存在しない場合は本チェックを無効化し undefined を返す
  if (!block.length) return undefined;
  const out = {};
  let inPatterns = false;
  // YAML セクションを1行ずつ評価して構造体に反映する
  for (const raw of block) {
    const l = raw.trimEnd();
    // ここから先はパターン配列を構築するフラグを立てる
    if (/^\s*patterns:\s*$/.test(l)) { inPatterns = true; out.patterns = []; continue; }

    const mPat = l.match(/^\s*-\s+"?(.+?)"?\s*$/);
    // パターン行であれば配列へ順次追加する
    if (inPatterns && mPat) { out.patterns.push(mPat[1]); continue; }

    const mWB = l.match(/^\s*word_boundary:\s*(true|false)\s*$/);
    // 単語境界の有無をここで反映する
    if (mWB) { out.word_boundary = mWB[1] === 'true'; continue; }

    // パス指定がある場合は既定値へ正規化して後段の走査対象を明確にする
    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

const parseTodo = (lines) => {
  const block = sliceBlock(lines, /^\s*todo_ticket_required:\s*$/, /^\s*banned_terms:\s*$/);
  // 設定ブロックが存在しない場合は本チェックを無効化し undefined を返す
  if (!block.length) return undefined;
  const out = {};
  // YAML セクションを1行ずつ評価して構造体に反映する
  for (const raw of block) {
    const l = raw.trimEnd();
    const mRegex = l.match(/^\s*regex:\s*"(.+)"\s*$/);
    // 正規表現の指定を抽出して後段の検査に利用する
    if (mRegex) { out.regex = mRegex[1]; continue; }

    // パス指定がある場合は既定値へ正規化して後段の走査対象を明確にする
    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

/**
 * ポリシー設定 YAML を読み込み、ランナー用の構造体へ変換する。
 * @param {string} repoRoot リポジトリルート
 * @returns {{checks: Record<string, unknown>}} 解析済み設定オブジェクト
 */
function readYamlConfig(repoRoot) {
  const yamlPath = path.join(repoRoot, 'qualities', 'policy', 'anti_mvp', 'anti_mvp_policy.yaml');
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const cfg = { checks: {} };
  const banned = parseBanned(lines);
  const todo = parseTodo(lines);
  // banned_terms が定義されている場合はチェック群へ反映する
  if (banned) cfg.checks.banned_terms = banned;
  // todo_ticket_required が定義されている場合はチェック群へ反映する
  if (todo) cfg.checks.todo_ticket_required = todo;
  return cfg;
}

/**
 * ルート配下の TS/TSX ファイル一覧を再帰的に収集する。
 * @param {string} rootDir 走査起点のディレクトリ
 * @returns {string[]} ルートからの相対パス配列
 */
function listAllTsFiles(rootDir) {
  const out = [];
  const SKIP_DIR_NAMES = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/').pop())
      .filter(Boolean)
  );
  const TS_EXT_RX = /\.(ts|tsx|mts|cts)$/i;
  /**
   * ディレクトリ配下を深さ優先で走査して TS/TSX を収集する。
   * @param {string} dirAbs 絶対パスのディレクトリ
   * @returns {void}。
   */
  function walk(dirAbs) {
    // 実行中にディレクトリが消えていても安全に続行できるよう存在確認を行う
    if (!fs.existsSync(dirAbs)) return;
    // 深さ優先でファイル・ディレクトリを列挙して対象のみを収集する
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const name = entry.name;
      const abs = path.join(dirAbs, name);
      // 無視対象のディレクトリは潜らずスキップして不要な走査を避ける
      if (entry.isDirectory()) {
        // 無視対象なら処理をスキップする
        if (SKIP_DIR_NAMES.has(name)) continue;
        walk(abs);
      }
      // 型対象の拡張子に一致するファイルのみをリストへ追加する
      else if (entry.isFile() && TS_EXT_RX.test(name)) {
        // 型対象ファイルを検出し、相対パスで収集する意図
        out.push(path.relative(rootDir, abs));
      }
    }
  }

  walk(rootDir);
  return out;
}

/**
 * 禁止語チェックを実行し、違反一覧を返す。
 * @param {string} rootDir リポジトリルート
 * @param {{checks?: {banned_terms?: {patterns?: string[], word_boundary?: boolean}}}} cfg 設定
 * @returns {Array<{ruleId:string,message:string,file:string,line:number}>} 違反一覧
 */
function bannedTermsCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.banned_terms;
  // 設定が無ければ本チェックは無効なため早期に空結果を返す
  if (!rule || !rule.patterns || rule.patterns.length === 0) return [];
  const files = listAllTsFiles(rootDir);
  const escaped = rule.patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joined = escaped.join('|');
  const body = rule.word_boundary ? `\\b(?:${joined})\\b` : `(?:${joined})`;
  const regex = new RegExp(body, 'i');
  const violations = [];
  // 全対象ファイルを走査して違反を集計する
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    // 各行を確認して最初にマッチしたトークンを報告に含める
    for (let i = 0; i < lines.length; i += 1) {
      // マッチした行を違反として収集する
      const m = regex.exec(lines[i]);
      // マッチした行のみを違反として記録し、発見語をメッセージへ含める
      if (m) {

        const found = m[0] ?? '';
        violations.push({ ruleId: 'banned_terms', message: `${rel}:${i + 1} contains "${found}"`, file: rel, line: i + 1 });
      }
    }
  }

  return violations;
}

/**
 * TODO/TICKET 必須チェックを実行し、違反一覧を返す。
 * @param {string} rootDir リポジトリルート
 * @param {{checks?: {todo_ticket_required?: {regex?: string}}}} cfg 設定
 * @returns {Array<{ruleId:string,message:string,file:string,line:number}>} 違反一覧
 */
function todoTicketRequiredCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.todo_ticket_required;
  // 設定が無ければ本チェックは無効なため早期に空結果を返す
  if (!rule || !rule.regex) return [];
  const files = listAllTsFiles(rootDir);
  const regex = new RegExp(rule.regex, 'i');
  const violations = [];
  // 全対象ファイルを走査して違反を集計する
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    // 各行を確認してチケットID無しの TODO/FIXME/HACK を検出する
    for (let i = 0; i < lines.length; i += 1) {
      // チケットIDが無ければ違反として記録する
      if (regex.test(lines[i])) violations.push({ ruleId: 'todo_ticket_required', message: `${rel}:${i + 1} missing ticket for TODO/FIXME/HACK`, file: rel, line: i + 1 });
    }
  }

  return violations;
}

// 実行: 2チェックのみ（複雑度を抑制）
/**
 * すべてのチェックを順次実行し、結果を集約する。
 * @param {string} rootDir リポジトリルート
 * @returns {Promise<{ok:boolean,violations:Array<{ruleId:string,message:string,file?:string,line?:number}>}>} 実行結果
 */
async function runAll(rootDir) {
  const cfg = readYamlConfig(rootDir);
  const violations = [];
  // 各チェックの失敗を分離し、片方が落ちてももう片方を継続させるよう try で囲む
  try {
    // 禁止語チェックの結果を集約する
    for (const v of bannedTermsCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    // 失敗を集約し後続チェックを続行する
    violations.push({ ruleId: 'banned_terms', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  // 各チェックの失敗を分離し、片方が落ちてももう片方を継続させるよう try で囲む
  try {
    // チケットID必須チェックの結果を集約する
    for (const v of todoTicketRequiredCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    // 失敗を集約し後続チェックを続行する
    violations.push({ ruleId: 'todo_ticket_required', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  return { ok: violations.length === 0, violations };
}

/**
 * エントリポイント
 * @returns {Promise<void>} 非同期実行
 */
async function main() {
  const repoRoot = process.cwd();
  const { ok, violations } = await runAll(repoRoot);
  // いずれかの違反が存在する場合は詳細を標準エラーへ出力して異常終了させる
  if (!ok) {

    // 違反一覧を出力する
    for (const v of violations) {
      process.stderr.write(`anti-mvp ❌ ${v.ruleId}: ${v.message}\n`);
    }

    process.exit(1);
  }

  process.stdout.write('anti-mvp ✅ no violations\n');
}

// ランナー自体の予期しない失敗を確実に記録してCIへ異常終了を伝える
main().catch((e) => {
  process.stderr.write(`anti-mvp ❌ runner error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

