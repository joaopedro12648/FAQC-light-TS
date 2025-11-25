# PRE-IMPL チェックリスト

> 要旨: IMPL 中の安定点で `npm run -s preflight` を実行し、成功時に対象 SnD を Reviewable に更新して `quality_refresh_hash_before_impl`（`npm run -s check:pre-impl` の標準出力1行）を front matter に記録する。

本チェックリストは、実装フェーズ開始前に必ず完了する「必須手順」です。完了結果は実装対象の SPEC-and-DESIGN の front matter に `quality_refresh_hash_before_impl: "<StartAt> <hash>"` を記録してください。値は `npm run -s check:pre-impl` の標準出力1行をそのまま貼り付けます（手計算や独自スクリプトによる生成は禁止）。

> 本チェックリストは [vibecoding/docs/PLAYBOOK/PRE-COMMON.md] の共通手順を内包して実施する。差分がある場合は PRE-COMMON を優先し、ここに反映すること。

## 実装実施時重要遵守項目一覧

- `npm run preflight` による早期検知  
  - 実装中は適宜 `npm run preflight` を実行し、policy/typecheck/lint レベルの違反を早期に検知・修正する（watch/対話モードは使用しない）。

### 単一情報源（SoT）の整理
- ゲート実行の SoT: `qualities/**`（実行は `npm run check`）
- コード生成時の SoT: `vibecoding/var/contexts/qualities/**`
 - 開発時の短縮実行: `npm run preflight`（policy/typecheck/lint のみ。build/test は除外）
- ユーザーにゲート通過を報告する場合は常に `num run check` を基準とすること。

### 品質原則
- 実装自体も後続モデルにとって広義の「品質コンテキスト」になるため、後続モデルの高精度な挙動を保つために、高品質な実装を行うこと

### 禁止事項（ハッシュ取得）
- `check:pre-impl` の出力以外からのハッシュ取得（手計算・独自スクリプト）を禁止
- ハッシュの SoT は `check:pre-impl` の標準出力1行のみ

## Required
1. PRE-IMPL 実行
   - `npm run -s check:pre-impl` を実行し、`exit=0` を得る（内部で PRE-COMMON と同一内容を実施する現行仕様）。
2. SPEC への記録
   - 実装対象 SPEC の front matter に `quality_refresh_hash_before_impl` を記録（`exit=0` の標準出力1行 `"<StartAt> <hash>"` をそのまま貼り付け）。
3. 次工程へ
   - 実装フェーズ移行後、PR では `npm run check` を実行して品質ゲートを通過させる。

### ブロッキング条件（必須）
- `vibecoding/var/contexts/qualities/**/context-review.md` が1つでも存在する場合、IMPL を開始してはならない。
  - 先に PRE-COMMON の「Context Review Handling（自動統合・ブロック）」を完了し、`npm run -s check:pre-common` で exit=0 を取得すること。

---

## エージェント指示（必須・自動実行）
- 実装開始前に、`npm run -s check:pre-impl` を実行する。
- `exit=0` 時の標準出力（`"<StartAt> <hash>"`）を、対象 SPEC の front matter に `quality_refresh_hash_before_impl` として記録する。
- 自動コミットは行わない（ユーザーから明示的な許可がある場合を除く）。

## 記録例（SPEC front matter）
```yaml
quality_refresh_hash_before_impl: "2025-10-30T09:08:11.750Z 8e8c...<sha256>"
```

> ヒント（PowerShell）: `$out = npm run -s check:pre-impl; if ($LASTEXITCODE -eq 0) { $out } else { Write-Error 'update contexts and rerun' }`
>
> ヒント（bash）: `out="$(npm run -s check:pre-impl)"; ec=$?; [ "$ec" -eq 0 ] && echo "$out" || echo 'update contexts and rerun' 1>&2`

> Qualities の要約・スキップ条件・スキーマは重複を避けるため省略し、[docs/PLAYBOOK/PRE-COMMON.md] を参照してください。

