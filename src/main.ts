import "./UI/styles.css";
import type { PlacementAI, PlacementAICandidate } from "./ai/PlacementAI";
import { SafeAI } from "./ai/SafeAI";
import { CharacterEventManager, type CharacterEventType } from "./Character/CharacterEventManager";
import { Inventory, MAX_INVENTORY } from "./Game/Inventory";
import { TetrisEngine, type TetrisSnapshot } from "./Game/TetrisEngine";
import { TETROMINO_ORDER, type TetrominoType } from "./Game/Tetromino";
import { SaveManager, type StageResultRecord } from "./save/SaveManager";
import type { SaveData, TrainingRank } from "./save/SaveData";
import asutonUrl from "../asuton.png";
import mintonUrl from "../minton.png";
import mistonUrl from "../miston.png";

const app = document.querySelector<HTMLDivElement>("#app");
const engine = new TetrisEngine();
const inventory = new Inventory();
const placementAI: PlacementAI = new SafeAI();
const saveManager = new SaveManager();
const blockTypes = TETROMINO_ORDER;
const developmentControlsEnabled = false;
const SHIPPING_DISPLAY_MS = 500;
const RECEIVED_DISPLAY_MS = 500;
const THINKING_DISPLAY_MS = 450;
const MOVE_ROTATE_ANIMATION_MS = 260;
const DROP_ANIMATION_MS = 300;
const FIXED_DISPLAY_MS = 300;
const MANAGEMENT_FEEDBACK_DISPLAY_MS = 2000;
const COUNTDOWN_STEP_MS = 620;
const START_DISPLAY_MS = 780;
const MANAGEMENT_MAX_EFFECT_MS = 1800;
const MANAGEMENT_SPEND_EFFECT_MS = 1200;
const STAGE_CLEAR_EFFECT_MS = 2200;
const LAST_SPURT_EFFECT_MS = 1900;
const REPLENISH_NOTICE_MS = 2000;
const WORLD_RANKER_TURN_GAP_MS = 90;
const TARGET_SCORE = 1000;
const LAST_SPURT_REMAINING_SCORE = 100;
const INITIAL_MANAGEMENT_POWER = 100;
const MANAGEMENT_MILESTONE_POWER = 100;
const MIN_MANAGEMENT_POWER = -100;
const TIMEOUT_MANAGEMENT_PENALTY = -20;
const MANAGEMENT_SKILL_COSTS = {
  aiHint: 30,
  emergencyReplenish: 20,
  inventoryAnalysis: 10
} as const;
const AI_HINT_UNLOCK_THRESHOLDS = [30, 60, 90] as const;
const DESIRED_PIECE_BONUS = 5;
const SECOND_DESIRED_PIECE_BONUS = 2;
const WORST_CHOICE_PENALTY = -10;
const BALANCE_SUPPLY_BONUS = 10;
const AI_SCORE_ADJUSTMENTS: Record<ManagementFeedbackKind, number> = {
  best: 20,
  second: 10,
  neutral: 0,
  worst: -10
};

type StageId = "training0" | "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "stage6" | "stage7";
type StageConfig = {
  id: StageId;
  title: string;
  shortTitle: string;
  isTraining: boolean;
  replenishmentInterval: number;
  decisionTimeMs: number;
  hintLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  requiredManagementPower: number | null;
};

const STAGE_CONFIGS: StageConfig[] = [
  {
    id: "training0",
    title: "新人管理人研修①",
    shortTitle: "研修",
    isTraining: true,
    replenishmentInterval: 7,
    decisionTimeMs: 14000,
    hintLevel: 7,
    requiredManagementPower: null
  },
  { id: "stage1", title: "本ステージ Stage1", shortTitle: "Stage1", isTraining: false, replenishmentInterval: 7, decisionTimeMs: 10000, hintLevel: 7, requiredManagementPower: 20 },
  { id: "stage2", title: "本ステージ Stage2", shortTitle: "Stage2", isTraining: false, replenishmentInterval: 6, decisionTimeMs: 8500, hintLevel: 6, requiredManagementPower: 30 },
  { id: "stage3", title: "本ステージ Stage3", shortTitle: "Stage3", isTraining: false, replenishmentInterval: 5, decisionTimeMs: 7000, hintLevel: 5, requiredManagementPower: 40 },
  { id: "stage4", title: "本ステージ Stage4", shortTitle: "Stage4", isTraining: false, replenishmentInterval: 4, decisionTimeMs: 5500, hintLevel: 4, requiredManagementPower: 50 },
  { id: "stage5", title: "本ステージ Stage5", shortTitle: "Stage5", isTraining: false, replenishmentInterval: 3, decisionTimeMs: 4200, hintLevel: 3, requiredManagementPower: 60 },
  { id: "stage6", title: "本ステージ Stage6", shortTitle: "Stage6", isTraining: false, replenishmentInterval: 2, decisionTimeMs: 3200, hintLevel: 2, requiredManagementPower: 70 },
  { id: "stage7", title: "本ステージ Stage7", shortTitle: "Stage7", isTraining: false, replenishmentInterval: 1, decisionTimeMs: 2200, hintLevel: 1, requiredManagementPower: 80 }
];
const STAGES_BY_ID = new Map(STAGE_CONFIGS.map((stage) => [stage.id, stage]));
const DEFAULT_STAGE_ID: StageId = "training0";

type SupplyPhase = "idle" | "shipping" | "received" | "placement" | "fixed" | "paused" | "gameover";
type GameState = "title" | "countdown" | "playing" | "paused" | "gameover" | "stageclear";
type ReturnToTitleSource =
  | "exit-confirm"
  | "pause-menu"
  | "gameover-panel"
  | "stageclear-panel"
  | "title-screen";
type ManagementFeedbackKind = "best" | "second" | "worst" | "neutral";
type ManagementFeedback = {
  kind: ManagementFeedbackKind;
  mark: string;
  title: string;
  message: string;
  delta: number;
};
type TurnEvaluation = "Perfect" | "Good" | "Neutral" | "Miss";
type TrainingReportEntry = {
  desiredPiece: TetrominoType | null;
  secondChoicePiece: TetrominoType | null;
  worstChoicePiece: TetrominoType | null;
  suppliedPiece: TetrominoType;
  evaluation: TurnEvaluation;
  managementDelta: number;
};
type TrainingReportSummary = {
  total: number;
  perfect: number;
  good: number;
  neutral: number;
  miss: number;
  matchRate: number;
  rank: "S" | "A" | "B" | "C" | "D";
  comment: string;
};
type DesiredPieceSnapshot = {
  first: TetrominoType | null;
  second: TetrominoType | null;
  worst: TetrominoType | null;
};
type ReplenishmentShipment = {
  id: "normal" | "i" | "balance" | "manual" | "timeout";
  name: string;
  items: Partial<Record<TetrominoType, number>>;
};
type ReplenishmentResult = {
  shipment: ReplenishmentShipment;
  appliedItems: Partial<Record<TetrominoType, number>>;
};
type UISound =
  | "button"
  | "replenish"
  | "powerUp"
  | "powerDown"
  | "clear"
  | "gameover"
  | "countdown"
  | "start"
  | "max"
  | "spend"
  | "lastSpurt"
  | "balance";

const REPLENISHMENT_SHIPMENTS: ReplenishmentShipment[] = [
  {
    id: "normal",
    name: "通常便",
    items: { I: 1, O: 1, T: 1, L: 1, J: 1, S: 1, Z: 1 }
  },
  {
    id: "i",
    name: "I便",
    items: { I: 3 }
  },
  {
    id: "balance",
    name: "バランス便",
    items: { L: 2, J: 2, S: 1, Z: 1 }
  }
];

let supplyPhase: SupplyPhase = "idle";
let supplyLocked = false;
let statusTimer: number | null = null;
let managementFeedbackTimer: number | null = null;
let replenishmentTimer: number | null = null;
let hintUnlockTimer: number | null = null;
let supplyDecisionTimer: number | null = null;
let continuousAITimer: number | null = null;
let replenishmentRequestTimer: number | null = null;
let flowToken = 0;
let continuousAIToken = 0;
let currentStageId: StageId = DEFAULT_STAGE_ID;
let managementPower = INITIAL_MANAGEMENT_POWER;
let pendingManagementJudgement: DesiredPieceSnapshot | null = null;
let isStageClear = false;
let isGameOver = false;
let isPaused = false;
let isExitConfirmOpen = false;
let isCountdownActive = false;
let gameState: GameState = "title";
let pausedPhaseBeforeMenu: SupplyPhase = "idle";
let activeFlowType: TetrominoType | null = null;
let activeFlowJudgement: DesiredPieceSnapshot | null = null;
let placementCount = 0;
let replenishmentShipmentIndex = 0;
let activeReplenishmentResult: ReplenishmentResult | null = null;
let isReplenishmentRequestActive = false;
let replenishmentRequestDeadline = 0;
let replenishmentCountdownTimer: number | null = null;
let suppliedBlockAwaitingUse: TetrominoType | null = null;
let supplyButtonOrder: TetrominoType[] = [...blockTypes];
let aiScoreAdjustment = 0;
let gameOverReason = "管理人を解任されました";
let trainingReportEntries: TrainingReportEntry[] = [];
let unlockedHintThresholds = new Set<number>();
let lastReplenishmentBubbleTurns: number | null = null;
let lastDangerBoardHeight = 0;
let hasShownManagementMax = false;
let hasShownLastSpurt = false;
let lastSuppliedType: TetrominoType | null = null;
let consecutiveSupplyCount = 0;
let balanceSupplyTypes = new Set<TetrominoType>();
let saveData: SaveData = saveManager.load();
let stageResultSaved = false;
let audioContext: AudioContext | null = null;
let effectTimers: number[] = [];
let lastSpurtBgm: { oscillator: OscillatorNode; gain: GainNode } | null = null;
let stageClearExecutionCount = 0;
let gameOverExecutionCount = 0;
let resetExecutionCount = 0;
let countdownStartCount = 0;
let rulesReturnTarget: "title" | "pause" = "title";

const getCurrentStage = () => STAGES_BY_ID.get(currentStageId) ?? STAGE_CONFIGS[0];

if (!app) {
  throw new Error("App root element was not found.");
}

const DEBUG_GAME_STATE = false;

const logDebug = (...args: unknown[]) => {
  if (DEBUG_GAME_STATE) {
    console.log(...args);
  }
};

const setGameState = (nextState: GameState, source: string) => {
  if (gameState === nextState) {
    logDebug("[GameState]", gameState, "→", nextState, "(unchanged)", "source:", source);
    return;
  }

  const previousState = gameState;
  gameState = nextState;
  logDebug("[GameState]", previousState, "→", nextState, "source:", source);
};

const canReturnToTitleFrom = (source: string): source is ReturnToTitleSource =>
  ["exit-confirm", "pause-menu", "gameover-panel", "stageclear-panel", "title-screen"].includes(source);

