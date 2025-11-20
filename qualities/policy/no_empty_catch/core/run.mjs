#!/usr/bin/env node
/**
 * @file empty-catch 禁止ポリシーのランナー（core ユニット実体）
 * 備考: qualities/policy/no_empty_catch/core/** を core ユニットの代表ディレクトリとし、本ファイルに実装ロジックを集約する
 * - 目的: 空の catch ブロックや実質的に例外を握り潰している catch ブロックを検出し、例外処理ポリシーを強制する
 * - 対象: src/**, vibecoding/**, qualities/**, scripts/** 配下の JS/TS 系ファイル（IGNORES SoT に従い dist/**, tmp/**, node_modules/** 等を除外）
 * - 方針: テキストベースの軽量解析で catch ブロックを抽出し、コメント付き許容パターンと意味のある処理を持つブロックのみ許可する
 * - 出力: 違反があればファイルパス・行番号・理由・抜粋を stderr に列挙し、CI ログから直接修正箇所を特定できるようにする
 * - 運用: ランナー自身も core/docs コンテキストの方針に従い、日本語コメントと責務分離を維持する
 * - 品質: empty/trivial catch を禁止することで例外握り潰しを防ぎ、例外ポリシーとロギング方針の一貫性を保つ
 * - 受入: `npm run check --silent` 実行時に本ランナーが成功し、空 catch や意味のない catch が検出されないことをもって受け入れ完了とみなす
 * - テスト: vibecoding/tests/policy/** で NG/OK の最小ケースを用意し、例外処理ポリシーの期待挙動を固定する
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251119/SnD-20251119-eslint-plugin-and-policy-extensions.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { IGNORES as SOT_IGNORES } from '../../../_shared/ignores.mjs';

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ['src', 'vibecoding', 'qualities', 'scripts'];

/**
 * SoT に基づく除外ディレクトリ名集合を生成（末端ディレクトリ名へ正規化）
 * - no_empty_catch も SoT IGNORES を単一起源として利用し、個別 EXCLUDE を設けない
 */
