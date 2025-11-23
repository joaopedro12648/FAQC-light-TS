/**
 * @file ESLint gate runner with post-message for comment-related errors.
 * - 目的: コメント追記/更新系エラー検出時に、.cursorrules の全局コメント規範を末尾に提示する
 * - 適用: qualities/check-steps.ts の lint ステップ（CI/本番ゲート）
 * - 終了: errorCount>0 または warningCount>0 を非0終了（--max-warnings=0 等価）
 * - 出力: 通常フォーマッタ出力 +（条件一致時のみ）規範メッセージ追記
 * - 境界: フォーマッタや終了コード挙動は変更しない（集計と末尾追記のみ）
 * - 責務: ESLint Node API 実行、結果集計、.cursorrules 抽出、末尾出力
 * - 前提: .cursorrules は YAML 互換インデント（2/4/6 スペース）で記述されている
 * - 例外: .cursorrules 読取失敗時は末尾追記を抑止（lint 結果のみを返す）
 */
import { ESLint } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';

/** コメント追記/更新系として扱う ruleId 集合（完全一致） */
const COMMENT_RULE_IDS = new Set([
  // jsdoc（コメントの新規追加/本文更新を要求）
  'jsdoc/require-jsdoc',
  'jsdoc/require-description',
  'jsdoc/require-param-description',
  'jsdoc/require-returns-description',
  'jsdoc/require-param',
  'jsdoc/require-returns',
  'jsdoc/require-file-overview',
  'jsdoc/check-alignment',
  'jsdoc/check-indentation',
  'jsdoc/empty-tags',
  // eslint-comments（ディレクティブに説明を要求）
  'eslint-comments/require-description',
  // リポジトリ内プラグイン（コメント整形・必須化）
  'blockfmt/block-comment-formatting',
  'blockfmt/no-empty-comment',
  'blockfmt/prefer-single-line-block-comment',
  'blockfmt/no-blank-lines-in-block-comment',
  'blockfmt/require-describe-comment',
  // インラインコメントのラベル風メタ記述抑止
  'inlineLbl/no-label-style-inline-comment',
  // 連続行コメントの類似抑止（内容の更新を要求）
  'cmtSim/consecutive-line-comments-similarity',
  // 制御構造コメント必須（説明コメントの追記を要求）
  'control/require-comments-on-control-structures',
  // ヘッダ関連（コメントの追加/更新を要求）
  'header/header-bullets-min',
  'singleHeader/single-file-header',
]);

/**
 * .cursorrules から style.comment_style を抽出する（単純構文対応の軽量実装）
 * - 期待構造を前提に正規表現でブロック抽出し、description / exceptions / guidance を取り出す
 * - 想定外の構造の場合は null を返して末尾出力を抑止する
 * @returns {{description:string,exceptions:string[],guidance:string[]}|null} 解析結果（存在しない場合は null）
 */
function extractCommentStyleFromCursorrules() {
  // 入力取得に失敗した場合は末尾出力を抑止し、終了コードへは影響させない
  const raw = readCursorrulesRaw();
  // .cursorrules が読めない場合は早期に終了する
  if (raw == null) return null;

  // 必要最小限の範囲（style → comment_style）に限定して抽出する
  const styleBlock = extractStyleBlock(raw);
  // 規範セクションが無い場合は誤検出を避けるため終了する
  if (!styleBlock) return null;

  const csBlock = extractCommentStyleBlock(styleBlock);
  // comment_style が見つからない場合は末尾出力を抑止する
  if (!csBlock) return null;

  // description / exceptions / guidance を抽出する
  const description = parseDescription(csBlock);
  const exceptions = parseList(csBlock, 'exceptions');
  const guidance = parseList(csBlock, 'guidance');

  // すべて空の場合は無効扱いとして末尾出力を抑止する
  if (!description && exceptions.length === 0 && guidance.length === 0) return null;

  return { description, exceptions, guidance };
}

/**
 * .cursorrules を UTF-8 で読み出す。
 * @returns {string|null} ファイル内容（失敗時は null を返す）
 */