app.innerHTML = `
  <main class="app-shell" aria-label="テトリスの管理人 β版 盤面UI">
    <section class="title-screen" data-screen="title" aria-label="タイトル画面">
      <div class="title-bg" aria-hidden="true">
        <span class="title-grid-light title-grid-light-a"></span>
        <span class="title-grid-light title-grid-light-b"></span>
        <span class="title-particle title-particle-a"></span>
        <span class="title-particle title-particle-b"></span>
        <span class="title-particle title-particle-c"></span>
        <span class="title-tetromino title-tetromino-i">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-o">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-t">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-l">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-j">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-s">
          <span></span><span></span><span></span><span></span>
        </span>
        <span class="title-tetromino title-tetromino-z">
          <span></span><span></span><span></span><span></span>
        </span>
      </div>
      <div class="title-copy">
        <span class="title-kicker">Beta Ver1</span>
        <h1 class="game-title" aria-label="テトリスの管理人">
          <span class="game-title-tetris" aria-hidden="true">
            <span class="tetris-letter">テ</span>
            <span class="tetris-letter">ト</span>
            <span class="tetris-letter">リ</span>
            <span class="tetris-letter">ス</span>
          </span>
          <span class="game-title-no">の</span>
          <span class="game-title-manager">管理人</span>
        </h1>
        <p class="title-catch">
          テトリスを遊ぶゲームではない。<br>
          世界ランカーの<span>思考を支える</span>ゲームだ。
        </p>
      </div>
      <div class="title-character-lineup" aria-label="管理室キャラクター">
        <figure class="title-character title-character-asuton">
          <span class="title-character-glow"></span>
          <img class="title-character-image" src="${asutonUrl}" alt="アストン" decoding="async" data-character-name="アストン" />
          <figcaption>アストン</figcaption>
        </figure>
        <figure class="title-character title-character-minton">
          <span class="title-character-glow"></span>
          <img class="title-character-image" src="${mintonUrl}" alt="ミントン" decoding="async" data-character-name="ミントン" />
          <figcaption>ミントン</figcaption>
        </figure>
        <figure class="title-character title-character-miston">
          <span class="title-character-glow"></span>
          <img class="title-character-image" src="${mistonUrl}" alt="ミストン" decoding="async" data-character-name="ミストン" />
          <figcaption>ミストン</figcaption>
        </figure>
      </div>
      <div class="title-actions">
        <button class="title-action-button title-action-button-primary" type="button" data-action="open-rules">研修を始める</button>
        <button class="title-action-button title-action-button-secondary" type="button" data-action="open-stage">ステージ選択</button>
        <button class="title-action-button title-action-button-secondary" type="button" data-action="open-records">記録を見る</button>
      </div>
      <span class="safeai-standby">SafeAI　待機中…</span>
    </section>

    <section class="stage-screen" data-screen="stage" hidden aria-label="ステージ選択">
      <div class="screen-heading">
        <span class="title-kicker">研修一覧</span>
        <h2>研修一覧</h2>
      </div>
      <button class="stage-card stage-card-active" type="button" data-action="start-training">
        <span class="stage-card-title">新人管理人研修①</span>
        <span class="stage-card-row">担当AI：SafeAI</span>
        <span class="stage-card-row" data-stage-state>状態 未挑戦</span>
        <span class="stage-card-row" data-stage-best-rank>最高ランク --</span>
        <span class="stage-card-row" data-stage-best-rate>最高一致率 --%</span>
        <span class="stage-card-row" data-stage-best-power>最高管理力 --</span>
        <span class="stage-card-row" data-stage-play-count>プレイ回数 0</span>
        <span class="stage-card-row" data-stage-clear-count>クリア回数 0</span>
        <span class="stage-card-action">研修を始める</span>
      </button>
      ${STAGE_CONFIGS.filter((stage) => !stage.isTraining)
        .map(
          (stage) => `
            <button class="stage-card stage-card-main" type="button" data-action="start-stage" data-stage-id="${stage.id}">
              <span class="stage-card-title">${stage.shortTitle}</span>
              <span class="stage-card-row">担当AI：SafeAI</span>
              <span class="stage-card-row">補充間隔 ${stage.replenishmentInterval}</span>
              <span class="stage-card-row">判断時間 ${Math.round(stage.decisionTimeMs / 1000)}秒</span>
              <span class="stage-card-row">必要管理力 ${stage.requiredManagementPower ?? "制限なし"}</span>
              <span class="stage-card-action">本ステージ開始</span>
            </button>
          `
        )
        .join("")}
      <button class="title-action-button title-action-button-secondary" type="button" data-action="back-title">タイトルへ戻る</button>
    </section>

    <section class="rules-screen" data-screen="rules" hidden aria-label="ルールブック">
      <div class="screen-heading rules-heading">
        <span class="title-kicker">MANAGER FIELD GUIDE</span>
        <h2>ルールブック</h2>
        <p>世界ランカーを支える管理人の仕事</p>
      </div>
      <div class="rules-hero">
        <div class="rules-hero-copy">
          <span class="rules-hero-label">あなたの役割</span>
          <strong>ブロックを供給して、<br />最高のプレイ環境を整える</strong>
          <span>世界ランカーは、あなたを待たずにプレイを続けます。</span>
        </div>
        <img class="rules-hero-character" src="${mistonUrl}" alt="" decoding="async" />
      </div>
      <div class="rules-flow" aria-label="ゲームの流れ">
        <article class="rules-card">
          <span class="rules-card-number">01</span>
          <span class="rules-piece-icon rules-piece-icon-i" aria-hidden="true">
            <i data-block="I"></i><i data-block="I"></i><i data-block="I"></i><i data-block="I"></i>
          </span>
          <h3>盤面を観察</h3>
          <p>AIは自動でブロックを配置し、ラインを消去します。</p>
        </article>
        <article class="rules-card">
          <span class="rules-card-number">02</span>
          <span class="rules-piece-icon rules-piece-icon-t" aria-hidden="true">
            <i data-block="T"></i><i data-block="T"></i><i data-block="T"></i><i data-block="T"></i>
          </span>
          <h3>補給要求に対応</h3>
          <p>要求が出たら、制限時間内に必要なブロックを選びます。</p>
        </article>
        <article class="rules-card">
          <span class="rules-card-number">03</span>
          <span class="rules-piece-icon rules-piece-icon-o" aria-hidden="true">
            <i data-block="O"></i><i data-block="O"></i><i data-block="O"></i><i data-block="O"></i>
          </span>
          <h3>判断を積み重ねる</h3>
          <p>良い供給ほど管理力が上がり、ステージ達成へ近づきます。</p>
        </article>
      </div>
      <div class="rules-quick-grid">
        <article class="rules-quick-card">
          <span class="rules-quick-icon">⚡</span>
          <div><strong>補給要求中も停止しない</strong><span>AIはプレイを続けています。画面のカウントダウンを見て素早く供給。</span></div>
        </article>
        <article class="rules-quick-card">
          <span class="rules-quick-icon">◎</span>
          <div><strong>管理力は判断の評価</strong><span>◎ +5 / ○ +2 / △ ±0 / × -10。時間切れは -20 です。</span></div>
        </article>
        <article class="rules-quick-card">
          <span class="rules-quick-icon">🚚</span>
          <div><strong>在庫切れでもゲームは継続</strong><span>緊急ランダム補給が行われます。管理力 -20 でプレイは止まりません。</span></div>
        </article>
      </div>
      <div class="rules-piece-strip" aria-label="7種類のブロック">
        ${blockTypes.map((type) => `<span class="rules-piece-chip" data-block="${type}">${type}</span>`).join("")}
      </div>
      <div class="rules-actions">
        <button class="title-action-button title-action-button-primary" type="button" data-action="rules-stage">ステージを選ぶ</button>
        <button class="title-action-button title-action-button-secondary" type="button" data-action="back-rules">戻る</button>
      </div>
    </section>

    <section class="records-screen" data-screen="records" hidden aria-label="記録画面">
      <div class="screen-heading">
        <span class="title-kicker">管理記録</span>
        <h2>記録を見る</h2>
      </div>
      <div class="records-panel" data-records-panel></div>
      <button class="title-action-button title-action-button-secondary" type="button" data-action="reset-save">セーブデータを初期化</button>
      <button class="title-action-button title-action-button-secondary" type="button" data-action="back-title">タイトルへ戻る</button>
    </section>

    <section class="game-panel" data-screen="game" hidden aria-label="ゲーム画面">
      <header class="status-grid" aria-label="ステータス">
        <div class="status-item">
          <span class="status-label">ステージ</span>
          <span class="status-value" data-stage-title>新人管理人研修①</span>
        </div>
        <div class="status-item">
          <span class="status-label">スコア</span>
          <span class="status-value" data-score>0</span>
        </div>
        <div class="status-item">
          <span class="status-label">目標</span>
          <span class="status-value" data-target-score>${TARGET_SCORE}</span>
        </div>
        <div class="status-item">
          <span class="status-label">管理力</span>
          <span class="status-value" data-management-power>100</span>
        </div>
        <div class="game-top-actions" aria-label="ゲーム操作">
          <button class="game-icon-button" type="button" data-action="pause-game" aria-label="一時停止">⏸</button>
          <button class="game-exit-button" type="button" data-action="open-exit-confirm" aria-label="終了">🚪</button>
        </div>
      </header>

      <aside class="dev-status" aria-label="開発確認ステータス">
        <span class="supply-status-title" data-status-kind="idle">📦 供給待ち</span>
        <span class="supply-status-message">ブロックを選択してください</span>
        <span class="communication-status">待機中</span>
        <span class="stage-progress" data-stage-progress>あと${TARGET_SCORE}点でクリア</span>
        <span class="ai-hint-panel" data-ai-hint-panel>
          <span class="ai-hint-label">AIヒント</span>
          <span class="ai-hint-message" data-ai-hint-message>？？？</span>
          <span class="ai-hint-next" data-ai-hint-next>管理力30で解放 / あと30で解放</span>
          <span class="ai-hint-unlock" data-ai-hint-unlock hidden>ヒント解放！</span>
        </span>
        <span class="management-feedback" data-management-feedback hidden>
          <span class="management-feedback-mark" data-management-feedback-mark></span>
          <span class="management-feedback-text">
            <span class="management-feedback-title" data-management-feedback-title></span>
            <span class="management-feedback-message" data-management-feedback-message></span>
          </span>
        </span>
        <span class="operator-bubble" data-operator-bubble hidden></span>
        <span class="operator-crew" aria-label="管理室クルー">
          <span class="operator-agent operator-agent-miston" aria-label="ミストン">
            <span class="character-bubble" data-character-bubble="miston" hidden></span>
            <img class="operator-image" src="${mistonUrl}" alt="" decoding="async" />
          </span>
          <span class="operator-agent operator-agent-minton" aria-label="ミントン">
            <span class="character-bubble" data-character-bubble="minton" hidden></span>
            <img class="operator-image" src="${mintonUrl}" alt="" decoding="async" />
          </span>
          <span class="operator-agent operator-agent-aston" aria-label="アストン">
            <span class="character-bubble" data-character-bubble="asuton" hidden></span>
            <img class="operator-image" src="${asutonUrl}" alt="" decoding="async" />
          </span>
        </span>
        <span class="game-over-text" hidden>GAME OVER</span>
      </aside>

      <section class="board-wrap" aria-label="10×20盤面">
        <div class="board-grid" role="grid" aria-label="10列20行の盤面">
          ${Array.from({ length: 200 }, (_, index) => {
            const row = Math.floor(index / 10) + 1;
            const column = (index % 10) + 1;
            return `<span class="board-cell" role="gridcell" aria-label="${row}行${column}列"></span>`;
          }).join("")}
        </div>
        <div class="countdown-overlay" data-countdown-overlay hidden></div>
        <div class="replenishment-countdown" data-replenishment-countdown hidden aria-live="polite"></div>
        <div class="management-max-effect" data-management-max-effect hidden>
          <span class="management-max-label">管理力 100突破！</span>
          <span class="effect-particles" aria-hidden="true">
            ${Array.from({ length: 12 }, (_, index) => `<span style="--particle-index:${index};"></span>`).join("")}
          </span>
        </div>
        <div class="management-spend-effect" data-management-spend-effect hidden>
          <span class="management-spend-label" data-management-spend-label>-30</span>
        </div>
        <div class="stage-clear-effect" data-stage-clear-effect hidden>
          <span class="stage-clear-effect-title">STAGE CLEAR!!</span>
          <span class="stage-clear-confetti" aria-hidden="true">
            ${Array.from({ length: 18 }, (_, index) => `<span style="--confetti-index:${index};"></span>`).join("")}
          </span>
        </div>
        <div class="last-spurt-effect" data-last-spurt-effect hidden>あと100点！</div>
        <div class="balance-bonus-effect" data-balance-bonus-effect hidden>
          <span>バランス供給ボーナス！</span>
          <span class="stage-clear-confetti" aria-hidden="true">
            ${Array.from({ length: 14 }, (_, index) => `<span style="--confetti-index:${index};"></span>`).join("")}
          </span>
        </div>
        <section class="clear-panel" data-clear-panel hidden aria-label="ステージクリア">
          <span class="clear-panel-subtitle">ステージリザルト</span>
          <span class="report-rank" data-report-rank>ランク D</span>
          <span class="report-rate" data-report-rate>結果 CLEAR</span>
          <span class="clear-panel-result report-management" data-final-management-power>管理力 0</span>
          <span class="clear-panel-result" data-required-management>必要管理力 制限なし</span>
          <div class="report-grid" aria-label="研修評価集計">
            <span class="report-item" data-report-perfect>Perfect（第1候補） 0</span>
            <span class="report-item" data-report-good>Good（第2候補） 0</span>
            <span class="report-item" data-report-neutral>Neutral（対応可能） 0</span>
            <span class="report-item" data-report-miss>Miss（最下位） 0</span>
          </div>
          <span class="clear-panel-result" data-final-score>最終スコア 0</span>
          <span class="clear-panel-result" data-report-total>総供給回数 0</span>
          <div class="clear-action-buttons" aria-label="クリア後の操作">
            <button class="clear-restart-button" type="button">もう一度</button>
            <button class="clear-next-button" type="button">次へ</button>
          </div>
          <span class="safe-ai-comment" data-safe-ai-comment>管理人としての判断が、世界ランカーを支えました。</span>
        </section>
        <section class="game-over-panel" data-game-over-panel hidden aria-label="ゲームオーバー">
          <span class="game-over-panel-title">管理終了</span>
          <span class="game-over-panel-message" data-game-over-message>管理人を解任されました</span>
          <span class="game-over-panel-result" data-game-over-final-score>最終スコア 0</span>
          <span class="game-over-panel-result" data-game-over-final-management-power>最終管理力 0</span>
          <button class="game-over-restart-button" type="button">もう一度遊ぶ</button>
        </section>
        <section class="pause-panel" data-pause-panel hidden aria-label="一時停止メニュー">
          <span class="pause-panel-title">一時停止</span>
          <button class="pause-menu-button" type="button" data-action="open-rules-from-pause">📖 ルールブック</button>
          <button class="pause-menu-button" type="button" data-action="resume-game">▶ 再開</button>
          <button class="pause-menu-button" type="button" data-action="restart-from-pause">🔄 リスタート</button>
          <button class="pause-menu-button" type="button" data-action="title-from-pause">🏠 タイトルへ戻る</button>
        </section>
        <section class="exit-confirm-panel" data-exit-confirm-panel hidden aria-label="終了確認">
          <span class="exit-confirm-title">ゲームを終了しますか？</span>
          <span class="exit-confirm-message">現在のスコアを保存してタイトルへ戻ります。</span>
          <div class="exit-confirm-actions">
            <button class="exit-confirm-button exit-confirm-button-primary" type="button" data-action="confirm-exit">はい</button>
            <button class="exit-confirm-button" type="button" data-action="cancel-exit">いいえ</button>
          </div>
        </section>
      </section>

      <footer class="supply-area" aria-label="供給管理">
        <span class="replenishment-status" data-replenishment-status>
          <span class="replenishment-label" data-replenishment-label>🚚 補充</span>
          <span class="replenishment-main" data-replenishment-main>あと${STAGE_CONFIGS[0].replenishmentInterval}手</span>
          <span class="replenishment-detail" data-replenishment-detail></span>
        </span>
        <div class="management-skill-panel" aria-label="管理力支援">
          <button class="management-skill-button" type="button" data-management-skill="aiHint">
            AIヒント <span>30</span>
          </button>
          <button class="management-skill-button" type="button" data-management-skill="emergencyReplenish">
            緊急補充 <span>20</span>
          </button>
          <button class="management-skill-button" type="button" data-management-skill="inventoryAnalysis">
            在庫分析 <span>10</span>
          </button>
        </div>
        <div class="supply-buttons" aria-label="供給ボタン">
          ${blockTypes
            .map(
              (type) => `
                <button class="supply-button" type="button" data-supply-type="${type}" aria-label="${type}ブロック供給">
                  <span class="supply-button-count">×0</span>
                </button>
              `
            )
            .join("")}
        </div>

        ${developmentControlsEnabled
          ? `
              <section class="dev-control-panel" aria-label="開発用操作">
                <span class="dev-control-label">開発用操作</span>
                <div class="dev-controls">
                  <button class="dev-control-button" type="button" data-action="left">左</button>
                  <button class="dev-control-button" type="button" data-action="rotate">回転</button>
                  <button class="dev-control-button" type="button" data-action="right">右</button>
                  <button class="dev-control-button dev-control-button-primary" type="button" data-action="drop">落下</button>
                </div>
              </section>
            `
          : ""}
      </footer>
    </section>
  </main>
`;