const SKIP_DIR_NAMES = (() => {
  const names = new Set(
    SOT_IGNORES
      .map((p) => p.replace(/\/\*\*$/, ''))
      .map((p) => p.replace(/^\.\//, ''))
      .map((p) => p.split('/').pop())
      .filter(Boolean),
  );
  return names;
})();

const EXT_RX = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

// 現行ポリシーでは「許可トークンによる例外扱い」は採用せず、すべての catch に実質的な処理を要求するため、ALLOW_TOKENS は空集合として扱う
const ALLOW_TOKENS = [];

const NOOP_HINTS = [
  '/* noop */',
  '/* no-op */',
  '/* ignore */',
  '/* swallow */',
  'void 0;',
  'void 0',
  '0;',
  'true;',
  'false;',
];

/**
 * IGNORES を考慮しつつ、指定ディレクトリ配下のファイルパスを再帰的に列挙する。
 * @param {string} dir 起点ディレクトリ
 * @returns {string[]} 発見したファイルの絶対パス一覧
 */
function listFilesRecursive(dir) {
  const files = [];
  const stack = [dir];
  // スタックが空になるまで深さ優先で走査し対象ファイルを列挙する
  while (stack.length) {
    const d = stack.pop();
    // 取り出したディレクトリ参照が不正な場合はこれ以上探索できないため、安全側でループを終了する
    if (!d) break;
    let entries;
    // 読み取り不能なディレクトリは局所的にスキップし、全体の検査を継続する
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      // 特定ディレクトリの読み取りに失敗した場合は当該ディレクトリ配下のみを除外し、残りの走査を継続する（対象パスと理由を標準エラーへ記録する）
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_empty_catch] warn: skip unreadable directory while walking :: ${path.relative(PROJECT_ROOT, d)} :: ${msg}\n`,
      );
      continue;
    }

    // 取得したエントリ集合を順次評価し、除外規則を考慮しつつ次段の走査対象を決定する
    for (const e of entries) {
      const full = path.join(d, e.name);
      const base = path.basename(full);
      // SoT で定義された除外ディレクトリ名に一致する場合は探索対象から外す
      if (e.isDirectory()) {
        // IGNORES で指定されたスキップ対象ディレクトリは走査対象から外し、不要な検査コストを抑える
        if (SKIP_DIR_NAMES.has(base)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }

  return files;
}

/**
 * empty-catch 検査対象とするファイル一覧を生成する。
 * @returns {string[]} 対象ファイルの絶対パス一覧
 */
function enumerateTargetFiles() {
  const roots = TARGET_DIRS.map((d) => path.join(PROJECT_ROOT, d));
  const all = roots
    .filter((r) => fs.existsSync(r))
    .flatMap((r) => listFilesRecursive(r));
  return all.filter((f) => EXT_RX.test(f));
}

/**
 * 最小限の catch ブロック抽出。
 * @param {string} source ソースコード
 * @returns {Array<{start:number,end:number,headerStart:number}>} 抽出結果
 */
function findCatchBlocks(source) {
  /**
   * empty-catch 解析対象となる catch ブロック情報の配列。
   * @type {Array<{start:number,end:number,headerStart:number}>}
   */
  const blocks = [];
  let idx = 0;

  // ファイル全体を繰り返し走査して次の catch キーワードを見つけるまで進め、全ての catch ブロックを検出する
  while (true) {
    // ファイル全体を走査し、例外処理ブロック（catch キーワード）の次の候補位置を取得する
    const header = findNextCatchHeader(source, idx);
    // これ以上有効な catch が見つからない場合は探索を終了する
    if (!header) break;

    // ブロック開始の '{' を探し、catch ブロックの先頭位置を特定する
    const braceOpen = source.indexOf('{', header.headerStart);
    // ブロック開始が見つからない場合は構文不整合とみなし、それ以降の解析を中断する
    if (braceOpen === -1) break;

    // 対応する '}' までを探索し、catch ブロックの終端位置を求める
    const end = findCatchBlockEnd(source, braceOpen);
    // 終端が見つからない場合はファイル末尾まで不整合なブロックとして扱い、解析を中断する
    if (end === -1) break;

    // 見つかった catch ブロックの開始位置と終端位置を登録し、次回探索の起点を更新する
    blocks.push({ start: braceOpen + 1, end, headerStart: header.headerStart });
    idx = end + 1;
  }

  return blocks;
}

/**
 * コメントや識別子を考慮しつつ、次の有効な catch ヘッダ位置を探索する。
 * @param {string} source ソースコード
 * @param {number} startIdx 探索開始位置
 * @returns {{headerStart:number,nextIdx:number}|null} 見つかったヘッダ位置と次の探索起点（見つからなければ null）
 */
function findNextCatchHeader(source, startIdx) {
  let idx = startIdx;

  // ファイル全体を走査し、例外処理ブロック（catch キーワード）の位置を順に探索する
  while (true) {
    const k = source.indexOf('catch', idx);
    // 次の catch が見つからない場合は探索を終了し、残りのブロックは存在しないと判断する
    if (k === -1) return null;

    // コメント内の catch は実際の例外処理ではないため、検査対象から除外して次の位置から探索を続ける
    if (isCatchInComment(source, k)) {
      idx = k + 5;
      continue;
    }

    // 言語構文としての catch は必ず後続に括弧を伴うため、"try/catch" のような文字列内表現を除外する
    const afterSlice = source.slice(k + 5);
    // "catch" の直後に空白を挟んだ括弧が続かない場合は構文上の catch ではないと判断し、次候補の探索へ進む
    if (!/^\s*\(/.test(afterSlice)) {
      idx = k + 5;
      continue;
    }

    return { headerStart: k, nextIdx: k + 5 };
  }
}

/**
 * 'catch' キーワードがコメント内に含まれているかどうかの簡易判定（ブロック/行コメント）。
 * @param {string} source ソースコード
 * @param {number} pos 'catch' の先頭位置
 * @returns {boolean} コメント内かどうか
 */
function isCatchInComment(source, pos) {
  // 直前に未クローズのブロックコメントが存在する場合はコメント内とみなし、catch キーワードを検査対象から除外する
  const lastBlockStart = source.lastIndexOf('/*', pos);
  // ブロックコメントが未クローズ、または pos より後で閉じられている場合は catch 自体がコメント内であると判断し、検査対象から除外する
  if (lastBlockStart !== -1) {
    const lastBlockEnd = source.indexOf('*/', lastBlockStart);
    // 対象位置より後ろまで続くブロックコメントは catch キーワード自体がコメント内にあるとみなし、検査対象から除外する
    if (lastBlockEnd === -1 || lastBlockEnd > pos) return true;
  }

  // 行コメント // 以降に登場する catch キーワードもコメント内として扱い、検査対象から除外する
  const lineStart = source.lastIndexOf('\n', pos);
  const slice = source.slice(lineStart === -1 ? 0 : lineStart + 1, pos);
  const lineCommentIdx = slice.indexOf('//');
  // 行コメント以降に現れる catch は実際の例外処理ではないため、検査対象から除外する
  if (lineCommentIdx !== -1) return true;

  // 単一行内の未クローズなクォート有無を別関数で判定し、文字列リテラル内の catch を検査対象から除外する
  return hasUnclosedQuoteOnLine(slice);
}

/**
 * 単一行内に未クローズのクォートが存在するかどうかを判定する。
 * - 奇数個の ' / " / ` のいずれかが現れている場合、その位置以降は文字列リテラル内とみなす簡易判定。
 * @param {string} slice 行頭から catch 直前までの文字列
 * @returns {boolean} 未クローズのクォートが存在すると推定される場合は true
 */
function hasUnclosedQuoteOnLine(slice) {
  const unescaped = slice.replace(/\\['"`]/g, '');
  const singleCount = (unescaped.match(/'/g) || []).length;
  const doubleCount = (unescaped.match(/"/g) || []).length;
  const backtickCount = (unescaped.match(/`/g) || []).length;
  // 奇数個のクォートが存在する場合は、その行の後続が文字列リテラル内にある可能性が高いため検査対象外とする
  if (singleCount % 2 === 1 || doubleCount % 2 === 1 || backtickCount % 2 === 1) return true;
  return false;
}

/**
 * 指定された '{' から対応する '}' までを探索し、catch ブロックの終端位置を返す。
 * @param {string} source ソースコード
 * @param {number} braceOpen ブロック開始位置（'{' のインデックス）
 * @returns {number} 対応する '}' のインデックス（見つからなければ -1）
 */
function findCatchBlockEnd(source, braceOpen) {
  let depth = 0;
  let pos = braceOpen;
  let end = -1;

  // ネストカウンタを使って対応する '}' を探索し、catch ブロックの終端位置を特定する
  while (pos < source.length) {
    const ch = source[pos];
    // ネストしたブロックの開始/終了を検出し、対応する '}' までの深さカウンタを更新する
    if (ch === '{') {
      // 新たなブロック開始を検出したときはネストレベルをインクリメントし、入れ子の catch/try を正しく追跡する
      depth += 1;
    } else if (ch === '}') {
      // ブロック終了を検出したときはネストレベルをデクリメントし、深さが 0 になった位置を対応する終端として扱う
      depth -= 1;
      // 深さが 0 に戻った時点で対応するブロック終端とみなし、走査を終了する
      if (depth === 0) {
        end = pos;
        break;
      }
    }

    pos += 1;
  }

  return end;
}

/**
 * コメントを粗く除去（行コメント // とブロックコメント）。
 * @param {string} s 文字列
 * @returns {string} コメント除去後
 */
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
}

/**
 * 許容理由タグが含まれているかを判定する。
 * @param {string} raw テキスト
 * @returns {boolean} 許容理由が含まれているかどうか
 */
function hasAllowReason(raw) {
  // コメント内に限定して理由タグを探す（コード本体のトークン一致は無効化）
  const blockComments = [...raw.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0] ?? '');
  const lineComments = [...raw.matchAll(/(^|\n)\s*\/\/.*(?=\n|$)/g)].map((m) => m[0] ?? '');
  const commentText = `${blockComments.join('\n')}\n${lineComments.join('\n')}`.toLowerCase();
  const okInComments = ALLOW_TOKENS.some((t) => commentText.includes(t));
  // コメント中に許容トークンが含まれている場合は「意図的に握り潰してよい catch」とみなし、違反対象から除外する
  if (okInComments) return true;
  // フォールバック: コメント抽出に失敗したケースに備えて raw 全体でも判定
  const rawLower = raw.toLowerCase();
  return ALLOW_TOKENS.some((t) => rawLower.includes(t));
}

/**
 * 実質空（セミコロンや空白のみ等）かを判定する。
 * @param {string} raw テキスト
 * @returns {boolean} 実質空かどうか
 */
function isTriviallyEmpty(raw) {
  const noComments = stripComments(raw);
  const simplified = noComments.replace(/\s+/g, ' ').trim().replace(/;+/g, ';');
  // コメントを除去した後に実質的な処理が空かどうかを判定し、単なるセミコロンや空白のみで構成される catch を検出する
  if (simplified === '' || simplified === ';') return true;
  return NOOP_HINTS.some((h) => raw.includes(h));
}

/**
 * 高速なオフセット→行番号変換のために行頭インデックス配列を計算する。
 * @param {string} text テキスト
 * @returns {number[]} 行オフセット配列
 */
function computeLineOffsets(text) {
  const arr = [0];
  // 入力テキスト内の改行位置を走査し、各行の先頭インデックスを累積する
  for (let i = 0; i < text.length; i += 1) {
    // 改行文字のインデックスを行頭配列に追加し、後続のオフセット→行番号変換で利用する
    if (text[i] === '\n') arr.push(i + 1);
  }

  return arr;
}

/**
 * 行オフセット配列から 1 始まりの行番号を求めるマッパー関数を生成する。
 * @param {number[]} lineOffsets 行オフセット配列
 * @returns {(off:number)=>number} オフセットから行番号への変換関数
 */
function makeOffsetToLine(lineOffsets) {
  return (off) => {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    // 行頭インデックス配列に対して二分探索を行い、与えられたオフセットが属する行番号を効率的に求める
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      // 探索中の中点がオフセット以下であれば右側へ寄せ、そうでなければ左側へ寄せて行番号候補を絞り込む
      if (lineOffsets[mid] <= off) lo = mid + 1;
      else hi = mid - 1;
    }

    return hi + 1;
  };
}

/**
 * 単一ファイルに対して empty-catch ポリシー違反検査を実行する。
 * @param {string} absFile 検査対象ファイルの絶対パス
 * @param {string} text ファイル内容
 * @param {Array<{file:string,line:number,reason:string,snippet:string}>} violations 違反配列
 * @returns {void}
 */
function scanFile(absFile, text, violations) {
  const blocks = findCatchBlocks(text);
  // 対象ファイル内に catch ブロックが 1 件も無い場合は検査不要のため、そのまま終了する
  if (blocks.length === 0) return;

  // オフセットから 1 始まりの行番号を取得するマッパーを構築し、違反レポートに安定した行情報を付与する
  const offsetToLine = makeOffsetToLine(computeLineOffsets(text));
  const meaningfulRegex =
    /throw\s|reporter|reportError\(|emit\(|logger\.|warn\(|diag\.|diagnostics\.|console\.|process\.stderr\.write\(|process\.stdout\.write\(|safeInvoke\(|protected\s+invoke|correlationId\s*:|status\s*:|message\s*:/i;

  // 抽出した各 catch ブロックに対して empty/trivial かどうかを評価し、必要に応じて違反として収集する
  for (const b of blocks) {
    const raw = text.slice(b.start, b.end);
    // コメント内の許容トークンが付与されている catch ブロックは、例外握り潰しを許容する特例として違反対象から除外する
    if (hasAllowReason(raw)) continue; // 許容3類型はコメント付きで OK

    const rawNoComments = stripComments(raw);
    // コメントを除去した後のテキストに意味のあるハンドリング（throw/ロギング等）が含まれているかを先に確認する
    const hasMeaningfulEarly = meaningfulRegex.test(rawNoComments);
    // 意味のある処理が無く、かつ noop パターンやセミコロンのみで構成されている場合は「実質空の catch」として違反とする
    // 意味のある処理が無く、かつ noop パターンやセミコロンのみで構成されている場合は「実質空の catch」として違反とする
    if (!hasMeaningfulEarly && isTriviallyEmpty(raw)) {
      const line = offsetToLine(b.headerStart);
      violations.push({
        file: path.relative(PROJECT_ROOT, absFile).replace(/\\/g, '/'),
        line,
        reason: 'empty-or-trivial-catch',
        snippet: raw.trim().split(/\n/).slice(0, 3).join(' '),
      });
      continue;
    }

    // noop 判定には掛からないが意味のある処理も検出できない場合は「握り潰しに近い曖昧な catch」として別種の違反とする
    const hasMeaningful = meaningfulRegex.test(rawNoComments);
    // noop 判定にも掛からず、かつ意味のある処理も検出できない catch を「曖昧な握り潰し」として別種の違反とする
    if (!hasMeaningful) {
      const line = offsetToLine(b.headerStart);
      violations.push({
        file: path.relative(PROJECT_ROOT, absFile).replace(/\\/g, '/'),
        line,
        reason: 'no-meaningful-handling-in-catch',
        snippet: raw.trim().split(/\n/).slice(0, 3).join(' '),
      });
    }
  }
}

/**
 * エントリポイント。
 * @returns {void}
 */
function main() {
  const files = enumerateTargetFiles();
  // 対象ディレクトリ群に JS/TS ファイルが存在しない場合は何も検査せずに成功として終了する
  if (files.length === 0) {
    process.stdout.write('[policy:no_empty_catch] OK: 対象ファイルが存在しません\n');
    process.exit(0);
  }

  /**
   * 検査で検出された empty/trivial catch ポリシー違反の一覧。
   * @type {Array<{file:string,line:number,reason:string,snippet:string}>}
   */
  const violations = [];

  // 収集した各ファイルを順に読み取り、empty/trivial catch 違反があれば violations 配列へ蓄積する
  for (const fp of files) {
    let text = '';
    // 個々のファイル読み取りで I/O 例外が発生しても、他のファイルの検査を継続できるように try/catch で保護する
    try {
      text = fs.readFileSync(fp, 'utf8');
    } catch (e) {
      // 読み取り不能ファイルは検査対象から除外し、全体の健全性を優先する（対象パスと理由を標準エラーへ記録する）
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `[policy:no_empty_catch] warn: skip unreadable file while scanning :: ${path.relative(PROJECT_ROOT, fp)} :: ${msg}\n`,
      );
      continue;
    }

    scanFile(fp, text, violations);
  }

  // 1 件も違反が検出されなかった場合は OK として終了し、例外ハンドリングポリシーが満たされていることを示す
  if (violations.length === 0) {
    process.stdout.write('[policy:no_empty_catch] OK: empty/trivial catch ブロックは検出されませんでした\n');
    process.exit(0);
  }

  // 違反が 1 件以上存在する場合は、検出結果を標準エラーへ列挙しポリシー違反として終了する
  process.stderr.write('[policy:no_empty_catch] NG: empty/trivial catch ブロックが検出されました\n');
  // 各違反ごとにファイルパス・行番号・理由・抜粋を 1 行で出力し、CI ログから直接修正箇所を特定できるようにする
  for (const v of violations) {
    const loc = `${v.file}:${v.line}`;
    process.stderr.write(`${loc}: ${v.reason} :: ${v.snippet}\n`);
  }

  process.exit(1);
}

// ランナー全体のエントリポイントを try/catch で保護し、テスト対象外の想定外例外もポリシー名付きで一括報告する
try {
  main();
} catch (e) {
  // ランナー自身の実行時例外をポリシー名付きで報告し、品質ゲートの異常終了として明示する
  const msg = e instanceof Error && typeof e.message === 'string' ? e.message : String(e);
  process.stderr.write(`[policy:no_empty_catch] fatal: ${msg}\n`);
  process.exit(2);
}