## 完了の定義
- PRE-COMMON の DoD を満たしている（last_updated・contexts 更新の整合が取れている）
- 実装対象 SPEC の front matter に `quality_refresh_hash_before_impl` が最新 StartAt+hash で記録済み

> 具体テンプレート（最小例）は PRE-COMMON または各ユニットのドキュメントに集約します（本書では重複掲載しません）。

## フィードバック記録（PRE-IMPL・必須）

- 目的: 実装前準備（PRE-IMPL）で得られた知見（ヘッダ適合・ルール理解の躓き・ゲート実行の手順改善点等）を、次の反復に活かすため可視化する。
- タイミング: 品質ゲート通過後（`npm run -s check` が exit=0 を確認した直後）。
- 出力先: `vibecoding/var/feedback/<YYYYMM>/<YYYYMMDD>/fb-IMPL-<YYYYMMDD>-<slug>.md`
  - `<slug>` は対象 SnD ファイル名のスラッグと同一（例: `SnD-20251108-snd-creation.md` → `snd-creation`）。
  - ディレクトリ `<YYYYMM>/<YYYYMMDD>` は SnD 側の日付ディレクトリに合わせる。
- 追記運用: 同じ SnD に対する PRE-IMPL を再実施する場合、同一ファイルへ追記する（無ければ新規作成可）。
- 記載内容（MUST、箇条書き中心・短文）:
  - 実行したゲートと結果要約（lint/type/policy/test の有無、失敗→修正の要点）
  - ヘッダコメント運用のハマりどころ（例: `@see` の選び方、文字数/行数調整のコツ）
  - `.cursorrules`/各 context.md の改善提案（次反復での更新候補）
  - 次反復へのアクション（チェックボックス 3 件以内）
- 記載すべき事項がない場合: 1 行で「No feedback」と記載する。

## Header Comment Quick Checklist（Prompt-driven / No Examples）

- 目的: 各 `src/**/*.ts` のファイル先頭に、品質ゲートの“量的にブロッカー化しやすく・生成時に抜けやすい”規範だけを約400±20文字で要約して記す。具体例・数値・コードは書かない（方針のみ）。

- 実施手順（MUST）
  1) `vibecoding/var/contexts/qualities/**/context.md` を読了（該当ユニットを優先）。
  2) 下記プロンプトで「箇条書き（8〜10行・約400±20文字）」を生成。
  3) 新規生成する全 `src/**/*.ts` の先頭JSDocに貼付し、末尾に `@see` を2件以上（実際に参照した `context.md` への相対パス）と `@snd`（`なし` または対象 SnD `.md` への相対パス）を追加。既存ファイルに適用する場合は先頭JSDocを置換。

- ヘッダコメント生成プロンプト
  > 品質コンテキストゲートの内容を参考にし、
  > - 品質ゲートで量的に大量にブロッカーとなりやすく
  > - コード生成時のアテンションから外れやすい
  > ルールを、ヘッダコメント用に「日本語・箇条書き（8〜10行）」で「約400±20文字」に要約してください。具体例・数値・コード・設定値は禁止。方針名と遵守観点のみ。
- 出力フォーマット（厳守）
  - 先頭JSDoc ブロックの構造:
    - `@file <ファイルの目的>`
    - `備考: <特記事項なし|引継ぎポイント等>`
    - 箇条書き（先頭「- 」）8〜10行・総量400±20文字（コード/値/例なし）
    - `@see <vibecoding/var/contexts/qualities/**/context.md>` を2件以上
    - `@snd <なし|vibecoding/var/SPEC-and-DESIGN/**/<SnD>.md>`
  - 品質ゲートコンテキストにヘッダコメントに関する他の規定もあればそれも遵守する。

