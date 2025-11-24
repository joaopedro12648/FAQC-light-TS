/**
 * @file PRE-COMMON 補助: Quality Context Hash Manifest の検査
 * - 目的: context.md 内のYAMLマニフェストの存在と妥当性を検査
 * - 出力: 問題メッセージ配列（空ならOK）
 * - 方針: 規約違反は文言固定で返し、上位で集約しやすくする
 * - 設計: 純粋関数として副作用を避ける
 * - 環境: Node.js/TS（ESM）
 * - コメント: 日本語・意図説明、ASCIIのみの行は避ける
 * - 品質: ヘッダ箇条書きは8行以上（チェック用）
 * - 受入: 形式不一致は定型文メッセージで返し解析容易性を担保
 */
import { extractSection, hasHeading } from './sections.ts';

/**
 * マニフェストの必須フィールドを検査する
 * @param lines YAML 行配列
 * @returns エラーメッセージ配列
 */
export function validateManifestFields(lines: string[]): string[] {
  const errs: string[] = [];
  const unitLine = lines.find((l) => l.startsWith('unit:'));
  const algoLine = lines.find((l) => l.startsWith('algo:'));
  const generatedAtLine = lines.find((l) => l.startsWith('generatedAt:'));
  const unitDigestLine = lines.find((l) => l.startsWith('unitDigest:'));
  // 必須キーの有無を順に検査して不足を追加する
  if (!unitLine) errs.push('hash_manifest: missing unit in yaml manifest');
  // algo が無ければ違反として追加する
  if (!algoLine) errs.push('hash_manifest: missing algo in yaml manifest');
  // generatedAt が無ければ違反として追加する
  if (!generatedAtLine) errs.push('hash_manifest: missing generatedAt in yaml manifest');
  // 該当キーの欠落と値形式の双方を検査する
  if (!unitDigestLine) {
    // 欠落時は専用メッセージを追加する
    errs.push('hash_manifest: missing unitDigest in yaml manifest');
  } else {
    // 値形式を検査し、不正なら違反を追加する
    const digestMatch = unitDigestLine.match(/unitDigest:\s*"?([0-9a-f]{32,})"?\s*$/i);
    // ダイジェスト形式不正を検出する
    if (!digestMatch) errs.push('hash_manifest: invalid unitDigest (expected hex string) in yaml manifest');
  }

  return errs;
}

/**
 * files セクションの存在と各行の形式を検査する
 * @param lines YAML 行配列
 * @param filesIndex files: 見出しの行インデックス（なければ -1）
 * @returns エラーメッセージ配列
 */
export function validateFilesList(lines: string[], filesIndex: number): string[] {
  const errs: string[] = [];
  // files セクションの存在を確認する
  if (filesIndex === -1) {
    errs.push('hash_manifest: missing files list in yaml manifest');
    return errs;
  }

  const fileLines = lines.slice(filesIndex + 1);
  const pathLines = fileLines.filter((l) => l.startsWith('- path:') || l.startsWith('path:'));
  const hashLines = fileLines.filter((l) => l.startsWith('hash:'));
  // path 行が一つも無い場合を検出する
  if (pathLines.length === 0) {
    errs.push('hash_manifest: files list has no entries in yaml manifest');
  }

  const invalidHashLines = hashLines.filter((l) => !/hash:\s*"?[0-9a-f]{32,}"?\s*$/i.test(l));
  // 不正なハッシュ値の行がある場合を検出する
  if (invalidHashLines.length > 0) {
    errs.push('hash_manifest: invalid hash value(s) in files list (expected hex string)');
  }

  return errs;
}

/**
 * context.md の本文からマニフェスト節を抽出して検査する
 * @param text ドキュメント本文
 * @returns エラーメッセージ配列
 */
export function checkInlineHashManifestSection(text: string): string[] {
  const errs: string[] = [];
  const headingPatterns = [/^###\s*Quality Context Hash Manifest\b/m];
  // セクション見出しが存在しない場合を検出する
  if (!hasHeading(text, headingPatterns)) {
    errs.push('hash_manifest: missing "### Quality Context Hash Manifest" section');
    return errs;
  }

  const section = extractSection(text, headingPatterns);
  const yamlBlockMatch = section.match(/```yaml([\s\S]*?)```/);
  // yaml 柵付きコードブロックの欠落を検出する
  if (!yamlBlockMatch) {
    errs.push('hash_manifest: missing yaml fenced block in Quality Context Hash Manifest section');
    return errs;
  }

  const yamlBody = yamlBlockMatch[1] ?? '';
  const lines = yamlBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const filesIndex = lines.findIndex((l) => l === 'files:' || l.startsWith('files:'));
  errs.push(...validateManifestFields(lines));
  errs.push(...validateFilesList(lines, filesIndex));
  return errs;
}