let boardCells = Array.from(document.querySelectorAll<HTMLSpanElement>(".board-cell"));
const boardGrid = document.querySelector<HTMLDivElement>(".board-grid");
const scoreValue = document.querySelector<HTMLSpanElement>("[data-score]");
const stageTitleValue = document.querySelector<HTMLSpanElement>("[data-stage-title]");
const targetScoreValue = document.querySelector<HTMLSpanElement>("[data-target-score]");
const managementPowerValue = document.querySelector<HTMLSpanElement>("[data-management-power]");
const devStatus = document.querySelector<HTMLElement>(".dev-status");
const supplyStatusTitle = document.querySelector<HTMLSpanElement>(".supply-status-title");
const supplyStatusMessage = document.querySelector<HTMLSpanElement>(".supply-status-message");
const communicationStatus = document.querySelector<HTMLSpanElement>(".communication-status");
const stageProgress = document.querySelector<HTMLSpanElement>("[data-stage-progress]");
const replenishmentStatus = document.querySelector<HTMLSpanElement>("[data-replenishment-status]");
const replenishmentLabel = document.querySelector<HTMLSpanElement>("[data-replenishment-label]");
const replenishmentMain = document.querySelector<HTMLSpanElement>("[data-replenishment-main]");
const replenishmentDetail = document.querySelector<HTMLSpanElement>("[data-replenishment-detail]");
const aiHintPanel = document.querySelector<HTMLSpanElement>("[data-ai-hint-panel]");
const aiHintMessage = document.querySelector<HTMLSpanElement>("[data-ai-hint-message]");
const aiHintNext = document.querySelector<HTMLSpanElement>("[data-ai-hint-next]");
const aiHintUnlock = document.querySelector<HTMLSpanElement>("[data-ai-hint-unlock]");
const operatorBubble = document.querySelector<HTMLSpanElement>("[data-operator-bubble]");
const operatorCrew = document.querySelector<HTMLSpanElement>(".operator-crew");
const managementFeedback = document.querySelector<HTMLSpanElement>("[data-management-feedback]");
const managementFeedbackMark = document.querySelector<HTMLSpanElement>("[data-management-feedback-mark]");
const managementFeedbackTitle = document.querySelector<HTMLSpanElement>("[data-management-feedback-title]");
const managementFeedbackMessage = document.querySelector<HTMLSpanElement>("[data-management-feedback-message]");
const gameOverText = document.querySelector<HTMLSpanElement>(".game-over-text");
const clearPanel = document.querySelector<HTMLElement>("[data-clear-panel]");
const pausePanel = document.querySelector<HTMLElement>("[data-pause-panel]");
const exitConfirmPanel = document.querySelector<HTMLElement>("[data-exit-confirm-panel]");
const countdownOverlay = document.querySelector<HTMLDivElement>("[data-countdown-overlay]");
const replenishmentCountdown = document.querySelector<HTMLDivElement>("[data-replenishment-countdown]");
const managementMaxEffect = document.querySelector<HTMLDivElement>("[data-management-max-effect]");
const managementSpendEffect = document.querySelector<HTMLDivElement>("[data-management-spend-effect]");
const managementSpendLabel = document.querySelector<HTMLSpanElement>("[data-management-spend-label]");
const stageClearEffect = document.querySelector<HTMLDivElement>("[data-stage-clear-effect]");
const lastSpurtEffect = document.querySelector<HTMLDivElement>("[data-last-spurt-effect]");
const balanceBonusEffect = document.querySelector<HTMLDivElement>("[data-balance-bonus-effect]");
const finalScore = document.querySelector<HTMLSpanElement>("[data-final-score]");
const finalManagementPower = document.querySelector<HTMLSpanElement>("[data-final-management-power]");
const requiredManagementPower = document.querySelector<HTMLSpanElement>("[data-required-management]");
const reportTotal = document.querySelector<HTMLSpanElement>("[data-report-total]");
const reportPerfect = document.querySelector<HTMLSpanElement>("[data-report-perfect]");
const reportGood = document.querySelector<HTMLSpanElement>("[data-report-good]");
const reportNeutral = document.querySelector<HTMLSpanElement>("[data-report-neutral]");
const reportMiss = document.querySelector<HTMLSpanElement>("[data-report-miss]");
const reportRate = document.querySelector<HTMLSpanElement>("[data-report-rate]");
const reportRank = document.querySelector<HTMLSpanElement>("[data-report-rank]");
const safeAIComment = document.querySelector<HTMLSpanElement>("[data-safe-ai-comment]");
const clearRestartButton = document.querySelector<HTMLButtonElement>(".clear-restart-button");
const clearNextButton = document.querySelector<HTMLButtonElement>(".clear-next-button");
const gameOverPanel = document.querySelector<HTMLElement>("[data-game-over-panel]");
const gameOverFinalScore = document.querySelector<HTMLSpanElement>("[data-game-over-final-score]");
const gameOverFinalManagementPower = document.querySelector<HTMLSpanElement>(
  "[data-game-over-final-management-power]"
);
const gameOverMessage = document.querySelector<HTMLSpanElement>("[data-game-over-message]");
const gameOverRestartButton = document.querySelector<HTMLButtonElement>(".game-over-restart-button");
const devControlButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".dev-control-button"));
const supplyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".supply-button"));
const managementSkillButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".management-skill-button")
);
const screens = Array.from(document.querySelectorAll<HTMLElement>("[data-screen]"));
const titleCharacterImages = Array.from(document.querySelectorAll<HTMLImageElement>(".title-character-image"));
const recordsPanel = document.querySelector<HTMLDivElement>("[data-records-panel]");
const stageState = document.querySelector<HTMLSpanElement>("[data-stage-state]");
const stageBestRank = document.querySelector<HTMLSpanElement>("[data-stage-best-rank]");
const stageBestRate = document.querySelector<HTMLSpanElement>("[data-stage-best-rate]");
const stageBestPower = document.querySelector<HTMLSpanElement>("[data-stage-best-power]");
const stagePlayCount = document.querySelector<HTMLSpanElement>("[data-stage-play-count]");
const stageClearCount = document.querySelector<HTMLSpanElement>("[data-stage-clear-count]");
const mainStageCards = Array.from(document.querySelectorAll<HTMLButtonElement>(".stage-card-main"));
const characterEvents = new CharacterEventManager({
  root: devStatus,
  bubble: operatorBubble
});

titleCharacterImages.forEach((image) => {
  image.addEventListener("error", () => {
    console.error(`[Title] character image failed to load: ${image.dataset.characterName ?? image.alt}`);
  });
});

const ensureBoardGrid = () => {
  if (!boardGrid) {
    return;
  }

  Array.from(boardGrid.childNodes).forEach((node) => {
    if (!(node instanceof HTMLSpanElement) || !node.classList.contains("board-cell")) {
      node.remove();
    }
  });

  boardCells = Array.from(boardGrid.querySelectorAll<HTMLSpanElement>(".board-cell"));

  while (boardCells.length < engine.board.width * engine.board.height) {
    const index = boardCells.length;
    const row = Math.floor(index / engine.board.width) + 1;
    const column = (index % engine.board.width) + 1;
    const cell = document.createElement("span");

    cell.className = "board-cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${row}行${column}列`);
    boardGrid.append(cell);
    boardCells.push(cell);
  }

  boardCells.slice(engine.board.width * engine.board.height).forEach((cell) => cell.remove());
  boardCells = boardCells.slice(0, engine.board.width * engine.board.height);
};

const sanitizeOperatorCrew = () => {
  if (!operatorCrew) {
    return;
  }

  Array.from(operatorCrew.childNodes).forEach((node) => {
    if (!(node instanceof HTMLSpanElement) || !node.classList.contains("operator-agent")) {
      node.remove();
    }
  });
};

const getEffectiveScore = (snapshot: TetrisSnapshot) => Math.max(0, snapshot.score + aiScoreAdjustment);

const getManagementRank = (): TrainingRank => {
  if (managementPower >= 95) return "S";
  if (managementPower >= 80) return "A";
  if (managementPower >= 60) return "B";
  if (managementPower >= 40) return "C";
  return "D";
};

const renderBoard = (snapshot: TetrisSnapshot) => {
  ensureBoardGrid();
  sanitizeOperatorCrew();

  const activeCellKeys = new Map(
    snapshot.activeCells.map((cell) => [`${cell.x},${cell.y}`, cell.type])
  );

  boardCells.forEach((cell, index) => {
    const x = index % engine.board.width;
    const y = Math.floor(index / engine.board.width);
    const fixedType = snapshot.cells[y][x];
    const activeType = activeCellKeys.get(`${x},${y}`) ?? null;
    const type = activeType ?? fixedType;

    cell.textContent = "";
    cell.dataset.block = type ?? "";
    cell.dataset.active = activeType ? "true" : "false";
    cell.setAttribute("aria-label", `${y + 1}行${x + 1}列${type ? ` ${type}` : ""}`);
  });

  if (scoreValue) {
    scoreValue.textContent = String(getEffectiveScore(snapshot));
  }

  if (stageTitleValue) {
    stageTitleValue.textContent = getCurrentStage().title;
  }

  if (targetScoreValue) {
    targetScoreValue.textContent = String(TARGET_SCORE);
  }

  if (managementPowerValue) {
    managementPowerValue.textContent = String(managementPower);
  }

  if (gameOverText) {
    gameOverText.hidden = !snapshot.isGameOver;
  }

  renderStageProgress(snapshot);
  const currentBoardHeight = getBoardHeight(snapshot);
  if (
    !snapshot.isGameOver &&
    !isStageClear &&
    !isGameOver &&
    currentBoardHeight >= 16 &&
    currentBoardHeight !== lastDangerBoardHeight
  ) {
    lastDangerBoardHeight = currentBoardHeight;
    emitCharacterEvent("boardDanger");
  } else if (currentBoardHeight < 16) {
    lastDangerBoardHeight = 0;
  }
  renderReplenishmentStatus();
  renderAIHint();
  renderClearPanel(snapshot);
  renderGameOverPanel(snapshot);

  devControlButtons.forEach((button) => {
    button.disabled =
      !developmentControlsEnabled ||
      snapshot.isGameOver ||
      gameState !== "playing" ||
      isStageClear ||
      isGameOver ||
      isPaused ||
      isExitConfirmOpen ||
      isCountdownActive ||
      !snapshot.hasActiveTetromino;
  });

  renderSupplyButtons(snapshot);
  renderManagementSkillButtons(snapshot);
  renderSupplyStatus(snapshot);
  renderPauseMenu();
  renderExitConfirm();
  syncSupplyDecisionTimer(snapshot);
};

const getAudioContext = () => {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
};

const playUISound = (sound: UISound) => {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const soundMap: Record<UISound, { frequency: number; endFrequency: number; duration: number; gain: number }> = {
    button: { frequency: 520, endFrequency: 680, duration: 0.055, gain: 0.025 },
    replenish: { frequency: 420, endFrequency: 760, duration: 0.16, gain: 0.032 },
    powerUp: { frequency: 640, endFrequency: 920, duration: 0.13, gain: 0.03 },
    powerDown: { frequency: 280, endFrequency: 180, duration: 0.16, gain: 0.028 },
    clear: { frequency: 720, endFrequency: 1040, duration: 0.24, gain: 0.035 },
    gameover: { frequency: 220, endFrequency: 120, duration: 0.22, gain: 0.03 },
    countdown: { frequency: 520, endFrequency: 520, duration: 0.09, gain: 0.024 },
    start: { frequency: 560, endFrequency: 1180, duration: 0.22, gain: 0.035 },
    max: { frequency: 760, endFrequency: 1280, duration: 0.24, gain: 0.038 },
    spend: { frequency: 420, endFrequency: 220, duration: 0.2, gain: 0.03 },
    lastSpurt: { frequency: 680, endFrequency: 980, duration: 0.18, gain: 0.032 },
    balance: { frequency: 680, endFrequency: 1320, duration: 0.26, gain: 0.038 }
  };
  const config = soundMap[sound];

  oscillator.type = sound === "powerDown" || sound === "gameover" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(config.frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, config.endFrequency), now + config.duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(config.gain, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + config.duration + 0.02);
};

