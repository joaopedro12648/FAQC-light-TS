#!/usr/bin/env node
/**
 * @file Anti-MVP ポリシーチェッカーの core 階層エントリポイント
 * 備考: 実装ロジックを core 階層に集約し、qualities/policy/anti_mvp/core/** を品質ゲートユニットの基点とする
 * - 対象: TypeScript 系ソースコード全体から MVP 的な仮実装や放置コメントを検出する
 * - 目的: banned_terms と todo_ticket_required の 2 系列ポリシーで早期に技術的負債の兆候を見つける
 * - 前提: qualities/policy/anti_mvp/anti_mvp_policy.yaml を単一情報源とし、paths/patterns/word_boundary をそこから解決する
 * - 方針: IGNORES に従って不要ディレクトリを除外しつつ、実際にレビュー対象となる TS ファイルだけを走査する
 * - チェック: 禁止語句は単語境界モードと非境界モードを切り替え、誤検出を抑えつつルールの意図を保つ
 * - レポート: 違反内容は ruleId・ファイルパス・行番号を含むメッセージとして stderr に出力し、人間が追える形で提示する
 * - 運用: ランナー自体も no_eslint_disable やコメントポリシーに従い、例外に頼らず実装側で規範に適合させる
 * - 統合: 他の policy ランナーと同様に preflight/check から呼び出され、品質ゲート全体の一部として動作する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251116/SnD-20251116-qualities-structure-and-context-granularity.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

/**
 * YAML 行配列から対象ブロックの中身だけを取り出すユーティリティ。
 * @param {string[]} lines YAML 全体の行配列
 * @param {RegExp} start 対象ブロックの開始行を判定する正規表現
 * @param {RegExp} end 対象ブロックの終了行を判定する正規表現
 * @returns {string[]} 開始行直後から終了直前までの行配列（見つからなければ空配列）
 */
const sliceBlock = (lines, start, end) => {
  // 開始ラベルに一致する行を特定し、見つからなければ空配列としてブロック非存在を表現する
  const sIdx = lines.findIndex((l) => start.test(l.trimEnd()));
  // 対象ブロックが存在しない場合は空配列を返し、後段処理で「未定義のルール」として扱う
  if (sIdx === -1) return [];
  const after = lines.slice(sIdx + 1);
  const baseIndent = ((/^(\s*)/.exec(lines[sIdx]) || [,''])[1] || '').length;
  let eIdx = lines.length;
  // 開始行以降を走査し、終了条件または同レベルの別キー出現でブロック終端とみなす
  for (let i = 0; i < after.length; i += 1) {
    const raw = after[i];
    const ind = ((/^(\s*)/.exec(raw) || [,''])[1] || '').length;
    // 明示的な end 正規表現に一致した行でブロックを区切る
    if (end.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }

    // インデントが開始行以下に戻り YAML の新しいキーと判断できる場合もブロック終端とする
    if (ind <= baseIndent && /^\s*[a-zA-Z0-9_]+:\s*$/.test(raw.trimEnd())) { eIdx = sIdx + 1 + i; break; }
  }

  return lines.slice(sIdx + 1, eIdx);
};

/**
 * banned_terms セクションをパースし、patterns/word_boundary/paths を持つ設定オブジェクトへ変換する。
 * @param {string[]} lines anti_mvp_policy.yaml 全体の行配列
 * @returns {{patterns:string[],word_boundary?:boolean,paths?:string[]}|undefined} banned_terms 設定
 */