function readCursorrulesRaw() {
  // この try は I/O 例外を呼び出し側へ伝播させず、末尾出力を抑止する目的で必要
  try {
    const fp = path.join(process.cwd(), '.cursorrules');
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

/**
 * style ブロックを抽出する（先頭の style: から次のトップレベルセクション直前まで）。
 * @param {string} raw 入力全体
 * @returns {string|null} 抽出したブロック
 */
function extractStyleBlock(raw) {
  // YAML のインデントを状態機械で追跡し、空行は終端にしない
  const lines = String(raw).split(/\r?\n/);
  let i = 0;
  // トップレベル 'style:' を特定する（インデント0）
  while (i < lines.length) {
    const line = lines[i];
    // トップレベル鍵の候補を識別して探索範囲を狭める（先頭非空白+コロンをトップレベル鍵とみなす）
    if (/^[^\s].*:$/.test(line) || /^\S.*:$/.test(line)) {
      // 見つかったトップレベルキーが style なら抽出を開始する
      if (/^style:\s*$/.test(line.trim())) {
        i += 1;
        break;
      }
    }

    i += 1;
  }

  // 到達不能時は抽出対象が無いと判断して終了する
  if (i >= lines.length) return null;

  const buf = [];
  // 次のトップレベル鍵までの本文を収集する（空行やコメントは保持）
  for (; i < lines.length; i += 1) {
    const s = lines[i];
    // 空行やコメントはそのまま保持し、終端判定の対象にしない
    if (/^\s*$/.test(s) || /^\s*#/.test(s)) {
      buf.push(s);
      continue;
    }

    // 次のトップレベルキーで終端（別セクションへの逸脱を防ぐ）
    if (/^[^\s].*:$/.test(s)) {
      break;
    }

    buf.push(s);
  }

  return buf.join('\n');
}

/**
 * style.comment_style のサブブロックを抽出する。
 * @param {string} styleBlock style の本文
 * @returns {string|null} 抽出したサブブロック
 */
function extractCommentStyleBlock(styleBlock) {
  // 2スペースインデントの 'comment_style:' から、次の2スペース鍵またはトップレベル終端までを抽出する
  const lines = String(styleBlock).split(/\r?\n/);
  let i = 0;
  // comment_style の定義位置を特定する（2スペース+comment_style:）
  while (i < lines.length) {
    const line = lines[i];
    // 宣言行を検出して本文開始位置を決定する
    if (/^\s{2}comment_style:\s*$/.test(line)) {
      i += 1;
      break;
    }

    i += 1;
  }

  // 宣言が無ければ抽出できないため終了する
  if (i >= lines.length) return null;

  const buf = [];
  // 同レベルの別鍵またはトップレベルまで本文を収集する（空行やコメントは保持）
  for (; i < lines.length; i += 1) {
    const s = lines[i];
    // トップレベル鍵に戻ったら終端（範囲逸脱を防ぐ）
    if (/^[^\s].*:$/.test(s)) break;
    // 2スペースの別鍵が始まったら終端（同レベルの別セクション開始）
    if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(s)) break;
    buf.push(s);
  }

  return buf.join('\n');
}

/**
 * description を抽出（ブロック/インライン両対応）。
 * @param {string} csBlock comment_style の本文
 * @returns {string} description の本文（存在しなければ空文字）
 */
function parseDescription(csBlock) {
  // ブロックスカラーの有無を先に判定して表現揺れに強くする
  const descBlock = csBlock.match(/^\s{4}description:\s*(?:>\s*|\|\s*)$(?:\r?\n)+((?:\s{6}.*\r?\n?)+)/m);
  // ブロック形式の description は 6 スペースの本文行を結合して確定する
  if (descBlock) {
    const lines = descBlock[1].split(/\r?\n/);

    // 6 スペースの整形記号を除去して本文へ整える
    const normalized = lines
      .map((l) => l.replace(/^\s{6}/, ''))
      .join('\n')
      .trim();

    return normalized;
  }

  // ブロック記法が無い場合は 1 行の description を採用する（引用符は除去）
  const descInline = csBlock.match(/^\s{4}description:\s*(.+)\s*$/m);
  // この分岐はインライン形式の description を本文として採用する
  if (descInline) {
    return descInline[1].replace(/^"|"$/g, '').trim();
  }

  return '';
}

/**
 * 箇条書き（- item）を抽出する。
 * @param {string} csBlock comment_style の本文
 * @param {'exceptions'|'guidance'} key 対象キー
 * @returns {string[]} 抽出した要素配列
 */
function parseList(csBlock, key) {
  // 指定キーのブロックを抽出し、先頭が "- " の行を配列化する
  const re = new RegExp(`^\\s{4}${key}:\\s*$(?:\\r?\\n)+((?:\\s{6}-\\s+.*\\r?\\n?)+)`, 'm');
  const match = csBlock.match(re);
  // 対応ブロックが無い場合は空配列を返す
  if (!match) return [];

  const items = [];
  const lines = match[1].split(/\r?\n/);

  // 箇条書き各行を要素として抽出する（空行は除外）
  for (const line of lines) {
    // 空行は要素ではないためスキップする
    if (!line.trim()) continue;
    items.push(line.replace(/^\s{6}-\s+/, '').replace(/^"|"$/g, '').trim());
  }

  return items;
}

/**
 * 結果配列から「コメント追記/更新系ルール」の違反有無を判定する。
 * @param {Array<import('eslint').ESLint.LintResult>} results ESLint 実行結果配列
 * @returns {boolean} 対象ルールの違反が 1 件以上あれば true
 */
function hasCommentSubsetHit(results) {
  // フォーマッタ出力とは独立に対象ルールの有無だけを確認する
  for (const r of results) {
    // 各ファイルの messages を走査して ruleId を確認する
    // コメント関連の違反が含まれているかを検査する
    for (const m of r.messages) {
      const id = m.ruleId;
      // コメント系ルールに当たったときは末尾の規範を出すため早期に返す
      if (id && COMMENT_RULE_IDS.has(id)) return true;
    }
  }

  return false;
}

/**
 * ゲート本体。ESLint を実行し、必要時のみ規範メッセージを追記する。
 * @returns {Promise<void>} 非同期実行
 */
async function main() {
  const eslint = createESLint();
  const results = await runLint(eslint);

  await printFormatted(eslint, results);
  await printPostMessage(results);

  exitWithResults(results);
}

/**
 * ESLint インスタンスを生成する。
 * @returns {ESLint} ESLint インスタンス
 */
function createESLint() {
  return new ESLint({
    // Flat config file
    overrideConfigFile: path.join('qualities', 'eslint', 'eslint.config.mjs'),
    // jsdoc/require-jsdoc の空JSDocスタブ自動付与だけを抑止し、それ以外のfixは許可する
    fix: (problem) => problem.ruleId !== 'jsdoc/require-jsdoc',
    cache: true,
    cacheLocation: path.join('node_modules', '.cache', 'eslint'),
    cwd: process.cwd(),
  });
}

/**
 * ESLint を実行し、結果を返す。
 * @param {ESLint} eslint ESLint インスタンス
 * @returns {Promise<Array<import('eslint').ESLint.LintResult>>} 実行結果配列
 */
async function runLint(eslint) {
  // Allow file globs via CLI args; default to '.'
  const patterns = process.argv.slice(2);
  const targets = patterns.length > 0 ? patterns : ['.'];
  const results = await eslint.lintFiles(targets);

  // 既存キャッシュの更新を反映（副作用あり）
  await ESLint.outputFixes(results);

  return results;
}

/**
 * フォーマッタ出力を表示する。
 * @param {ESLint} eslint ESLint インスタンス
 * @param {Array<import('eslint').ESLint.LintResult>} results 実行結果
 * @returns {Promise<void>} 表示完了
 */
async function printFormatted(eslint, results) {
  const formatter = await eslint.loadFormatter('stylish');
  const text = formatter.format(results);

  // 出力が空でなければ改行を保証して書き出す
  if (text && text.trim().length > 0) {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }
}

/**
 * コメント追記/更新系ルールにヒットした場合、.cursorrules の規範メッセージを出力する。
 * @param {Array<import('eslint').ESLint.LintResult>} results 実行結果
 * @returns {Promise<void>} 出力完了
 */
async function printPostMessage(results) {
  // 対象ヒット時のみ追加出力を行う
  if (hasCommentSubsetHit(results)) {
    const cs = extractCommentStyleFromCursorrules();

    // 抽出に失敗した場合は静かに抑止する
    if (cs) {
      const out = [];
      out.push('');
      out.push('コメント追記/更新時は下記のグローバルルールを厳守すること');
      out.push('');

      // 空要素は出力しない
      if (cs.description) {
        out.push(cs.description);
        out.push('');
      }

      // 空配列の見出し出力は避ける
      if (cs.exceptions.length > 0) {
        out.push('例外:');
        // 例外項目を1行ずつ出力する
        for (const x of cs.exceptions) out.push(`- ${x}`);
        out.push('');
      }

      // 空配列の見出し出力は避ける
      if (cs.guidance.length > 0) {
        out.push('ガイダンス:');
        // ガイダンス項目を1行ずつ出力する
        for (const g of cs.guidance) out.push(`- ${g}`);
        out.push('');
      }

      process.stdout.write(out.join('\n'));
    }
  }
}

/**
 * 結果の件数から終了コードを計算し、プロセスを終了する。
 * @param {Array<import('eslint').ESLint.LintResult>} results 実行結果
 * @returns {never} プロセスを終了
 */
function exitWithResults(results) {
  const errorCount = results.reduce((a, r) => a + (r.errorCount || 0), 0);
  const warningCount = results.reduce((a, r) => a + (r.warningCount || 0), 0);

  process.exit(errorCount > 0 || warningCount > 0 ? 1 : 0);
}

main().catch((e) => {
  const msg = e && typeof e.message === 'string' ? e.message : String(e);
  const stack = e && typeof e.stack === 'string' ? e.stack : '';
  process.stderr.write(`[lint-gate] failed: ${msg}\n`);
  // 例外原因を追跡しやすくするために、スタックが存在するときだけ追加出力する
  if (stack) {
    process.stderr.write(`${stack}\n`);
  }

  process.exit(1);
});