const startLastSpurtBgm = () => {
  if (lastSpurtBgm) {
    return;
  }

  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(164, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.009, now + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  lastSpurtBgm = { oscillator, gain };
};

const stopLastSpurtBgm = () => {
  if (!lastSpurtBgm || !audioContext) {
    lastSpurtBgm = null;
    return;
  }

  const now = audioContext.currentTime;
  lastSpurtBgm.gain.gain.cancelScheduledValues(now);
  lastSpurtBgm.gain.gain.setValueAtTime(lastSpurtBgm.gain.gain.value, now);
  lastSpurtBgm.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  lastSpurtBgm.oscillator.stop(now + 0.1);
  lastSpurtBgm = null;
};

const renderSupplyButtons = (snapshot: TetrisSnapshot) => {
  const shortageType = blockTypes.find((type) => inventory.getCount(type) <= 1);
  if (
    shortageType &&
    !snapshot.isGameOver &&
    !isStageClear &&
    !isGameOver &&
    !isPaused &&
    !isExitConfirmOpen &&
    !isCountdownActive &&
    devStatus?.dataset.operatorReaction !== "shortage"
  ) {
    emitCharacterEvent("stockShortage", { shortageType });
  }

  supplyButtons.forEach((button) => {
    const type = button.dataset.supplyType as TetrominoType;
    const count = inventory.getCount(type);
    const countLabel = button.querySelector<HTMLSpanElement>(".supply-button-count");

    if (countLabel) {
      countLabel.textContent = `×${count}`;
    }

    button.dataset.stockState = count <= 0 ? "empty" : "available";

    button.disabled =
      snapshot.isGameOver ||
      gameState !== "playing" ||
      isStageClear ||
      isGameOver ||
      isPaused ||
      isExitConfirmOpen ||
      isCountdownActive ||
      !isReplenishmentRequestActive;
  });
};

const renderManagementSkillButtons = (snapshot: TetrisSnapshot) => {
  managementSkillButtons.forEach((button) => {
    const skill = button.dataset.managementSkill as keyof typeof MANAGEMENT_SKILL_COSTS;
    const cost = MANAGEMENT_SKILL_COSTS[skill];
    const canSpend =
      managementPower - cost >= MIN_MANAGEMENT_POWER &&
      (cost !== 30 || managementPower >= -70);
    button.dataset.powerState = canSpend ? "ready" : "shortage";

    button.disabled =
      snapshot.isGameOver ||
      gameState !== "playing" ||
      isStageClear ||
      isGameOver ||
      isPaused ||
      isExitConfirmOpen ||
      isCountdownActive;
  });
};

const setSupplyStatus = (
  title: string,
  message: string,
  communication: string,
  kind: string = "idle"
) => {
  if (devStatus) {
    devStatus.dataset.statusKind = kind;
  }

  if (supplyStatusTitle) {
    supplyStatusTitle.textContent = title;
    supplyStatusTitle.dataset.statusKind = kind;
  }

  if (supplyStatusMessage) {
    supplyStatusMessage.textContent = message;
  }

  if (communicationStatus) {
    communicationStatus.textContent = communication;
  }
};

const renderSupplyStatus = (snapshot: TetrisSnapshot) => {
  if (isExitConfirmOpen) {
    setSupplyStatus("🚪 終了確認", "ゲームを終了しますか？", "確認中", "paused");
    return;
  }

  if (isPaused) {
    setSupplyStatus("⏸ 一時停止", "メニューから再開できます", "停止中", "paused");
    return;
  }

  if (isCountdownActive) {
    setSupplyStatus("▶ 開始準備", "カウントダウン中", "待機中", "thinking");
    return;
  }

  if (isStageClear) {
    const stage = getCurrentStage();
    setSupplyStatus("✓ クリア", stage.isTraining ? "本ステージ解放" : `${stage.shortTitle} 完了`, "完了", "clear");
    return;
  }

  if (snapshot.isGameOver || isGameOver) {
    setSupplyStatus("× 管理終了", gameOverReason, "停止中", "gameover");
    return;
  }

  if (activeReplenishmentResult) {
    setSupplyStatus("🚚 補充便到着", activeReplenishmentResult.shipment.name, "補充完了", "replenish");
    return;
  }

  if (isReplenishmentRequestActive) {
    const remainingMs = Math.max(0, replenishmentRequestDeadline - Date.now());
    setSupplyStatus(
      "⚡ 補給要求",
      `補給ブロックを選択してください（残り${Math.ceil(remainingMs / 1000)}秒）`,
      "AIプレイ継続中",
      "replenish"
    );
    return;
  }

  if (supplyPhase === "idle") {
    if (getEffectiveScore(snapshot) >= TARGET_SCORE) {
      const required = getCurrentStage().requiredManagementPower;
      const message =
        required !== null && managementPower < required
          ? `必要管理力 ${required} に届いていません`
          : "クリア条件を確認中";
      setSupplyStatus("✓ 目標達成", message, "目標達成", "target");
      return;
    }

    setSupplyStatus("▶ 自動プレイ中", "世界ランカーがプレイ継続中", "補給待機", "idle");
  }
};

const getBoardHeight = (snapshot: TetrisSnapshot) => {
  const firstFilledRow = snapshot.cells.findIndex((row) => row.some((cell) => cell !== null));
  return firstFilledRow === -1 ? 0 : engine.board.height - firstFilledRow;
};

const renderStageProgress = (snapshot: TetrisSnapshot) => {
  if (!stageProgress) {
    return;
  }

  if (isStageClear) {
    stageProgress.hidden = true;
    stageProgress.textContent = "";
    stageProgress.dataset.stageState = "";
    return;
  }

  stageProgress.hidden = false;

  if (snapshot.isGameOver || isGameOver) {
    stageProgress.textContent = "管理終了";
    stageProgress.dataset.stageState = "gameover";
    return;
  }

  const effectiveScore = getEffectiveScore(snapshot);
  if (effectiveScore < TARGET_SCORE) {
    const remainingScore = TARGET_SCORE - effectiveScore;
    if (remainingScore <= LAST_SPURT_REMAINING_SCORE) {
      showLastSpurtEffect();
    }
    stageProgress.textContent = `あと${remainingScore}点でクリア`;
    stageProgress.dataset.stageState = "score";
    return;
  }

  const requiredPower = getCurrentStage().requiredManagementPower;
  stageProgress.textContent =
    requiredPower !== null && managementPower < requiredPower
      ? `管理力 ${requiredPower} 必要`
      : "クリアスコア到達！";
  stageProgress.dataset.stageState = "arrange";
};

const getTurnsUntilReplenishment = () => {
  const interval = getCurrentStage().replenishmentInterval;
  const remainder = placementCount % interval;
  return remainder === 0 ? interval : interval - remainder;
};

const getReplenishmentItemEntries = (items: Partial<Record<TetrominoType, number>>) =>
  blockTypes
    .flatMap((type) => {
      const amount = items[type] ?? 0;
      return amount > 0 ? [{ type, amount }] : [];
    });

const getReplenishmentCells = (type: TetrominoType) => {
  const shapes: Record<TetrominoType, number[]> = {
    I: [4, 5, 6, 7],
    O: [1, 2, 5, 6],
    T: [1, 4, 5, 6],
    L: [0, 1, 2, 4],
    J: [0, 1, 2, 6],
    S: [1, 2, 4, 5],
    Z: [0, 1, 5, 6]
  };

  return shapes[type]
    .map((index) => {
      const column = (index % 4) + 1;
      const row = Math.floor(index / 4) + 1;
      return `<span class="replenishment-icon-cell" style="grid-column: ${column}; grid-row: ${row};"></span>`;
    })
    .join("");
};

const renderReplenishmentItems = (items: Partial<Record<TetrominoType, number>>) => {
  const entries = getReplenishmentItemEntries(items);

  if (entries.length === 0) {
    return `<span class="replenishment-empty">在庫上限のため増加なし</span>`;
  }

  return entries
    .map(
      ({ type, amount }) => `
        <span class="replenishment-item" data-block="${type}" aria-label="${type} +${amount}">
          <span class="replenishment-icon" aria-hidden="true">${getReplenishmentCells(type)}</span>
          <span class="replenishment-amount">+${amount}</span>
        </span>
      `
    )
    .join("");
};

const getNextReplenishmentShipment = () =>
  REPLENISHMENT_SHIPMENTS[replenishmentShipmentIndex % REPLENISHMENT_SHIPMENTS.length];

const renderReplenishmentStatus = () => {
  if (!replenishmentStatus || !replenishmentLabel || !replenishmentMain || !replenishmentDetail) {
    return;
  }

  if (isStageClear || isGameOver) {
    replenishmentStatus.hidden = true;
    if (devStatus) {
      delete devStatus.dataset.replenishmentMood;
    }
    return;
  }

  replenishmentStatus.hidden = false;

  if (activeReplenishmentResult) {
    if (devStatus) {
      devStatus.dataset.replenishmentMood = "arrived";
    }
    replenishmentStatus.dataset.replenishmentState = "arrived";
    replenishmentLabel.textContent = "🚚 補充便到着！";
    replenishmentMain.textContent = activeReplenishmentResult.shipment.name;
    replenishmentDetail.innerHTML = renderReplenishmentItems(activeReplenishmentResult.appliedItems);
    return;
  }

  if (isReplenishmentRequestActive) {
    const remainingMs = Math.max(0, replenishmentRequestDeadline - Date.now());
    if (devStatus) {
      devStatus.dataset.replenishmentMood = "soon";
    }
    replenishmentStatus.dataset.replenishmentState = "request";
    replenishmentLabel.textContent = "⚡ 補給要求";
    replenishmentMain.textContent = `残り${Math.ceil(remainingMs / 1000)}秒`;
    replenishmentDetail.innerHTML = `<span class="replenishment-shipment-name">ブロックを選択</span>`;
    return;
  }

  const nextShipment = getNextReplenishmentShipment();
  const turnsUntilReplenishment = getTurnsUntilReplenishment();
  if (devStatus) {
    devStatus.dataset.replenishmentMood = turnsUntilReplenishment <= 1 ? "soon" : "waiting";
  }
  if (lastReplenishmentBubbleTurns !== turnsUntilReplenishment) {
    lastReplenishmentBubbleTurns = turnsUntilReplenishment;
    emitCharacterEvent("replenishmentCountdown", { turnsUntilReplenishment });
  }
  replenishmentStatus.dataset.replenishmentState = "waiting";
  replenishmentLabel.textContent = "🚚 補充";
  replenishmentMain.textContent = `あと${turnsUntilReplenishment}手`;
  replenishmentDetail.innerHTML = `
    <span class="replenishment-shipment-name">${nextShipment.name}</span>
    <span class="replenishment-items">${renderReplenishmentItems(nextShipment.items)}</span>
  `;
};

const getAIHintText = (power = managementPower) => {
  if (power < -70) {
    return "解析不能";
  }

  switch (getCurrentStage().hintLevel) {
    case 7:
      return "低く平らに。穴を避けよう。";
    case 6:
      return "穴を避けて低く。";
    case 5:
      return "低い配置を優先。";
    case 4:
      return "高く積みすぎ注意。";
    case 3:
      return "低く保とう。";
    case 2:
      return "穴注意。";
    case 1:
      return "……";
    case 0:
      return "？？？";
  }
};

const renderAIHint = () => {
  if (!aiHintPanel || !aiHintMessage || !aiHintNext) {
    return;
  }

  aiHintPanel.hidden = isStageClear || isGameOver;
  aiHintMessage.textContent = getAIHintText();
  aiHintNext.hidden = true;
  aiHintNext.textContent = "";
  aiHintPanel.dataset.hintLevel =
    managementPower >= 90 ? "high" : managementPower >= 60 ? "mid" : managementPower >= 30 ? "low" : "locked";
};

const showHintUnlock = () => {
  if (!aiHintUnlock) {
    return;
  }

  emitCharacterEvent("aiHintUnlocked");
  aiHintUnlock.hidden = true;
  void aiHintUnlock.offsetWidth;
  aiHintUnlock.hidden = false;

  clearHintUnlockTimer();
  hintUnlockTimer = window.setTimeout(() => {
    aiHintUnlock.hidden = true;
    hintUnlockTimer = null;
  }, 1500);
};

const renderClearPanel = (snapshot: TetrisSnapshot) => {
  if (!clearPanel) {
    return;
  }

  const stage = getCurrentStage();
  const reportSummary = getTrainingReportSummary();
  clearPanel.hidden = !isStageClear || isGameOver || snapshot.isGameOver;

  if (!clearPanel.hidden && devStatus?.dataset.operatorReaction !== "clear") {
    emitCharacterEvent("result");
  }

  if (finalScore) {
    finalScore.textContent = `Score ${getEffectiveScore(snapshot)}`;
  }

  if (finalManagementPower) {
    finalManagementPower.textContent = `Management ${managementPower}`;
  }

  if (requiredManagementPower) {
    const required = stage.requiredManagementPower;
    requiredManagementPower.textContent = required === null ? "Required 制限なし" : `Required ${required}`;
  }

  if (reportTotal) {
    reportTotal.textContent = `総供給回数 ${reportSummary.total}`;
  }

  if (reportPerfect) {
    reportPerfect.textContent = `Perfect（第1候補） ${reportSummary.perfect}`;
  }

  if (reportGood) {
    reportGood.textContent = `Good（第2候補） ${reportSummary.good}`;
  }

  if (reportNeutral) {
    reportNeutral.textContent = `Neutral（対応可能） ${reportSummary.neutral}`;
  }

  if (reportMiss) {
    reportMiss.textContent = `Miss（最下位） ${reportSummary.miss}`;
  }

  if (reportRate) {
    reportRate.textContent = "結果 CLEAR";
  }

  if (reportRank) {
    reportRank.textContent = `Rank ${reportSummary.rank}`;
  }

  if (safeAIComment) {
    safeAIComment.textContent = reportSummary.comment;
  }

  if (clearNextButton) {
    const nextStageId = getNextStageId();
    const hasNextStage = nextStageId !== currentStageId;
    clearNextButton.hidden = false;
    clearNextButton.disabled = !hasNextStage;
    clearNextButton.textContent = hasNextStage ? "次へ" : "完了";
    clearNextButton.setAttribute(
      "aria-label",
      hasNextStage
        ? `${stage.isTraining ? "本ステージ Stage1" : STAGES_BY_ID.get(nextStageId)?.title ?? "次のステージ"}を開始`
        : "次のステージはまだありません"
    );
  }
};

const renderGameOverPanel = (snapshot: TetrisSnapshot) => {
  if (!gameOverPanel) {
    return;
  }

  gameOverPanel.hidden = !isGameOver || isStageClear;

  if (gameOverFinalScore) {
    gameOverFinalScore.textContent = `最終スコア ${getEffectiveScore(snapshot)}`;
  }

  if (gameOverFinalManagementPower) {
    gameOverFinalManagementPower.textContent = `最終管理力 ${managementPower}`;
  }

  if (gameOverMessage) {
    gameOverMessage.textContent = gameOverReason;
  }
};

const renderPauseMenu = () => {
  if (pausePanel) {
    pausePanel.hidden = !isPaused || isExitConfirmOpen || isStageClear || isGameOver;
  }
};

const renderExitConfirm = () => {
  if (exitConfirmPanel) {
    exitConfirmPanel.hidden = !isExitConfirmOpen || isStageClear || isGameOver;
  }
};

const clearStatusTimer = () => {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
};

const clearManagementFeedbackTimer = () => {
  if (managementFeedbackTimer !== null) {
    window.clearTimeout(managementFeedbackTimer);
    managementFeedbackTimer = null;
  }
};

const clearReplenishmentTimer = () => {
  if (replenishmentTimer !== null) {
    window.clearTimeout(replenishmentTimer);
    replenishmentTimer = null;
  }
};

const clearHintUnlockTimer = () => {
  if (hintUnlockTimer !== null) {
    window.clearTimeout(hintUnlockTimer);
    hintUnlockTimer = null;
  }
};

const clearSupplyDecisionTimer = () => {
  if (supplyDecisionTimer !== null) {
    window.clearTimeout(supplyDecisionTimer);
    supplyDecisionTimer = null;
  }
};

const clearReplenishmentRequestTimer = () => {
  if (replenishmentRequestTimer !== null) {
    window.clearTimeout(replenishmentRequestTimer);
    replenishmentRequestTimer = null;
  }
};

const clearReplenishmentCountdown = () => {
  if (replenishmentCountdownTimer !== null) {
    window.clearInterval(replenishmentCountdownTimer);
    replenishmentCountdownTimer = null;
  }

  if (replenishmentCountdown) {
    replenishmentCountdown.hidden = true;
    replenishmentCountdown.textContent = "";
  }

  if (boardGrid) {
    delete boardGrid.dataset.replenishmentRequest;
    delete boardGrid.dataset.supplyUse;
    delete boardGrid.dataset.supplyComplete;
  }
};

const updateReplenishmentCountdown = () => {
  if (!isReplenishmentRequestActive || !replenishmentCountdown) {
    return;
  }

  const remainingSeconds = Math.max(0, replenishmentRequestDeadline - Date.now()) / 1000;
  replenishmentCountdown.hidden = false;
  replenishmentCountdown.textContent = remainingSeconds.toFixed(1);
};

const startReplenishmentCountdown = () => {
  clearReplenishmentCountdown();
  if (boardGrid) {
    boardGrid.dataset.replenishmentRequest = "true";
  }
  updateReplenishmentCountdown();
  replenishmentCountdownTimer = window.setInterval(updateReplenishmentCountdown, 100);
};

const flashSupplyComplete = () => {
  if (!boardGrid) {
    return;
  }

  boardGrid.dataset.supplyComplete = "true";
  scheduleEffectTimer(() => {
    delete boardGrid.dataset.supplyComplete;
  }, 420);
};

const stopContinuousAI = () => {
  continuousAIToken += 1;
  if (continuousAITimer !== null) {
    window.clearTimeout(continuousAITimer);
    continuousAITimer = null;
  }
};

const clearEffectTimers = () => {
  effectTimers.forEach((timer) => window.clearTimeout(timer));
  effectTimers = [];
};

const scheduleEffectTimer = (callback: () => void, milliseconds: number) => {
  const timer = window.setTimeout(() => {
    effectTimers = effectTimers.filter((effectTimer) => effectTimer !== timer);
    callback();
  }, milliseconds);

  effectTimers.push(timer);
  return timer;
};

const waitForEffect = (milliseconds: number, token: number) =>
  new Promise<boolean>((resolve) => {
    scheduleEffectTimer(() => resolve(token === flowToken), milliseconds);
  });

const replayEffect = (element: HTMLElement | null, duration: number) => {
  if (!element) {
    return;
  }

  element.hidden = true;
  void element.offsetWidth;
  element.hidden = false;
  scheduleEffectTimer(() => {
    element.hidden = true;
  }, duration);
};

const hideAllEffects = () => {
  [
    countdownOverlay,
    managementMaxEffect,
    managementSpendEffect,
    stageClearEffect,
    lastSpurtEffect,
    balanceBonusEffect
  ].forEach((element) => {
    if (element) {
      element.hidden = true;
    }
  });
};

const runStartCountdown = async () => {
  if (gameState !== "countdown") {
    return;
  }

  if (!countdownOverlay) {
    isCountdownActive = false;
    supplyLocked = false;
    setGameState("playing", "countdown-missing-fallback");
    renderBoard(engine.getSnapshot());
    return;
  }

  countdownStartCount += 1;
  logDebug("[Countdown] start count:", countdownStartCount);
  const token = ++flowToken;
  isCountdownActive = true;
  supplyLocked = true;
  renderBoard(engine.getSnapshot());

  for (const label of ["3", "2", "1"]) {
    if (token !== flowToken || gameState !== "countdown") return;
    countdownOverlay.textContent = label;
    countdownOverlay.dataset.countdownState = "number";
    replayEffect(countdownOverlay, COUNTDOWN_STEP_MS);
    playUISound("countdown");
    if (!(await waitForEffect(COUNTDOWN_STEP_MS, token))) return;
  }

  countdownOverlay.textContent = "START!";
  countdownOverlay.dataset.countdownState = "start";
  replayEffect(countdownOverlay, START_DISPLAY_MS);
  playUISound("start");
  await waitForEffect(START_DISPLAY_MS, token);

  if (token !== flowToken || gameState !== "countdown") {
    return;
  }

  countdownOverlay.hidden = true;
  isCountdownActive = false;
  supplyLocked = false;
  setGameState("playing", "countdown-complete");
  renderBoard(engine.getSnapshot());
  startContinuousAI();
};

const clearCharacterEvents = () => {
  characterEvents.clear();
};

const emitCharacterEvent = (
  type: CharacterEventType,
  payload: Parameters<CharacterEventManager["emit"]>[1] = {}
) => {
  characterEvents.emit(type, payload);
};

const showManagementMaxEffect = () => {
  hasShownManagementMax = true;
  managementPowerValue?.closest(".status-item")?.classList.add("status-item-management-max");
  replayEffect(managementMaxEffect, MANAGEMENT_MAX_EFFECT_MS);
  playUISound("max");
  characterEvents.notify("miston", "最高！", MANAGEMENT_MAX_EFFECT_MS);
  characterEvents.notify("asuton", "管理力MAX！", MANAGEMENT_MAX_EFFECT_MS);

  scheduleEffectTimer(() => {
    managementPowerValue?.closest(".status-item")?.classList.remove("status-item-management-max");
  }, MANAGEMENT_MAX_EFFECT_MS);
};

const showManagementSpendEffect = (amount: number) => {
  if (amount >= 0) {
    return;
  }

  if (managementSpendLabel) {
    managementSpendLabel.textContent = String(amount);
  }

  managementPowerValue?.closest(".status-item")?.classList.add("status-item-management-spend");
  replayEffect(managementSpendEffect, MANAGEMENT_SPEND_EFFECT_MS);
  playUISound("spend");

  scheduleEffectTimer(() => {
    managementPowerValue?.closest(".status-item")?.classList.remove("status-item-management-spend");
  }, MANAGEMENT_SPEND_EFFECT_MS);
};

const showStageClearEffect = () => {
  replayEffect(stageClearEffect, STAGE_CLEAR_EFFECT_MS);
  characterEvents.notify("miston", getCurrentStage().isTraining ? "本番解放！" : "ステージクリア！", STAGE_CLEAR_EFFECT_MS);
  characterEvents.notify("minton", "準備OK！", STAGE_CLEAR_EFFECT_MS);
  characterEvents.notify("asuton", "記録確認！", STAGE_CLEAR_EFFECT_MS);
};

const showLastSpurtEffect = () => {
  if (hasShownLastSpurt || isStageClear || isGameOver) {
    return;
  }

  hasShownLastSpurt = true;
  document.body.dataset.lastSpurt = "true";
  replayEffect(lastSpurtEffect, LAST_SPURT_EFFECT_MS);
  playUISound("lastSpurt");
  startLastSpurtBgm();
  characterEvents.notify("miston", "あと少し！", LAST_SPURT_EFFECT_MS);
  characterEvents.notify("asuton", "クリア目前！", LAST_SPURT_EFFECT_MS);
  characterEvents.notify("minton", "最後まで補充します！", LAST_SPURT_EFFECT_MS);
};

const showBalanceSupplyBonusEffect = () => {
  replayEffect(balanceBonusEffect, STAGE_CLEAR_EFFECT_MS);
  managementPowerValue?.closest(".status-item")?.classList.add("status-item-management-max");
  playUISound("balance");
  characterEvents.notify("asuton", "完璧な供給です！", 1900);
  characterEvents.notify("minton", "補充バランス最高！", 1900);
  characterEvents.notify("miston", "さすが管理人！", 1900);

  scheduleEffectTimer(() => {
    managementPowerValue?.closest(".status-item")?.classList.remove("status-item-management-max");
  }, STAGE_CLEAR_EFFECT_MS);
};

const showSupplyPenaltyReaction = () => {
  characterEvents.notify("asuton", "供給が偏っています！", 1900);
  characterEvents.notify("minton", "在庫バランス注意！", 1900);
  characterEvents.notify("miston", "別のブロックも欲しい！", 1900);
};

const getConsecutiveSupplyPenalty = (count: number) => {
  if (count >= 5) return -50;
  if (count === 4) return -20;
  if (count === 3) return -10;
  return 0;
};

const evaluateSupplyPattern = (type: TetrominoType) => {
  if (lastSuppliedType === type) {
    consecutiveSupplyCount += 1;
  } else {
    lastSuppliedType = type;
    consecutiveSupplyCount = 1;
  }

  const penalty = getConsecutiveSupplyPenalty(consecutiveSupplyCount);
  if (penalty < 0) {
    addManagementPower(penalty);
    showSupplyPenaltyReaction();
    showManagementFeedback({
      kind: "worst",
      mark: "×",
      title: "偏った供給！",
      message: `管理力 ${penalty}`,
      delta: penalty
    });
  }

  balanceSupplyTypes.add(type);
  if (balanceSupplyTypes.size === blockTypes.length) {
    balanceSupplyTypes = new Set<TetrominoType>();
    addManagementPower(BALANCE_SUPPLY_BONUS);
    showBalanceSupplyBonusEffect();
    showManagementFeedback({
      kind: "best",
      mark: "◎",
      title: "バランス供給ボーナス！",
      message: `管理力 +${BALANCE_SUPPLY_BONUS}`,
      delta: BALANCE_SUPPLY_BONUS
    });
  }
};

const showManagementShortage = () => {
  setSupplyStatus("⚠ 管理力不足", "管理力が足りません", "実行不可", "paused");
  characterEvents.notify("asuton", "管理力不足！", 1700);
  playUISound("powerDown");
};

const spendManagementPower = (amount: number) => {
  if (managementPower - amount < MIN_MANAGEMENT_POWER) {
    return false;
  }

  if (amount === 30 && managementPower < -70) {
    return false;
  }

  addManagementPower(-amount);
  return true;
};

const getInventoryAnalysisText = () => {
  const counts = inventory.getCounts();
  const lowest = blockTypes.reduce((currentLowest, type) =>
    counts[type] < counts[currentLowest] ? type : currentLowest
  );
  const emptyTypes = blockTypes.filter((type) => counts[type] === 0);

  if (emptyTypes.length > 0) {
    return `在庫0：${emptyTypes.join(" / ")}`;
  }

  return `最少在庫：${lowest} ×${counts[lowest]}`;
};

const useManagementSkill = (skill: keyof typeof MANAGEMENT_SKILL_COSTS) => {
  const snapshot = engine.getSnapshot();

  if (
    snapshot.isGameOver ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive
  ) {
    return;
  }

  const cost = MANAGEMENT_SKILL_COSTS[skill];
  const managementPowerBeforeSpend = managementPower;
  const aiHintText = skill === "aiHint" ? getAIHintText(managementPowerBeforeSpend) : "";
  if (!spendManagementPower(cost)) {
    renderBoard(snapshot);
    showManagementShortage();
    return;
  }

  switch (skill) {
    case "aiHint":
      showHintUnlock();
      setSupplyStatus("💡 AIヒント", aiHintText, `管理力 -${cost}`, "thinking");
      characterEvents.notify("asuton", "分析しました！", 1800);
      break;
    case "emergencyReplenish":
      activeReplenishmentResult = applyReplenishment();
      lastReplenishmentBubbleTurns = null;
      emitCharacterEvent("replenishmentArrived");
      scheduleReplenishmentArrivalHide();
      setSupplyStatus("🚚 緊急補充", activeReplenishmentResult.shipment.name, `管理力 -${cost}`, "replenish");
      break;
    case "inventoryAnalysis":
      setSupplyStatus("📊 在庫分析", getInventoryAnalysisText(), `管理力 -${cost}`, "thinking");
      characterEvents.notify("asuton", "在庫確認！", 1800);
      break;
  }

  renderBoard(engine.getSnapshot());

  if (skill === "aiHint") {
    setSupplyStatus("💡 AIヒント", aiHintText, `管理力 -${cost}`, "thinking");
  } else if (skill === "inventoryAnalysis") {
    setSupplyStatus("📊 在庫分析", getInventoryAnalysisText(), `管理力 -${cost}`, "thinking");
  }
};

const waitFor = (milliseconds: number, token: number) =>
  new Promise<boolean>((resolve) => {
    statusTimer = window.setTimeout(() => {
      statusTimer = null;
      resolve(token === flowToken);
    }, milliseconds);
  });

const getAutoSupplyType = () => {
  const desired = placementAI.desiredPiece;
  if (desired && inventory.canConsume(desired)) {
    return desired;
  }

  return blockTypes.find((type) => inventory.canConsume(type)) ?? null;
};

const getWorldRankerPieceType = () => {
  const desired = placementAI.desiredPiece;
  const second = placementAI.secondChoicePiece;

  if (desired && inventory.canConsume(desired)) {
    return desired;
  }

  if (second && inventory.canConsume(second)) {
    return second;
  }

  return blockTypes.find((type) => inventory.canConsume(type)) ?? null;
};

const handleSupplyTimeout = () => {
  supplyDecisionTimer = null;
  const snapshot = engine.getSnapshot();

  if (
    snapshot.isGameOver ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive ||
    supplyLocked ||
    snapshot.hasActiveTetromino ||
    supplyPhase !== "idle"
  ) {
    return;
  }

  addManagementPower(TIMEOUT_MANAGEMENT_PENALTY);
  showManagementFeedback({
    kind: "worst",
    mark: "×",
    title: "補給遅延",
    message: `管理力 ${TIMEOUT_MANAGEMENT_PENALTY}`,
    delta: TIMEOUT_MANAGEMENT_PENALTY
  });
  characterEvents.notify("asuton", "判断遅延！", 1700);
  characterEvents.notify("minton", "急ぎます！", 1700);

  if (isGameOver) {
    return;
  }

  const type = getAutoSupplyType();
  if (!type) {
    enterGameOver(engine.markGameOver());
    return;
  }

  setSupplyStatus("⚠ 補給遅延", `${type}ブロックを自動発送`, "管理力 -20", "shipping");
  void supplyBlock(type, { isTimeoutAuto: true });
};

const syncSupplyDecisionTimer = (_snapshot: TetrisSnapshot) => {};

const renderPlacementStep = (rotationIndex: number, x: number, y: number) => {
  renderBoard(
    engine.previewPlacement({
      rotationIndex,
      position: { x, y }
    })
  );
};

const getDesiredPieceSnapshot = (): DesiredPieceSnapshot => ({
  first: placementAI.desiredPiece,
  second: placementAI.secondChoicePiece,
  worst: placementAI.worstChoicePiece
});

const addManagementPower = (amount: number) => {
  const before = managementPower;
  managementPower = Math.max(MIN_MANAGEMENT_POWER, managementPower + amount);
  const unlockedThreshold = AI_HINT_UNLOCK_THRESHOLDS.find(
    (threshold) =>
      before < threshold && managementPower >= threshold && !unlockedHintThresholds.has(threshold)
  );

  if (unlockedThreshold) {
    unlockedHintThresholds.add(unlockedThreshold);
    showHintUnlock();
  }

  if (amount < 0 && managementPower < before) {
    showManagementSpendEffect(managementPower - before);
  }

  if (managementPower < MANAGEMENT_MILESTONE_POWER) {
    hasShownManagementMax = false;
  }

  if (
    before < MANAGEMENT_MILESTONE_POWER &&
    managementPower >= MANAGEMENT_MILESTONE_POWER &&
    !hasShownManagementMax
  ) {
    showManagementMaxEffect();
  }

  if (managementPower <= MIN_MANAGEMENT_POWER && !isGameOver && !isStageClear && gameState === "playing") {
    setSupplyStatus("× 解任通知", "補給判断能力不足", "管理力 -100", "gameover");
    enterGameOver(engine.getSnapshot());
  }
};

const hideManagementFeedback = () => {
  if (managementFeedback) {
    managementFeedback.hidden = true;
    managementFeedback.dataset.feedbackKind = "";
  }
};

const stopFeedbackDisplay = () => {
  clearManagementFeedbackTimer();
  hideManagementFeedback();
};

const hideReplenishmentArrival = () => {
  activeReplenishmentResult = null;
  renderReplenishmentStatus();
  renderSupplyStatus(engine.getSnapshot());
};

const scheduleReplenishmentArrivalHide = () => {
  clearReplenishmentTimer();
  replenishmentTimer = window.setTimeout(() => {
    replenishmentTimer = null;
    hideReplenishmentArrival();
  }, REPLENISH_NOTICE_MS);
};

const applyReplenishment = (): ReplenishmentResult => {
  const shipment = getNextReplenishmentShipment();
  const appliedItems: Partial<Record<TetrominoType, number>> = {};

  for (const type of blockTypes) {
    const amount = shipment.items[type] ?? 0;
    const added = amount > 0 ? inventory.add(type, amount) : 0;

    if (added > 0) {
      appliedItems[type] = added;
    }
  }

  replenishmentShipmentIndex += 1;

  return {
    shipment,
    appliedItems
  };
};

const getRandomReplenishmentType = () => {
  const candidates = blockTypes.filter((type) => inventory.getCount(type) < MAX_INVENTORY[type]);
  const pool = candidates.length > 0 ? candidates : blockTypes;
  return pool[Math.floor(Math.random() * pool.length)] ?? "I";
};

const applySingleReplenishment = (type: TetrominoType, source: "manual" | "timeout"): ReplenishmentResult => {
  const added = inventory.add(type, 1);
  return {
    shipment: {
      id: source,
      name: source === "manual" ? "補給完了" : "ランダム補給",
      items: { [type]: 1 }
    },
    appliedItems: added > 0 ? { [type]: added } : {}
  };
};

const shouldShuffleSupplyButtons = () => ["stage5", "stage6", "stage7"].includes(currentStageId);

const shuffleSupplyButtonsForRequest = () => {
  if (!shouldShuffleSupplyButtons()) {
    supplyButtonOrder = [...blockTypes];
    return;
  }

  const nextOrder = [...blockTypes];
  for (let index = nextOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
  }
  supplyButtonOrder = nextOrder;
};

const renderSupplyButtonOrder = () => {
  const supplyButtonContainer = supplyButtons[0]?.parentElement;
  if (!supplyButtonContainer) {
    return;
  }

  supplyButtonOrder.forEach((type) => {
    const button = supplyButtons.find((candidate) => candidate.dataset.supplyType === type);
    if (button) {
      supplyButtonContainer.append(button);
    }
  });
};

const finishReplenishmentRequest = () => {
  isReplenishmentRequestActive = false;
  replenishmentRequestDeadline = 0;
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
};

const showReplenishmentResult = (result: ReplenishmentResult) => {
  activeReplenishmentResult = result;
  lastReplenishmentBubbleTurns = null;
  emitCharacterEvent("replenishmentArrived");
  playUISound("replenish");
  scheduleReplenishmentArrivalHide();
};

const handleReplenishmentTimeout = () => {
  if (
    !isReplenishmentRequestActive ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive
  ) {
    return;
  }

  finishReplenishmentRequest();
  addManagementPower(TIMEOUT_MANAGEMENT_PENALTY);
  showManagementFeedback({
    kind: "worst",
    mark: "×",
    title: "補給失敗",
    message: `管理力 ${TIMEOUT_MANAGEMENT_PENALTY}`,
    delta: TIMEOUT_MANAGEMENT_PENALTY
  });

  if (isGameOver) {
    return;
  }

  const type = getRandomReplenishmentType();
  showReplenishmentResult(applySingleReplenishment(type, "timeout"));
  setSupplyStatus("⚠ 補給失敗", `${type}をランダム補給`, "AIプレイ継続中", "replenish");
  characterEvents.notify("asuton", "判断遅延！", 1700);
  characterEvents.notify("minton", "急ぎます！", 1700);
  renderBoard(engine.getSnapshot());
};

const startReplenishmentRequest = () => {
  if (
    isReplenishmentRequestActive ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive
  ) {
    return;
  }

  isReplenishmentRequestActive = true;
  replenishmentRequestDeadline = Date.now() + getCurrentStage().decisionTimeMs;
  clearReplenishmentRequestTimer();
  shuffleSupplyButtonsForRequest();
  renderSupplyButtonOrder();
  startReplenishmentCountdown();
  replenishmentRequestTimer = window.setTimeout(handleReplenishmentTimeout, getCurrentStage().decisionTimeMs);
  characterEvents.notify("minton", "補給お願いします！", 1500);
  setSupplyStatus("⚡ 補給要求", "補給ブロックを選択してください", "AIプレイ継続中", "replenish");
  renderBoard(engine.getSnapshot());
};

const chooseReplenishment = (type: TetrominoType) => {
  if (
    !isReplenishmentRequestActive ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive
  ) {
    return;
  }

  const desiredBeforeSupply = getDesiredPieceSnapshot();
  finishReplenishmentRequest();
  const feedback = applyManagementPowerReward(type, desiredBeforeSupply);
  recordTrainingReportEntry(type, desiredBeforeSupply, feedback);
  if (feedback) {
    aiScoreAdjustment += AI_SCORE_ADJUSTMENTS[feedback.kind];
    showManagementFeedback(feedback);
  }
  suppliedBlockAwaitingUse = type;
  showReplenishmentResult(applySingleReplenishment(type, "manual"));
  flashSupplyComplete();
  setSupplyStatus("🚚 補給完了", `${type}を補給しました`, "AIプレイ継続中", "replenish");
  renderBoard(engine.getSnapshot());
};

const handlePlacementCount = () => {
  placementCount += 1;

  if (placementCount % getCurrentStage().replenishmentInterval !== 0) {
    return;
  }

  startReplenishmentRequest();
};

const enterGameOver = (snapshot: TetrisSnapshot, reason = "管理人を解任されました") => {
  if (isStageClear || gameState === "stageclear" || gameState !== "playing") {
    return;
  }

  gameOverExecutionCount += 1;
  logDebug("[GameOver] count:", gameOverExecutionCount);
  stopContinuousAI();
  flowToken += 1;
  clearStatusTimer();
  clearReplenishmentTimer();
  clearSupplyDecisionTimer();
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
  isReplenishmentRequestActive = false;
  activeReplenishmentResult = null;
  stopFeedbackDisplay();
  stopLastSpurtBgm();
  pendingManagementJudgement = null;
  supplyLocked = false;
  supplyPhase = "gameover";
  isGameOver = true;
  gameOverReason = reason;
  setGameState("gameover", "enterGameOver");
  activeFlowType = null;
  activeFlowJudgement = null;
  emitCharacterEvent("gameOver");
  playUISound("gameover");
  saveStageResult(false);
  renderBoard(snapshot);
};

const showManagementFeedback = (feedback: ManagementFeedback) => {
  clearManagementFeedbackTimer();

  if (managementFeedbackMark) {
    managementFeedbackMark.textContent = feedback.mark;
  }

  if (managementFeedbackTitle) {
    managementFeedbackTitle.textContent = feedback.title;
  }

  if (managementFeedbackMessage) {
    managementFeedbackMessage.textContent = feedback.message;
  }

  if (managementFeedback) {
    managementFeedback.hidden = true;
    managementFeedback.dataset.feedbackKind = "";
    void managementFeedback.offsetWidth;
    managementFeedback.hidden = false;
    managementFeedback.dataset.feedbackKind = feedback.kind;
  }

  if (feedback.kind === "best") {
    emitCharacterEvent("managerPerfect");
  } else if (feedback.kind === "second") {
    emitCharacterEvent("managerGood");
  } else if (feedback.kind === "worst") {
    emitCharacterEvent("managerMiss");
  }

  playUISound(feedback.delta > 0 ? "powerUp" : feedback.delta < 0 ? "powerDown" : "button");

  managementFeedbackTimer = window.setTimeout(() => {
    hideManagementFeedback();
    managementFeedbackTimer = null;
  }, MANAGEMENT_FEEDBACK_DISPLAY_MS);
};

const applyManagementPowerReward = (
  suppliedType: TetrominoType | null,
  desiredBeforeSupply: DesiredPieceSnapshot | null
): ManagementFeedback | null => {
  if (!suppliedType || !desiredBeforeSupply) {
    return null;
  }

  if (suppliedType === desiredBeforeSupply.first) {
    addManagementPower(DESIRED_PIECE_BONUS);
    return {
      kind: "best",
      mark: "◎",
      title: "最適補給！",
      message: "管理力 +5",
      delta: DESIRED_PIECE_BONUS
    };
  }

  if (suppliedType === desiredBeforeSupply.second) {
    addManagementPower(SECOND_DESIRED_PIECE_BONUS);
    return {
      kind: "second",
      mark: "○",
      title: "良い補給",
      message: "管理力 +2",
      delta: SECOND_DESIRED_PIECE_BONUS
    };
  }

  if (suppliedType === desiredBeforeSupply.worst) {
    addManagementPower(WORST_CHOICE_PENALTY);
    return {
      kind: "worst",
      mark: "×",
      title: "悪い補給",
      message: "管理力 -10",
      delta: WORST_CHOICE_PENALTY
    };
  }

  return {
    kind: "neutral",
    mark: "△",
    title: "対応可能",
    message: "管理力 ±0",
    delta: 0
  };
};

const getTurnEvaluation = (feedback: ManagementFeedback): TurnEvaluation => {
  switch (feedback.kind) {
    case "best":
      return "Perfect";
    case "second":
      return "Good";
    case "worst":
      return "Miss";
    case "neutral":
      return "Neutral";
  }
};

const recordTrainingReportEntry = (
  suppliedType: TetrominoType | null,
  desiredBeforeSupply: DesiredPieceSnapshot | null,
  feedback: ManagementFeedback | null
) => {
  if (!suppliedType || !desiredBeforeSupply || !feedback) {
    return;
  }

  trainingReportEntries.push({
    desiredPiece: desiredBeforeSupply.first,
    secondChoicePiece: desiredBeforeSupply.second,
    worstChoicePiece: desiredBeforeSupply.worst,
    suppliedPiece: suppliedType,
    evaluation: getTurnEvaluation(feedback),
    managementDelta: feedback.delta
  });
};

const getSafeAIComment = (rank: TrainingReportSummary["rank"]) => {
  switch (rank) {
    case "S":
      return "完璧な管理でした。次もお願いします。";
    case "A":
      return "安定した管理でした。";
    case "B":
      return "悪くありません。もう少し先を読めそうです。";
    case "C":
      return "対応はできています。AIの狙いを観察してみましょう。";
    case "D":
      return "供給の傾向を見直してみましょう。";
  }
};

const getTrainingReportSummary = (): TrainingReportSummary => {
  const perfect = trainingReportEntries.filter((entry) => entry.evaluation === "Perfect").length;
  const good = trainingReportEntries.filter((entry) => entry.evaluation === "Good").length;
  const neutral = trainingReportEntries.filter((entry) => entry.evaluation === "Neutral").length;
  const miss = trainingReportEntries.filter((entry) => entry.evaluation === "Miss").length;
  const total = trainingReportEntries.length;
  const matchRate = total === 0 ? 0 : Math.round((perfect / total) * 100);
  const rank = getManagementRank();

  return {
    total,
    perfect,
    good,
    neutral,
    miss,
    matchRate,
    rank,
    comment: getSafeAIComment(rank)
  };
};

const showScreen = (screenName: "title" | "stage" | "records" | "rules" | "game") => {
  screens.forEach((screen) => {
    screen.hidden = screen.dataset.screen !== screenName;
  });
};

const hasAnyRecord = () => {
  const record = saveData.stages.training1;
  return (
    saveData.totalPlayCount > 0 ||
    saveData.totalClearCount > 0 ||
    record.bestScore > 0 ||
    record.bestRank !== null
  );
};

const renderTitleScreen = () => {};

const renderStageScreen = () => {
  const record = saveData.stages.training1;
  const challenged = hasAnyRecord();
  const stageStateLabel = record.cleared ? "クリア済" : challenged ? "挑戦中" : "未挑戦";

  if (stageState) {
    stageState.textContent = `状態 ${stageStateLabel}`;
  }

  if (stageBestRank) {
    stageBestRank.textContent = `最高ランク ${record.bestRank ?? "--"}`;
  }

  if (stageBestRate) {
    stageBestRate.textContent = `最高一致率 ${record.bestMatchRate || "--"}%`;
  }

  if (stageBestPower) {
    stageBestPower.textContent = `最高管理力 ${record.bestManagementPower || "--"}`;
  }

  if (stagePlayCount) {
    stagePlayCount.textContent = `プレイ回数 ${saveData.totalPlayCount}`;
  }

  if (stageClearCount) {
    stageClearCount.textContent = `クリア回数 ${saveData.totalClearCount}`;
  }

  mainStageCards.forEach((card) => {
    const unlocked = record.cleared;
    card.disabled = !unlocked;
    card.dataset.stageState = unlocked ? "unlocked" : "locked";
    const action = card.querySelector<HTMLSpanElement>(".stage-card-action");
    if (action) {
      action.textContent = unlocked ? "本ステージ開始" : "研修クリアで解放";
    }
  });
};

const renderRecordsScreen = () => {
  if (!recordsPanel) {
    return;
  }

  if (!hasAnyRecord()) {
    recordsPanel.innerHTML = `<p class="records-empty">まだ研修記録がありません。</p>`;
    return;
  }

  const record = saveData.stages.training1;
  recordsPanel.innerHTML = `
    <span>総プレイ回数 ${saveData.totalPlayCount}</span>
    <span>総クリア回数 ${saveData.totalClearCount}</span>
    <span>最高ランク ${record.bestRank ?? "--"}</span>
    <span>最高一致率 ${record.bestMatchRate}%</span>
    <span>最高管理力 ${record.bestManagementPower}</span>
    <span>最高スコア ${record.bestScore}</span>
    <span>最少Miss ${record.fewestMiss ?? "--"}</span>
  `;
};

const openTitleScreen = () => {
  renderTitleScreen();
  setGameState("title", "openTitleScreen");
  showScreen("title");
};

const openStageScreen = () => {
  saveData = saveManager.markFirstLaunch(saveData);
  renderStageScreen();
  showScreen("stage");
};

const openRulesScreen = (returnTarget: "title" | "pause" = "title") => {
  rulesReturnTarget = returnTarget;
  showScreen("rules");
};

const closeRulesScreen = () => {
  if (rulesReturnTarget === "pause") {
    showScreen("game");
    renderBoard(engine.getSnapshot());
    return;
  }

  showScreen("title");
};

const openRecordsScreen = () => {
  renderRecordsScreen();
  showScreen("records");
};

const pauseGame = () => {
  const snapshot = engine.getSnapshot();

  if (gameState !== "playing" || isPaused || isExitConfirmOpen || isCountdownActive || isStageClear || isGameOver || snapshot.isGameOver) {
    return;
  }

  pausedPhaseBeforeMenu = supplyPhase;
  isPaused = true;
  setGameState("paused", "pause-button");
  flowToken += 1;
  stopContinuousAI();
  clearStatusTimer();
  clearReplenishmentTimer();
  clearSupplyDecisionTimer();
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
  renderBoard(snapshot);
};

const resumeGame = () => {
  if (!isPaused || gameState !== "paused") {
    return;
  }

  isPaused = false;
  setGameState("playing", "resume-button");
  const snapshot = engine.getSnapshot();

  if (activeReplenishmentResult) {
    scheduleReplenishmentArrivalHide();
  }

  if (isReplenishmentRequestActive) {
    replenishmentRequestDeadline = Date.now() + getCurrentStage().decisionTimeMs;
    clearReplenishmentRequestTimer();
    startReplenishmentCountdown();
    replenishmentRequestTimer = window.setTimeout(handleReplenishmentTimeout, getCurrentStage().decisionTimeMs);
  }

  if (snapshot.hasActiveTetromino && activeFlowType) {
    const token = ++flowToken;
    supplyLocked = true;
    supplyPhase = "placement";
    void startSafeAIPlacement(activeFlowType, token, activeFlowJudgement ?? pendingManagementJudgement).then(() => {
      if (gameState === "playing" && !isPaused && !isStageClear && !isGameOver) {
        supplyLocked = false;
        supplyPhase = "idle";
        startContinuousAI();
      }
    });
    renderBoard(engine.getSnapshot());
    return;
  }

  supplyLocked = false;
  supplyPhase =
    pausedPhaseBeforeMenu === "gameover" || pausedPhaseBeforeMenu === "paused"
      ? "idle"
      : pausedPhaseBeforeMenu === "fixed"
        ? "idle"
        : pausedPhaseBeforeMenu;
  renderBoard(snapshot);
  startContinuousAI();
};

const restartFromMenu = () => {
  isPaused = false;
  isExitConfirmOpen = false;
  startTraining("pause-restart");
};

const openExitConfirm = () => {
  const snapshot = engine.getSnapshot();

  if (
    isExitConfirmOpen ||
    isCountdownActive ||
    isStageClear ||
    isGameOver ||
    snapshot.isGameOver ||
    (gameState !== "playing" && gameState !== "paused")
  ) {
    return;
  }

  pausedPhaseBeforeMenu = supplyPhase;
  isExitConfirmOpen = true;
  isPaused = gameState === "paused";
  flowToken += 1;
  stopContinuousAI();
  clearStatusTimer();
  clearReplenishmentTimer();
  clearSupplyDecisionTimer();
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
  renderBoard(snapshot);
};

const cancelExitConfirm = () => {
  if (!isExitConfirmOpen) {
    return;
  }

  isExitConfirmOpen = false;
  if (isPaused) {
    renderBoard(engine.getSnapshot());
    return;
  }

  isPaused = true;
  setGameState("paused", "exit-cancel-restore");
  resumeGame();
};

const confirmExitToTitle = () => {
  isExitConfirmOpen = false;
  isPaused = false;
  saveStageResult(false);
  returnToTitle("exit-confirm");
};

const createStageResultRecord = (cleared: boolean): StageResultRecord => {
  const summary = getTrainingReportSummary();
  return {
    cleared,
    rank: summary.rank as TrainingRank,
    matchRate: summary.matchRate,
    managementPower,
    score: getEffectiveScore(engine.getSnapshot()),
    miss: summary.miss
  };
};

const saveStageResult = (cleared: boolean) => {
  if (stageResultSaved || (!cleared && trainingReportEntries.length === 0)) {
    return;
  }

  saveData = saveManager.recordStageResult(saveData, createStageResultRecord(cleared));
  stageResultSaved = true;
  renderStageScreen();
  renderRecordsScreen();
};

const hasReachedClearScore = (snapshot: TetrisSnapshot) => getEffectiveScore(snapshot) >= TARGET_SCORE;

const hasRequiredManagementPower = () => {
  const required = getCurrentStage().requiredManagementPower;
  return required === null || managementPower >= required;
};

const shouldClearStage = (snapshot: TetrisSnapshot) =>
  gameState === "playing" &&
  !isStageClear &&
  !isGameOver &&
  !isCountdownActive &&
  hasReachedClearScore(snapshot) &&
  hasRequiredManagementPower();

const runAction = (action: string) => {
  if (!developmentControlsEnabled) {
    return;
  }

  if (!engine.getSnapshot().hasActiveTetromino) {
    return;
  }

  let snapshot: TetrisSnapshot;

  switch (action) {
    case "left":
      renderBoard(engine.moveLeft());
      break;
    case "right":
      renderBoard(engine.moveRight());
      break;
    case "rotate":
      renderBoard(engine.rotate());
      break;
    case "drop":
      snapshot = engine.hardDrop();
      supplyLocked = false;
      supplyPhase = snapshot.isGameOver ? "gameover" : "fixed";
      setSupplyStatus(
        snapshot.isGameOver ? "× 研修失敗" : "⬇ 配置中",
        snapshot.isGameOver ? "ゲームオーバー" : "次の供給を準備中",
        snapshot.isGameOver ? "停止中" : "固定完了",
        snapshot.isGameOver ? "gameover" : "placement"
      );
      renderBoard(snapshot);

      if (!snapshot.isGameOver) {
        clearStatusTimer();
        statusTimer = window.setTimeout(() => {
          supplyPhase = "idle";
          renderBoard(engine.getSnapshot());
        }, FIXED_DISPLAY_MS);
      }
      break;
  }
};

const completePlacement = (
  snapshot: TetrisSnapshot,
  suppliedType: TetrominoType | null = null,
  desiredBeforeSupply: DesiredPieceSnapshot | null = null
) => {
  supplyLocked = false;
  supplyPhase = snapshot.isGameOver ? "gameover" : "fixed";
  const managementJudgement = desiredBeforeSupply ?? pendingManagementJudgement;

  if (snapshot.isGameOver) {
    enterGameOver(snapshot);
    return;
  }

  if (!snapshot.isGameOver) {
    handlePlacementCount();
    const managementFeedbackResult = applyManagementPowerReward(suppliedType, managementJudgement);
    recordTrainingReportEntry(suppliedType, managementJudgement, managementFeedbackResult);

    if (managementFeedbackResult) {
      showManagementFeedback(managementFeedbackResult);
    }

    if (isGameOver) {
      return;
    }

    if (snapshot.lastClearedLines > 0) {
      const reactionToken = flowToken;
      window.setTimeout(() => {
        if (reactionToken !== flowToken || isStageClear || isGameOver) {
          return;
        }

        emitCharacterEvent("lineClear", { lineCount: snapshot.lastClearedLines });
      }, 650);
    }
  }

  pendingManagementJudgement = null;
  activeFlowType = null;
  activeFlowJudgement = null;
  placementAI.updateDesiredPiece(snapshot.cells);

  if (hasReachedClearScore(snapshot) && !hasRequiredManagementPower()) {
    const required = getCurrentStage().requiredManagementPower;
    enterGameOver(
      snapshot,
      required === null ? "ステージ条件を満たせませんでした" : `必要管理力 ${required} に届きませんでした`
    );
    return;
  }

  if (shouldClearStage(snapshot)) {
    stageClearExecutionCount += 1;
    logDebug("[StageClear] count:", stageClearExecutionCount, "score:", snapshot.score);
    isStageClear = true;
    setGameState("stageclear", "completePlacement");
    activeReplenishmentResult = null;
    clearReplenishmentTimer();
    clearReplenishmentRequestTimer();
    clearReplenishmentCountdown();
    isReplenishmentRequestActive = false;
    stopContinuousAI();
    supplyPhase = "idle";
    delete document.body.dataset.lastSpurt;
    stopLastSpurtBgm();
    emitCharacterEvent("stageClear");
    showStageClearEffect();
    playUISound("clear");
    saveStageResult(true);
  }

  setSupplyStatus(
    isGameOver ? "× 管理終了" : isStageClear ? "✓ クリア" : "⬇ 配置中",
    isGameOver
      ? "管理人を解任されました"
      : isStageClear
        ? getCurrentStage().isTraining ? "本ステージ解放" : `${getCurrentStage().shortTitle} 完了`
        : "次の供給を準備中",
    isGameOver ? "停止中" : isStageClear ? "完了" : "固定完了",
    isGameOver ? "gameover" : isStageClear ? "clear" : "placement"
  );
  renderBoard(snapshot);

  if (!isGameOver && !isStageClear) {
    clearStatusTimer();
    statusTimer = window.setTimeout(() => {
      supplyPhase = "idle";
      renderBoard(engine.getSnapshot());
    }, FIXED_DISPLAY_MS);
  }
};

const animateSafeAIPlacement = async (
  candidate: PlacementAICandidate,
  token: number
) => {
  let snapshot = engine.getSnapshot();

  if (!snapshot.activePosition || snapshot.activeRotationIndex === null) {
    return;
  }

  let currentX = snapshot.activePosition.x;
  let currentY = snapshot.activePosition.y;
  let currentRotationIndex = snapshot.activeRotationIndex;
  const targetX = candidate.position.x;
  const targetY = candidate.position.y;
  const targetRotationIndex = candidate.rotationIndex;
  const horizontalSteps = Math.abs(targetX - currentX);
  const rotationSteps = currentRotationIndex === targetRotationIndex ? 0 : 1;
  const moveSteps = horizontalSteps + rotationSteps;
  const moveDelay = moveSteps > 0 ? MOVE_ROTATE_ANIMATION_MS / moveSteps : MOVE_ROTATE_ANIMATION_MS;

  if (currentRotationIndex !== targetRotationIndex) {
    currentRotationIndex = targetRotationIndex;
    renderPlacementStep(currentRotationIndex, currentX, currentY);
    if (!(await waitFor(moveDelay, token))) return;
  }

  while (currentX !== targetX) {
    currentX += currentX < targetX ? 1 : -1;
    renderPlacementStep(currentRotationIndex, currentX, currentY);
    if (!(await waitFor(moveDelay, token))) return;
  }

  const dropDistance = Math.max(0, targetY - currentY);
  const dropStep = Math.max(1, Math.ceil(dropDistance / 6));
  const dropFrames = Math.max(1, Math.ceil(dropDistance / dropStep));
  const dropDelay = DROP_ANIMATION_MS / dropFrames;

  while (currentY < targetY) {
    currentY = Math.min(targetY, currentY + dropStep);
    renderPlacementStep(currentRotationIndex, currentX, currentY);
    if (!(await waitFor(dropDelay, token))) return;
  }
};

const startSafeAIPlacement = async (
  type: TetrominoType,
  token: number,
  desiredBeforeSupply: DesiredPieceSnapshot | null
) => {
  if (isPaused || isExitConfirmOpen || isCountdownActive) {
    return;
  }

  let suppliedSnapshot = engine.getSnapshot();

  if (!suppliedSnapshot.hasActiveTetromino && !suppliedSnapshot.isGameOver) {
    suppliedSnapshot = engine.supplyTetromino(type);
  }

  if (suppliedSnapshot.isGameOver) {
    enterGameOver(suppliedSnapshot);
    return;
  }

  supplyPhase = "placement";
  emitCharacterEvent("aiThinking");
  setSupplyStatus("🤔 思考中", `${placementAI.name} が配置を検討中`, "思考中", "thinking");
  renderBoard(suppliedSnapshot);

  clearStatusTimer();
  if (!(await waitFor(THINKING_DISPLAY_MS, token))) return;
  if (isPaused || isExitConfirmOpen || isCountdownActive) return;

  const candidate = placementAI.choosePlacement(type, engine.getSnapshot().cells);

  if (!candidate) {
    enterGameOver(engine.markGameOver());
    return;
  }

  setSupplyStatus("⬇ 配置中", `${type}ブロックを配置中`, "配置中", "placement");
  await animateSafeAIPlacement(candidate, token);

  if (token !== flowToken || isPaused || isExitConfirmOpen || isCountdownActive) {
    return;
  }

  completePlacement(engine.hardDrop(), type, desiredBeforeSupply);
};

const scheduleContinuousAI = (token: number, delay = WORLD_RANKER_TURN_GAP_MS) => {
  if (continuousAITimer !== null) {
    window.clearTimeout(continuousAITimer);
  }

  continuousAITimer = window.setTimeout(() => {
    continuousAITimer = null;
    void runContinuousAI(token);
  }, delay);
};

const runContinuousAI = async (token: number) => {
  if (
    token !== continuousAIToken ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive
  ) {
    return;
  }

  const snapshot = engine.getSnapshot();
  if (snapshot.isGameOver) {
    enterGameOver(snapshot);
    return;
  }

  if (snapshot.hasActiveTetromino || supplyLocked) {
    scheduleContinuousAI(token, WORLD_RANKER_TURN_GAP_MS);
    return;
  }

  let type = getWorldRankerPieceType();
  if (!type) {
    addManagementPower(TIMEOUT_MANAGEMENT_PENALTY);
    showManagementFeedback({
      kind: "worst",
      mark: "×",
      title: "在庫切れ",
      message: `管理力 ${TIMEOUT_MANAGEMENT_PENALTY}`,
      delta: TIMEOUT_MANAGEMENT_PENALTY
    });

    if (isGameOver) {
      return;
    }

    type = getRandomReplenishmentType();
    showReplenishmentResult(applySingleReplenishment(type, "timeout"));
  }

  if (!inventory.consume(type)) {
    scheduleContinuousAI(token, WORLD_RANKER_TURN_GAP_MS);
    return;
  }

  const isUsingPlayerSuppliedBlock = suppliedBlockAwaitingUse === type;
  if (isUsingPlayerSuppliedBlock && boardGrid) {
    boardGrid.dataset.supplyUse = "true";
  }

  const turnToken = ++flowToken;
  supplyPhase = "placement";
  activeFlowType = type;
  activeFlowJudgement = null;
  await startSafeAIPlacement(type, turnToken, null);

  if (isUsingPlayerSuppliedBlock) {
    suppliedBlockAwaitingUse = null;
    if (boardGrid) {
      delete boardGrid.dataset.supplyUse;
    }
  }

  if (token === continuousAIToken && gameState === "playing" && !isStageClear && !isGameOver) {
    supplyLocked = false;
    supplyPhase = "idle";
    scheduleContinuousAI(token);
  }
};

const startContinuousAI = () => {
  stopContinuousAI();
  const token = ++continuousAIToken;
  scheduleContinuousAI(token, WORLD_RANKER_TURN_GAP_MS);
};

const supplyBlock = async (type: TetrominoType, options: { isTimeoutAuto?: boolean } = {}) => {
  const snapshot = engine.getSnapshot();

  if (
    snapshot.isGameOver ||
    gameState !== "playing" ||
    isStageClear ||
    isGameOver ||
    isPaused ||
    isExitConfirmOpen ||
    isCountdownActive ||
    snapshot.hasActiveTetromino ||
    supplyLocked ||
    supplyPhase !== "idle" ||
    !inventory.canConsume(type)
  ) {
    return;
  }

  const token = ++flowToken;
  const desiredBeforeSupply = getDesiredPieceSnapshot();
  clearSupplyDecisionTimer();
  pendingManagementJudgement = options.isTimeoutAuto ? null : desiredBeforeSupply;
  activeFlowType = type;
  activeFlowJudgement = options.isTimeoutAuto ? null : desiredBeforeSupply;
  supplyLocked = true;
  supplyPhase = "shipping";
  inventory.consume(type);
  if (!options.isTimeoutAuto) {
    evaluateSupplyPattern(type);
    if (isGameOver) {
      return;
    }
  }
  const suppliedSnapshot = engine.supplyTetromino(type);

  if (suppliedSnapshot.isGameOver) {
    enterGameOver(suppliedSnapshot);
    return;
  }

  playUISound("button");
  setSupplyStatus("📦 発送中", `${type}ブロック発送中`, "発送中", "shipping");
  renderBoard(suppliedSnapshot);

  clearStatusTimer();
  if (!(await waitFor(SHIPPING_DISPLAY_MS, token))) return;
  if (isPaused || isExitConfirmOpen || isCountdownActive) return;

  supplyPhase = "received";
  setSupplyStatus("☑ AI受取", `${type}ブロックを受取`, "AI受取", "received");
  renderBoard(engine.getSnapshot());

  if (!(await waitFor(RECEIVED_DISPLAY_MS, token))) return;
  if (isPaused || isExitConfirmOpen || isCountdownActive) return;

  await startSafeAIPlacement(type, token, options.isTimeoutAuto ? null : desiredBeforeSupply);
};

devControlButtons.forEach((button) => {
  button.addEventListener("click", () => {
    runAction(button.dataset.action ?? "");
  });
});

supplyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chooseReplenishment(button.dataset.supplyType as TetrominoType);
  });
});