const parseBanned = (lines) => {
  // banned_terms ブロックを切り出し、見つからなければルール未定義として undefined を返す
  const block = sliceBlock(lines, /^\s*banned_terms:\s*$/, /^\s*todo_ticket_required:\s*$/);
  // banned_terms セクションが存在しない場合は本ルールを無効扱いとして後続処理を省略する
  if (!block.length) return undefined;
  const out = {};
  let inPatterns = false;
  // banned_terms セクション内の各行を走査し、禁止語句や補助フラグを抽出する
  for (const raw of block) {
    const l = raw.trimEnd();
    // patterns: 行に到達したら以降の行を禁止語句リストとして扱う
    if (/^\s*patterns:\s*$/.test(l)) { inPatterns = true; out.patterns = []; continue; }

    const mPat = l.match(/^\s*-\s+"?(.+?)"?\s*$/);
    // patterns セクション内の箇条書き行を禁止語句として収集する
    if (inPatterns && mPat) { out.patterns.push(mPat[1]); continue; }

    const mWB = l.match(/^\s*word_boundary:\s*(true|false)\s*$/);
    // word_boundary フラグが指定されていれば単語境界モードの有無として記録する
    if (mWB) { out.word_boundary = mWB[1] === 'true'; continue; }

    // paths キーは明示的なパスリストを使わず、ここでは ts 系拡張子のみを対象とする既定値へ正規化する
    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

/**
 * todo_ticket_required セクションをパースし、正規表現と対象パス設定へ変換する。
 * @param {string[]} lines anti_mvp_policy.yaml 全体の行配列
 * @returns {{regex:string,paths?:string[]}|undefined} todo_ticket_required 設定
 */
const parseTodo = (lines) => {
  // todo_ticket_required ブロックを切り出し、見つからなければルール未定義として undefined を返す
  const block = sliceBlock(lines, /^\s*todo_ticket_required:\s*$/, /^\s*banned_terms:\s*$/);
  // 設定が存在しない場合は TODO チケット必須チェックを無効扱いとする
  if (!block.length) return undefined;
  const out = {};
  // todo_ticket_required セクション内の各行を走査し、正規表現や対象パス設定を抽出する
  for (const raw of block) {
    const l = raw.trimEnd();
    const mRegex = l.match(/^\s*regex:\s*"(.+)"\s*$/);
    // TODO 記法にマッチさせる正規表現を拾い、違反検出のための基準とする
    if (mRegex) { out.regex = mRegex[1]; continue; }

    // paths キーは明示的なパスリストを使わず、ここでは ts 系拡張子のみを対象とする既定値へ正規化する
    if (/^\s*paths:\s*/.test(l)) { out.paths = ['**/*.{ts,tsx,mts,cts}']; continue; }
  }

  return Object.keys(out).length ? out : undefined;
};

/**
 * anti_mvp_policy.yaml を読み込み、banned_terms / todo_ticket_required チェック設定へ変換する。
 * @param {string} repoRoot リポジトリルートディレクトリの絶対パス
 * @returns {{checks:{banned_terms?:object,todo_ticket_required?:object}}} パース済みチェック設定
 */
function readYamlConfig(repoRoot) {
  const yamlPath = path.join(repoRoot, 'qualities', 'policy', 'anti_mvp', 'core', 'anti_mvp_policy.yaml');
  const raw = fs.readFileSync(yamlPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const cfg = { checks: {} };
  const banned = parseBanned(lines);
  const todo = parseTodo(lines);
  // banned_terms が定義されている場合のみ checks に統合し、不要な空オブジェクトを避ける
  if (banned) cfg.checks.banned_terms = banned;
  // todo_ticket_required が定義されている場合のみ checks に統合し、不要な空オブジェクトを避ける
  if (todo) cfg.checks.todo_ticket_required = todo;
  return cfg;
}

/**
 * SoT の IGNORES を反映しつつ、走査対象となる TypeScript ファイルの相対パス一覧を収集する。
 * @param {string} rootDir 走査起点とするディレクトリの絶対パス
 * @returns {string[]} 走査対象となる ts/tsx/mts/cts ファイルの相対パス配列
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
   * 単一ディレクトリ配下を深さ優先で走査し、対象拡張子のファイルを out に蓄積する。
   * @param {string} dirAbs 走査中のディレクトリ絶対パス
   */
  function walk(dirAbs) {
    // 存在しないパスはサイレントに無視し、他のディレクトリ探索を継続する
    if (!fs.existsSync(dirAbs)) return;
    // IGNORES を反映しつつ、サブディレクトリと対象ファイルを順に探索する
    // ディレクトリ配下のエントリを列挙し、ディレクトリとファイルのいずれも走査対象として評価する
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const name = entry.name;
      const abs = path.join(dirAbs, name);
      // 除外ディレクトリ名に一致する場合は再帰探索をスキップ
      if (entry.isDirectory()) {
        // SoT の除外ディレクトリは配下ごとスキップする
        if (SKIP_DIR_NAMES.has(name)) continue;
        walk(abs);
      } else if (entry.isFile() && TS_EXT_RX.test(name)) {
        out.push(path.relative(rootDir, abs));
      }
    }
  }

  walk(rootDir);
  return out;
}

/**
 * banned_terms チェックを実行し、禁止語句の出現箇所を収集する。
 * @param {string} rootDir 検査対象のルートディレクトリ
 * @param {{checks?:{banned_terms?:{patterns?:string[],word_boundary?:boolean}}}} cfg YAML から構築した設定
 * @returns {Array<{ruleId:string,message:string,file?:string,line?:number}>} 検出された違反一覧
 */
function bannedTermsCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.banned_terms;
  // 設定が存在しない場合は banned_terms チェックをスキップする
  if (!rule || !rule.patterns || rule.patterns.length === 0) return [];
  // IGNORES を考慮した TypeScript ファイル一覧を取得してから禁止語句検査を行う
  const files = listAllTsFiles(rootDir);
  const escaped = rule.patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joined = escaped.join('|');
  const body = rule.word_boundary ? `\\b(?:${joined})\\b` : `(?:${joined})`;
  const regex = new RegExp(body, 'i');
  const violations = [];
  // 走査対象ファイルを順に開き、禁止語句にマッチする行を検出して違反として記録する
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    // 各行を順に評価し、禁止語句の正規表現にマッチした場合だけ違反として収集する
    for (let i = 0; i < lines.length; i += 1) {
      const m = regex.exec(lines[i]);
      // 対象行が禁止語句にマッチした場合のみ違反として扱い、それ以外の行は検査結果に含めない
      if (m) {
        const found = m[0] ?? '';
        violations.push({ ruleId: 'banned_terms', message: `${rel}:${i + 1} contains "${found}"`, file: rel, line: i + 1 });
      }
    }
  }

  return violations;
}

