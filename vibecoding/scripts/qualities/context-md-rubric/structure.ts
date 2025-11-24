/**
 * @file context.md の構造重複（H1/Why/Where/What/How/Manifest）を検査するユーティリティ
 * - 目的: 主要セクションの重複や Manifest の多重化を検出して品質を維持する
 * - 入力: ドキュメント本文（文字列）
 * - 出力: 違反メッセージ配列（空ならOK）
 * - 設計: テキスト処理のみで副作用を持たない純粋関数で構成
 * - 方針: コードブロック内は除外して見出しや節の重複のみを評価する
 * - 可読性: 小さなヘルパー関数へ分割し早期リターンを徹底する
 * - 表記: コメントは日本語、ASCIIのみの行を避ける
 * - 検証: テスト可能な純粋関数として実行可能
 */
import { hasHeading } from './sections.ts';

/**
 * コードブロック外の行だけを対象に、与えたパターンの出現回数を数える。
 * @param textAll ドキュメント本文
 * @param matchers 行単位の正規表現群
 * @returns {number} 該当行数
 */
function countOutsideCode(textAll: string, matchers: RegExp[]): number {
  const ls = textAll.split(/\r?\n/);
  let inCode = false;
  let count = 0;
  // 行を順に処理して、コードブロック外の一致のみを数える
  for (const l of ls) {
    // フェンス開始/終了をトグルする
    if (/^```/.test(l)) {
      inCode = !inCode;
      continue;
    }

    // コードブロック内は評価対象外とする
    if (inCode) continue;
    // いずれかのパターンに一致した行をカウントする
    if (matchers.some((re) => re.test(l))) count += 1;
  }

  return count;
}

/**
 * H1 の出現回数（コードブロック外のみ）を返す。
 * @param textAll ドキュメント本文
 * @returns {number} 出現回数
 */
function countH1(textAll: string): number {
  return countOutsideCode(textAll, [/^\s*#\s+/]);
}

/**
 * 主要セクションや Manifest 節の重複、Manifest 内の複数 YAML ブロックを検査する。
 * @param text ドキュメント本文
 * @returns 違反メッセージ配列
 */
export function checkDuplicateStructure(text: string): string[] {
  const errs: string[] = [];
  const h1Count = countH1(text);
  const whyCount = countOutsideCode(text, [
    /^\s*#{1,6}\s*目的・思想（Why）\b/,
    /^\s*\d+\.\s*目的・思想（Why）\b/,
    /^\s*#{1,6}\s*Why\b/,
  ]);
  const whereCount = countOutsideCode(text, [
    /^\s*#{1,6}\s*適用範囲（Where）\b/,
    /^\s*\d+\.\s*適用範囲（Where）\b/,
    /^\s*#{1,6}\s*Where\b/,
  ]);
  const whatCount = countOutsideCode(text, [
    /^\s*#{1,6}\s*要求基準（What）\b/,
    /^\s*\d+\.\s*要求基準（What）\b/,
    /^\s*#{1,6}\s*What\b/,
  ]);
  const howCount = countOutsideCode(text, [
    /^\s*#{1,6}\s*適用例（How）\b/,
    /^\s*\d+\.\s*適用例（How）\b/,
    /^\s*#{1,6}\s*How\b/,
  ]);
  const manifestSectionCount = countOutsideCode(text, [/^\s*###\s*Quality Context Hash Manifest\b/]);
  const counts: Array<{ label: string; count: number; message: string }> = [
    { label: 'h1', count: h1Count, message: 'structure: duplicated H1 detected' },
    { label: 'why', count: whyCount, message: 'structure: multiple Why sections detected' },
    { label: 'where', count: whereCount, message: 'structure: multiple Where sections detected' },
    { label: 'what', count: whatCount, message: 'structure: multiple What sections detected' },
    { label: 'how', count: howCount, message: 'structure: multiple How sections detected' },
    { label: 'manifest', count: manifestSectionCount, message: 'structure: multiple "Quality Context Hash Manifest" sections detected' },
  ];
  // 各セクションの重複を検査し、2回以上の出現を違反として収集する
  for (const c of counts) {
    // 同名セクションが複数存在する場合は重複として報告する
    if (c.count > 1) errs.push(c.message);
  }

  const manifestSections: string[] = hasHeading(text, [/^###\s*Quality Context Hash Manifest\b/m])
    ? Array.from(text.matchAll(/^###\s*Quality Context Hash Manifest\b[\s\S]*?(?=^###\s|\Z)/mg)).map((m) => m[0] ?? '')
    : [];
  let totalYamlBlocks = 0;
  // Manifest 各節の中の ```yaml ... ``` ブロック数を合算する
  for (const sec of manifestSections) {
    const blocks = sec.match(/```yaml[\s\S]*?```/g) || [];
    totalYamlBlocks += blocks.length;
  }

  // Manifest 節内に複数の YAML ブロックが存在する場合は違反とする
  if (totalYamlBlocks > 1) {
    errs.push('structure: multiple yaml fenced blocks detected in "Quality Context Hash Manifest"');
  }

  return errs;
}

