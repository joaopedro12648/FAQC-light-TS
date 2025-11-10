---
id: SnD-20251108-snd-creation
title: トップヘッダ規約と品質ゲート運用（SnD-creation）
status: Implemented
createdAt: 2025-11-08
author: AI Agent
owners: [quality]
tags: [SnD, header-policy, documentation, quality-gate]
locale: ja-JP
quality_refresh_hash_at_created: "2025-11-10T00:22:30.280Z 2409dd42394c66bf08c170a12d25181641ba5a2118d00c3284a59eba28ec71e1"
quality_refresh_hash_before_impl: "2025-11-08T06:33:05.020Z 5559e30cec6818fe3527ee8c0b5cbe2ba9dc61d1953dd9ec4b7df3fbfe193c26"
context:
  Role: "Architect / Implementer / Reviewer"
  inputFiles:
    - qualities/eslint/plugins/header-bullets-min.js
    - qualities/eslint/plugins/block-comment-formatting.js
    - vibecoding/docs/PLAYBOOK/PRE-IMPL.md
    - vibecoding/docs/PLAYBOOK/PRE-SnD.md
    - scripts/qualities/check.ts
    - qualities/check-steps.ts
    - vibecoding/tests/eslint/header-bullets-min.test.ts
    - vibecoding/tests/eslint/block-comment-formatting.test.ts
    - vibecoding/tests/quality/context-review.test.ts
  outputTargets:
    - vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
---

# トップヘッダ規約と品質ゲート運用（SnD-creation）

## 品質ゲート宣言（必読）
- SoT（設定）: `qualities/**`（ESLint/tsconfig/policy 等の実設定）
- SoT（品質ゲートの地図）: `vibecoding/var/contexts/qualities/**/{context.yaml,context.md}`
- 実行: `npm run check`（ポリシー → 型検査 → Lint → テスト を順次）
- 非準拠検出時はコードより先に SnD と品質コンテキストを修正し、ゲートを再実行する

---

## 背景 / 文脈
- 生成/手書きコードの先頭JSDocヘッダを統一し、レビューコストと逸脱を削減する
- ルールは ESLint ローカルプラグインで強制し、運用はプレイブック（PRE-IMPL/PRE-SnD）で補強する
- `.cursorrules` のロケール規約をコメントにも適用し、レポート構造と一貫する語彙・分量を担保する

## 目的（Goals）
- トップヘッダの統一形式（`@file` / `備考:` / 箇条書き 8–10 行 / `@see`≥2 / `@snd`）を定着
- ブロックコメント先頭行のインライン本文を禁止し、読みやすいJSDoc整形を徹底
- ゲート実行の標準ルートを単一化し、変化に強い代表的不変条件で保守コストを低減

## 非目標（Non-Goals）
- プロダクト機能仕様の詳細化（本 SnD は作法と運用の規範）

## 設計構想（Design Concept）
- ヘッダ規約は `qualities/eslint/plugins/header-bullets-min.js` で検証（最小8〜最大10、@see≥2、@snd必須）
- コメント整形は `qualities/eslint/plugins/block-comment-formatting.js` で検証（先頭行インライン本文禁止、--fix 対応）
- ゲート実行は `scripts/qualities/check.ts` と `qualities/check-steps.ts` に規範リストを定義し順次実行
- PRE-IMPL にセルフチェックとミニテンプレを掲出し、運用で補強
- テストはルール実体/運用/文脈の健全性を `vibecoding/tests/**` と `tests/**` で担保

## 用語 / 境界
- 対象: `src/**/*.ts`（トップヘッダ規約の直接対象。テスト/生成物は除外）
- 品質コメント: 箇条書き 8–10 行。具体例/数値/コードは含めない（抽象・運用指針の粒度）
- `@snd` 値: `なし` または `.md` への相対パス（例: `vibecoding/var/SPEC-and-DESIGN/... .md`）

