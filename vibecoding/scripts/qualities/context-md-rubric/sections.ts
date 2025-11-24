/**
 * @file PRE-COMMON 補助: context.md の主要セクション検査ユーティリティ
 * - 目的: Why/Where/What/How セクションの存在と最低限の充足を検査
 * - 出力: セクションごとのエラーメッセージ配列
 * - 方針: テキスト処理のみで完結し、副作用を持たない
 * - 設計: 小さな純粋関数の組合せで読みやすさを維持
 * - コメント: 日本語で意図説明、ASCIIのみの行は避ける
 * - 品質: ヘッダ箇条書きは8行以上（チェック用）
 * - 受入: 主要セクション欠落時は定型メッセージで明示
 * - 参考: セクション見出し正規表現は SoT の規約に追従
 */
import path from 'node:path';
import { toPosix } from './fsargs.ts';

const MIN_CODE_FENCES = 4;
const MIN_NG_PATTERNS = 5;
const MIN_LINES = 60;
const repoRoot = process.cwd();

/**
 * 見出しのいずれかが本文に存在するかを判定する
 * @param content 本文
 * @param patterns 見出し正規表現の配列
 * @returns 見つかれば true
 */
export function hasHeading(content: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(content));
}

/**
 * 行の見出しレベル（#の数）を返す
 * @param line 対象行
 * @returns 見出しレベル（0は非見出し）
 */