managementSkillButtons.forEach((button) => {
  button.addEventListener("click", () => {
    useManagementSkill(button.dataset.managementSkill as keyof typeof MANAGEMENT_SKILL_COSTS);
  });
});

const resetGame = (countAsPlay = false, source = "resetGame", stageId: StageId = currentStageId) => {
  currentStageId = stageId;
  resetExecutionCount += 1;
  logDebug("[Reset] count:", resetExecutionCount, "source:", source);
  saveStageResult(false);
  flowToken += 1;
  clearStatusTimer();
  clearReplenishmentTimer();
  clearHintUnlockTimer();
  clearSupplyDecisionTimer();
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
  clearEffectTimers();
  stopContinuousAI();
  stopLastSpurtBgm();
  clearCharacterEvents();
  if (devStatus) {
    delete devStatus.dataset.operatorReaction;
    delete devStatus.dataset.replenishmentMood;
    delete devStatus.dataset.characterActor;
    delete devStatus.dataset.characterEvent;
    delete devStatus.dataset.shortageType;
    delete devStatus.dataset.lineCount;
  }
  stopFeedbackDisplay();
  if (aiHintUnlock) {
    aiHintUnlock.hidden = true;
  }
  hideAllEffects();
  delete document.body.dataset.lastSpurt;
  inventory.reset();
  managementPower = INITIAL_MANAGEMENT_POWER;
  pendingManagementJudgement = null;
  activeFlowType = null;
  activeFlowJudgement = null;
  isStageClear = false;
  isGameOver = false;
  isPaused = false;
  isExitConfirmOpen = false;
  isCountdownActive = false;
  isReplenishmentRequestActive = false;
  replenishmentRequestDeadline = 0;
  pausedPhaseBeforeMenu = "idle";
  placementCount = 0;
  replenishmentShipmentIndex = 0;
  lastDangerBoardHeight = 0;
  hasShownManagementMax = false;
  hasShownLastSpurt = false;
  lastSuppliedType = null;
  consecutiveSupplyCount = 0;
  balanceSupplyTypes = new Set<TetrominoType>();
  activeReplenishmentResult = null;
  suppliedBlockAwaitingUse = null;
  supplyButtonOrder = [...blockTypes];
  aiScoreAdjustment = 0;
  gameOverReason = "管理人を解任されました";
  trainingReportEntries = [];
  unlockedHintThresholds = new Set<number>();
  lastReplenishmentBubbleTurns = null;
  stageResultSaved = false;
  supplyLocked = false;
  supplyPhase = "idle";
  renderSupplyButtonOrder();
  if (countAsPlay) {
    saveData = saveManager.recordStageStart(saveData, currentStageId);
  }
  const snapshot = engine.restart();
  placementAI.updateDesiredPiece(snapshot.cells);
  renderBoard(snapshot);
};

