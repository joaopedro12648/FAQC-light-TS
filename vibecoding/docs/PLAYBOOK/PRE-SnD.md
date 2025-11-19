# PRE-SnD — SPEC-and-DESIGN 作成前チェックリスト

目的: SPEC-and-DESIGN（SnD）を新規/更新で作成する「設計フェーズ」において、品質ゲートのコンテキストを事前に揃え、ADR生成/設計記述の精度を高める。

参照: 共通手順は [vibecoding/docs/PLAYBOOK/PRE-COMMON.md] を用いる。

### 品質原則
- 作成した SnD 自体も後続モデルにとって広義の「品質コンテキスト」になるため、後続モデルの高精度な挙動を保つために、高品質な SnD を作成すること

---

## 品質ゲート宣言（SnD作成時）
SPEC-and-DESIGN ファイル作成にあたっては、次の SoT を明確に区別して参照する：
- コード生成時の SoT: `vibecoding/var/contexts/qualities/**/context.md`（人間/LLM向け: `context.md` 本文と、その中の `### Quality Context Hash Manifest` などの YAML ブロック）。hash manifest / unitDigest を含む機械可読な情報の単一情報源（SoT）は常に `context.md` 内の YAML とする。
- ゲート実行時の SoT: `qualities/**` に配置された実設定（ESLint/tsconfig/policy 等）。実行は「コマンドロール定義とマッピング」に従う。

---

## 必須

1. SnD テンプレート準備
   - `vibecoding/docs/PLAYBOOK/_SnD-template.md` をベースに新規SnDを作成
   - 「品質ゲート宣言（必読）」節をテンプレートに沿って記載
   - 「品質ゲート（このSnDの定義）」に、この変更に特有の追加ゲート/閾値を必要に応じて明記
   - 「実施方式」セクションに関してはテンプレートのものをそのまま利用する（追記のみ可能）

2. コンテキストの添付（LLM/ADR向け）
   - 設計/ADR生成時の入力に、次の【最新】コンテキストを必ず添付する:
   - `vibecoding/var/contexts/qualities/{core,types,docs,tsconfig}/context.md`（正規ユニットの人間可読＋機械可読コンテキスト。特に `### Quality Context Hash Manifest` セクション直下の YAML manifest を hash manifest / unitDigest の SoT として扱う）
   - 追加で必要な場合に限り、`vibecoding/var/contexts/qualities/**/*.yaml`（補助的な機械可読設定。hash manifest / unitDigest の SoT ではなく、説明補足用途とする）
     - `qualities/policy/baseline.yaml` など（ポリシーは `npm run check` から個別実行される）
   - 品質系 SnD（front matter の `tags` に `qualities` を含む SnD）では、加えて次を参照した上で SnD を記述する:
     - 対象ユニットの `context.md` 内 `### Quality Context Hash Manifest` セクション（インライン YAML manifest）
     - 当該ユニットの unitDigest（YAML manifest に記録されたユニット全体の代表ハッシュ。SnD から参照する場合は、この inline YAML の値を前提とする）

