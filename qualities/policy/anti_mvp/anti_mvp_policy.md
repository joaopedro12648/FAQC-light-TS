---
title: Anti-MVP / 互換残骸・沈黙フォールバック禁止
id: anti_mvp_policy
---

# Anti-MVP / 互換残骸・沈黙フォールバック禁止

## goal
コードベースは OCP/SRP/明示的エラー を優先する。
次を禁止する: 互換残骸の温存、沈黙フォールバック、ダミー既定値での誤魔化し、段階的移行、例外駆動制御、仕様準拠のためのフォールバック強化。

## scope / terms（適用範囲・用語）
- 適用範囲: 本ポリシーは `src/**/*.ts` を主対象とし、PRレビュー/CI検査で適用する。
- 短期カットオーバー: 移行の猶予は最大 24h まで。事前計画・計測・ロールバック手順必須。
- 計画済み移行フラグ: `migrate_<domain>_to_<target>` 命名。コメントで期限・デフォルト・削除期日・`TRACK` を明記。
- SPECタグ: TSファイル内に `[SPEC:<id>] <title>` を記述して関連SPECを明示。
- TRACK: 課題管理チケットID（例: `ABC-123`）。

## hard_bans（禁止事項の要約）
- 沈黙フォールバック禁止
- 「後方互換のための残留実装」禁止
- 握りつぶし try/catch 禁止
- TODO/FIXME の無チケット禁止
- 暗黙の互換フラグ禁止
- 段階的移行の禁止
- 例外駆動制御（例外制御フロー）禁止
- 「仕様準拠のためのフォールバック強化」禁止

## details（各禁止事項の詳細）
1) 沈黙フォールバック禁止
   - 禁止ワード/フレーズ検知: "fallback", "graceful", "legacy", "shim", "polyfill", "compat", "default to", "best-effort", "swallow", "ignore error"。
   - これらを使う代わりに「明示的に例外を投げる／エラーを返す」こと。
   - switch の default: で「とりあえず return」は禁止。assertNever() を使って落とす。

2) 「後方互換のための残留実装」禁止
   - 目的が「壊さないために置いておく」だけのクラス/関数/フラグの新規追加を禁止。
   - 本当に必要なら Deprecated 注釈＋期限＋削除チケットIDを必須:
     * 形式例: "@deprecated since vX.Y; remove by vA.B (TRACK: ABC-123) — use NewApiX"

3) 握りつぶし try/catch 禁止
   - catch 内でログ無し／再送出無し／代替値返却は原則禁止（例外処理ポリシーの許容3類型のみ参照）。
   - 代替値を返す場合も 明示ログ＋テレメトリ＋呼び出し側に判断手段 を渡す。

4) TODO/FIXME の無チケット禁止
   - TODO, FIXME, HACK は必ず "(#<ticket>)" を併記。なければ生成しない。

5) 暗黙の互換フラグ禁止
   - enableLegacyX, useOldPath などの布石を新規に作らない。
   - 必要なら「計画済み移行フラグ」として次の書式で:
     * 名称: migrate_<domain>_to_<target>
     * メタ: 有効期限・デフォルト値・削除期日・TRACK をコメントで明記。

6) 段階的移行の禁止
   - 旧実装と新実装の長期併存（二重実装・両対応IF・デュアルリード/ライト）を禁止。
   - 許容されるのは「短期カットオーバー（≤ 24h）」のみ。必須事項:
     * SPEC にカットオーバー計画（メトリクス・受け入れ条件・ロールバック・凍結ウィンドウ・期限・TRACK）を明記。
     * フラグは「計画済み移行フラグ」準拠（名称/メタ要件に従う）。
     * カナリアや影付き運用は明示ログ・テレメトリ・終了期限を伴うこと。
   - 互換ブリッジ/アダプタは Deprecated 注釈＋削除チケットID＋期限を付与（deprecation_annotation 参照）。
   - データ移行は一方向バッチ＋リハーサル＋検証可能な一致率を満たし、双方向同期は禁止。

7) 例外駆動制御（例外制御フロー）禁止
   - try/catch を正常系の分岐・制御フローに用いない（例外は例外的事象のみに限定）。
   - 許容されるのは外部I/O障害や不変条件違反等に限定し、ログ＋再送出（または Result/Either 化）のいずれかを必須。
   - 推奨: 明示的な事前検証（型ガード・パース検査・Option/Result/Either）で正常系を記述し、異常系のみ例外を使用。

8) 「仕様準拠のためのフォールバック強化」禁止
   - 本来は happy path で満たすべき仕様を、デフォルト値拡張・フォールバック条件追加・緩和で取り繕うことを禁止。
   - 許容されるのは SPEC 合意済みの短期カットオーバーのみ（期限≤24h・計測・ロールバック計画・TRACK 明記）。
   - 必須: 根本原因の是正計画（正道の実装）／期限／受け入れ条件を SPEC に明記。フォールバックは消滅前提の暫定措置に限る。

## recommended_patterns（推奨パターン）
- 明示的エラー: invariant() or throw new Error(code…) を使用。
- 列挙の網羅性: assertNever(x) で未対応分岐を検出（ビルド/実行時）。
- 型でフォールバック不能化: never 到達はエラーに。
- 機能フラグは typed: ユニオン型 or as const オブジェクト（裸の文字列は不可）。
 - 例外の代替: Result/Either/Option の活用で正常/異常を明示する。

### 例外の許容範囲（操作の類型）
次の3類型のみ、例外発生を業務エラーとせず許容する（ただし swallow/正常値返却は禁止）:
1) 冪等なクリーンアップ操作（stop()/disconnect()/remove()/close() 等）
2) 環境依存の軽量 getter（location/navigator/localStorage などの非存在・権限不足）
3) preventDefault?.() 等のイベント抑止系呼び出しの失敗

必須条件:
- catch 内で正常値を返さない（fail-fast の再送出 か Result/Either 化）
- 観測: 少なくとも debug 以上でログ（必要に応じてテレメトリ）
- try の範囲は最小に保ち、ドメイン状態を変更しない

## ts_utilities（共通ユーティリティ）
TypeScript ユーティリティ（必要に応じて共通ユーティリティへ集約）：

```ts
export function assertNever(x: never, msg?: string): never {
  throw new Error(msg ?? `Unreachable: ${JSON.stringify(x)}`);
}
export function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Invariant failed: ${msg}`);
}
```

## enforcement_notes（運用上の注意）
- 例外処理ポリシーと整合させること。
- 本ポリシー違反の導入が必要な場合は、必ず新規SPEC-and-DESIGNで理由・代替案・期限を記録し、合意の上で限定適用すること。