/**
 * todo_ticket_required チェックを実行し、チケット ID を伴わない TODO 系コメントの出現箇所を収集する。
 * @param {string} rootDir 検査対象のルートディレクトリ
 * @param {{checks?:{todo_ticket_required?:{regex?:string}}}} cfg YAML から構築した設定
 * @returns {Array<{ruleId:string,message:string,file?:string,line?:number}>} 検出された違反一覧
 */
function todoTicketRequiredCheck(rootDir, cfg) {
  const rule = cfg.checks && cfg.checks.todo_ticket_required;
  // 設定が存在しない場合は TODO チケット必須チェックをスキップする
  if (!rule || !rule.regex) return [];
  // IGNORES を考慮した TypeScript ファイル一覧を取得してから TODO コメントを検査する
  const files = listAllTsFiles(rootDir);
  const regex = new RegExp(rule.regex, 'i');
  const violations = [];
  // 走査対象ファイルを順に開き、TODO/FIXME/HACK に対応する行を検出して違反として記録する
  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    // 各行を順に評価し、設定された正規表現にマッチする TODO コメントを違反として収集する
    for (let i = 0; i < lines.length; i += 1) {
      // TODO/FIXME/HACK にチケット ID が付いていない行だけを違反として記録し、その他のコメントは検査対象から外す
      if (regex.test(lines[i])) violations.push({ ruleId: 'todo_ticket_required', message: `${rel}:${i + 1} missing ticket for TODO/FIXME/HACK`, file: rel, line: i + 1 });
    }
  }

  return violations;
}

/**
 * anti_mvp ポリシー全体を実行し、禁止語句と TODO チケット必須の両チェック結果を集約する。
 * @param {string} rootDir 検査対象のルートディレクトリ
 * @returns 検査結果オブジェクト（成功フラグと違反一覧）
 */
async function runAll(rootDir) {
  const cfg = readYamlConfig(rootDir);
  const violations = [];
  // banned_terms チェック実行中の例外はランナーエラーとして記録し、全体処理は継続する
  try {
    // banned_terms の各違反を 1 件ずつ violations 配列へ集約し、レポート経路を統一する
    for (const v of bannedTermsCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    // ランナー内部例外を違反として扱い、全体の検査を継続する
    violations.push({ ruleId: 'banned_terms', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  // todo_ticket_required チェック実行中の例外もランナーエラーとして記録し、他の結果と合わせて返す
  try {
    // todo_ticket_required の各違反を 1 件ずつ violations 配列へ集約し、レポート経路を統一する
    for (const v of todoTicketRequiredCheck(rootDir, cfg)) violations.push(v);
  } catch (e) {
    // ランナー内部例外を違反として扱い、後続処理を継続する
    violations.push({ ruleId: 'todo_ticket_required', message: `checker crashed: ${e && e.message ? e.message : String(e)}` });
  }

  return { ok: violations.length === 0, violations };
}

/** CLI エントリポイント。リポジトリルートを基準とした anti_mvp ポリシーチェックを実行する。 */
async function main() {
  const repoRoot = process.cwd();
  const { ok, violations } = await runAll(repoRoot);
  // 1 件でも違反が検出された場合は CI で検知できるよう非ゼロ終了コードで失敗させる
  if (!ok) {
    // 収集した違反をファイル/ルール単位で stderr へ列挙し、修正対象を特定しやすくする
    for (const v of violations) {
      process.stderr.write(`anti-mvp ❌ ${v.ruleId}: ${v.message}\n`);
    }

    process.exit(1);
  }

  process.stdout.write('anti-mvp ✅ no violations\n');
}

main().catch((e) => {
  process.stderr.write(`anti-mvp ❌ runner error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