- 検証基準（MUST）
  - 行数: 8〜10行ちょうど（箇条書き）。
  - 文字数: 全体で 380〜420 文字（記号/空白含む）。
  - 禁止要素: コード断片（記号連続や型注釈等）、算用数字・具体値・設定名/キー名、具体例、URL。
  - 構造: 先頭JSDocに `@file` と `備考:` を含むこと。
  - 参照: `@see <相対パス>` を2件以上、かつ `@snd <なし|*.md>` を1件必須。
  - スコープ適合: 対象ファイルのユニットに対応する `qualities/**/context.md` からの要約であること。

- 予防ガイド（短時間セルフチェック / MUST）
  1) 先頭JSDocの1行目に `@file ...` があること
  2) 2行目に `備考:` があること（なければ `備考: 特記事項なし`）
  3) 箇条書き行（`- `）が 8〜10 行ちょうどであること
  4) 末尾に `@see ...` が 2 行以上あること（実際に参照した context.md）
  5) `@snd なし` または対象 SnD `.md` への相対パスが 1 行あること。`@snd なし` の場合はセミコロンに続けて理由やユーザーが承認したIMPLタスクの概要を記述すること。
  6) コマンド確認（非ウォッチ・非対話）: `npm run -s lint`
  - CI は `header/header-bullets-min` により構造・行数・参照を自動検証。ローカルで満たしてからコミットする。

- コメント言語セルフレビュー（MUST）
  - 目的: 先頭ヘッダ以外のコメントも、`.cursorrules` のロケール言語（現状: 日本語）で記述されていることを保存前に確認する。
  - 対象: 変更した `src/**/*.ts`
  - 検査コマンド（どちらか）
    - PowerShell:

```powershell
Select-String -Pattern '^\s*(//|/\*|\*)\s*[A-Za-z]{4,}' -Path src/**/*.ts
```

    - bash:

```bash
rg -n '^\s*(//|/\*|\*)\s*[A-Za-z]{4,}' src
```

  - 判定:
    - ヒット0件で合格。
    - ヒット行は日本語へ置換（固有名詞・型・識別子は除外可、コード断片はコメント外に移動）。
    - 修正後に `npm run -s lint` を実行。

- 失敗時のリカバリ（MUST）
  - どれか1つでも不一致なら出力を破棄し、同プロンプトで再生成。
  - 再生成で2回以上連続不一致の場合、当該 `context.md` の不足/曖昧さを疑い PRE-COMMON を実施して当該ユニットの `context.md` を補強後に再試行。

- 証跡・エビデンス（MUST）
  - 各ヘッダJSDoc直下に `@see` を最低2件記載（例: `vibecoding/var/contexts/qualities/<unit>/context.md`）。
  - コミットメッセージに「Header-Checklist: <対象ファイル数> / Verified by PRE-IMPL §Header-Checklist」を含める。

- 適用対象（MUST）
  - `src/**/*.ts`（テスト/生成物は除外）。既存ヘッダがある場合は追記ではなく置換。

- 移行/新規向けミニテンプレート（任意・補助）
  - まず骨組みを貼り付け、各 `[方針]` を当該ユニットの `context.md` から要約して置換すること（ダミーのまま禁止）。

```
/**
 * @file [ファイルの目的]
 * 備考: 特記事項なし
 * - [方針1]
 * - [方針2]
 * - [方針3]
 * - [方針4]
 * - [方針5]
 * - [方針6]
 * - [方針7]
 * - [方針8]
* @see vibecoding/var/contexts/qualities/docs/context.md
* @see vibecoding/var/contexts/qualities/core/context.md
 * @snd なし
 */
```

- テンプレート先行方式（任意・補助）
  - 新規追加時、ヘッダコメントのみの `.ts` をテンプレートとして先に生成してよい（本体未実装のまま）。その後に実装を追記する。
  - 本方式でも上記の検証基準・証跡要件に準拠すること。

- ゲート連携（MUST）
  - 本工程の完了は PRE-IMPL の承認条件。ヘッダ未設置/不整合はCIで失敗とする（判定は上記検証基準に従う）。
  - 自動検証は ESLint ルール `header/header-bullets-min`（ローカルプラグイン）で行う。既定で「箇条書き8〜10行」「@file/備考/@see≥2/@snd」を検査する。