3. SnD 内の明記ポイント
   - 改変許可範囲（Allowed Change Scope）: 今回の設計/実装で手を入れる範囲を限定
   - ステータス運用/受け入れ条件: Ready 判定・受け入れ基準を具体的に列挙
   - AI実装指針: 生成時に参照すべきコンテキスト（上記）を箇条書きで明記
   - 外部依存と環境値: ファイル/ディレクトリ/環境変数/設定/CLI/外部サービス/API を列挙し、各項目に「型・既定値・用途・責務・例外方針・受入条件の検証観点」を明記する。未記載の依存は実装禁止（必要時は本節を更新し Ready 再判定後に IMPL 再承認）。
   - qualities 改変ポリシー: ユーザーから「qualities/** を変更する SnD」として明示依頼されたタスク以外では qualities/** の編集を全面禁止とし、該当しない SnD では「qualities/**: 本SnDの改変対象外」と明記する。
   - 改変対象パスの明示（IMPL スコープ連動）: IMPL フェーズで AI/エージェントが編集してよいパスは、承認済み SnD の「改変許可範囲」と `context.outputTargets` の両方に列挙されたパスに限定される。`src/**`, `tests/**`, `vibecoding/**`, `qualities/**` を編集対象とする場合は、必ず本節と `context.outputTargets` の双方に明示し、明示されていないパスへの編集はガードレール違反として禁止する。
   - qualities 配下のルールやゲート強化を行う SnD では、「設定追加後にどの範囲（例: `qualities/**`, `src/**`, `scripts/**`）へ lint/typecheck/policy を再実行し、既存コードの違反をいつ・どこまで修正するか」というロールアウト計画を必ず SnD 本文（目的/マイグレーション/受け入れ条件など）に明示する。新しいルールだけを追加し、既存コードの修正計画を曖昧なまま残すことは禁止。

4. 設計レビュー準備
   - 「未確定事項」を埋めきること（空であること）
   - 例外方針/パフォーマンス/可観測性の最小要件を満たすこと

---

## エージェント指示（必須・自動実行）
- 本ドキュメントに基づき SnD を新規作成/更新する LLM/Agent は、開始前に必ず PRE-COMMON を実行する。
- 実行内容は PRE-COMMON の「エージェント指示（必須・自動実行）」に従う（本書では列挙しない）。
- PRE-COMMON が完了したら（exit=0）、標準出力される1行（`"<StartAt> <hash>"`）を、そのまま対象 SnD の front matter `quality_refresh_hash_at_created` に記録する。
- PRE-COMMON exit=0 を取得したら、SnD の新規作成を自動で続行してよい（デフォルト動作）。front matter へ `quality_refresh_hash_at_created` を即時記録する。
- PRE-COMMON exit=0 未達（または `context-review.md` 残存）の場合は SnD を起票しない（レビュー統合を優先）。
 - 禁止: `check:pre-common` 以外の手段でハッシュを生成・改変すること（手計算・独自スクリプト等）
- 追加ポリシー（明示依頼時の自動更新）: ユーザーから SnD 作成を明示依頼された場合、`check:pre-common` で exit=0 を得るために必要な `vibecoding/var/contexts/qualities/**` の詳細レポート生成・更新（派生物の生成に限る）を、追加確認なく自動実施してよい。ここには `qualities/**` の設定変更やルール緩和は含まれない。得られた `"<StartAt> <hash>"` をそのまま `quality_refresh_hash_at_created` に記録する。

## フィードバック記録（SnD作成/更新後・必須）
- SnD 作成完了後（`quality_refresh_hash_at_created` を記録した直後）、次のファイルにフィードバックを出力する: `vibecoding/var/feedback/<YYYYMM>/<YYYYMMDD>/fb-SnD-<YYYYMMDD>-<slug>.md`（`<slug>` は SnD のファイル名に用いたものと同一。`<YYYYMM>` と `<YYYYMMDD>` は SnD のディレクトリ日付に従う）。
- SnD 更新時は、同一の fb-SnD ファイルに追記する（存在しない場合は新規作成してよい）。
- 記載内容: 実際にルール群を実行してみた際の判断の迷い、`.cursorrules` および参照ルールの改善検討ポイント、根拠と具体例（OK/NG の短例）、次回反復に向けた改善案。
- 記載すべき事項がない場合は、1 行で「No feedback」と記載する。

## SnDの準備完了の定義
- 「未確定事項」が空である
- 必須セクション（背景/目的/非目標/設計構想/用語・境界/公開インタフェース/型設計/例外方針/受け入れ条件）が充足
- 「品質ゲート（このSnDの定義）」が明記され、テスト観点が列挙
- 特段の理由がない限り、「CHECK ロール（`npm run --silent check`）の緑化」を受け入れ条件に含め、その実行結果を SnD の受け入れ条件節に明記する（現実的でない場合は理由と代替ゲートを明記する）
- PRE-COMMON によるコンテキスト更新が完了し、参照リンクが SnD に記載

---

## 補足
- 実装フェーズへ移行する際は、別途 [docs/PLAYBOOK/PRE-IMPL.md] を実施し、SnD の front matter に `quality_refresh_hash_before_impl` を記録すること。
- PRE-SnD は設計の精度/再現性向上のための手順であり、CIの PRE-IMPL チェックとは独立する。

---

## コマンドロール定義とマッピング（SnD-ONLY/IMPL）

本節は `.cursorrules` から外だしされた、非対話（--ci/-q 等）前提の「許可コマンド群」の規定である。

1) ロール定義（抽象）
- CHECK: リポジトリ既定の総合チェック（lint/typecheck/test などの編成は各リポジトリで定義）
- TYPECHECK: 型検査のみを実行
- LINT: 静的解析（リンタ）のみを実行
- TEST: 自動テストのみを実行（非対話・ウォッチ無効）

### 承認プロンプト出力ガード（MAINT）
- 承認プロンプト（4行ブロック）は「IMPL 開始前の案内」に限定する。
- 表示許可: `current_phase == SnD-ONLY` かつ `impl_not_started == true`
- 表示抑止（いずれか一致で抑止）:
  - `current_phase == IMPL`
  - `quality_gate.last_run.scope == full`
  - `session.edits_count > 0` かつ `edits_paths ∩ {src/**, tests/**} != ∅`
- 再掲防止: `approval_prompt_once_per_snd: true`
- 位相補正: `src/**` または `tests/**` への編集検知時は `current_phase = IMPL` に自動遷移し、以降は承認プロンプトを出力しない。

2) フェーズ許可
- SnD-ONLY: CHECK / TYPECHECK / LINT / TEST を個別実行してよい
- IMPL: 上記すべて実行してよい（CI方針は PRE-IMPL.md の Gate Policy に従う）

3) 本リポジトリのマッピング（Node/NPM 実装）
- CHECK:
  - `npm run --silent check`
  - `npm run check --silent`
- TYPECHECK:
  - `npm run --silent typecheck`
  - `npm run typecheck --silent`
- LINT:
  - `npm run --silent lint`
  - `npm run lint --silent`
- TEST:
  - `npm run --silent test`
  - `npm run test --silent`

備考:
- プロジェクトが Node/NPM 以外の場合は、同ロール名に対応するコマンドをプロジェクト標準に合わせて再定義すること（例: `make check`, `just test`, `cargo test --quiet` 等）。
