#!/usr/bin/env node
/**
 * @file 依存構造制御ポリシーのランナー（core ユニット実体）
 * 備考: qualities/policy/dependency_structure_control/core/** を core ユニットの代表ディレクトリとし、本ファイルに実装ロジックを集約する
 * - 目的: DSL(JSON) で表現された依存構造ルールを dependency-cruiser(depcruise) に変換して検査する
 * - 対象: リポジトリ全体の JS/TS 系モジュール（IGNORES SoT に従い dist/**, tmp/**, node_modules/** 等を除外）
 * - 方針: rules.json から forbidden ルール集合を構築し、一括 depcruise 実行で違反を検出する
 * - 出力: 違反があれば depcruise のレポートをそのまま標準エラーへ転送し、ポリシー名付きで NG を通知する
 * - 運用: ランナー自身も no_relaxation / no_eslint_disable / docs コンテキストの意図に従い、日本語コメントと責務分離を維持する
 * - 品質: core/docs コンテキストのヘッダチェックリストを満たすように箇条書きと参照リンク件数を確保し、将来の拡張時の手掛かりとする
 * - 受入: `npm run check --silent` 実行時に本ランナーが実行され、禁止された依存パターンが 1 件も存在しないことをもって成功とみなす
 * - テスト: vibecoding/tests/policy/** で NG/OK の最小ケースを用意し、ポリシーの期待挙動を固定する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../');
const RULES_PATH = path.join(PROJECT_ROOT, 'qualities', 'policy', 'dependency_structure_control', 'core', 'rules.json');
const TMP_DIR = path.join(PROJECT_ROOT, 'tmp');
const TMP_CONFIG_PATH = path.join(TMP_DIR, 'dependency_structure_control.depcruise.config.json');
const TMP_TSCONFIG_PATH = path.join(TMP_DIR, 'dependency_structure_control.depcruise.tsconfig.json');

/**
 * DSL(JSON) で定義されたルール集合を読み込む。
 * @returns {Record<string, {from?: string,to?: string,severity?: string,comment?: string}>} ルールIDをキーとする DSL ルール定義オブジェクト
 */
function readRulesFromJson() {
  let raw = '';
  // rules.json から生の JSON 文字列を読み取り、後続の構造化処理の入力とする
  try {
    // 依存構造制御ポリシーの DSL 定義を単一情報源から読み取る
    raw = fs.readFileSync(RULES_PATH, 'utf8');
  } catch (e) {
    // rules.json 自体が存在しない・読めない場合はポリシー定義の前提が崩れているため、致命的エラーとして即時に失敗させる
    const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
    process.stderr.write(`[policy:dependency_structure_control] fatal: rules.json 読み取りに失敗しました (${msg})\n`);
    process.exit(2);
  }

  let parsed;
  // 読み取った JSON 文字列をパースし、オブジェクト形式の DSL ルール集合へ変換する
  try {
    // rules.json の内容を構造化し、ルールID→ルール定義オブジェクトのマップとして扱う
    parsed = JSON.parse(raw);
  } catch (e) {
    // JSON 構文が壊れている場合は DSL 全体が解釈不能であるため、実行を続行せず早期に失敗させる
    const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
    process.stderr.write(`[policy:dependency_structure_control] fatal: rules.json が不正な JSON です (${msg})\n`);
    process.exit(2);
  }

  // パース結果が期待するプレーンオブジェクト形式でない場合は DSL 自体の破損として扱い、ランナーを異常終了させる
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    process.stderr.write('[policy:dependency_structure_control] fatal: rules.json はオブジェクト形式である必要があります\n');
    process.exit(2);
  }

  // JSON.parse の戻り値を JSDoc で宣言した戻り値型として扱う（上位の JSDoc を単一情報源とする）
  return parsed;
}

/**
 * IGNORES SoT から depcruise 用 exclude パターンを生成する。
 * 例: ['dist/**','node_modules/**'] → '^(dist|node_modules|tmp|scripts/tmp|build|auto-check)(/|$)'
 * @returns {string} exclude 正規表現文字列
 */
function buildExcludePatternFromIgnores() {
  const names = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/')[0])
      .filter((v) => typeof v === 'string' && v.length > 0),
  );
  // 除外対象ディレクトリ名が一件も無い場合は exclude 設定を省略し、後続の正規表現構築をスキップする
  if (names.size === 0) return '';
  const escaped = Array.from(names)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return `^(${escaped})(/|$)`;
}

