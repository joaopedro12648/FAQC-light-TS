# PRE-COMMON — Qualities Context Refresh (Shared, Dynamic TS-Aware)

目的: 今後の設計/実装フェーズにおいて、後続でどんな厳しい品質ゲートが来ても問題ないよう、「品質ゲートの地図」を先に把握し、詳細レポート化すること。この生成するレポートの内容が表層的、もしくは曖昧な場合、後続タスクの未達や品質低下、時間やトークンの浪費に直結する。

## 🚫 禁止事項 — カンニング行為の抑止

### 原則
目的に照らし合わせ、他フェーズ（例: SPEC-and-DESIGN、IMPL、tests）由来の情報を参照して予め回答を推測・模倣する行為（いわゆる「試験範囲のカンニング」）を禁ずる。

### 目的
表層的、もしくは曖昧な詳細レポートの生成を防止するため。PRE-COMMON は **「設計思想との同調試験」** であり、単なる結果生成フェーズではない。

### 許可される例
- `qualities/**` 以下の既知ルールの参照  
- `.cursorrules` または同等メタマニフェストの読解  
- 本ファイル `PRE-COMMON.md` 自身の再帰的参照

### 禁止される例
- `**/tests/**` ファイルや `**/scripts/**` ファイルを根拠に要求を逆算する行為  
- `package.json` のコマンド内容を利用してゴールを推測する行為  
- “前回の出題傾向” に基づく自己最適化的回答

---

## 単一情報源（SoT）の原則
- 品質ゲートコンテキストの SoT: `qualities/**`
- コード生成時の SoT: `vibecoding/var/contexts/qualities/**`
- PRE-COMMON は参照元→要約ミラーの整合検査を行う（参照元は変更しない）。

#### ハッシュ記録のSoT（明確化）
- SnD の `quality_refresh_hash_*` に記録する値は、`npm run -s check:pre-common` の標準出力1行（`<start_at> <hash>`）のみを用いる。
- 手計算・独自スクリプトによる生成や改変は禁止。
- 「設定ファイルの網羅的読み込み」や「診断出力の参照」は、詳細レポート作成（`context.yaml`/`context.md` 生成）時の要件であり、ハッシュ記録の SoT とは切り離して扱う。

### 詳細レポート作成（detailed quality report generation）の定義
- 参照元（normative）: `qualities/**` の実設定
- 生成物（derived）: `vibecoding/var/contexts/qualities/**/{context.yaml,context.md}`
- 最小要件:
  - `context.yaml` に gate.commands/configs, checks/coverage
  - `context.md` に Why/Where/What/How 節（詳細は後述）
- 検知: mtime 最低検知＋実質変更検知
- 実装方針: LLMの能力を活用して詳細レポートを生成。詳細レポートにて「品質ゲートを考慮しない設計・実装」の問題点を明らかにし、その問題を回避するための方策を定義する。
- 分量要件: 詳細レポート（context.md）の行数要件は、作成フェーズにより異なる：
  - **初回作成時**（context.md が存在しない、または10行未満）：**60-100行厳守**
    - 下限60行：品質ゲート初回通過に必要な最低限の情報（GPT対策）
    - 上限100行：暴走防止、簡潔性の維持（Claude対策）
    - Why: 8-15行、Where: 2-5行、What: 8-15行、How: 35-60行
  - **更新時**（既存 context.md が60行以上存在）：**下限60行のみ、上限なし**
    - 実践から得られた知見（追加NGパターン、エッジケース、トラブル事例）の追記を優先
    - ただし、冗長な重複や無関係な記述は削除すること

### 詳細レポート作成の前提条件（必須）
詳細レポート作成にあたっては、**必ず以下を実施する**：

1. **品質ゲート設定の網羅的読み込み**
   - 対象ユニットの `qualities/**` 配下のすべての設定ファイルを読み込む
   - 例：
     - `qualities/eslint/eslint.config.mjs` - ESLintルール全体
     - `qualities/tsconfig/tsconfig/types/tsconfig.json` - TypeScript strictオプション全体
     - `qualities/policy/anti_mvp/core/anti_mvp_policy.yaml` - 禁止語・パターン全体
     - `qualities/policy/baseline.yaml` - ポリシーベースライン
     - 関連する実装コード（`qualities/policy/anti_mvp/**/*.ts`）