## 実行順（必須）
1. PRE-COMMON 実施（last_updated・contexts 更新）
2. 対象 SPEC に `quality_refresh_hash_before_impl` を記録
3. ヘッダ生成の組み込み（MUST）: 以降に新規生成する `src/**/*.ts` は生成時点でヘッダJSDocを自動付与すること。テンプレート先行方式を採る場合は、先にヘッダコメントのみの `.ts` を作成し、その後に実装を追記してよい。いずれの場合も「Header Comment Quick Checklist」に準拠（箇条書き8〜10行・約400±20文字・末尾 `@see` 2件以上）。
4. 実装中は適宜 `npm run preflight` を実行して早期検知する（policy/typecheck/lint のみ。build/test は除外）
   - IMPL 中は `check` を実行しない（最終確認まで遅延・禁止）
5. 実装フェーズ完了時に `npm run check` を通過（静的解析はリポジトリ全体を対象とすること）
   - flow.1shot_impl=true の場合: 3〜4 の「自動実行」は no-op（任意の手動実行は可）。完了時の単発フルゲートで代替。
   - IMPL の中間段階での `check` 実行は原則禁止。最終確認として1回だけ実行し、修正が入った場合でも最後にもう一度 `check` を実行して緑で確定する

### 実装中のゲート運用（必須）
- 短縮ループは `npm run -s preflight` のみを反復する。IMPL 中の `npm run -s check` は禁止（最終確認まで遅延）。
- lint/test 実行結果のチャット報告ポリシー
  - 成功時: チャット上での明示的な成功報告は不要とし、バッチ完了時の一言要約にとどめる（`.cursorrules` の output_policy と整合）。
  - 失敗時: ファイルパスと先頭のエラーのみを簡潔に共有し、修正後に再実行した結果が緑であれば追加報告は省略してよい。
- 単発化モード（flow.1shot_impl=true）の例外:
  - 自動化/エージェントのゲート実行は IMPL 中は no-op（遅延）
  - 人手による任意実行は許容（推奨）。ただしウォッチャは禁止（非対話・非ウォッチ）
  - 実装完了時にフルゲートを1回だけ必須実行（全体スコープ）
- 短縮ループ（開発中の素早い確認）:
  - `npm run -s preflight`（変更ファイル限定モードは使用禁止。build/test は除外）
  - 実装前の事前確認（仕様確定直後の軽い自己点検）が必要な場合も `preflight` を用いる（最終判定は `check` で実施）
- 最終確認（修正が1つでも入ったら必須）:
- 単一コマンドのフル実行で「一発緑」を確認する: `npm run -s check`（静的解析は全体対象）
  - これが成功するまで「完了」扱いにしない（途中でどれかが赤→修正した場合も、最後にもう一度 `npm run -s check` を実行）

#### preflight 成功時の出力ポリシー
- 成功時はサイレント（出力なし）。preflight は早期検知（policy/typecheck/lint 実行）のみを目的とし、ガイダンス出力は行わない。
- 実装規約（スクリプト側）: `scripts/qualities/preflight.ts` は環境変数 `SND_PATH` を参照しない。

<!-- 参考: 以前のガイダンス文面は運用簡素化のため撤廃 -->

#### 開発サーバでの実動確認（feature 限定）
- 適用条件: `work_kind=feature` のときのみ。本節は preflight 成功直後に有効。
- 要件（最小構成・依存非拘束）:
  - `public/index.html` 等、ブラウザから直接到達可能な HTML で動作確認できること
  - 画面内にゲーム用の `canvas` 要素が1つ存在すること（id は任意で良いが固定）
  - 初回のユーザ入力（クリック/キー）で AudioContext を初期化し、その後にエントリ関数 `start(canvas)` を呼び出す設計であること
  - 開始/再挑戦の操作（クリック/Space/Enter）のいずれか1つ以上をサポートすること