export function getHeadingLevel(line: string): number {
  const match = line.match(/^\s*(#{1,6})\s+/);
  return match?.[1]?.length ?? 0;
}

/**
 * 指定見出しに一致するセクション本文を抽出する
 * @param content 本文
 * @param headingPatterns 見出しの候補
 * @returns セクション本文（見つからなければ空）
 */
export function extractSection(content: string, headingPatterns: RegExp[]): string {
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let sectionLevel = 0;
  let sectionContent = '';
  let inCodeBlock = false;
  // 行を順に処理し、セクション本文を収集する
  for (const line of lines) {
    // 柵コード領域の開始/終了をトグルする
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
    }

    // 指定見出しに到達したら収集モードへ入る（コードブロック内は除外）
    if (!inCodeBlock && headingPatterns.some((re) => re.test(line))) {
      inSection = true;
      sectionLevel = getHeadingLevel(line) || 2;
      continue;
    }

    // 収集中は見出しの入れ替わりまで本文を取り込む
    if (inSection) {
      const currentLevel = !inCodeBlock ? getHeadingLevel(line) : 0;
      // 見出しレベルが元より高ければセクション終了
      if (currentLevel > 0 && currentLevel <= sectionLevel) break;
      sectionContent += `${line}\n`;
    }
  }

  return sectionContent;
}

/**
 * Why セクションの充足を検査する
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkWhySection(text: string): string[] {
  const errs: string[] = [];
  const whyPatterns = [/^\s*#{1,6}\s*目的・思想（Why）/m, /^\s*\d+\.\s*目的・思想（Why）/m, /^\s*#{1,6}\s*Why\b/m];
  // 見出しがない場合は早期に不足を返す
  if (!hasHeading(text, whyPatterns)) {
    errs.push('Why: missing heading');
    return errs;
  }

  const whySection = extractSection(text, whyPatterns);
  const hasQualityImpact = /型安全性|保守性|セキュリティ|type.?safe|maintain|security/i.test(whySection);
  const hasCostImpact = /トークン|時間|認知負荷|token|time|cognitive|分|秒/i.test(whySection);
  // 品質影響の言及が無ければ指摘する
  if (!hasQualityImpact) errs.push('Why: missing quality impact (型安全性・保守性・セキュリティ)');
  // コスト影響の言及が無ければ指摘する
  if (!hasCostImpact) errs.push('Why: missing cost impact (トークン・時間・認知負荷)');
  return errs;
}

/**
 * Where セクションの充足を検査する
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkWhereSection(text: string): string[] {
  const errs: string[] = [];
  const wherePatterns = [/^\s*#{1,6}\s*適用範囲（Where）/m, /^\s*\d+\.\s*適用範囲（Where）/m, /^\s*#{1,6}\s*Where\b/m];
  // 見出しがない場合は早期に不足を返す
  if (!hasHeading(text, wherePatterns)) {
    errs.push('Where: missing heading');
    return errs;
  }

  const whereSection = extractSection(text, wherePatterns);
  const hasGlobPattern = /\*\*\/\*|\*\.[a-z]+/i.test(whereSection);
  // グロブ例の欠落を指摘する
  if (!hasGlobPattern) errs.push('Where: missing glob pattern examples');
  return errs;
}

/**
 * What セクションの充足を検査する
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkWhatSection(text: string): string[] {
  const errs: string[] = [];
  const whatPatterns = [/^\s*#{1,6}\s*要求基準（What）/m, /^\s*\d+\.\s*要求基準（What）/m, /^\s*#{1,6}\s*What\b/m];
  // 見出しがない場合は早期に不足を返す
  if (!hasHeading(text, whatPatterns)) {
    errs.push('What: missing heading');
    return errs;
  }

  const whatSection = extractSection(text, whatPatterns);
  const hasTable = /\|.*\|.*\|/.test(whatSection);
  const hasCommandSetup = /(コマンド|command|設定|config|範囲|coverage)/i.test(whatSection);
  // 対応表またはコマンド/設定の対応が無ければ指摘する
  if (!hasTable && !hasCommandSetup) errs.push('What: missing command/config/coverage mapping');
  return errs;
}

/**
 * 本文の行数（空行除く）が最低要件を満たすかを検査する
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkLineCount(text: string): string[] {
  const errs: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  // 最低行数を満たしていなければ指摘する
  if (lines < MIN_LINES) {
    errs.push(`Line count: ${lines} lines (MUST be ≥${MIN_LINES} for sufficient detail)`);
  }

  return errs;
}

/**
 * How セクションの最低限（見出し/コード塀/NG/チェックリスト/修正方針）を検査する
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkHowSection(text: string): string[] {
  const errs: string[] = [];
  const howPatterns = [/^\s*#{1,6}\s*適用例（How）/m, /^\s*\d+\.\s*適用例（How）/m, /^\s*#{1,6}\s*How\b/m];
  // 見出しがない場合は早期に不足を返す
  if (!hasHeading(text, howPatterns)) {
    errs.push('How: missing heading');
    return errs;
  }

  const howSection = extractSection(text, howPatterns);
  const codeFences = (howSection.match(/```/g) || []).length;
  // コードブロックの最低個数を満たしていなければ指摘する
  if (codeFences < MIN_CODE_FENCES) errs.push('How: need >= 2 code blocks (success/failure patterns)');
  const ngSectionMatch = howSection.match(/###\s*(LLM典型NG|典型.*NG|NG.*パターン)/i);
  // NG 節がある場合のみ詳細検査を行う
  if (ngSectionMatch) {
    // NG 節の開始位置を特定し、次の見出し直前までを範囲として抽出する
    const ngSectionStart = howSection.indexOf(ngSectionMatch[0]);
    const nextHeadingMatch = howSection.slice(ngSectionStart + ngSectionMatch[0].length).match(/^###\s/m);
    const ngSectionEnd = nextHeadingMatch
      ? ngSectionStart + ngSectionMatch[0].length + nextHeadingMatch.index!
      : howSection.length;
    const ngSection = howSection.slice(ngSectionStart, ngSectionEnd);
    const ngCount = (ngSection.match(/^\s*\d+\.\s+\*\*/gm) || []).length;
    // NG パターンの最低件数を満たしていなければ指摘する
    if (ngCount < MIN_NG_PATTERNS) errs.push(`How: need >= 5 NG patterns (found ${ngCount})`);
  } else {
    // NG の具体例セクションが欠落している
    errs.push('How: missing LLM典型NG section');
  }

  const hasChecklist = /^[\s-]*\[\s*\]/m.test(howSection);
  // チェックリストの欠落を指摘する
  if (!hasChecklist) errs.push('How: missing checklist (事前チェックリスト)');
  const hasRemediation = /(修正|対処|方針|remediation|fix)/i.test(howSection);
  // 修正方針の欠落を指摘する
  if (!hasRemediation) errs.push('How: missing remediation steps (修正方針)');
  return errs;
}

/**
 * キーユニットの How に設定閾値一覧が存在するかを検査する
 * @param filePath 対象ファイルパス
 * @param text 本文
 * @returns エラーメッセージ配列
 */
export function checkThresholdSectionForKeyUnits(filePath: string, text: string): string[] {
  const rel = toPosix(path.relative(repoRoot, filePath));
  const keyUnitTargets = new Set<string>([
    'vibecoding/var/contexts/qualities/core/context.md',
    'vibecoding/var/contexts/qualities/docs/context.md',
    'vibecoding/var/contexts/qualities/types/context.md',
  ]);
  // 対象ユニット以外は検査しない
  if (!keyUnitTargets.has(rel)) return [];
  const howPatterns = [/^\s*#{1,6}\s*適用例（How）/m, /^\s*\d+\.\s*適用例（How）/m, /^\s*#{1,6}\s*How\b/m];
  const howSection = extractSection(text, howPatterns);
  const hasThresholdHeading = /#{2,6}\s*設定閾値一覧/.test(howSection);
  const errs: string[] = [];
  // 閾値一覧の見出しが無ければ指摘する
  if (!hasThresholdHeading) {
    errs.push('How: missing 設定閾値一覧 section for core/docs/types unit');
  }

  return errs;
}

