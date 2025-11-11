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

/**
 * 使用方法（CLI）
 * - 全ファイル（既定）:
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts
 *
 * - 対象を絞る（--include または位置引数。複数可・カンマ区切り可）:
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include vibecoding/var/contexts/qualities/policy/anti_mvp/context.md
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include vibecoding/var/contexts/qualities/eslint/** --include vibecoding/var/contexts/qualities/tsconfig/context.md
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts qualities/policy/no_relaxation/**,qualities/policy/no_unknown_double_cast/**
 *
 * - 便宜機能: qualities/ からの指定を var 側に自動マップ
 * 例: npx tsx vibecoding/scripts/qualities/context-md-rubric.ts --include qualities/policy/anti_mvp/**
 *
 * 絞り込み挙動
 * - 引数未指定: vibecoding/var/contexts/qualities/**\/context.md を全走査
 * - --include/位置引数指定時: 引数を簡易グロブ（** と *）として repo 相対パスにマッチさせフィルタ
 * - マッチ 0 件時: 「no files matched by --include」を出して 0 終了（スキップ扱い）
 *
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
 *
 * 推奨運用
 * - 最初にテンプレに沿って各ユニットの context.md を作成（How 内に上記4要素を必ず内包）
 * - まとめて編集後に rubric を1回だけ実行（O(n) 運用）。逐次修正は O(n^2) 寄りになりがち
 * - 増分チェック時は --include で対象ユニットのみに絞って実行（例: `--include qualities/policy/anti_mvp/**`）。最終確認は全体実行
 */

/** リポジトリのルートディレクトリ（カレントワーキングディレクトリ） */
const repoRoot = process.cwd();
/** 解析対象の品質コンテキスト（var 配下）の基底ディレクトリ */
const VAR_BASE = path.join(repoRoot, 'vibecoding', 'var', 'contexts', 'qualities');

// しきい値
/** コードブロック（```）の最低個数 */
const MIN_CODE_FENCES = 4;
/** NG パターンの最低件数（典型NGの列挙） */
const MIN_NG_PATTERNS = 5;
/** 本文の最低行数（密度確保のための下限） */
const MIN_LINES = 60; // 下限のみ（上限は初回/更新でLLMが判断）

/**
 * ディレクトリ配下のファイルを再帰的に列挙する。
 * @param dir ルートディレクトリ
 * @returns ファイルの絶対パス配列
 */
function listFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];
  // 未処理のディレクトリが残る限り探索を継続して対象ファイルを収集する
  while (stack.length) {
    const cur = stack.pop();
    // 無効なパスに遭遇した場合は探索を中断して次の要素へ進む
    if (!cur) break;
    let entries: fs.Dirent[] | undefined;
    // ディレクトリの列挙に失敗しても処理全体を止めず次のノードへ進む
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    // 子エントリを順に評価して探索キューまたは結果へ反映する
    for (const e of entries) {
      const full = path.join(cur, e.name);
      // ディレクトリは後続の走査対象としてスタックへ積む
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(full);
    }
  }

  return files;
}

/**
 * パスを POSIX 形式（/ 区切り）へ正規化
 * @param p 入力パス
 * @returns POSIX 形式へ正規化したパス
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 簡易グロブを正規表現に変換（** -> .* / * -> [^/]*）
 * @param glob 簡易グロブ文字列
 * @returns 生成した正規表現
 */
function globToRegex(glob: string): RegExp {
  const posix = toPosix(glob.trim());
  // 先に ** を退避
  const doubled = posix.replace(/\*\*/g, '§DOUBLESTAR§');
  // 正規表現メタをエスケープ（* は後で処理するため除外）
  const escaped = doubled.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // 単独 * をセグメント内ワイルドカードへ
  const withSingles = escaped.replace(/\*/g, '[^/]*');
  // 退避した ** をディレクトリ横断ワイルドカードへ
  const finalBody = withSingles.replace(/§DOUBLESTAR§/g, '.*');
  return new RegExp(`^${finalBody}$`, 'i');
}

/**
 * CLI 引数から include パターンを取得。
 * サポート:
 * - 例: --include=pattern1,pattern2
 * - 例: --include pattern1 --include pattern2
 * - 位置引数（先頭が '-' で始まらないもの）をパターンとして扱う
 * @param argv プロセス引数（先頭2要素除去後）
 * @returns include パターン配列
 */
