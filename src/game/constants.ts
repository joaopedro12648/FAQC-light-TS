/**
 * @file ゲーム定数（マジックナンバー集約）
 * 備考: ブロック崩しゲームで使用する物理定数、レイアウト定数、速度定数を集約
 * - マジックナンバー禁止ルール（no-magic-numbers）に適合するため、すべての数値リテラルを命名付き定数として定義
 * - 各定数には出典や根拠をコメントで明示し、設計意図を保持
 * - 型安全性を維持するため、すべての定数に明示的な型注釈を付与
 * - 複雑度を抑えるため、定数定義のみに特化し、ロジックを含まない
 * - 定数の変更は SnD の「具体仕様」節と整合させ、単一情報源を維持
 * - テストでは定数を import して期待値と照合し、ハードコード値との乖離を防ぐ
 * - 境界値（画面サイズ、ブロック配置、速度範囲）は受入条件から導出
 * - 将来の拡張（ステージ複数化、難易度調整）に備え、定数を階層化・グループ化
 * @see vibecoding/var/contexts/qualities/core/context.md
 * @see vibecoding/var/contexts/qualities/docs/context.md
 * @snd vibecoding/var/SPEC-and-DESIGN/202511/20251114/SnD-20251114-breakout-classic.md
 */

/** 画面幅（px）出典: SnD 具体仕様「画面/スケーリング」 */
export const CANVAS_WIDTH: number = 640;
/** 画面高さ（px）出典: SnD 具体仕様「画面/スケーリング」 */
export const CANVAS_HEIGHT: number = 800;

/** ブロックグリッド列数　出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_COLS: number = 16;
/** ブロックグリッド行数　出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_ROWS: number = 10;
/** ブロック幅（px）出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_WIDTH: number = 40;
/** ブロック高さ（px）出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_HEIGHT: number = 20;
/** 上マージン（px）ブロック2個分　出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_MARGIN_TOP: number = 40;
/** 左マージン（px）壁と隙間なし　出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_MARGIN_LEFT: number = 0;
/** 右マージン（px）壁と隙間なし　出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const BLOCK_MARGIN_RIGHT: number = 0;

/** ブロック配置密度（0〜1）出典: SnD 具体仕様「ブロックグリッド/マージン」充填密度 */
export const BLOCK_DENSITY: number = 0.8;
/** 増殖ブロック比率（0〜1）出典: SnD 具体仕様「ブロックグリッド/マージン」増殖ブロック比率 */
export const MULTIPLY_BLOCK_RATIO: number = 0.3;

/** パドル幅（px）出典: SnD 設計構想「Clean 3層」IO.Adapter 層の責務 */
export const PADDLE_WIDTH: number = 80;
/** パドル高さ（px）出典: SnD 設計構想「Clean 3層」IO.Adapter 層の責務 */
export const PADDLE_HEIGHT: number = 12;
/** パドルの画面下端からのオフセット（px）出典: SnD 設計構想 */
export const PADDLE_Y_OFFSET: number = 60;
/** パドル移動速度（px/s）出典: SnD 設計構想 */
export const PADDLE_SPEED: number = 480;

/** ボール半径（px）出典: SnD 設計構想「衝突は AABB と円」 */
export const BALL_RADIUS: number = 6;
/** ボール初期速度（px/s）出典: SnD 具体仕様「角度/速度」初期ボール速度 */
export const BALL_INITIAL_SPEED: number = 320;
/** ボール初期発射角（度）真上　出典: SnD 具体仕様「角度/速度」初期発射角=真上（-90°） */
export const BALL_INITIAL_ANGLE_DEG: number = -90;
/** ボール角度制約・水平からの最小角度（度）出典: SnD 具体仕様「角度/速度」角度クランプ */
export const BALL_MIN_ANGLE_FROM_HORIZONTAL_DEG: number = 20;
/** ボール角度制約・水平からの最大角度（度）出典: SnD 具体仕様「角度/速度」角度クランプ */
export const BALL_MAX_ANGLE_FROM_HORIZONTAL_DEG: number = 160;
/** 増殖ボールの角度差分最小値（度）出典: SnD 具体仕様「増殖ブロック挙動」新ボール角度 */
export const BALL_MULTIPLY_ANGLE_MIN_DIFF_DEG: number = 5;
/** 増殖ボールの角度差分最大値（度）出典: SnD 具体仕様「増殖ブロック挙動」新ボール角度 */
export const BALL_MULTIPLY_ANGLE_MAX_DIFF_DEG: number = 30;

/** 速度アップ係数　出典: SnD 具体仕様「角度/速度」Clear後の再開時に×1.12 */
export const BALL_SPEED_UP_FACTOR: number = 1.12;
/** ボール速度上限（px/s）出典: SnD 具体仕様「角度/速度」上限=900 px/s */
export const BALL_SPEED_MAX: number = 900;
/** ボール数上限　出典: SnD 公開インタフェース maxBalls 既定=64 */
export const MAX_BALLS: number = 64;

