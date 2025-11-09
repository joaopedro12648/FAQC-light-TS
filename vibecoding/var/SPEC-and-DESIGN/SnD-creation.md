---
id: SnD-20251108-snd-creation
title: SnD 作成とヘッダポリシーの運用
status: Draft
createdAt: 2025-11-08
author: AI Agent
owners: [quality]
tags: [SnD, header-policy, documentation]
locale: ja-JP
quality_refresh_hash_at_created: "2025-11-08T06:31:44.236Z 80fc21e47eadf6eef7738a05d9e817902057df153f89cc2b674d69288aa36ea5"
quality_refresh_hash_before_impl: "2025-11-08T06:33:05.020Z 5559e30cec6818fe3527ee8c0b5cbe2ba9dc61d1953dd9ec4b7df3fbfe193c26"
context:
  Role: "Architect / Implementer / Reviewer"
  inputFiles:
    - qualities/eslint/plugins/header-bullets-min.js
    - vibecoding/docs/PLAYBOOK/PRE-IMPL.md
    - vibecoding/tests/quality/context-review.test.ts
  outputTargets:
    - vibecoding/var/SPEC-and-DESIGN/SnD-creation.md
---

# SnD 作成とヘッダポリシーの運用

## 品質ゲート宣言（必読）
- SoT（設定）: `qualities/**`
- SoT（品質ゲートの地図）: `vibecoding/var/contexts/qualities/**/{context.yaml,context.md}`
- 実行: `npm run check`（ESLint/型検査/ポリシー/テストを一括）
- ポリシー抵触時は実装を進めず、SnD と品質コンテキストを先に整備してから再試行する

---

## 背景 / 文脈
- 先頭ヘッダの構造と量的基準を一定化し、生成コードのぶれを抑止する
- 仕様と品質ゲートの橋渡しとして SnD を単一情報源とし、`.cursorrules` のロケール規約をコメントにも徹底する

## 目的（Goals）
- 先頭ヘッダの統一形式（@file/備考/箇条書き8–10/@see≥2/@snd）をレポ構造に定着させる
- PRE-IMPL 上の「予防ガイド」とセルフレビュー手順を通じて未然に非準拠を低減する

## 非目標（Non-Goals）
- プロダクト仕様の詳細化（本SnDは作法と運用の規範）

## 設計構想（Design Concept）
- ルール自体は ESLint ローカルプラグインで強制（`header/header-bullets-min`）
- ドキュメント側は PRE-IMPL にセルフチェックとミニテンプレを掲載し、運用で補強
- テスト側は品質コンテキストのレビュー存在を担保（`context-review.test.ts`）

## 用語 / 境界
- 対象: `src/**/*.ts`（テスト/生成物は除外）
- 品質コメント: 8–10 行の箇条書きで具体例/数値/コードを含めない

## 公開インタフェース
- なし（ルール/運用の規定のみ）

## 型設計 / 例外・エラー方針
- なし（該当せず）

## 品質ゲート（このSnDの定義）
- `npm run check` が成功すること
- 先頭ヘッダ構造: `@file` 行、`備考:` 行、箇条書き 8–10 行、`@see` 2 件以上、`@snd なし|*.md`
- コメント言語: `.cursorrules` のロケール（現状: 日本語）に統一

## 受け入れ条件（Acceptance Criteria）
- `qualities/eslint/plugins/header-bullets-min.js` が構造/行数/参照/`@snd` を検出し、全 `src/**/*.ts` で pass
- PRE-IMPL 節「コメント言語セルフレビュー（MUST）」手順で 0 ヒット
- `vibecoding/tests/quality/context-review.test.ts` が pass

## 実施方式
1) 設計前: [docs/PLAYBOOK/PRE-COMMON.md] を実施し、`quality_refresh_hash_at_created` を記録（本書では PENDING。exit=0 後に置換）
2) 実装直前: [docs/PLAYBOOK/PRE-IMPL.md] を実施し、`quality_refresh_hash_before_impl` を記録
3) 実装完了前: PRE-IMPL の「結果記録」「トラブルシューティング」「バックフィル」を実施

## トラブルシューティング（抜粋）
- 先頭ヘッダで失敗: PRE-IMPL のミニテンプレを貼付→ `context.md` を参照して 8–10 行に整形→ `@see`/`@snd` を追加
- コメント言語で失敗: `rg -n '^\s*(//|/\\*|\\*)\\s*[A-Za-z]{4,}' src`（PowerShell は Select-String 版）→ 該当行を日本語へ

## 未確定事項
- PRE-COMMON 成功時の StartAt+hash を追記すること（exit=0 取得後に置換）

## 参考リンク
- `qualities/eslint/plugins/header-bullets-min.js`
- `vibecoding/docs/PLAYBOOK/PRE-IMPL.md`
- `vibecoding/tests/quality/context-review.test.ts`

