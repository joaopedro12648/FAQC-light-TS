#!/usr/bin/env node
/**
 * @file Context MD ルーブリックチェッカー — vibecoding/var/contexts/qualities 配下の context.md を検証する
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
 * @see vibecoding/docs/PLAYBOOK/PRE-COMMON.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  globToRegex,
  listFilesRecursive,
  parseIncludeArgs,
  toPosix,
} from './context-md-rubric/fsargs.ts';
import {
  checkInlineHashManifestSection,
} from './context-md-rubric/manifest.ts';
import {
  checkHowSection,
  checkLineCount,
  checkThresholdSectionForKeyUnits,
  checkWhatSection,
  checkWhereSection,
  checkWhySection,
} from './context-md-rubric/sections.ts';
import { checkDuplicateStructure } from './context-md-rubric/structure.ts';

/**
 * 使用方法（CLI）
 * - 全ファイル（既定）:
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts
 * 使用例（対象の絞り込み）:
 * - 対象を絞る（--include または位置引数。複数可・カンマ区切り可）:
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include vibecoding/var/contexts/qualities/eslint/** --include vibecoding/var/contexts/qualities/tsconfig/context.md
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts qualities/policy/no_relaxation/**,qualities/policy/no_unknown_double_cast/**
 * 便宜機能:
 * - 便宜機能: qualities/ からの指定を var 側に自動マップ
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include qualities/policy/anti_mvp/**
 * 絞り込み挙動の定義:
 * 絞り込み挙動
 * - 引数未指定: vibecoding/var/contexts/qualities/**\/context.md を全走査
 * - --include/位置引数指定時: 引数を簡易グロブ（** と *）として repo 相対パスにマッチさせフィルタ
 * - マッチ 0 件時: 「no files matched by --include」を出して 0 終了（スキップ扱い）
 * rubric 要件の要点:
 * context.md 作成上の注意（rubric 検出要件の要点）
 * - すべての項目は各セクション内に存在すること（見出しは「…（Why/Where/What/How）」または "Why/Where/What/How" のいずれか）
 * 1) Why: 品質影響（型安全性/保守性/セキュリティ等）とコスト影響（トークン/時間/認知負荷等）を明記
 * 2) Where: グロブ例（例: **\/\*, \*.ts 等）を本文に含める
 * 3) What: コマンド/設定/coverage の対応（語: command/config/coverage いずれかの出現）
 * 4) How: 下記4要素を「How セクションの中に」含める
 * - コードブロック ≥ 2（フェンス記号 ``` の合計 ≥ 4）
 * - 見出し「### LLM典型NG」（表記揺れ対応。番号付き 1. **… 形式が5件以上）
 * - チェックリスト（- [ ] の形式が1つ以上）
 * - 修正方針（語: 修正/対処/方針/remediation/fix のいずれかを含む）
 * - 本文の最低行数（空行除外）: 60 行以上
 * 運用ヒント:
 * 推奨運用
 * - 最初にテンプレに沿って各ユニットの context.md を作成（How 内に上記4要素を必ず内包）
 * - まとめて編集後に rubric を1回だけ実行（O(n) 運用）。逐次修正は O(n^2) 寄りになりがち
 * - 増分チェック時は --include で対象ユニットのみに絞って実行（例: `--include qualities/policy/anti_mvp/**`）。最終確認は全体実行
 */

/** リポジトリのルートディレクトリ（カレントワーキングディレクトリ） */
const repoRoot = process.cwd();
/** 解析対象の品質コンテキスト（var 配下）の基底ディレクトリ */
const VAR_BASE = path.join(repoRoot, 'vibecoding', 'var', 'contexts', 'qualities');
// しきい値は sections.ts 側で管理

/**
 * 単一の context.md に対してルーブリック検査を実行する。
 * @param filePath 絶対パス
 * @returns エラーメッセージ配列
 */
function checkContextMd(filePath: string): string[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const errs: string[] = [];
  errs.push(...checkLineCount(text));
  errs.push(...checkWhySection(text));
  errs.push(...checkWhereSection(text));
  errs.push(...checkWhatSection(text));
  errs.push(...checkHowSection(text));
  errs.push(...checkThresholdSectionForKeyUnits(filePath, text));
  errs.push(...checkInlineHashManifestSection(text));
  errs.push(...checkDuplicateStructure(text));

  return errs;
}

/**
 * context.md に対するルーブリック検査を実行する。
 * @param includeGlobs --include で指定されたパターン一覧
 * @param allErrors 収集した違反メッセージの出力先
 */
function runContextMdChecks(includeGlobs: string[], allErrors: Array<{ file: string; errs: string[] }>): void {
  // var 配下のコンテキストミラーが未整備なリポジトリでは、context.md 検査をスキップする
  if (!fs.existsSync(VAR_BASE)) {
    process.stdout.write('context-md-rubric: no var contexts found, skipping context.md checks\n');
    return;
  }

  // var 配下が存在する場合のみ context.md のルーブリック検査対象を列挙する
  let files = listFilesRecursive(VAR_BASE).filter((f) => /context\.md$/i.test(f));
  // --include が指定されている場合は簡易グロブに基づいて対象を絞り込む
  if (includeGlobs.length > 0) {
    const relToRepo = (abs: string) => toPosix(path.relative(repoRoot, abs));
    const regs = includeGlobs.map(globToRegex);
    files = files.filter((abs) => {
      const rel = relToRepo(abs);
      return regs.some((re) => re.test(rel));
    });
    // 絞り込み結果が 0 件の場合はスキップ扱いとして早期終了する
    if (files.length === 0) {
      process.stdout.write('context-md-rubric: no files matched by --include\n');
      process.exit(0);
    }
  }

  // ルーブリック対象の context.md を順に検査し、違反があるもののみを結果へ追加する
  for (const f of files) {
    const errs = checkContextMd(f);
    // ルーブリック違反が存在するファイルのみを allErrors に追加し、出力をノイズレスに保つ
    if (errs.length) {
      allErrors.push({ file: path.relative(repoRoot, f).replace(/\\/g, '/'), errs });
    }
  }
}

/** エントリポイント: すべての context.md を検証して終了する。 */
function main(): void {
  const allErrors: Array<{ file: string; errs: string[] }> = [];

  // 引数処理（--include / 位置引数）— context.md 用のフィルタとして扱う。
  const argv = process.argv.slice(2);
  const includeGlobs = parseIncludeArgs(argv);

  // context.md の検査を実行し、違反を allErrors に集約する
  runContextMdChecks(includeGlobs, allErrors);

  // 全件合格なら成功終了（ルーブリック準拠）
  if (allErrors.length === 0) {

    process.stdout.write('context-md-rubric ✅ no violations\n');
    process.exit(0);
  }

  process.stderr.write(`\ncontext-md-rubric ❌ violations:\n`);
  // ファイル単位で違反内容を列挙して修正着手を支援する
  for (const e of allErrors) {
    process.stderr.write(`- ${e.file}\n`);
    // 各メッセージを行単位で出力し読みやすさを確保する
    for (const msg of e.errs) {
      process.stderr.write(`  • ${msg}\n`);
    }
  }

  process.exit(1);
}

// CLI 全体のエラー処理を一元化して異常を明確に終了させる
try {
  main();
} catch (err) {
  // 致命的例外は詳細を記録して非0終了とする
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`context-md-rubric ❌ ${msg}\n`);
  process.exit(1);
}