- 目視確認項目（受入）:
  - Title 画面の表示→操作で開始できる
  - ブロックの描画とボールの発射/反射が行われる
  - 増殖ブロック破壊でボールが増える、GameOver/Cleared で演出後に再挑戦できる
  - 効果音は初回入力後に鳴動する（ブラウザ差による無音は許容）
- 実行手順の参照先（SoT）: 具体的な起動/アクセス方法は、プロジェクト内の「開発サーバ手順書」（例: `docs/**` または `vibecoding/docs/**` 配下）を参照すること。PRE-IMPL.md は特定ツール（例: Vite 等）への依存を持たない。

## Notes
- すべての手順を完了できない場合は実装を中断する（`.cursorrules` 参照）
- チェックリスト内容は必要に応じて更新される。更新時は `checklist_ref` に参照コミットを記録する

---

## 実装完了前必須手順 — 結果記録バッチ（必須）

目的: 実装完了前に、SnD の「## 実施結果 / レビュワー向けコメント」および関連メタ情報を単一バッチで確実に記録する。

### 実施内容（単一バッチ内で実施）
1) 品質ゲートの最終確認: `npm run -s check`。途中で修正が入った場合はもう一度実行して「一発緑」を確認。
   - **重要**: `npm run check` が失敗する場合、その原因を解消する必要がある。SnD の実装範囲外であっても、品質ゲートを通過させるために必要な作業（例: `vibecoding/var/contexts/qualities/**/context-review.md` の作成、テスト要件の充足）は実施すること。実装範囲外の作業である場合は、SnD の「実施結果 / レビュワー向けコメント」にその旨を明記する。
   - `context-review.md` が不足している場合: 各 `context.md` に対応する `context-review.md` を作成する。内容は「次回の SnD 実装時に token 消費を最小化するための context.md 改善提案」または「No changes needed for context.md」のいずれかを記載する。
2) SnD の「## 実施結果 / レビュワー向けコメント」を以下の構成で埋める。
   - a) 実施概要: 実装者・実施日・全ゲート通過・要件充足確認
   - b) 全体概要: 達成事項を2-3行
   - c) 作業ログ: 実行コマンド順序 / PRE-COMMON StartAt+hash（実装直前）/ 失敗→修正の経緯
   - d) 実装詳細（ファイル別）: 追加/更新/削除ファイル、役割・主要実装・設計判断（多い場合は適切にグループ化）
   - e) 品質・設計コメント: 型安全性・複雑度・テスト・パフォーマンス・セキュリティ・技術的負債
   - f) 設計上の判断・逸脱: 逸脱点・理由・不採用案
   - g) リスク・制約事項: 既知のリスクと緩和策
   - h) フォローアップタスク: 次に実施すべき具体タスク（チェックボックス）
3) 「## トラブルシューティング・動作確認手順」を実装内容に合わせて具体化（起動/アクセス/確認項目/エラー収集/よくある問題）。
4) front matter の `status` を `Implemented` に更新。

### エージェント指示
- (1)〜(4) を同一コミット/同一編集バッチで完了させる（分割禁止）。
- 途中でいずれかのゲートが失敗→修正が入った場合も、最後にもう一度 `npm run -s check` を実行して「一発緑」を確認してから保存する。

## 完了前必須手順 — コンテキストのバックフィル（条件付き必須）

目的: 実装中に得られた知見（lint/complexity/JSDoc/ポリシー回避やテスト安定化ノウハウ）を、後続モデル・実装者が一発でゲートを通せるよう `vibecoding/var/contexts/qualities/**/context.md` に反映する。

### 必須判定基準（Self-Check）
実装完了時、以下のいずれか1つでも該当すれば**必須実施**:
- [ ] `eslint-disable` / `eslint-disable-line` / `eslint-disable-next-line` を使用した
- [ ] 型エラーを修正した（型アサーション、型ガード追加、`as unknown as`等）
- [ ] テストケースを実装仕様に合わせて修正・調整した
- [ ] 既存 context.md の成功/失敗例に該当しない新パターンが発生した
- [ ] `npm run check` が初回実行で失敗した

