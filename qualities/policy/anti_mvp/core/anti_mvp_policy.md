# Anti-MVP ポリシー定義（core ユニット）

本ファイルは `qualities/policy/anti_mvp/core/anti_mvp_policy.yaml` の内容を人間向けに説明するメモであり、
禁止語ポリシーと TODO/TICKET 必須ポリシーの意図と利用方法を短く整理したものです。

## banned_terms

- 対象: `**/*.{ts,tsx,mts,cts}`
- 目的: 「暫定」「フォールバック」「レガシー」など、終了条件が不明瞭な実装を表す語の常在を防ぎ、MVP 的な仮実装を放置させないこと。
- 禁止語（抜粋）:
  - `"WIP"`, `"fallback"`, `"graceful"`, `"legacy"`, `"shim"`, `"polyfill"`, `"compat"`, `"default to"`, `"best-effort"`, `"swallow"`, `"ignore error"`
- `word_boundary: true` によって、他の単語の一部として偶発的にマッチするケース（例: `fallbackHandler` など）の誤検出を抑制する。

## todo_ticket_required

- 対象: `**/*.{ts,tsx,mts,cts}`
- 目的: `TODO` / `FIXME` / `HACK` を「一時的な退避」ではなく、必ずチケット ID 付きで管理されたタスクとして扱うこと。
- `regex` は `\b(?:TODO|FIXME|HACK)\b(?!.*\(#\s*[A-Z]{2,}-\d+\))` を使用し、
  - 行内に `TODO`/`FIXME`/`HACK` が現れる
  - かつ同一行に `(# ABC-123)` のようなチケット ID が付いていない
  場合のみ違反として検出する。

## 実行と活用

- 実行コマンド:
  - `node qualities/policy/anti_mvp/core/run.mjs`
- 設定ファイル:
  - `qualities/policy/anti_mvp/core/anti_mvp_policy.yaml`
- 典型的な運用フロー:
  1. ローカルで Anti-MVP 違反を修正する。
  2. `node qualities/policy/anti_mvp/core/run.mjs` を実行し、違反 0 件であることを確認する。
  3. `npm run -s preflight` → `npm run -s check` を通し、他ポリシーとの整合を確認する。