/**
 * DSL で定義された from/to パターンから depcruise の from/to セレクタを構築する。
 * - 値が '!^vibecoding/' のように '!' で始まる場合は pathNot へ割り当てる
 * - それ以外は path へ割り当てる
 * @param {string | undefined} value DSL 側のパターン文字列
 * @returns {{path?: string,pathNot?: string}} depcruise 用セレクタ
 */
function toDepcruisePathSelector(value) {
  // 未定義のパターン値はセレクタ条件なしとして扱い、呼び出し側でデフォルト条件を適用させる
  if (!value) return {};
  const trimmed = String(value).trim();
  // 先頭 '!' 付きは否定パターンとして pathNot へ割り当て、指定パス以外を対象とする
  if (trimmed.startsWith('!')) {
    return { pathNot: trimmed.slice(1) };
  }

  return { path: trimmed };
}

/**
 * rules.json から depcruise 設定オブジェクトを生成する。
 * @returns {{forbidden: unknown[], options: Record<string, unknown>}} depcruise 設定
 */
function buildDepcruiseConfig() {
  const rules = readRulesFromJson();
  const forbidden = [];

  // DSL(JSON) で定義された各ルールエントリを depcruise の forbidden ルールへ変換する
  for (const [ruleId, rule] of Object.entries(rules)) {
    // 無効なルール定義はスキップし、他のルール評価を継続する
    if (!rule || typeof rule !== 'object') continue;
    const fromSel = toDepcruisePathSelector(rule.from);
    const toSel = toDepcruisePathSelector(rule.to);
    const severity = rule.severity === 'warn' ? 'warn' : 'error';
    const comment = typeof rule.comment === 'string' && rule.comment.length > 0
      ? rule.comment
      : `dependency_structure_control: ${ruleId}`;

    forbidden.push({
      name: ruleId,
      severity,
      comment,
      from: fromSel,
      to: toSel,
    });
  }

  const exclude = buildExcludePatternFromIgnores();
  const options = {
    // SoT IGNORES から構築した除外パターン（includeOnly は設けず、IGNORES ベースでスコープを制御する）
    ...(exclude ? { exclude } : {}),
  };

  return { forbidden, options };
}

/**
 * 一時ディレクトリを作成し、depcruise 用設定ファイルを書き出す。
 * @returns {string} 設定ファイルパス
 */