const startTraining = (source = "start-training", stageId: StageId = DEFAULT_STAGE_ID) => {
  resetGame(true, source, stageId);
  showScreen("game");
  setGameState("countdown", source);
  void runStartCountdown();
};

const getNextStageId = (): StageId => {
  const currentIndex = STAGE_CONFIGS.findIndex((stage) => stage.id === currentStageId);
  return STAGE_CONFIGS[Math.min(STAGE_CONFIGS.length - 1, currentIndex + 1)]?.id ?? "stage1";
};

const returnToTitle = (source: string) => {
  logDebug("[Navigation] returnToTitle called from:", source);
  if (!canReturnToTitleFrom(source)) {
    console.warn("[Navigation] blocked returnToTitle from:", source);
    return;
  }

  saveStageResult(false);
  flowToken += 1;
  clearStatusTimer();
  clearReplenishmentTimer();
  clearHintUnlockTimer();
  clearSupplyDecisionTimer();
  clearReplenishmentRequestTimer();
  clearReplenishmentCountdown();
  clearEffectTimers();
  stopContinuousAI();
  stopLastSpurtBgm();
  clearCharacterEvents();
  if (devStatus) {
    delete devStatus.dataset.operatorReaction;
    delete devStatus.dataset.replenishmentMood;
    delete devStatus.dataset.characterActor;
    delete devStatus.dataset.characterEvent;
    delete devStatus.dataset.shortageType;
    delete devStatus.dataset.lineCount;
  }
  stopFeedbackDisplay();
  hideAllEffects();
  delete document.body.dataset.lastSpurt;
  isPaused = false;
  isExitConfirmOpen = false;
  isCountdownActive = false;
  isReplenishmentRequestActive = false;
  replenishmentRequestDeadline = 0;
  pausedPhaseBeforeMenu = "idle";
  activeFlowType = null;
  activeFlowJudgement = null;
  supplyLocked = false;
  supplyPhase = "idle";
  setGameState("title", `returnToTitle:${source}`);
  renderTitleScreen();
  showScreen("title");
};