2. **check:pre-commonの診断出力の参照（補助）**
   - exit=2 時の診断出力（`pre-common-diagnostics.md`）は補助的な参考情報
   - 診断出力のみに依存せず、設定ファイルの直接理解が主

3. **設定項目の体系的理解**
   - 各ルールの意図・閾値・禁止事項を理解
   - ルール間の関連性・優先順位を把握
   - カバレッジ範囲と除外パターンの確認

4. **hash manifest / unitDigest の生成（必須・自動）**
   - PRE-COMMON 実行時には、`vibecoding/scripts/qualities/context-hash-manifest.ts` を通じて、各ユニットの hash manifest（`vibecoding/var/contexts/qualities/<unit>/manifest.yaml`）および unitDigest を必ず生成・更新する。
   - hash manifest には、少なくとも次の情報を含める（詳細仕様はスクリプト側の SoT とし、本プレイブックでは構造のみを規定する）:
     - `unit`: ユニット ID（例: `docs/core/types` など）
     - `algo`: 使用するダイジェストアルゴリズム名（例: `sha256`）
     - `files`: `qualities/**` 配下から収集した入力ファイルの一覧（正規化済み相対パス＋内容ダイジェスト）
   - unitDigest は、当該ユニットの hash manifest から導出される「ユニット全体の代表ハッシュ」とし、SnD や関連ドキュメントが「どのバージョンの品質コンテキストに基づいているか」を記録するために用いる。

### context.md の節構成と責務
各 `context.md` は以下の4節で構成され、各節は明確な責務を持つ：

#### Why（問題提起）
品質ゲートを考慮しない設計・実装で発生しうる問題点と影響の大きさを明示する。

- **成果物品質への影響**
  - 型安全性の崩壊（runtime error、null参照等）
  - 保守性の低下（可読性、拡張性、技術的負債）
  - セキュリティリスク（any型による型検証回避等）
- **品質ゲートでの手戻りコスト**
  - トークン消費（再生成、修正サイクル）
  - 時間損失（lint修正、type error解消、リファクタリング）
  - 認知負荷（エラー解析、根本原因特定）

#### Where（適用範囲）
この品質ゲートが監視する対象範囲（`coverage` と一致）。

#### What（検査内容）
具体的なルール、閾値、禁止事項を列挙。コマンドと設定ファイルの対応を明示。

#### How（方策の網羅的一覧）
上記問題を避けるための具体的な実装方針・パターンを網羅的に提示する。

- **成功パターン**（最低1件）
- **失敗パターン**（最低1件）
- **LLM典型NGパターン**（最低5件）：LLMが陥りやすい具体的な誤りと回避策
- **事前チェックリスト**：コード生成前に確認すべき項目
- **修正方針**：違反発見時の体系的な対処手順

---

## 用語注（「対象」の使い分け）
- コンテキスト選択規則での「対象」＝コードパス
- 手順2での「対象」＝ quality コンテキストディレクトリ
- `unit_path` は vibecoding/var/contexts/qualities/** に定義。最長一致選択。

### unit_path の正規化規範
- NFC 正規化 → `/` 正規化 → 小文字化 → 前方一致（末尾 `/` 付与）

---

## context.yaml スキーマ（固定）
```yaml
name: <string>
unit_path: <string>
gate:
  type: <lint|typecheck|policy|test|build|other>
  enforce: <block|warn>
  commands:
    - <string>
  configs:
    - <path>
checks:
  - id: <string>
    description: <string?>
    path: <path?>
coverage:
  include:
    - <glob>
  exclude:
    - <glob>
updated_from:
  since: <UTC-ISO8601 start_at of last successful mirror>
updated_at: <UTC-ISO8601 start_at>
```
※ glob は micromatch 互換。`coverage.exclude` が include と重複した場合は exclude 優先。

### commands/configs の典拠
- commands の典拠: `package.json` のスクリプト。
  - 代表例: `npm run check`（内部でポリシー/型検査/Lint/テストを実行）。
  - **lint の厳格性**: `--max-warnings=0` を指定し、warning も許容しない。
- configs の典拠: qualities 配下の実設定。
  - 代表例: `qualities/eslint/eslint.config.mjs`（ESLint）, `qualities/tsconfig/tsconfig/types/tsconfig.json`（TypeScript）, `qualities/policy/baseline.yaml` および `qualities/policy/**`（Policy）。

参考例（ESLint ユニットの context.yaml 抜粋）:
```yaml
name: eslint
unit_path: /qualities/eslint/
gate:
  type: lint
  enforce: block
  commands:
    - npm run -s lint  # --max-warnings=0 が package.json で指定済み
  configs:
    - qualities/eslint/eslint.config.mjs
coverage:
  include:
    - "**/*.ts"
  exclude:
    - "**/node_modules/**"