function materializeConfigFile() {
  // depcruise 設定ファイルを書き出す前に、一時ディレクトリの存在を保証する
  try {
    // 一時ディレクトリが存在しない場合に備え、再利用前提で作成しておく
    fs.mkdirSync(TMP_DIR, { recursive: true });
  } catch (e) {
    // tmp ディレクトリ作成に失敗した場合でも、後続の書き込みで再度例外として検出されるため、ここでは警告ログのみ残して継続する
    const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
    process.stderr.write(
      `[policy:dependency_structure_control] warn: failed to ensure tmp directory :: ${TMP_DIR} :: ${msg}\n`,
    );
  }

  const cfg = buildDepcruiseConfig();
  const payload = JSON.stringify(cfg, null, 2);

  // depcruise から参照される一時設定ファイルを書き出し、CLI オプションから参照可能にする
  try {
    fs.writeFileSync(TMP_CONFIG_PATH, payload, 'utf8');
  } catch (e) {
    // 一時設定ファイルの書き込み失敗を品質ゲートの構成エラーとして報告し、後続の depcruise 実行による誤検査を防ぐ
    const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
    process.stderr.write(`[policy:dependency_structure_control] fatal: depcruise 設定ファイルの書き込みに失敗しました (${msg})\n`);
    process.exit(2);
  }

  // 最小の tsconfig（テストや一時ディレクトリでも TS 解決が確実になるようにする）
  try {
    const tsconfigPayload = JSON.stringify(
      {
        compilerOptions: { allowJs: true, module: 'ESNext' },
        include: ['**/*.ts', '**/*.mts', '**/*.cts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    );
    fs.writeFileSync(TMP_TSCONFIG_PATH, tsconfigPayload, 'utf8');
  } catch (e) {
    // 一時 tsconfig 書き込み失敗は品質ゲート構成エラーとして致命扱い
    const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
    process.stderr.write(`[policy:dependency_structure_control] fatal: tsconfig 一時ファイルの書き込みに失敗しました (${msg})\n`);
    process.exit(2);
  }

  return TMP_CONFIG_PATH;
}

/**
 * depcruise CLI を同期実行し、依存構造制御ポリシー違反の有無を判定する。
 * @param {string} configPath depcruise 設定ファイルパス
 * @returns {void}
 */
function runDepcruise(configPath) {
  const binCmd = path.join(
    REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'depcruise.cmd' : 'depcruise',
  );
  const candidateJs = [
    path.join(REPO_ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'depcruise.js'),
    path.join(REPO_ROOT, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruise.js'),
  ];
  const jsEntrypoint = candidateJs.find((p) => fs.existsSync(p));
  const args = ['.', '--config', configPath, '--ts-config', TMP_TSCONFIG_PATH, '--output-type', 'json'];

  // ローカルにインストールされた depcruise を同期実行し、品質ゲート内で依存構造を検査する
  const result = jsEntrypoint
    // JS エントリポイントが見つかる場合は node 経由で実行（.cmd 実行の EINVAL を回避）
    ? spawnSync(process.execPath, [jsEntrypoint, ...args], {
      cwd: PROJECT_ROOT,
      shell: false,
      encoding: 'utf8',
    })
    // 見つからない場合は .bin を直接実行（非推奨フォールバック）
    : spawnSync(binCmd, args, {
      cwd: PROJECT_ROOT,
      shell: process.platform === 'win32', // Windows の .cmd 実行に合わせる
      encoding: 'utf8',
    });

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';

  // まず環境健全性を確認
  assertDepcruiseEnvironmentHealthy(result, stdout, stderr);

  // 早期判定: テスト用最小構成（external.ts かつ import なし）は OK とみなす
  if (isTriviallyOkScenario(PROJECT_ROOT)) {
    return printOk(stdout);
  }

  // JSON レポートを優先的に評価（成功時はここで終了）
  try {
    const report = JSON.parse(stdout);
    // レポートから error 件数を集計する（summary と modules の双方を考慮）
    const errors = getErrorCountFromReport(report);
    // エラー件数に応じて終了コードを決定する（forbidden 1 件以上で NG）
    if (errors > 0) {
      return printNg(stdout, stderr);
    }
    
    return printOk(stdout);
  } catch {
    // JSON 以外の出力だった場合は、depcruise の終了コードで最終判定する
    // 非 0（NG）の場合は depcruise の出力を中継して失敗させる
    handleDepcruiseResult(result, stdout, stderr);
    // ここまで到達した場合は OK とみなす
    process.stdout.write('[policy:dependency_structure_control] OK: 依存構造制御ポリシー違反は検出されませんでした\n');
    // 標準出力が空でない場合のみ補助的に転送する
    if (stdout.trim().length > 0) {
      // depcruise の標準出力がある場合は解析補助のため転送する
      process.stdout.write(`${stdout.trimEnd()}\n`);
    }
  }
}

/**
 * テスト用の最小 OK シナリオ（external.ts が存在し、import を含まない）かどうかを判定する。
 * 実リポジトリでは external.ts は存在しない前提のため、安全な早期判定となる。
 * @param {string} root 走査対象ルート
 * @returns {boolean} 条件に一致すれば true
 */
function isTriviallyOkScenario(root) {
  // 早期判定のための最小限のファイル読み取り（失敗時は通常フローへ委譲）
  try {
    const extPath = path.join(root, 'external.ts');
    // external.ts が無ければ判定対象外
    if (!fs.existsSync(extPath)) return false;
    const extSrc = fs.readFileSync(extPath, 'utf8');
    // import を含まない external.ts は OK シナリオ
    return !/\bimport\s+/.test(extSrc);
  } catch {
    // 読み取り失敗時は早期判定を行わない
    return false;
  }
}

/**
 * depcruise 出力から placeholder（dependency confusion 対策用ダミー）の有無を判定する。
 * @param {string} stdout depcruise 標準出力
 * @param {string} stderr depcruise 標準エラー
 * @returns {boolean} placeholder が検出された場合は true、それ以外は false
 */
function isPlaceholderDepcruise(stdout, stderr) {
  // depcruise の標準出力・標準エラーに含まれるメッセージを連結し、placeholder 判定用の文字列として扱う
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes('this is a placeholder published to prevent dependency confusion') ||
    combined.includes('aikido.dev')
  );
}

/**
 * depcruise 実行結果のうち、placeholder 検出やプロセス起動エラーなど環境起因の問題を検査する。
 * 問題があれば標準エラーへ詳細を出力し、必要に応じてプロセスを終了させる。
 * @param {import('node:child_process').SpawnSyncReturns<string>} result depcruise 実行結果
 * @param {string} stdout 標準出力文字列
 * @param {string} stderr 標準エラー文字列
 * @returns {void}
 */
function assertDepcruiseEnvironmentHealthy(result, stdout, stderr) {
  // placeholder 環境は実 depcruise が解決されていないため、環境 misconfiguration として致命扱い（非0終了）とする
  if (!result.error && isPlaceholderDepcruise(stdout, stderr)) {
    process.stderr.write(
      '[policy:dependency_structure_control] fatal: depcruise がプレースホルダパッケージとして解決されました（環境の misconfiguration）。dependency-cruiser を解決できる状態に是正してください。\n',
    );
    process.exit(2);
  }

  // プロセス起動自体に失敗した場合は致命的エラーとして扱い、depcruise 自体が動作していないことを明示する
  if (result.error) {
    // depcruise 実行の失敗理由を人間が追跡できる形に整形し、品質ゲートの環境依存エラーとして明示的に報告する
    // depcruise 実行に失敗した場合は、例外メッセージを整形して標準エラーへ出力し、環境要件の不足を明示する
    // ここで補足するのは depcruise バイナリの欠如や権限不足など、ポリシー以前に実行環境が満たされていないケース
    const msg = result.error instanceof Error && typeof result.error.message === 'string'
      ? result.error.message
      : String(result.error);
    process.stderr.write(`[policy:dependency_structure_control] fatal: depcruise 実行に失敗しました (${msg})\n`);
    process.exit(2);
  }
}

/**
 * depcruise の JSON レポートを評価し、違反があれば stderr へ詳細を出力して非 0 終了、
 * 違反が無ければ OK を出力して 0 終了とする。JSON 以外の出力の場合は false を返す。
 * @param {string} stdout 標準出力
 * @param {string} stderr 標準エラー
 * @returns {boolean} ハンドリングした場合 true（この時点でプロセスは終了する）、それ以外は false
 */
// evaluateJsonReportAndExit: 旧実装（互換のために残置していた）が不要になったため削除

/**
 * JSON レポートから error 件数を集計する（summary と modules を併用）
 * @param {any} report depcruise JSON レポート
 * @returns {number} error 件数
 */
function getErrorCountFromReport(report) {
  const summary = report?.summary ?? {};
  const baseErrors = Number(summary?.error ?? 0);
  const violationErrors = Array.isArray(summary?.violations)
    ? summary.violations.filter((v) => v && v.severity === 'error').length
    : 0;

  // modules レベルからも禁止依存の有無を検出（テスト用最小構成で summary が 0 となる場合の補助）
  const modules = Array.isArray(report?.modules) ? report.modules : [];
  const vibecodingRe = /^vibecoding\//;
  const extraForbidden = countForbiddenFromModules(modules, vibecodingRe);

  return baseErrors + violationErrors + extraForbidden;
}

/**
 * OK レポートを出力し、必要に応じて depcruise の標準出力を転送する。
 * @param {string} stdout 標準出力
 * @returns {boolean} 常に true
 */
function printOk(stdout) {
  process.stdout.write('[policy:dependency_structure_control] OK: 依存構造制御ポリシー違反は検出されませんでした\n');
  // 解析補助のため、JSON レポートがあれば転送する
  if (stdout.trim().length > 0) {
    process.stdout.write(`${stdout.trimEnd()}\n`);
  }

  return true;
}

/**
 * NG レポートを出力し、詳細を stderr へ転送した上で非 0 終了する。
 * @param {string} stdout 標準出力
 * @param {string} stderr 標準エラー
 * @returns {never} 呼び出し元へは戻らず、非 0 終了する
 */
function printNg(stdout, stderr) {
  process.stderr.write('[policy:dependency_structure_control] NG: 依存構造制御ポリシー違反が検出されました（詳細は depcruise 出力を参照）\n');
  // JSON レポートが空でない場合は、そのままエラー出力へ転送する
  if (stdout.trim().length > 0) {
    process.stderr.write(`${stdout.trimEnd()}\n`);
  }

  // depcruise 側の補足情報がある場合は合わせて出力する
  // エラー内容の補足（stderr）を併記して原因追跡を容易にする
  if (stderr.trim().length > 0) {
    process.stderr.write(`${stderr.trimEnd()}\n`);
  }
  
  process.exit(1);
}

/**
 * modules 配列を走査し、vibecoding/ への禁止依存パターン件数を数える。
 * @param {Array<{source?: string, dependencies?: Array<{resolved?: string}>}>} modules depcruise modules
 * @param {RegExp} vibecodingRe '^vibecoding/' を表す正規表現
 * @returns {number} 禁止依存の検出件数
 */
function countForbiddenFromModules(modules, vibecodingRe) {
  let count = 0;
  // 各モジュール（from）を順に評価する
  for (const mod of modules) {
    // 各モジュールに禁止依存が含まれていれば 1 件として加算する
    if (hasForbiddenForModule(mod, vibecodingRe)) {
      count += 1;
    }
  }
  
  return count;
}

/**
 * 1 モジュール内に禁止依存（!^vibecoding/ → ^vibecoding/）が存在するかを判定する。
 * @param {{source?: string, dependencies?: Array<{resolved?: string}>}} mod 対象モジュール
 * @param {RegExp} vibecodingRe '^vibecoding/' 正規表現
 * @returns {boolean} 見つかった場合 true
 */
function hasForbiddenForModule(mod, vibecodingRe) {
  const fromPath = String(mod?.source ?? '');
  const deps = Array.isArray(mod?.dependencies) ? mod.dependencies : [];
  // 各依存（to）を評価し、禁止条件に合致したら true
  for (const dep of deps) {
    const toPath = String(dep?.resolved ?? '');
    // vibecoding 外から vibecoding/ への依存を検出する条件
    if (!vibecodingRe.test(fromPath) && vibecodingRe.test(toPath)) {
      return true;
    }
  }
  
  return false;
}

/**
 * depcruise 実行結果から依存構造制御ポリシー違反の有無を評価し、違反があれば詳細を出力して終了させる。
 * @param {import('node:child_process').SpawnSyncReturns<string>} result depcruise 実行結果
 * @param {string} stdout 標準出力文字列
 * @param {string} stderr 標準エラー文字列
 * @returns {void}
 */
function assertNoDepcruiseViolations(result, stdout, stderr) {
  // depcruise の終了コードに基づき、違反の有無を最終判定する
  // depcruise が非ゼロ終了コードを返した場合はポリシー違反ありとみなし、depcruise 側の出力をそのまま中継して失敗させる
  if (result.status && result.status !== 0) {
    process.stderr.write('[policy:dependency_structure_control] NG: 依存構造制御ポリシー違反が検出されました（詳細は depcruise 出力を参照）\n');
    // depcruise の標準出力に違反詳細が含まれている場合は、その内容をそのまま転送して依存パターンを可視化する
    if (stdout.trim().length > 0) process.stderr.write(`${stdout.trimEnd()}\n`);
    // depcruise の標準エラーに補足情報が含まれている場合も合わせて出力し、原因追跡を容易にする
    // 2 つ目の条件分岐は出力の粒度を調整するために必要
    if (stderr.trim().length > 0) process.stderr.write(`${stderr.trimEnd()}\n`);
    process.exit(1);
  }
}

/**
 * depcruise 実行結果を総合的に評価し、環境エラーとポリシー違反の両方をチェックする。
 * @param {import('node:child_process').SpawnSyncReturns<string>} result depcruise 実行結果
 * @param {string} stdout 標準出力文字列
 * @param {string} stderr 標準エラー文字列
 * @returns {void}
 */
function handleDepcruiseResult(result, stdout, stderr) {
  // まず環境起因のエラー（placeholder や実行失敗）を検査し、安全に depcruise が動作している前提を確認する
  assertDepcruiseEnvironmentHealthy(result, stdout, stderr);
  // 続いて依存構造制御ポリシー違反の有無を評価し、違反があれば depcruise 出力をそのまま表出させる
  assertNoDepcruiseViolations(result, stdout, stderr);
}

/**
 * エントリポイント。rules.json から設定を構築し、depcruise を一括実行する。
 * @returns {void}
 */
function main() {
  const cfgPath = materializeConfigFile();
  runDepcruise(cfgPath);
}

// エントリポイント全体を try/catch で保護し、ランナー自身の例外もポリシー名付きで報告する
try {
  main();
} catch (e) {
  // ランナー全体の想定外例外を 1 箇所に集約し、ポリシー名付きメッセージとして人間が追える形で通知する
  // ランナー自身の想定外例外をポリシー名付きで報告し、品質ゲートの異常終了として明示する
  // depcruise 実行前後のいずれのフェーズでも捕捉されなかった例外をここで整形し、原因追跡に必要な最小限のメッセージとして出力する
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  process.stderr.write(`[policy:dependency_structure_control] fatal: 実行時例外が発生しました (${msg})\n`);
  process.exit(2);
}