## 公開インタフェース
- なし（規範はルール/運用の規定のみ）

## 型設計 / 例外・エラー方針
- なし（該当せず）。ルール違反は ESLint 診断として可視化し、例外で握り潰さない

## 品質ゲート（このSnDの定義）
- `npm run check` が成功すること（ポリシー → 型検査 → Lint → テスト）
- トップヘッダ構造: `@file` 行、`備考:` 行、箇条書き 8–10 行、`@see` 2 件以上、`@snd なし|*.md`
- コメント整形: 複数行JSDocの開幕行インライン本文を禁止（--fix で是正可能）
- コメント言語: `.cursorrules` のロケール（現状: 日本語）に統一

## 受け入れ条件（Acceptance Criteria）
- `header-bullets-min` ルールが構造/行数/参照/`@snd` を検出し、全 `src/**/*.ts` で pass
- `block-comment-formatting` ルールが複数行JSDocの先頭行インライン本文を検出し、--fix の結果が妥当
- PRE-IMPL の「コメント言語セルフレビュー（MUST）」で 0 ヒット
- 内製/ユーザーテストが pass: `vibecoding/tests/**` と `tests/**` が全て成功
- ゲート手順の規範（`qualities/check-steps.ts`）に対し、E2E-lite が pass（ステップ存在/設定ディレクトリの存在）

## 実施方式
1) 設計前: [docs/PLAYBOOK/PRE-COMMON.md] を実施し、標準出力（`<StartAt> <hash>`）を front matter `quality_refresh_hash_at_created` に記録
2) 実装直前: [docs/PLAYBOOK/PRE-IMPL.md] を実施し、`quality_refresh_hash_before_impl` を記録
3) 実装中: トップヘッダ未充足の `src/**/*.ts` にはミニテンプレを貼付し、`@see` と `@snd` を整備
4) 実装完了前: PRE-IMPL の「結果記録」「トラブルシューティング」「バックフィル」を実施

## トラブルシューティング（抜粋）
- 先頭ヘッダで失敗: PRE-IMPL のミニテンプレを貼付 → `context.md` を参照して 8–10 行へ整形 → `@see`/`@snd` を追加
- コメント言語で失敗: `rg -n '^\s*(//|/\*|\*)\s*[A-Za-z]{4,}' src`（PowerShell は Select-String 版）→ 日本語へ修正
- ブロックコメント整形で失敗: `eslint --fix` を適用し、開幕行インライン本文を次行の `* ` に移動
- 内製テストの追加実行: `vibecoding/` または `qualities/` の変更があると自動で追加実行（`scripts/qualities/check.ts`）

## 改変許可範囲（Allowed Change Scope）
- ルール: `qualities/eslint/plugins/header-bullets-min.js` / `qualities/eslint/plugins/block-comment-formatting.js`
- ゲート: `scripts/qualities/check.ts` / `qualities/check-steps.ts`
- ドキュメント: `vibecoding/docs/PLAYBOOK/PRE-IMPL.md` / `vibecoding/docs/PLAYBOOK/PRE-SnD.md`
- テスト: `vibecoding/tests/**`, `tests/**`

## AI実装指針（参照必須コンテキスト）
- `vibecoding/var/contexts/qualities/**/context.md`（人間可読）
- `vibecoding/var/contexts/qualities/**/context.yaml`（機械可読）
- `qualities/policy/baseline.yaml`（ポリシー実行の基準）

## 未確定事項
- なし

## 参考リンク
- `qualities/eslint/plugins/header-bullets-min.js`
- `qualities/eslint/plugins/block-comment-formatting.js`
- `vibecoding/docs/PLAYBOOK/PRE-IMPL.md`
- `vibecoding/docs/PLAYBOOK/PRE-SnD.md`
- `scripts/qualities/check.ts`
- `qualities/check-steps.ts`
- `vibecoding/tests/quality/context-review.test.ts`