**該当なし**の場合: SnD結果節に `"BACKFILL NOT NEEDED: no new patterns"` と記録してスキップ可

トリガ:
- POST-IMPL BATCH完了直後、**同一バッチ内**で実施（別バッチへの分割禁止）
- 上記判定基準を自己評価し、該当する場合は必ず実施

実施内容（timeboxed ≤10min）:
1) 該当する `contexts/qualities/**/context.md` を更新:
   - 今回の実装から得た**成功コード例1件** + **失敗コード例1件**（失敗理由を1行で明記）
   - 今回遭遇した**LLM NGパターン 1〜2件**（回避策付き）
   - 必要時のみ: コマンド↔設定↔対象範囲の対応表の差分
2) coverage の include/exclude を見直し、gate の実適用範囲と鏡像になるよう整合
3) `npm run -s check:pre-common` を再実行し、`"<StartAt> <hash>"` を確認（exit=0）

ガードレール:
- 分量は箇条書き中心で 10 分以内、長文禁止
- 所有者（例: `game`）の承認が必要な場合は PR で依頼

### Agent向け実行指示
- **Step 1**: POST-IMPL BATCH完了後、上記判定基準を自己評価
- **Step 2**: 該当する場合、同一バッチ内で context.md/yaml を更新
- **重要**: Step 1-2 を同一バッチ内で完了すること（POST-IMPL BATCHと分割禁止）

---

## 実装完了前必須手順 — トラブルシューティング節の更新（必須）

目的: 実装完了後の動作確認手順を、実装内容に応じて具体化し、後続の利用者やメンテナーが問題を自己解決できるようにする。

### 必須実施タイミング
POST-IMPL BATCH と同一バッチ内で実施

### 実施内容
対象 SnD の「## トラブルシューティング・動作確認手順」セクションを更新:

1. **動作確認手順の具体化**:
   - 起動コマンドを実際のコマンドで記述
   - アクセス方法（URL/コマンド/呼び出し方法）を具体的に記述
   - 確認項目を実装した機能に合わせて具体化

2. **エラー収集手順の具体化**:
   - 実装内容に応じたエラー情報の収集方法を記述
   - 実装固有の確認事項を「Step 2」に追加

3. **よくある問題の記録**:
   - 実装中に実際に遭遇した問題があれば「症状/原因/解決策/回避策」を記録
   - 問題が発生しなかった場合: "実装完了後、特記すべき問題は発生しませんでした。" と記載

### Agent向け実行指示
POST-IMPL BATCH に統合して実施:
- POST-IMPL BATCHの最終ステップとして、SnDのトラブルシューティングセクションを更新
- 実装内容（Webアプリ/API/CLI/ライブラリ）に応じて、動作確認手順とエラー収集方法を具体化
- 実装中に遭遇した問題があれば「よくある問題」に追記
- 同一バッチ内で完了すること

## SnD Template Compliance（補足）

- テンプレ見出しの削除禁止（特に「実施結果 / レビュワー向けコメント」）。
- 未適用でも節は残す。`**実施判定**: NOT_NEEDED | DEFERRED | APPLIED` を必ず記載し、理由を1行で説明。
- Ready 条件の再掲: 必須セクションの全存在 / 「未確定事項=空」 / front matter に `quality_refresh_hash_at_created` と `quality_refresh_hash_before_impl` を保持。

## Gate順の固定（変更禁止・再掲）

- 実行は `npm run check`。このゲートの緩和や変更は禁止。
- ルール緩和（例: default export 許可、no-magic-numbers を全OFF）は、SnD の「改変許可範囲」で明示承認がある場合のみ許可。

---

## Gate Execution Policy（自動化・ツール向け・権威的）