clearRestartButton?.addEventListener("click", () => startTraining("stageclear-restart", currentStageId));
clearNextButton?.addEventListener("click", () => {
  const nextStageId = getNextStageId();
  if (nextStageId !== currentStageId) {
    startTraining("stageclear-next", nextStageId);
  }
});
gameOverRestartButton?.addEventListener("click", () => startTraining("gameover-restart"));

document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    switch (button.dataset.action) {
      case "open-stage":
        openStageScreen();
        break;
      case "open-rules":
        openRulesScreen("title");
        break;
      case "rules-stage":
        openStageScreen();
        break;
      case "open-rules-from-pause":
        openRulesScreen("pause");
        break;
      case "start-training":
        startTraining("start-training", DEFAULT_STAGE_ID);
        break;
      case "start-stage":
        startTraining("start-stage", (button.dataset.stageId as StageId) ?? "stage1");
        break;
      case "open-records":
        openRecordsScreen();
        break;
      case "back-title":
        openTitleScreen();
        break;
      case "back-rules":
        closeRulesScreen();
        break;
      case "return-title":
        returnToTitle("title-screen");
        break;
      case "pause-game":
        pauseGame();
        break;
      case "resume-game":
        resumeGame();
        break;
      case "restart-from-pause":
        restartFromMenu();
        break;
      case "title-from-pause":
        returnToTitle("pause-menu");
        break;
      case "open-exit-confirm":
        openExitConfirm();
        break;
      case "confirm-exit":
        confirmExitToTitle();
        break;
      case "cancel-exit":
        cancelExitConfirm();
        break;
      case "reset-save":
        if (window.confirm("本当に削除しますか？")) {
          saveData = saveManager.reset();
          renderRecordsScreen();
          renderTitleScreen();
        }
        break;
    }
  });
});

window.addEventListener("keydown", (event) => {
  if (!developmentControlsEnabled) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    runAction("left");
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    runAction("right");
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    runAction("rotate");
  }

  if (event.code === "Space") {
    event.preventDefault();
    runAction("drop");
  }
});

const initialSnapshot = engine.getSnapshot();
placementAI.updateDesiredPiece(initialSnapshot.cells);
renderBoard(initialSnapshot);
openTitleScreen();