updated_at: <UTC-ISO8601>
```

---

## Context-First 実務規範（教訓の制度化）

本節は過去の反復から得られた「手戻り最小化」の実務規範を、PRE-COMMON の一部として明文化する。以下は PRE-SnD/PRE-IMPL に先立って必ず満たす。

1. 実装や SnD を書く前に、必ず `npm run -s check:pre-common` を実行し、`vibecoding/var/contexts/qualities/**` の鏡像（context.yaml/context.md）を更新して exit=0 を得る。
2. **初回作成と更新の判定**（LLM/Agent向け）:
   - `context.md` が存在しない、または10行未満 → **初回作成モード**（60-100行厳守）
   - `context.md` が既に60行以上存在 → **更新モード**（下限60行のみ、上限なし）
   - 判定は各エージェントが自律的に実施（スクリプト不介入）
3. 各ユニットの `context.md` の How 節には、次の「実装ガードレール」を必ず含める（LLM/人間どちらにも効く即効性のある指針）：
   - JSDoc 必須とファイル概要（`jsdoc/require-jsdoc`, `require-file-overview`）
   - マジックナンバー禁止（専用 `constants.ts` へ集約）
   - 複雑度/関数長制約（例: complexity≤10, max-lines-per-function≤80）→「責務単位でクラス/モジュールを分割」
   - default export 禁止（named export 徹底）
   - 二重キャスト禁止（`as unknown as`）→ 代替パターンを提示（例: Safari 音声初期化は拡張 Window 型で安全に）
   - relax 禁止（ESLint 抑止ディレクティブに依存しない。ルールに適合する実装で解決）
4. How 節は「成功/失敗/LLM典型NG（≥5）/事前チェック/修正方針」を満たすだけでなく、以下のような「すぐ使えるスタータ」を併記し、実装前の迷いをなくす：
   - 定数集約の雛形（no-magic-numbers 回避）
   - 複雑度回避の構造化雛形（エンジン分割など）
   - ブラウザ互換の安全な型付け例（Safari の AudioContext など）
5. 各ユニットの `context.md` の How 節の先頭に「設定閾値一覧」小節を設ける（特に core/docs/types ユニットは必須）：
   - 設定閾値一覧には、当該ユニットが参照する `qualities/**` の設定値から導出した主要な閾値・禁止事項・フラグを、**「閾値名＋具体的な値」** の組み合わせ（例: `complexity: 10`, `max-lines-per-function: 80`, `max-warnings: 0`）として表または箇条書きで一覧する（抽象表現やスタータの例値は禁止）。
   - 各行に「出典（相対パス＋抜粋/値）」を必ず併記し、PRE-COMMON 実行時点の現行設定と整合していることを示す（設定ファイルの値をそのまま引用し、SnD 側の仮値・サンプル値で代用しない）。
   - core/docs/types 以外のユニットでも、数値閾値や禁止語など設定値由来の境界条件を持つ場合は同様に「設定閾値一覧」を How 節先頭へ追加する。

### スタータ（How にそのまま貼れる例）

> 注意: 本スタータは非正典（Non-canonical）。具体値は qualities/** の現行設定やドメイン仕様から導出して置換すること。導出根拠（相対パス＋抜粋/値）を併記しない場合、Rubric未充足とみなす。

#### 定数集約（`src/**/constants.ts` の最小骨格）

```ts
/**
 * @file ゲーム定数（マジックナンバー集約）
 */