/** 初期残機数　出典: SnD 公開インタフェース initialLives 既定=2 */
export const INITIAL_LIVES: number = 2;

/** ミリ秒からタイムステップへの変換係数 */
const MS_PER_SECOND: number = 1000;
/** 物理タイムステップのターゲットFPS */
const FIXED_DT_FPS: number = 120;
/** 物理タイムステップ（ms）固定1/120秒　出典: SnD 設計構想「物理時間は固定タイムステップ」 */
export const FIXED_DT_MS: number = MS_PER_SECOND / FIXED_DT_FPS;
/** 物理タイムステップの最大累積時間（ms）過大 dt のクランプ用　出典: SnD 設計構想 */
export const MAX_ACCUMULATED_DT_MS: number = 250;

/** 度からラジアンへの変換係数 */
const DEG_DIVISOR: number = 180;
/** 度からラジアン変換係数　出典: SnD 用語/境界「角度表現: ラジアン（内部）」 */
export const DEG_TO_RAD: number = Math.PI / DEG_DIVISOR;
/** ラジアンから度への変換係数　出典: SnD 用語/境界「角度表現: ラジアン（内部）」 */
export const RAD_TO_DEG: number = DEG_DIVISOR / Math.PI;

/** パドル反射時のヒット位置による最大角度補正（度）出典: SnD 具体仕様「角度/速度」±30° */
export const PADDLE_HIT_OFFSET_MAX_ANGLE_DEG: number = 30;
/** パドル反射時の速度による最大角度補正（度）出典: SnD 具体仕様「角度/速度」±10° */
export const PADDLE_VELOCITY_MAX_ANGLE_DEG: number = 10;

/** 音声デフォルトボリューム（0〜1）出典: SnD 公開インタフェース audio.volume 既定=0.5 */
export const AUDIO_DEFAULT_VOLUME: number = 0.5;

/** エンディング演出時間（ms）出典: SnD 具体仕様「状態遷移/演出」3秒 */
export const ENDING_DURATION_MS: number = 3000;
/** ゲームオーバー演出時間（ms）出典: SnD 具体仕様「状態遷移/演出」3秒 */
export const GAMEOVER_DURATION_MS: number = 3000;

/** 増殖ブロック配置重み・上段（最上行）出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const MULTIPLY_BLOCK_WEIGHT_TOP: number = 1.5;
/** 増殖ブロック配置重み・下段（最下行）出典: SnD 具体仕様「ブロックグリッド/マージン」 */
export const MULTIPLY_BLOCK_WEIGHT_BOTTOM: number = 0.6;

/** 効果音周波数・反射音（Hz）出典: SnD 具体仕様「音声」 */
export const SFX_BOUNCE_FREQ: number = 440;
/** 効果音周波数・破壊音（Hz）出典: SnD 具体仕様「音声」 */
export const SFX_BREAK_FREQ: number = 523;
/** 効果音周波数・増殖音（Hz）出典: SnD 具体仕様「音声」 */
export const SFX_MULTIPLY_FREQ: number = 659;
/** 効果音周波数・クリア音（Hz）出典: SnD 具体仕様「音声」 */
export const SFX_CLEAR_FREQ: number = 784;
/** 効果音周波数・ゲームオーバー音（Hz）出典: SnD 具体仕様「音声」 */
export const SFX_GAMEOVER_FREQ: number = 196;

/** 効果音長さ・反射音（秒）出典: SnD 具体仕様「音声」 */
export const SFX_BOUNCE_DURATION: number = 0.05;
/** 効果音長さ・破壊音（秒）出典: SnD 具体仕様「音声」 */
export const SFX_BREAK_DURATION: number = 0.1;
/** 効果音長さ・増殖音（秒）出典: SnD 具体仕様「音声」 */
export const SFX_MULTIPLY_DURATION: number = 0.15;
/** 効果音長さ・クリア音（秒）出典: SnD 具体仕様「音声」 */
export const SFX_CLEAR_DURATION: number = 0.3;
/** 効果音長さ・ゲームオーバー音（秒）出典: SnD 具体仕様「音声」 */
export const SFX_GAMEOVER_DURATION: number = 0.5;

/** 音声フェードアウト下限（0より大きい値）出典: Web Audio API 仕様 */
export const AUDIO_FADE_OUT_FLOOR: number = 0.01;

/** 増殖ボール角度決定時のランダム符号決定閾値（0.5で50%ずつ）出典: SnD 具体仕様「増殖ブロック」 */
export const MULTIPLY_ANGLE_SIGN_THRESHOLD: number = 0.5;