本節は自動化/ツール/エージェントが品質ゲートを実行する際の唯一の参照（SoT）です。`.cursorrules` は本節に従うよう定められています。
なお、具体的な実行コマンド（npm/npx 等）は本節にのみ記載し、`.cursorrules` 側には具体コマンドを記載しません（方針・参照先のみ）。

### 承認プロンプト出力ポリシー（MAINT）
- 対象: IMPL 開始承認プロンプト（要旨→別チャット可→ガイダンス→承認フレーズの4行ブロック）
- 表示許可: `current_phase == SnD-ONLY` かつ `impl_not_started == true` のときのみ
- 表示抑止（いずれかで抑止）:
  - `current_phase == IMPL`
  - `quality_gate.last_run.scope == full`（実装完了ゲート実行済み）
  - `session.edits_count > 0` かつ `edits_paths ∩ {src/**, tests/**} != ∅`
- 位相補正: `src/**` または `tests/**` への書き込みを検知した時点で `current_phase = IMPL`（自動遷移）。この状態での承認プロンプト出力は常に禁止。
- 再掲防止: `approval_prompt_once_per_snd: true`（同一 SnD セッション内での再掲禁止）

### 実装スコープ遵守（SnD準拠・ブロッキング）
- 原則: 実装は承認済み SnD の「改変許可範囲」と「外部依存と環境値」に明記された要素のみに限定する。
- 禁止: SnD に明記のない依存の導入（例: ファイル/ディレクトリ/環境変数/設定値/CLIオプション/外部サービス/API）、隠れた入出力や設定の追加・変更。
- 例外手続（必須・順序固定）:
  1) ユーザーの明示許可を取得
  2) SnD を更新し、当該依存を「外部依存と環境値」等に記載（I/O/型/既定値/責務/例外方針/受入条件を明確化）
  3) 未確定事項=空 を満たした上で Ready を再判定
  4) IMPL 承認フレーズ（`PHASE=IMPL 承認: SnD=...`）で再開
- 検出時の扱い: 当該変更は破棄し、SnD 更新提案に切り替える（PR/コミットへは載せない）。

0) 単発化モード（flow.1shot_impl=true のとき）
- IMPL 中: 自動化によるゲート呼び出しは必ず defer（no-op）する
- 完了時: リポジトリ全体を対象とする FULL gate を厳密に1回だけ実行する
- 実行は常に非対話・非ウォッチ（--ci/-q 等）で行い、確認ダイアログ/承認待ちは禁止
- 失敗時の再試行は 1 回まで。改善しなければ停止して報告（手戻りを明示）

1) スコープ方針（必須）
- 最終/自動チェックはリポジトリ全体を対象とする（changed-files gating を禁止）。
- 非対話・非ウォッチで実行する（--ci/-q 相当）。

2) 実行順序（検出ロジック）
- If `.github/workflows/*` exists: ワークフローを読み、ローカルで同等の `check` 相当を実行。
- Else if `Makefile` exists: `make -s check`。
- Else if `package.json` exists: `npm run -s check` を第一選択。
  - 失敗時の分解実行: `npm run -s lint && npm run -s test && npm run -s typecheck`。
- Else if Python 環境（pyproject/poetry/tox/nox）: `(make -s check) || tox -q || nox -q || (ruff check . && pytest -q && mypy .)`。
- Else if Go: `(make -s check) || golangci-lint run --out-format=tab && go test ./...`。
- Else if Rust: `cargo clippy -- -D warnings && cargo test`。
- Else if Gradle: `./gradlew -q check`。
- Fallback: `echo 'No standard quality gate found; skipping.'`（必要時のみ）。
 - IMPL 中は開発ループで `preflight` のみを使用し、`check` の実行は完了時の最終1回に限る（自動・手動とも）

3) 失敗時の報告（必須）
- ファイル:行 とファイルごとの最初のエラーを要約。
- ツールが導入したエラーは最大3回までのターゲット修正を試み、改善しなければ停止して報告。