export const TARGET_FPS = /* <derive-from-domain-or-qualities> */ 60;
export const FIXED_DT = 1 / TARGET_FPS; // 出典: 設計上のタイムステップ方針
export const UI_TEXT_SIZE = /* <derive-from-ux-guideline> */ 18;
// 具体値はスタータではなく導出して置換する（値を直接コードに埋めない）
```

#### 構造分割（複雑度ガード: エンジン/描画/入出力の分離）

```ts
/** @file エンジン起動 */
import { GameEngine } from './GameEngine';
export function start(canvas: HTMLCanvasElement): void {
  const game = new GameEngine(canvas);
  game.init();
  game.run();
}
```

#### 二重キャスト禁止の代替（Safari 互換の安全な初期化）

```ts
const win = window as Window & { webkitAudioContext?: typeof AudioContext };
const Ctx = win.webkitAudioContext ?? AudioContext;
const audio = new Ctx();
```

> 目的: `as unknown as` などの二重キャストに頼らず、拡張インターフェースで安全に表現する。

---

## 必須手順（共通）
1. **start_at確定とlast_updated更新**  
   `npm run -s check:pre-common` 実行。開始時刻を記録。
   - last_updated の格納先: `vibecoding/var/contexts/qualities/last_updated`
   - フォーマット: UTC-ISO8601 を1行（末尾改行付き）で保存

2. **対象ユニット列挙**  
   - 共通除外: 先頭が `_` のディレクトリは全ルールで対象外（例: `_shared`, `_draft`）。  
   - ユニット候補ディレクトリ: `qualities/{eslint,policy,tsconfig,...}/<bucket>/<unit>` の **第3階層ディレクトリ** をユニット候補とみなす。  
   - ユニット名の命名規約: `<unit>` は次の正規表現に一致する ASCII 名とする（先頭 `_` 禁止）。  
     - `^[a-z][a-z0-9_-]*$`  
   - 上記命名規約を満たす `<unit>` だけを PRE-COMMON のユニット ID として扱い、`vibecoding/var/contexts/qualities/<unit>/` 配下に `context.yaml/context.md` および hash manifest（`manifest.yaml`）を生成する。  
   - `core` / `docs` / `types` は従来どおり canonical なユニットとして扱うが、命名規約を満たすユニット名であれば追加ユニット（例: `perf`, `security` など）も将来的に許容される。  

3. **exit=2 の自動診断（example code & diagnostics）**  
   `npm run -s check:pre-common` が exit=2 の場合、スクリプトは以下を自動出力する。
   - kata.ts の例（参考コード）。標準出力は ASCII セーフ、完全版はファイル保存。
   - `npm run check` に相当する各段階の結果（exit と要約出力）。
   - 完全版保存先: `tmp/pre-common-diagnostics.md`
   - 解釈: exit=0 は合格。>0 は失敗。失敗詳細を確認し、`context.md` へ「NGパターン」「成功/失敗例」「フィードバック」を反映。
   - 注意: 例コードは一時的に `src/kata/sieve.ts` として生成・検査後に削除される（リポジトリには残らない）。
   - 但し書き: exit=2 時の出力は「キャリブレーション用サンプル」であり、プロダクトコードのゲート違反ではない。先に鏡像（`vibecoding/var/contexts/qualities/**`）を作成・更新し、再実行して `<start_at> <hash>`（exit=0）を取得する。
   - 表記規則: サンプル行には `[SAMPLE]`、実際の鏡像不足やRubric未充足などのゲート対象には `[GATE]` を付与。
   

4. **詳細レポート作成**  
   各ユニットに context.yaml/md 生成。以下の手順で実施：
   
   a. **設定ファイルの網羅的読み込み**（必須）
      - 対象ユニットの `qualities/**` 配下の全設定ファイルを読み込む
      - 設定内容を体系的に理解（ルール・閾値・禁止事項・カバレッジ）
   
   b. **診断出力の参照**（補助）
      - `pre-common-diagnostics.md` の内容を参照（exit=2時）
      - Calibration Kata の結果から具体的なNG例を抽出
   
   c. **context.yaml/md 生成**
      - 設定ファイルの理解に基づき context.yaml を生成
      - Why/Where/What/How 各節を含む context.md を生成
      - Rubric満足までLLM内部3サイクル
   
   d. **Rubric検証**（必須）
      - 詳細レポート作成の度に `npx -y tsx vibecoding/scripts/qualities/context-md-rubric.ts` を実行
      - exit code が 0 であることを確認
      - 違反がある場合は修正して再度検証


5. **再実行確認**  
   `npm run -s check:pre-common` → `<start_at> <hash>` 出力・exit=0。
   - ドリフト検知: `qualities/**` の mtime/内容が前回の出典（context.md の引用/値）と不整合の場合、鏡像を再生成して整合を回復する。整合が取れるまで exit=2 相当の扱いとし、SnD 記録を保留する。
   - 出典整合: `context.md` の各ルール・閾値には必ず「出典（相対パス＋抜粋/値）」を併記し、PRE-COMMON 実行時点の現行設定と一致していること。
   - hash manifest 整合: `vibecoding/var/contexts/qualities/<unit>/manifest.yaml` および unitDigest は、PRE-COMMON 実行時点の `qualities/**` の内容をもとに最新化されていることを前提とし、これが満たされない場合は exit=0 を返さず、再生成と再実行によって整合を回復する。

6. **SnD連携記録**  
   `npm run -s check:pre-common` が exit=0 時に出力する `<start_at> <hash>` をそのまま SnD の front matter に記録。
   - PRE-SnD（設計作成時）: `quality_refresh_hash_at_created: "<start_at> <hash>"`
   - PRE-IMPL（実装移行時）: `quality_refresh_hash_before_impl: "<start_at> <hash>"`
   - 記録例（YAML）:
```yaml
quality_refresh_hash_at_created: "2025-11-05T12:34:56.789Z 012345...abcd"
# 実装移行直前に再記録する場合:
quality_refresh_hash_before_impl: "2025-11-05T12:34:56.789Z 012345...abcd"
```

---

## Rubric（最低充足基準）

各 `context.md` は以下の基準を満たす必要がある：

### Why節
- [ ] **問題点の明示**：品質ゲート未考慮時の具体的な問題を列挙
- [ ] **成果物品質への影響**：型安全性・保守性・セキュリティの各観点で記述
- [ ] **手戻りコストの定量化**：トークン・時間・認知負荷の観点で記述

### Where節
- [ ] **適用範囲の明示**：`context.yaml` の `coverage` と整合
- [ ] **包含・除外パターン**：glob パターンを例示

### What節
- [ ] **コマンド↔設定↔範囲の対応表**：実行コマンド、設定ファイル、監視範囲の3点セット
- [ ] **閾値・禁止事項の明示**：具体的な数値・パターンを記載（設定ファイルから直接読み取った内容）
- [ ] **ルールの根拠**：なぜそのルールが必要かを簡潔に説明
- [ ] **設定ファイルの反映**：`qualities/**` の設定内容が正確に反映されている
 - [ ] **出典の併記**：各数値・閾値・禁止事項に「出典（相対パス＋抜粋/値）」を併記
 - [ ] **スタータ依存の排除**：スタータの値をそのまま流用していない（qualities/** から導出・置換済み）

### How節
- [ ] **成功パターン**：最低1件（コード例付き）
- [ ] **失敗パターン**：最低1件（コード例＋エラーメッセージ付き）
- [ ] **LLM典型NGパターン**：最低5件（具体例＋回避策付き）
- [ ] **事前チェックリスト**：コード生成前の確認項目
- [ ] **修正方針**：違反発見時の体系的な対処手順
 - [ ] **Reasoning Hooks**：生成前の自問チェック（関数長/複雑度/定数化/型安全/禁止事項をどう満たすか）を明記
 - [ ] **反パターン明記**：「スタータのコピペのみ」等の思考停止パターンをNGとして明文化

### Rubric充足の判定基準
Rubric照合は `check:pre-common` による機械的最低限のチェックにも一部内包されているが、それは必要条件に過ぎない。真のRubric充足とは、LLMが context.md を参照して今後のコード生成に対して品質ゲート通過の責任を持てる状態である。

具体的には：
- **設定ファイルの理解が反映されている**：`qualities/**` の設定内容が正確に context.md に記述されている
- 問題点が「なぜ」重要かをLLMが理解できる
- 「どこで」「何を」チェックするかが明確（設定ファイルの具体的な値を含む）
- 「どうやって」守るかの具体的な実装指針がある

---

## 自己完結チェックリスト

### Why節
- [ ] 成果物品質への影響を3観点（型安全性・保守性・セキュリティ）で記述
- [ ] 手戻りコストを3観点（トークン・時間・認知負荷）で記述

### Where節
- [ ] `context.yaml` の `coverage` と整合
- [ ] glob パターンを具体例で示す

### What節
- [ ] コマンド↔設定↔範囲の対応表あり
- [ ] 閾値・禁止事項を具体的に明示（設定ファイルから直接読み取った値）
- [ ] ルールの根拠を記載
- [ ] `qualities/**` の設定内容が正確に反映されている
 - [ ] 出典（相対パス＋抜粋/値）を併記し、PRE-COMMON 実行時点の現行設定と一致
 - [ ] スタータ値の直接流用をしていない（導出と理由の1文を添える）

### How節
- [ ] 成功パターン（コード例付き）≥1
- [ ] 失敗パターン（コード例＋エラーメッセージ付き）≥1
- [ ] LLM典型NGパターン（具体例＋回避策付き）≥5
- [ ] 事前チェックリストあり
- [ ] 修正方針あり
 - [ ] Reasoning Hooks（生成前の自問チェック）を明記
 - [ ] 反パターン（スタータのコピペのみ等）をNGとして明記

---

## 自動生成プロセス（3回サイクル）
1. 初期生成 → Rubric照合  
2. 不足補完（NG/例補足）  
3. 最終レビュー → Rubric全充足  
※3回で満たせない場合のみ不足報告。

---

## context.md のテンプレート構造例

以下は、各品質ゲートの `context.md` が目指すべき構造の例：

```markdown
# [ゲート名] Quality Context

## Why（なぜこの品質ゲートが必要か）

### 品質ゲート未考慮時の問題点

#### 成果物品質への影響
- **型安全性**：[具体的な問題例]
- **保守性**：[具体的な問題例]
- **セキュリティ**：[具体的な問題例]

#### 品質ゲートでの手戻りコスト
- **トークン消費**：[修正サイクルの回数・規模]
- **時間損失**：[エラー解析・修正に要する時間]
- **認知負荷**：[デバッグ・根本原因特定の複雑さ]

## Where（どこに適用されるか）

- 監視範囲：`[glob pattern]`
- 除外範囲：`[glob pattern]`

## What（何をチェックするか）

| コマンド | 設定ファイル | 監視範囲 | 閾値/禁止事項 |
|---------|------------|---------|---------------|
| [command] | [config] | [glob] | [threshold] |

### 主要ルールと根拠
1. **[ルール名]**：[根拠]
2. **[ルール名]**：[根拠]

## How（どうやって守るか）

### 成功パターン
\```typescript
// 良い例
[code]
\```

### 失敗パターン
\```typescript
// 悪い例
[code]
\```
エラーメッセージ：`[error]`

### LLM典型NGパターン（最低5件）
1. **[パターン名]**
   - 問題：[description]
   - 回避策：[solution]
   
2. **[パターン名]**
   ...

### 事前チェックリスト（コード生成前）
- [ ] [項目1]
- [ ] [項目2]

### 修正方針（違反発見時）
1. [ステップ1]
2. [ステップ2]
```

---

## よくある落とし穴と回避策
- ESLint: JSDoc必須, complexity≤10, max-lines-per-function≤80, no-default-export 等
  - **warning も error 扱い**: `--max-warnings=0` により warning も許容しない
- TS: `import type`, `no any`, `strict` 前提  
- Policy: 禁止語（case-insensitive, コード+コメント）  
- 実行は `npm run check`  
- coverage mirror 一致必須。

### TypeScript 系ユニット構成メモ（types = canonical）

- TypeScript 型検査ゲート（`npm run -s typecheck` とその coverage）は `types` ユニット（`unit_path: /qualities/types/`）が canonical とする。
- `tsconfig` ユニット（`unit_path: /qualities/tsconfig/`）は、`qualities/tsconfig/tsconfig.json` の設定変更が PRE-COMMON の再実行と `types` ユニット context 更新を要求するかどうかを記述する補助的コンテキストとし、型検査 gate 定義（commands/configs/coverage）は持たない。
- PRE-COMMON の詳細レポート作成時に TypeScript 系の gate/coverage を把握したい場合は、まず `vibecoding/var/contexts/qualities/types/context.{yaml,md}` を参照し、必要に応じて tsconfig 側のメタ情報（再実行トリガー）を確認する。

### 実務的チェックリスト（実装前に読む）
- [ ] `vibecoding/var/contexts/qualities/**/context.md` の How 節に「定数化/分割/型付け/禁止事項」のスタータが載っているか
- [ ] 実装で数値を直書きしていないか（必ず `constants.ts` へ）
- [ ] 1関数が長くなっていないか（分割し、役割を明確化）
- [ ] `as unknown as` を使っていないか（代替の型付けで表現）
- [ ] 抑止コメント（eslint-disable 等）を増やしていないか

---

## コマンドと終了コード
| 状況 | 出力 | 終了コード |
|------|------|-------------|
| 更新なし | `<start_at> <hash>` | 0 |
| 更新あり | SRC=>DEST | 2 |
| 致命エラー | エラー詳細 | 1 |

---

## コマンドロール定義とマッピング（PRE-COMMON）

PRE-COMMON の実行は非対話・ウォッチ無効で行う。許可されるコマンドのマッピングは以下の通り。

- PRE-COMMON:
  - `npm run --silent check:pre-common`
  - `npm run check:pre-common --silent`

備考:
- プロジェクトが Node/NPM 以外の場合は、同ロールに相当するコマンドをプロジェクト標準に合わせて再定義すること。
  - 例: `make pre-common`, `just pre-common`, など。

## エージェント指示

### 基本フロー
- exit=0 → SnD記録→次工程  
- exit=2 → 詳細レポート作成→再実行→exit=0確認  
- exit=1 → 停止・報告  
※自動コミット禁止。

### 詳細レポート作成時の必須手順
exit=2 の場合、以下を順に実施：

0. **作成モード判定**
   - 対象ユニットの `vibecoding/var/contexts/qualities/**/context.md` を確認
   - 存在しないor <10行 → **初回作成モード**（上限100行厳守）
   - ≥60行存在 → **更新モード**（上限なし、追記・改善）
   - この判定結果を内部で保持し、以降のステップで適用

1. **品質ゲート設定の網羅的読み込み**
   - 対象ユニットの `qualities/**` 配下のすべての設定ファイルを読み込む
   - 各ルールの意図・閾値・禁止事項を理解する
   - この理解が context.md の主要な情報源となる

2. **診断出力の参照**（補助）
   - `pre-common-diagnostics.md` から具体的なNG例を抽出
   - Calibration Kata の結果を How節に反映

3. **context.yaml/md 生成**
   - **初回作成モード**の場合：
     - 60-100行の範囲で生成
     - コード例は各8-12行、NGパターン5項目（各2-3行）
     - 簡潔性を優先、核心を押さえる
   - **更新モード**の場合：
     - 既存内容を読み込み、不足部分を追記
     - 実践から得られた知見（追加NGパターン、エッジケース）を反映
     - 行数上限なし（ただし冗長性は排除）
   - Rubric充足まで内部反復（最大3サイクル）

4. **Rubric検証**
   - `npx -y tsx vibecoding/scripts/qualities/context-md-rubric.ts` を実行
   - **初回作成モード**：下限60行＋上限100行の両方を自己チェック
   - **更新モード**：下限60行のみチェック（上限は自己判断）
   - exit code が 0 であることを確認（スクリプトは下限のみ検証）

5. **再実行確認**
   - `npm run -s check:pre-common` → exit=0 を確認

---

## Definition of Done

### 必須成果物
- [ ] `last_updated` 最新化
- [ ] 各ユニット `context.yaml` 完備（スキーマ準拠）
- [ ] 各ユニット `context.md` 完備（Rubric満足）

### context.md のRubric充足
- [ ] **設定ファイル読み込み完了**：対象ユニットの `qualities/**` 配下の全設定ファイルを読み込み済み
- [ ] **Why節**：問題点・成果物品質影響・手戻りコスト記述
- [ ] **Where節**：適用範囲・glob パターン記述
- [ ] **What節**：コマンド/設定/範囲対応表・閾値（設定ファイルの値）・根拠記述
- [ ] **How節**：成功/失敗例・NGパターン≥5・チェックリスト・修正方針記述

### context.md 要約時の優先度（圧縮ポリシー）
- [ ] 長文化した context.md を要約・圧縮する際も、以下の優先度に従い上位の情報を省略しない：
  1. **設計レベルでの大規模リファクタリングを防ぐ事項**  
     - モジュール分割方針、責務境界、データ構造や不変条件など、後からの変更コストが特に高い前提。
     - ここに属するルールは、具体的な閾値・パターン・出典（相対パス＋抜粋/値）まで含めて保持する。
  2. **初期実装時の見落としが、大量の品質ゲートエラーを誘発する事項**  
     - no-magic-numbers、complexity 制約、型の方針（no any / import type）、禁止語ポリシーなど、1回の判断ミスが多数のファイルに波及するルール。
     - これらも閾値・典型NGパターン・エラーメッセージ例・出典を含めて維持し、短文化しても情報密度を落とさない。
  3. **その他の補助的・背景的な情報**  
     - 歴史的背景や補足的な説明、運用上の小ネタなど、1・2の理解を補強するが、欠落しても直ちにゲート違反や大規模リファクタリングには直結しない情報。
     - トークン圧縮時は原則として 3 から削減し、1・2 を構成する中核情報（閾値・パターン・出典・NG例/成功例）は「圧縮禁止領域」として扱う。

### 品質ゲート通過
- [ ] `npm run -s check:pre-common` → exit=0
- [ ] SnD記録完了（`quality_refresh_hash_*` に `<start_at> <hash>` 記録）  
- [ ] 各ユニットの hash manifest（`vibecoding/var/contexts/qualities/<unit>/manifest.yaml`）および unitDigest が、PRE-COMMON 実行時点の `qualities/**` の内容に基づき最新化されている  

---

## Calibration Kata フィードバック例

以下は、exit=2 時の diagnostics を context.md へ反映する例：

```md
## Calibration Kata フィードバック
- 実施: src/kata/sieve.ts
- ゲート結果:
  - policy ❌ (禁止語等検出)
  - typecheck ❌ (型エラー)
  - lint ❌ (34 errors)
  - test ✅
  
### 発見された問題と影響

#### 成果物品質への影響
- **型安全性**：`any` 型の多用により実行時エラーのリスク
- **保守性**：complexity=24（閾値10超過）により可読性低下
- **セキュリティ**：型検証回避により予期しない入力を受理

#### 手戻りコスト
- **トークン消費**：34箇所のlintエラー修正で約5000トークン
- **時間損失**：エラー解析・修正に約15分
- **認知負荷**：複雑度高により根本原因特定が困難

### NGパターンの追記（How節へ）
1. **magic numbers 未定義**：直接数値を使用（100, 42, 17等）
2. **default export**：named export を使用すべき
3. **型import漏れ**：`import type` を使用すべき
4. **複雑度>10**：関数分割が必要
5. **JSDoc欠如**：すべての関数に必須
6. **any型の多用**：具体的な型を定義すべき
7. **禁止語使用**：fallback, best-effort, TODO等
```

---

## Context Review Handling（レビュー検出時の自動統合・ブロック）

- トリガー: `vibecoding/var/contexts/qualities/**/context-review.md` が1つでも存在する
- 動作（自動・非対話・必須）:
  1) 対象レビューの“兄弟”`context.md` を更新（統合先は必ず同ディレクトリ）
     - Where/What: 現行の `qualities/**` に基づく同定・引用（相対パス＋抜粋/値を明記）
     - How: OK/NGの最小例、LLM典型NG（≥5）、事前チェック、修正方針を補強
     - 既存構成（Why/Where/What/How/Rubric）に統合し、重複は整理する（canonical を維持）
  2) ルーブリック検証: `npx -y tsx vibecoding/scripts/qualities/context-md-rubric.ts` を通す（exit=0まで）
  3) `context-review.md` を削除（当該ユニットのみ）
  4) `npm run -s check:pre-common` を再実行し、`<StartAt> <hash>`（exit=0）を取得するまでループ
- 禁止: レビュー本文の貼り付け（incorporate 節の作成）、緩和（eslint-disable 等）、例外運用の追加
- 確認依頼の禁止: 本手順の実施可否を人へ確認する行為（チャット等での可否問い合わせ）は禁止。検出時は即時に自動統合し、確認待ちは行わない。
- 優先度: 本節は SnD 作成や IMPL 着手より常に優先される（本節が未完了の間は後工程へ進まない）
- 参考（ポリシー宣言）: `.cursorrules → quality-context-review.mode: auto-integrate-block`

---

**本プレイブックは品質ゲートの前提をコード・設計・生成のすべてで同期させ、TS設定変更にも追従する動的品質基盤である。**