function parseIncludeArgs(argv: string[]): string[] {
  const out: string[] = [];
  // CLI 引数を左から走査して include 指定を抽出する
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    // --include= の形式を優先して解釈し複数指定を分解する
    // 1トークン形式（--include=...）を優先認識して分割する
    if (a.startsWith('--include=')) {
      const body = a.slice('--include='.length).trim();
    // 空文字を除外して有効な指定のみ取り込む
      if (body) out.push(...body.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }

    // --include <patterns> の2トークン形式を解釈して取り込む
    // 次トークンにパターンを取る形式を解釈して取り込む
    if (a === '--include') {
      const nxt = argv[i + 1] ?? '';
    // 次トークンがオプションでなければパターン指定として取り込む
      // 候補がオプションでない場合だけパターンとして採用する
      if (nxt && !nxt.startsWith('-')) {
        out.push(...nxt.split(',').map((s) => s.trim()).filter(Boolean));
        i += 1;
      }

      continue;
    }

    // 先頭が '-' でない位置引数はパターンとして受け取り分解する
    // 位置引数は include と見なして分解して取り込む
    if (!a.startsWith('-')) {
      out.push(...a.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  // context.md を対象にするのが基本なので、パターンがディレクトリで終わる場合は補完

  return out.map((raw) => {

    let p = raw;
    // qualities/** を var 側のコンテキストパスに自動マップして指定を簡略化する
    // 便宜置換: qualities/** → vibecoding/var/contexts/qualities/**
    if (/^qualities\//i.test(p)) {
      p = p.replace(/^qualities\//i, 'vibecoding/var/contexts/qualities/');
    }

    // ディレクトリ終端の場合は context.md を自動補完する
    if (p.endsWith('/')) return `${p}**/context.md`;
    // 既に context.md を指している場合はそのまま扱う
    if (/\/context\.md$/i.test(p)) return p;
    // 明示的に *.md が無ければ context.md に寄せる（広げたい場合は **/* を利用）
    // 明示的拡張子やワイルドカードの無いパターンは context.md へ正規化する
    if (!/\*/.test(p) && !/\.md$/i.test(p)) return `${p}/context.md`;
    return p;
  });
}

/**
 * 見出しパターンが存在するかを確認する。
 * @param content Markdown の本文
 * @param patterns 見出しの正規表現一覧
 * @returns いずれかに一致した場合は true
 */
function hasHeading(content: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(content));
}

/**
 * 見出しレベルを取得
 * @param line 行文字列
 * @returns 見出しレベル（1-6）、見出しでない場合は0
 */
function getHeadingLevel(line: string): number {
  const match = line.match(/^\s*(#{1,6})\s+/);
  return match?.[1]?.length ?? 0;
}

/**
 * Markdownセクションを抽出
 * @param content Markdown全文
 * @param headingPatterns セクション開始を示す正規表現配列
 * @returns セクション内容
 */
function extractSection(content: string, headingPatterns: RegExp[]): string {
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let sectionLevel = 0;
  let sectionContent = '';
  
  // 行を順に評価し指定見出しから次の同レベル見出し手前までを抽出する
  for (const line of lines) {
    // セクション開始の見出しに一致したら抽出モードへ移行する
    if (headingPatterns.some((re) => re.test(line))) {
      inSection = true;
      sectionLevel = getHeadingLevel(line);
      // 見出しレベルが取得できない場合は既定レベルでフェイルセーフにする
      if (sectionLevel === 0) {
        sectionLevel = 2;
      }

      continue;
    }
    
    // セクション内に入っている間のみ本文を収集する
    if (inSection) {
      const currentLevel = getHeadingLevel(line);
      // 同レベル以下の新しい見出しが現れたら抽出を終了する
      if (currentLevel > 0 && currentLevel <= sectionLevel) {
        break;
      }

      sectionContent += `${line  }\n`;
    }
  }
  
  return sectionContent;
}

/**
 * Why セクションを検証する。
 * @param text Markdown の本文
 * @returns エラーメッセージ配列
 */
function checkWhySection(text: string): string[] {
  const errs: string[] = [];
  const whyPatterns = [/^\s*#{1,6}\s*目的・思想（Why）/m, /^\s*\d+\.\s*目的・思想（Why）/m, /^\s*#{1,6}\s*Why\b/m];
  // Why セクションの見出しが欠落している場合は直ちに不足として返す
  if (!hasHeading(text, whyPatterns)) {
    errs.push('Why: missing heading');
    return errs;
  }

  const whySection = extractSection(text, whyPatterns);
  const hasQualityImpact = /型安全性|保守性|セキュリティ|type.?safe|maintain|security/i.test(whySection);
  const hasCostImpact = /トークン|時間|認知負荷|token|time|cognitive|分|秒/i.test(whySection);
  // 品質影響の記述が無い場合は不足として指摘する
  if (!hasQualityImpact) errs.push('Why: missing quality impact (型安全性・保守性・セキュリティ)');
  // コスト影響の記述が無い場合は不足として指摘する
  if (!hasCostImpact) errs.push('Why: missing cost impact (トークン・時間・認知負荷)');
  return errs;
}

/**
 * Where セクションを検証する。
 * @param text Markdown の本文
 * @returns エラーメッセージ配列
 */
function checkWhereSection(text: string): string[] {
  const errs: string[] = [];
  const wherePatterns = [/^\s*#{1,6}\s*適用範囲（Where）/m, /^\s*\d+\.\s*適用範囲（Where）/m, /^\s*#{1,6}\s*Where\b/m];
  // Where セクションの見出しが無ければ直ちに不足として返す
  if (!hasHeading(text, wherePatterns)) {
    errs.push('Where: missing heading');
    return errs;
  }

  const whereSection = extractSection(text, wherePatterns);
  const hasGlobPattern = /\*\*\/\*|\*\.[a-z]+/i.test(whereSection);
  // グロブ例の記載が無い場合は対象範囲の不明確さとして指摘する
  if (!hasGlobPattern) errs.push('Where: missing glob pattern examples');
  return errs;
}

/**
 * What セクションを検証する。
 * @param text Markdown の本文
 * @returns エラーメッセージ配列
 */
function checkWhatSection(text: string): string[] {
  const errs: string[] = [];
  const whatPatterns = [/^\s*#{1,6}\s*要求基準（What）/m, /^\s*\d+\.\s*要求基準（What）/m, /^\s*#{1,6}\s*What\b/m];
  // What セクションの見出しが無ければ直ちに不足として返す
  if (!hasHeading(text, whatPatterns)) {
    errs.push('What: missing heading');
    return errs;
  }

  const whatSection = extractSection(text, whatPatterns);
  const hasTable = /\|.*\|.*\|/.test(whatSection);
  const hasCommandSetup = /(コマンド|command|設定|config|範囲|coverage)/i.test(whatSection);
  // コマンド/設定/coverage の対応が示されていなければ不足として指摘する
  if (!hasTable && !hasCommandSetup) errs.push('What: missing command/config/coverage mapping');
  return errs;
}

/**
 * 行数チェック（下限のみ、上限なし）
 * @param text Markdown の本文
 * @returns エラーメッセージ配列
 */
function checkLineCount(text: string): string[] {
  const errs: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length; // 空行除外
  
  // 下限チェックのみ（GPT対策：詳細度不足を防止）
  // 本文の行数がしきい値未満の場合は詳細度不足として指摘する
  if (lines < MIN_LINES) {
    errs.push(`Line count: ${lines} lines (MUST be ≥${MIN_LINES} for sufficient detail)`);
  }
  
  // 上限チェックは意図的に実装しない（初回/更新の判定と上限管理はLLMがPRE-COMMON.mdから読み取る）
  
  return errs;
}

/**
 * How セクションを検証する。
 * @param text Markdown の本文
 * @returns エラーメッセージ配列
 */
function checkHowSection(text: string): string[] {
  const errs: string[] = [];
  const howPatterns = [/^\s*#{1,6}\s*適用例（How）/m, /^\s*\d+\.\s*適用例（How）/m, /^\s*#{1,6}\s*How\b/m];
  // How セクションの見出しが無ければ直ちに不足として返す
  if (!hasHeading(text, howPatterns)) {
    errs.push('How: missing heading');
    return errs;
  }

  const howSection = extractSection(text, howPatterns);
  const codeFences = (howSection.match(/```/g) || []).length;
  // 代表的な成功/失敗例を最低2ブロック含めることを要求する
  if (codeFences < MIN_CODE_FENCES) errs.push('How: need >= 2 code blocks (success/failure patterns)');
  
  // NG patterns: 「### LLM典型NG」セクション内の番号付きリストをカウント
  // 典型NGセクションが存在する場合は番号付き項目数を検査する
  const ngSectionMatch = howSection.match(/###\s*(LLM典型NG|典型.*NG|NG.*パターン)/i);
  // 典型NGセクションが存在する場合のみ詳細計数に進む
  if (ngSectionMatch) {
    const ngSectionStart = howSection.indexOf(ngSectionMatch[0]);
    const nextHeadingMatch = howSection.slice(ngSectionStart + ngSectionMatch[0].length).match(/^###\s/m);
    const ngSectionEnd = nextHeadingMatch 
      ? ngSectionStart + ngSectionMatch[0].length + nextHeadingMatch.index!
      : howSection.length;
    const ngSection = howSection.slice(ngSectionStart, ngSectionEnd);
    const ngCount = (ngSection.match(/^\s*\d+\.\s+\*\*/gm) || []).length;
    // 典型NGの列挙がしきい値未満の場合は不足として報告する
    if (ngCount < MIN_NG_PATTERNS) errs.push(`How: need >= 5 NG patterns (found ${ngCount})`);
  } else {
    errs.push('How: missing LLM典型NG section');
  }
  
  // 事前チェックリストの有無を確認し不足を指摘する
  const hasChecklist = /^[\s-]*\[\s*\]/m.test(howSection);
  // 事前チェックリストが無い場合は不足として報告する
  if (!hasChecklist) errs.push('How: missing checklist (事前チェックリスト)');
  // 修正方針に関する記述の有無を確認し不足を指摘する
  const hasRemediation = /(修正|対処|方針|remediation|fix)/i.test(howSection);
  // 修正方針の記述が無い場合は不足として報告する
  if (!hasRemediation) errs.push('How: missing remediation steps (修正方針)');
  return errs;
}

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
  return errs;
}

/** エントリポイント: すべての context.md を検証して終了する。 */
function main(): void {
  // 対象ディレクトリが存在しない場合は非該当として早期終了する
  if (!fs.existsSync(VAR_BASE)) {
    process.stdout.write('context-md-rubric: no var contexts found, skipping\n');
    process.exit(0);
  }

  // 引数処理（--include / 位置引数）
  const argv = process.argv.slice(2);
  const includeGlobs = parseIncludeArgs(argv);

  // 走査とフィルタ
  let files = listFilesRecursive(VAR_BASE).filter((f) => /context\.md$/i.test(f));
  // 絞り込み指定がある場合は対象ファイル集合をフィルタする
  if (includeGlobs.length > 0) {
    const relToRepo = (abs: string) => toPosix(path.relative(repoRoot, abs));
    const regs = includeGlobs.map(globToRegex);
    // include パターンに一致するファイルのみを残して走査対象を絞り込む
    files = files.filter((abs) => {
      const rel = relToRepo(abs);
      return regs.some((re) => re.test(rel));
    });
    // 一致が 0 件ならスキップとして即時終了する
    // マッチ0件ならスキップとして終了し不要な走査を避ける
    if (files.length === 0) {
      process.stdout.write('context-md-rubric: no files matched by --include\n');
      process.exit(0);
    }
  }

  const allErrors: Array<{ file: string; errs: string[] }> = [];
  // 対象ファイルを順に検査して違反を収集する
  for (const f of files) {
    const errs = checkContextMd(f);
    // 対象ファイルに違反がある場合のみ結果へ追加して報告対象を明確化する
    // 違反の無いファイルはノイズ削減のためスキップする
    if (errs.length) {
      allErrors.push({ file: path.relative(repoRoot, f).replace(/\\/g, '/'), errs });
    }
  }

  // すべての対象が基準を満たしていれば成功として終了する
  // 全件合格なら成功終了してルーブリック準拠を示す
  if (allErrors.length === 0) {
    process.stdout.write(`context-md-rubric ✅ all ${files.length} file(s) compliant\n`);
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

// 実行時例外を捕捉してメッセージ化しプロセスを失敗終了させる
try {
  main();
} catch (err) {
  process.stderr.write(`context-md-rubric ❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

