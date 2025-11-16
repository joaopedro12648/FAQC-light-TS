/**
 * @file ESLint セクション: 環境別の例外と運用
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
 * @see vibecoding/var/contexts/qualities/eslint/03-documentation/context.md
 * @see vibecoding/docs/PLAYBOOK/PRE-IMPL.md
 * @snd vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
 */
import { FILES_ALL_CODE } from '../../_shared/core/globs.mjs';

/**
 * 環境別の例外方針（基本は禁止で必要時に明示許容）を定義する設定断片。
 * - 既定では console 使用を禁止（各ファイルで必要に応じて局所許可）
 * @returns Flat Config 配列
 */
export const environmentExceptions = [
  // デフォルトでは console 禁止
  {
    files: FILES_ALL_CODE,
    rules: { 'no-console': 'error' }
  }
];

