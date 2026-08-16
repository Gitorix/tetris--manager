import { MistakeAI, type MistakePlacement } from "./ai/MistakeAI";
import { analyzeBoard, type BoardDiagnostics } from "./Game/BoardDiagnostics";
import type { BoardCell, BoardPosition } from "./Game/Board";
import { TetrisEngine, type TetrisSnapshot } from "./Game/TetrisEngine";
import { TETROMINO_ORDER, type TetrominoType } from "./Game/Tetromino";
import asutonUrl from "../asuton.png";
import mintonUrl from "../minton.png";
import mistonUrl from "../miston.png";

const rulebookGameplayUrl = `${import.meta.env.BASE_URL}rulebook/gameplay-live.png`;
const rulebookAnalysisUrl = `${import.meta.env.BASE_URL}rulebook/priority-analysis.png`;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element was not found.");
}

type StageConfig = {
  id: number;
  name: string;
  targetLines: number;
  fallStepMs: number;
  turnGapMs: number;
  mistakeSeverity: number;
  initialRows: readonly string[];
};

const STAGES: StageConfig[] = [
  { id: 1, name: "復旧研修 01", targetLines: 10, fallStepMs: 88, turnGapMs: 1320, mistakeSeverity: 0.64, initialRows: ["II..OO..TT", "....O....."] },
  { id: 2, name: "復旧現場 02", targetLines: 14, fallStepMs: 70, turnGapMs: 1020, mistakeSeverity: 0.75, initialRows: ["LL..OO..JJ", ".L..O...J.", "....T....."] },
  { id: 3, name: "復旧現場 03", targetLines: 16, fallStepMs: 57, turnGapMs: 860, mistakeSeverity: 0.84, initialRows: ["SS..OO..ZZ", ".SS..O..ZZ", "....TTT...", ".....T...."] },
  { id: 4, name: "復旧現場 04", targetLines: 18, fallStepMs: 46, turnGapMs: 720, mistakeSeverity: 0.91, initialRows: ["LL..OO..JJ", ".L..O...J.", "..L...TT..", "...S..T...", "....SS...."] },
  { id: 5, name: "復旧現場 05", targetLines: 20, fallStepMs: 37, turnGapMs: 590, mistakeSeverity: 0.96, initialRows: ["ZZ..OO..SS", ".ZZ.OO.SS.", "LL..T...JJ", ".L.TTT...J", "..L..I....", "....I....."] },
  { id: 6, name: "復旧現場 06", targetLines: 24, fallStepMs: 30, turnGapMs: 480, mistakeSeverity: 0.99, initialRows: ["JJ..OO..LL", ".J..OO...L", ".J.TTT.L..", "...T.SS...", "....SS....", "....Z....."] },
  { id: 7, name: "復旧現場 07", targetLines: 28, fallStepMs: 24, turnGapMs: 390, mistakeSeverity: 1, initialRows: ["ZZ..OO..SS", ".ZZ.OO.SS.", "LL..TT..JJ", ".L.TTT...J", "..L...I...", "....III...", ".....I...."] },
];
const STAGE_STORAGE_KEY = "tetris-manager-unlocked-stage-v1";
const ANALYSIS_MS = 2000;
const TOAST_MS = 1800;
const FLASH_MS = 480;
const MAX_SPECIAL_GAUGE = 100;
const EARLY_STAGE_REPAIR_MATERIAL_LIMIT = 3;
const SPECIAL_GAUGE_GAIN_MULTIPLIER = 0.5;

type Screen = "title" | "stage" | "game" | "settings" | "rulebook";
type Skill = "remove" | "rebuild" | "analysis" | "delivery" | "special";
type CharacterId = "miston" | "minton" | "asuton";

type GameSettings = {
  vibration: boolean;
  sound: boolean;
  highContrast: boolean;
  largeText: boolean;
};

const SETTINGS_STORAGE_KEY = "tetris-manager-settings-v1";
const defaultSettings: GameSettings = {
  vibration: true,
  sound: true,
  highContrast: false,
  largeText: false,
};

const readSettings = (): GameSettings => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as Partial<GameSettings>;
    return { ...defaultSettings, ...saved };
  } catch {
    return { ...defaultSettings };
  }
};

const settings = readSettings();

type OperatorState = {
  screen: Screen;
  playing: boolean;
  paused: boolean;
  gameOver: boolean;
  cleared: boolean;
  turn: number;
  lines: number;
  managementChain: number;
  recoveryWindow: number;
  specialGauge: number;
  repairMaterials: number;
  deliveryCooldown: number;
  currentStageId: number;
  selectedSkill: Skill | null;
  analysisActive: boolean;
  analysisSpecialReady: boolean;
  analysisTargets: BoardPosition[];
  activePlan: MistakePlacement | null;
  nextType: TetrominoType;
  toast: string;
  toastTone: "info" | "good" | "warn";
  activeCharacter: CharacterId | null;
  characterMessage: string;
  skillEffect: { label: string; position: { x: number; y: number } } | null;
  specialImpact: { removed: { x: number; y: number }[]; patched: { x: number; y: number }[] } | null;
};

const engine = new TetrisEngine();
const mistakeAI = new MistakeAI();
const state: OperatorState = {
  screen: "title",
  playing: false,
  paused: false,
  gameOver: false,
  cleared: false,
  turn: 0,
  lines: 0,
  managementChain: 0,
  recoveryWindow: 0,
  specialGauge: 0,
  repairMaterials: 0,
  deliveryCooldown: 0,
  currentStageId: 1,
  selectedSkill: null,
  analysisActive: false,
  analysisSpecialReady: false,
  analysisTargets: [],
  activePlan: null,
  nextType: "T",
  toast: "現場を選んでください",
  toastTone: "info",
  activeCharacter: null,
  characterMessage: "",
  skillEffect: null,
  specialImpact: null,
};

let aiTurnTimer: number | null = null;
let dropTimer: number | null = null;
let toastTimer: number | null = null;
let analysisTimer: number | null = null;
let flashTimer: number | null = null;
let characterTimer: number | null = null;
let burstTimer: number | null = null;
let skillEffectTimer: number | null = null;
let specialImpactTimer: number | null = null;
let progressWatchdogTimer: number | null = null;
let pieceBag: TetrominoType[] = [];

const readUnlockedStage = () => {
  const value = Number(window.localStorage.getItem(STAGE_STORAGE_KEY));
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), STAGES.length) : 1;
};

let unlockedStageId = readUnlockedStage();

const currentStage = () => STAGES.find((stage) => stage.id === state.currentStageId) ?? STAGES[0];
const maxRepairMaterials = () => EARLY_STAGE_REPAIR_MATERIAL_LIMIT;

const createInitialBoard = (stage: StageConfig): BoardCell[][] => {
  const cells: BoardCell[][] = Array.from({ length: 20 }, () => Array<BoardCell>(10).fill(null));
  stage.initialRows.forEach((row, rowFromBottom) => {
    if (row.length !== 10) throw new Error(`Invalid initial row for ${stage.name}.`);
    [...row].forEach((symbol, x) => {
      if (symbol !== ".") cells[19 - rowFromBottom][x] = symbol as TetrominoType;
    });
  });
  return cells;
};

const getPriorityRemovalTargets = (cells: BoardCell[][]): BoardPosition[] => {
  const topBlocks: BoardPosition[] = [];
  for (let x = 0; x < 10; x += 1) {
    const y = cells.findIndex((row) => row[x] !== null);
    if (y >= 0) topBlocks.push({ x, y });
  }

  return topBlocks
    .sort((a, b) => a.y - b.y || Math.abs(a.x - 4.5) - Math.abs(b.x - 4.5) || a.x - b.x)
    .slice(0, 3);
};

const unlockStage = (stageId: number) => {
  unlockedStageId = Math.max(unlockedStageId, Math.min(stageId, STAGES.length));
  window.localStorage.setItem(STAGE_STORAGE_KEY, String(unlockedStageId));
};

const iconCells: Record<TetrominoType, number[]> = {
  I: [4, 5, 6, 7],
  O: [1, 2, 5, 6],
  T: [1, 4, 5, 6],
  L: [0, 1, 2, 4],
  J: [0, 1, 2, 6],
  S: [1, 2, 4, 5],
  Z: [0, 1, 5, 6],
};

const getTetrominoIcon = (type: TetrominoType) => `
  <span class="mini-tetromino" data-block="${type}" aria-hidden="true">
    ${iconCells[type]
      .map((index) => `<i style="grid-column:${(index % 4) + 1};grid-row:${Math.floor(index / 4) + 1}"></i>`)
      .join("")}
  </span>
`;

const screens = () => Array.from(app.querySelectorAll<HTMLElement>("[data-screen]"));
const boardGrid = () => app.querySelector<HTMLElement>("[data-board-grid]");
const boardFrame = () => app.querySelector<HTMLElement>("[data-board-frame]");

const initialMarkup = `
  <main class="manager-two" data-manager-two>
    <section class="m2-screen m2-title-screen" data-screen="title">
      <div class="m2-title-grid" aria-hidden="true"></div>
      <div class="m2-title-content">
        <span class="m2-kicker">MANAGER ACTION PUZZLE</span>
        <h1><span class="m2-title-tetris">テトリス</span><span class="m2-title-name">の管理人</span></h1>
        <p>AIが作る現場の乱れを、管理人の判断で復旧せよ。</p>
        <div class="m2-title-crew" aria-label="管理人チーム">
          <figure><img src="${mistonUrl}" alt="ミストン" /><figcaption>ミストン</figcaption></figure>
          <figure><img src="${mintonUrl}" alt="ミントン" /><figcaption>ミントン</figcaption></figure>
          <figure><img src="${asutonUrl}" alt="アストン" /><figcaption>アストン</figcaption></figure>
        </div>
        <button class="m2-primary-button" type="button" data-action="open-stage">現場へ入る</button>
        <button class="m2-title-action-link" type="button" data-action="open-rulebook">ルールブック</button>
        <button class="m2-settings-link" type="button" data-action="open-settings">設定</button>
        <span class="m2-title-note">Prototype 1 / AIのミスを復旧する管理アクションパズル</span>
      </div>
    </section>

    <section class="m2-screen m2-settings-screen" data-screen="settings" hidden aria-label="設定">
      <div class="m2-settings-content">
        <button class="m2-back-button" type="button" data-action="close-settings">戻る</button>
        <span class="m2-kicker">OPERATION SETTINGS</span>
        <h2>設定</h2>
        <p>現場で使う演出と見やすさを調整します。</p>
        <section class="m2-settings-card" aria-labelledby="settings-feedback-title">
          <h3 id="settings-feedback-title">フィードバック</h3>
          <label class="m2-setting-row"><span><b>バイブレーション</b><small>対応端末で、ライン消去・スキル成功・必殺技時に振動します</small></span><input type="checkbox" data-setting="vibration" role="switch" /></label>
          <label class="m2-setting-row"><span><b>効果音</b><small>操作と現場復旧の短い効果音</small></span><input type="checkbox" data-setting="sound" role="switch" /></label>
        </section>
        <section class="m2-settings-card" aria-labelledby="settings-display-title">
          <h3 id="settings-display-title">表示</h3>
          <label class="m2-setting-row"><span><b>高コントラスト</b><small>盤面と操作対象の輪郭を強調</small></span><input type="checkbox" data-setting="highContrast" role="switch" /></label>
          <label class="m2-setting-row"><span><b>文字を大きくする</b><small>操作説明と状態表示を拡大</small></span><input type="checkbox" data-setting="largeText" role="switch" /></label>
        </section>
        <button class="m2-primary-button" type="button" data-action="close-settings">設定を閉じる</button>
      </div>
    </section>

    <section class="m2-screen m2-stage-screen" data-screen="stage" hidden>
      <div class="m2-stage-content">
        <button class="m2-back-button" type="button" data-action="show-title">タイトルへ戻る</button>
        <button class="m2-stage-rulebook-link" type="button" data-action="open-rulebook">ルールブックを見る</button>
        <span class="m2-kicker">PROTOTYPE 1</span>
        <h2>現場を選ぶ</h2>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="1">
          <span class="m2-stage-card-top">TRAINING SITE</span>
          <strong>復旧研修 01</strong>
          <span>目標: 10ライン消去</span>
          <small>AIの穴・段差を見極め、管理スキルで立て直す。</small>
          <b>開始する</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="2" data-locked-stage="2">
          <span class="m2-stage-card-top">RECOVERY SITE</span>
          <strong>復旧現場 02</strong>
          <span>目標: 14ライン消去 / AI高速</span>
          <small>ミスの頻度が増加。ミントンの資材搬入も使い、連鎖を維持する。</small>
          <b data-stage-lock-label>研修クリアで解放</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="3" data-locked-stage="3">
          <span class="m2-stage-card-top">RECOVERY SITE</span>
          <strong>復旧現場 03</strong>
          <span>目標: 16ライン消去 / AI加速</span>
          <small>より短い間隔で崩れが発生。資材と必殺技を計画的に使う現場です。</small>
          <b data-stage-lock-label>前現場クリアで解放</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="4" data-locked-stage="4">
          <span class="m2-stage-card-top">RECOVERY SITE</span>
          <strong>復旧現場 04</strong>
          <span>目標: 18ライン消去 / 危険配置増加</span>
          <small>AIの失敗が明確に悪化。穴と段差を先回りして整えます。</small>
          <b data-stage-lock-label>前現場クリアで解放</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="5" data-locked-stage="5">
          <span class="m2-stage-card-top">RECOVERY SITE</span>
          <strong>復旧現場 05</strong>
          <span>目標: 20ライン消去 / 緊急現場</span>
          <small>高速かつ連続するAIの悪手を、チーム全員で復旧する最終研修です。</small>
          <b data-stage-lock-label>前現場クリアで解放</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="6" data-locked-stage="6">
          <span class="m2-stage-card-top">RECOVERY SITE</span>
          <strong>復旧現場 06</strong>
          <span>目標: 24ライン消去 / 超高速</span>
          <small>初期崩壊が深く、AIの悪手も連続します。分析と緊急復旧工事を切らさず使う現場です。</small>
          <b data-stage-lock-label>前現場クリアで解放</b>
        </button>
        <button class="m2-stage-card" type="button" data-action="start-game" data-stage-id="7" data-locked-stage="7">
          <span class="m2-stage-card-top">CRITICAL RECOVERY SITE</span>
          <strong>復旧現場 07</strong>
          <span>目標: 28ライン消去 / 極限現場</span>
          <small>最速のAIと最大級の初期崩壊に対処する最終現場です。復旧の順番が勝敗を分けます。</small>
          <b data-stage-lock-label>前現場クリアで解放</b>
        </button>
        <p class="m2-stage-footnote">ミストン: 撤去 / 再施工　ミントン: 資材搬入　アストン: 優先撤去分析</p>
      </div>
    </section>

    <section class="m2-screen m2-rulebook-screen" data-screen="rulebook" hidden aria-label="現場復旧ルールブック">
      <div class="m2-rulebook-content">
        <header class="m2-rulebook-header">
          <button class="m2-back-button" type="button" data-action="show-title">タイトルへ戻る</button>
          <span class="m2-kicker">FIELD MANUAL</span>
          <h2>現場復旧ルールブック</h2>
          <p>AIの悪手を見つけ、チームの力で盤面を整えます。</p>
          <button class="m2-primary-button" type="button" data-action="open-stage">現場を選ぶ</button>
        </header>

        <section class="m2-rulebook-live" aria-labelledby="rulebook-live-title">
          <div class="m2-rulebook-copy">
            <span class="m2-kicker">LIVE OPERATION</span>
            <h3 id="rulebook-live-title">プレイヤーはテトリスミノを動かさない</h3>
            <ol class="m2-rulebook-flow">
              <li><b>1</b><span><strong>AIが積む</strong> 下手な配置で穴や段差を作ります。</span></li>
              <li><b>2</b><span><strong>現場を見極める</strong> 崩れそうな場所を優先します。</span></li>
              <li><b>3</b><span><strong>スキルで整える</strong> 1列そろえて消去を目指します。</span></li>
            </ol>
          </div>
          <figure class="m2-rulebook-shot">
            <img src="${rulebookGameplayUrl}" alt="実際のプレイ中の盤面と管理スキル" />
            <figcaption>実際のプレイ画面: 盤面を見ながら下のチーム操作を使います。</figcaption>
          </figure>
        </section>

        <section class="m2-rulebook-section" aria-labelledby="rulebook-controls-title">
          <div class="m2-rulebook-section-heading">
            <span class="m2-kicker">HOW TO OPERATE</span>
            <h3 id="rulebook-controls-title">実際の操作方法</h3>
          </div>
          <div class="m2-rulebook-controls-grid">
            <article>
              <div class="m2-rulebook-control-visual" aria-hidden="true"><span class="m2-rulebook-demo-button is-remove">撤去</span><i>→</i><span class="m2-rulebook-demo-mode">連続モード</span></div>
              <b>1. スキルを選ぶ</b><p>画面下の <strong>撤去</strong> または <strong>再施工</strong> を押すと、連続操作モードになります。</p>
            </article>
            <article>
              <div class="m2-rulebook-control-visual" aria-hidden="true"><span class="m2-rulebook-demo-cell is-block"></span><i>タップ</i><span class="m2-rulebook-demo-material">補修材 +1</span></div>
              <b>2. 盤面をタップ</b><p><strong>撤去</strong>は上に何もないブロックだけ。1つ消すごとに補修材を1つ回収します。</p>
            </article>
            <article>
              <div class="m2-rulebook-control-visual" aria-hidden="true"><span class="m2-rulebook-demo-material is-cost">補修材 -1</span><i>→</i><span class="m2-rulebook-demo-cell is-repair"></span></div>
              <b>3. 補修材で埋める</b><p><strong>再施工</strong>で、下に支えがある空マスをタップ。補修材1つを消費して仮設ブロックを置きます。</p>
            </article>
            <article>
              <div class="m2-rulebook-control-visual" aria-hidden="true"><span class="m2-rulebook-demo-button is-rebuild">再施工</span><i>もう一度</i><span class="m2-rulebook-demo-mode is-off">通常状態</span></div>
              <b>4. モードを終える</b><p>選択中の <strong>撤去</strong> / <strong>再施工</strong> をもう一度押すと、通常状態へ戻ります。</p>
            </article>
          </div>
          <p class="m2-rulebook-note"><b>補修材とは:</b> 撤去したテトリスミノを、別の場所へ再施工するための資材です。最大3個まで貯められます。</p>
          <section class="m2-rulebook-invalid-section" aria-labelledby="rulebook-invalid-title">
            <h4 id="rulebook-invalid-title">操作できない場所もあります</h4>
            <div class="m2-rulebook-invalid-grid">
              <article>
                <div class="m2-operation-diagram m2-operation-diagram-remove" role="img" aria-label="上にテトリスミノがある下のブロックは撤去できず、上のブロックから撤去する図">
                  <div class="m2-operation-board">
                    <i class="m2-operation-cell is-piece is-first" style="--x:3;--y:2" data-label="先"></i>
                    <i class="m2-operation-cell is-piece" style="--x:3;--y:3"></i><i class="m2-operation-cell is-piece" style="--x:4;--y:3"></i>
                    <i class="m2-operation-cell is-piece is-blocked" style="--x:3;--y:4" data-label="×"></i><i class="m2-operation-cell is-piece" style="--x:4;--y:4"></i>
                    <i class="m2-operation-floor" style="--x:1"></i><i class="m2-operation-floor" style="--x:2"></i><i class="m2-operation-floor" style="--x:3"></i><i class="m2-operation-floor" style="--x:4"></i><i class="m2-operation-floor" style="--x:5"></i><i class="m2-operation-floor" style="--x:6"></i>
                  </div>
                  <div class="m2-operation-diagram-legend"><span class="is-good">上から順に撤去</span><b>→</b><span class="is-bad">下の×は後</span></div>
                </div>
                <p><b>撤去不可:</b> 上にテトリスミノがあるブロックは押せません。<strong>いちばん上のマス</strong>から撤去します。</p>
              </article>
              <article>
                <div class="m2-operation-diagram m2-operation-diagram-rebuild" role="img" aria-label="床かテトリスミノに支えられた空マスには再施工でき、空中のマスには再施工できない図">
                  <div class="m2-operation-board">
                    <i class="m2-operation-target is-invalid" style="--x:5;--y:1" data-label="×"></i>
                    <i class="m2-operation-target is-valid" style="--x:3;--y:3" data-label="✓"></i>
                    <i class="m2-operation-cell is-piece" style="--x:3;--y:4"></i><i class="m2-operation-cell is-piece" style="--x:4;--y:4"></i>
                    <i class="m2-operation-floor" style="--x:1"></i><i class="m2-operation-floor" style="--x:2"></i><i class="m2-operation-floor" style="--x:3"></i><i class="m2-operation-floor" style="--x:4"></i><i class="m2-operation-floor" style="--x:5"></i><i class="m2-operation-floor" style="--x:6"></i>
                  </div>
                  <div class="m2-operation-diagram-legend"><span class="is-good">✓ ブロックの真上: 置ける</span><b>／</b><span class="is-bad">× 空中: 置けない</span></div>
                </div>
                <p><b>再施工不可:</b> 下が空のマスには置けません。<strong>床やテトリスミノの真上</strong>を選びます。</p>
              </article>
            </div>
          </section>
        </section>

        <section class="m2-rulebook-section" aria-labelledby="rulebook-skills-title">
          <div class="m2-rulebook-section-heading">
            <span class="m2-kicker">TEAM SKILLS</span>
            <h3 id="rulebook-skills-title">3人の役割</h3>
          </div>
          <div class="m2-rulebook-skill-grid">
            <article class="m2-rulebook-skill m2-rulebook-skill-miston">
              <img src="${mistonUrl}" alt="ミストン" />
              <div><span>ミストン</span><h4>撤去 / 再施工</h4><p>撤去は表面のテトリスミノを1つ消し、補修材を回収。再施工は補修材1つで、支えのある空マスを埋めます。</p></div>
            </article>
            <article class="m2-rulebook-skill m2-rulebook-skill-minton">
              <img src="${mintonUrl}" alt="ミントン" />
              <div><span>ミントン</span><h4>資材搬入</h4><p>補修材を2つ追加します。再施工の回数を増やせる、立て直しの準備役です。</p></div>
            </article>
            <article class="m2-rulebook-skill m2-rulebook-skill-astun">
              <img src="${asutonUrl}" alt="アストン" />
              <div><span>アストン</span><h4>優先撤去分析</h4><p>AIを2秒止め、優先箇所を最大3つ光らせます。この間の必殺技は、光った3つだけを撤去します。</p></div>
            </article>
            <article class="m2-rulebook-skill m2-rulebook-skill-special">
              <div class="m2-rulebook-special-mark">100%</div>
              <div><span>必殺技</span><h4>緊急復旧工事</h4><p>通常は露出ブロックを最大4つ撤去。分析直後は、アストンが光らせた最大3つだけを確実に撤去します。穴は最大2つ仮設補修します。</p></div>
            </article>
          </div>
        </section>

        <section class="m2-rulebook-analysis" aria-labelledby="rulebook-analysis-title">
          <figure class="m2-rulebook-shot m2-rulebook-analysis-shot">
            <img src="${rulebookAnalysisUrl}" alt="優先撤去分析で危険なブロックが光る実際の画面" />
            <figcaption>優先撤去分析: 光ったブロックから触ると判断しやすくなります。</figcaption>
          </figure>
          <div class="m2-rulebook-analysis-copy">
            <span class="m2-kicker">BOARD READING</span>
            <h3 id="rulebook-analysis-title">最初に見る3つ</h3>
            <dl>
              <div><dt>穴</dt><dd>下が空いた場所。再施工で埋める候補です。</dd></div>
              <div><dt>段差</dt><dd>高い山は危険。撤去で低く整えます。</dd></div>
              <div><dt>補修材</dt><dd>撤去で回収する再施工用の資材。最大3個、0ならミントンの資材搬入を使います。</dd></div>
            </dl>
          </div>
        </section>

        <section class="m2-rulebook-special-compare" aria-labelledby="rulebook-special-compare-title">
          <div class="m2-rulebook-section-heading">
            <span class="m2-kicker">ASTON + SPECIAL</span>
            <h3 id="rulebook-special-compare-title">分析後の必殺技は、狙いを絞る</h3>
          </div>
          <div class="m2-rulebook-special-compare-grid">
            <article>
              <div class="m2-rulebook-special-diagram is-analysis" role="img" aria-label="アストンの分析で光った3つのブロックだけを必殺技で撤去する図">
                <span class="m2-special-diagram-label">分析直後</span>
                <div class="m2-special-diagram-blocks"><i></i><i></i><i></i></div>
                <b>光った3個を撤去</b>
              </div>
              <h4>アストン → 必殺技</h4>
              <p>分析中に発動すると、<strong>表示された優先箇所だけ最大3個</strong>を消します。狙いどおりに整えるための使い方です。</p>
            </article>
            <article>
              <div class="m2-rulebook-special-diagram is-normal" role="img" aria-label="分析なしで必殺技を使い、露出した4つのブロックを撤去する図">
                <span class="m2-special-diagram-label">通常</span>
                <div class="m2-special-diagram-blocks"><i></i><i></i><i></i><i></i></div>
                <b>露出4個を撤去</b>
              </div>
              <h4>必殺技のみ</h4>
              <p>分析を使わずに発動すると、<strong>露出したブロックを最大4個</strong>まとめて撤去します。崩壊を急いで止める使い方です。</p>
            </article>
          </div>
          <p class="m2-rulebook-note"><b>共通:</b> どちらも撤去後に、穴を最大2か所まで仮設補修します。</p>
        </section>

        <section class="m2-rulebook-section" aria-labelledby="rulebook-clear-title">
          <div class="m2-rulebook-section-heading">
            <span class="m2-kicker">CLEAR CONDITION</span>
            <h3 id="rulebook-clear-title">勝敗とステージ</h3>
          </div>
          <div class="m2-rulebook-rule-grid">
            <article><b>クリア</b><p>ステージごとの目標ラインを消去。</p></article>
            <article><b>ゲームオーバー</b><p>盤面の上まで積み上がると失敗です。</p></article>
            <article><b>次の現場</b><p>クリアすると次のステージが解放されます。</p></article>
          </div>
          <div class="m2-rulebook-stage-strip" aria-label="ステージの難易度">
            ${STAGES.map((stage) => `<span><b>${stage.id}</b><i>${stage.id === 1 ? "研修" : "現場"}</i></span>`).join("")}
            <p>後半ほどAIが速く、初期の崩れと悪手も増えます。</p>
          </div>
        </section>

        <footer class="m2-rulebook-footer">
          <button class="m2-primary-button" type="button" data-action="open-stage">現場を選ぶ</button>
          <p>迷ったら、まず <b>分析</b> → <b>撤去</b> → <b>再施工</b> の順で整えましょう。</p>
        </footer>
      </div>
    </section>

    <section class="m2-screen m2-game-screen" data-screen="game" hidden aria-label="テトリスの管理人 II プレイ画面">
      <header class="m2-game-header">
        <button class="m2-header-button" type="button" data-action="pause-game" aria-label="一時停止">II</button>
        <div class="m2-header-summary">
          <span data-stage-name>復旧研修 01</span>
          <b data-header-summary>AI現場を監視中</b>
        </div>
        <button class="m2-header-button" type="button" data-action="exit-game" aria-label="現場を出る">EXIT</button>
      </header>

      <div class="m2-play-layout">
        <aside class="m2-side-readout" aria-label="現場情報">
          <div><span>消去ライン</span><b data-lines>0 / 10</b></div>
          <div><span>現場危険度</span><b data-danger-value>0</b><i data-danger-label>安全</i></div>
          <div><span>管理連鎖</span><b data-chain>--</b></div>
        </aside>

        <section class="m2-board-frame" data-board-frame aria-label="AIプレイ盤面">
          <div class="m2-board-grid" data-board-grid role="grid" aria-label="10列20行の現場盤面">
            ${Array.from({ length: 200 }, (_, index) => {
              const x = index % 10;
              const y = Math.floor(index / 10);
              return `<button type="button" class="m2-board-cell" data-board-cell data-x="${x}" data-y="${y}" aria-label="${y + 1}行 ${x + 1}列"></button>`;
            }).join("")}
          </div>
          <section class="m2-board-overlay" aria-live="polite">
            <div class="m2-overlay-head">
              <span data-ai-state>AI 自動配置中</span>
              <span class="m2-next-piece">NEXT ${getTetrominoIcon("T")}</span>
            </div>
            <strong data-issue-title>現場を監視しています</strong>
            <span data-issue-description>穴・段差・偏りを見つけたら、管理スキルで介入してください。</span>
            <div class="m2-danger-strip"><i data-danger-fill></i></div>
            <span class="m2-board-toast" data-toast data-tone="info">現場を選んでください</span>
          </section>
          <div class="m2-analysis-layer" data-analysis-layer hidden aria-hidden="true"></div>
          <div class="m2-clear-burst" data-clear-burst hidden>現場復旧！</div>
          <div class="m2-skill-flash" data-skill-flash hidden aria-hidden="true"></div>
          <section class="m2-result-modal" data-result-modal hidden aria-live="assertive"></section>
          <section class="m2-pause-modal" data-pause-modal hidden>
            <strong>一時停止</strong>
            <button type="button" data-action="resume-game">再開</button>
            <button type="button" data-action="open-settings">設定</button>
            <button type="button" data-action="restart-game">やり直す</button>
            <button type="button" data-action="exit-game">タイトルへ戻る</button>
          </section>
        </section>

        <aside class="m2-operator-panel" aria-label="管理人チーム">
          <div class="m2-operator-copy" data-character-copy>アストン: 現場を監視中です。</div>
          <div class="m2-crew-row">
            <article class="m2-character-card" data-character="miston">
              <img src="${mistonUrl}" alt="ミストン" />
              <div><b>ミストン</b><span>現場補修</span><em class="m2-miston-callout" data-miston-callout>様子見</em><small class="m2-material-stock">補修材 <i data-repair-pips></i><strong data-repair-count>×0</strong></small></div>
              <div class="m2-skill-actions">
                <button type="button" data-skill="remove">撤去</button>
                <button type="button" data-skill="rebuild">再施工</button>
              </div>
            </article>
            <article class="m2-character-card" data-character="minton">
              <img src="${mintonUrl}" alt="ミントン" />
              <div><b>ミントン</b><span>資材搬入</span><em class="m2-minton-callout" data-minton-callout>資材待機</em></div>
              <button type="button" data-skill="delivery" data-delivery-button>資材搬入</button>
            </article>
            <article class="m2-character-card" data-character="asuton">
              <img src="${asutonUrl}" alt="アストン" />
              <div><b>アストン</b><span>優先撤去分析</span></div>
              <button type="button" data-skill="analysis">撤去分析</button>
            </article>
          </div>
          <button class="m2-special-button" type="button" data-skill="special" disabled>
            <span>緊急復旧工事</span>
            <i><b data-special-gauge></b></i>
            <strong data-special-label>緊急復旧工事 0%</strong>
            <em data-special-detail>100%で露出4撤去 + 穴2仮設補修</em>
          </button>
        </aside>
      </div>
      <p class="m2-action-guide" data-action-guide>ミストンのスキルを選び、盤面の対象マスをタップしてください。</p>
    </section>
  </main>
`;

const setScreen = (screen: Screen) => {
  state.screen = screen;
  screens().forEach((element) => {
    element.hidden = element.dataset.screen !== screen;
  });
};

const applySettings = () => {
  const root = app.querySelector<HTMLElement>("[data-manager-two]");
  root?.toggleAttribute("data-high-contrast", settings.highContrast);
  root?.toggleAttribute("data-large-text", settings.largeText);
  app.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    input.checked = settings[input.dataset.setting as keyof GameSettings];
  });
};

const saveSettings = () => {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  applySettings();
};

const shuffle = <T,>(items: T[]): T[] => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const nextPiece = () => {
  if (pieceBag.length === 0) pieceBag = shuffle([...TETROMINO_ORDER]);
  return pieceBag.pop() ?? "T";
};

const clearTimer = (timer: number | null) => {
  if (timer !== null) window.clearTimeout(timer);
};

const stopGameTimers = () => {
  clearTimer(aiTurnTimer);
  clearTimer(dropTimer);
  clearTimer(analysisTimer);
  clearTimer(flashTimer);
  clearTimer(burstTimer);
  clearTimer(skillEffectTimer);
  clearTimer(specialImpactTimer);
  if (progressWatchdogTimer !== null) window.clearInterval(progressWatchdogTimer);
  aiTurnTimer = null;
  dropTimer = null;
  analysisTimer = null;
  flashTimer = null;
  burstTimer = null;
  skillEffectTimer = null;
  specialImpactTimer = null;
  progressWatchdogTimer = null;
};

type FeedbackKind = "small" | "medium" | "big" | "special";

const requestVibration = (pattern: number | number[]) => {
  if (!settings.vibration || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(pattern);
};

const feedback = (kind: FeedbackKind) => {
  const patterns: Record<typeof kind, number | number[]> = {
    small: 15,
    medium: [20, 30, 20],
    big: [28, 32, 28, 42],
    special: [45, 55, 70, 80],
  };
  requestVibration(patterns[kind]);

  if (!settings.sound) return;

  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const config = kind === "special" ? [240, 880, 0.07] : kind === "big" ? [430, 980, 0.06] : [560, 760, 0.04];
  oscillator.frequency.setValueAtTime(config[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(config[1], now + config[2]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config[2]);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + config[2] + 0.02);
};

const showToast = (message: string, tone: OperatorState["toastTone"] = "info", duration = TOAST_MS) => {
  state.toast = message;
  state.toastTone = tone;
  clearTimer(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, duration);
};

const speak = (character: CharacterId, message: string, duration = 1900) => {
  state.activeCharacter = character;
  state.characterMessage = message;
  clearTimer(characterTimer);
  characterTimer = window.setTimeout(() => {
    state.activeCharacter = null;
    state.characterMessage = "";
    render();
  }, duration);
};

const getIssueCopy = (plan: MistakePlacement | null) => {
  if (!plan) return ["現場を監視しています", "AIの配置を見ながら、崩れた場所だけに介入してください。"];
  switch (plan.issue) {
    case "hole": return ["穴が残りそうです", "撤去で補修材を回収し、再施工で次の消去につながる足場を作れます。"];
    case "step": return ["段差が広がっています", "表面の邪魔ブロックを撤去して、AIが置き直せる形に。"];
    case "bias": return ["片側へ偏っています", "今すぐ直すか、AIの次手に任せるかを判断してください。"];
    case "tunnel": return ["深い詰まりを確認", "優先撤去分析で露出した危険ブロックを確認してから、無駄なく介入しましょう。"];
    default: return ["AIが持ち直しています", "今は待つ判断も、立派な管理です。"];
  }
};

const getMistonCue = (plan: MistakePlacement | null, diagnostics: BoardDiagnostics) => {
  if (plan?.issue === "hole" || plan?.issue === "tunnel") return "出番: 撤去→再施工";
  if (plan?.issue === "step") return "出番: 段差を撤去";
  if (diagnostics.level === "emergency" || diagnostics.level === "collapse") return "出番: 緊急復旧工事";
  if (state.repairMaterials > 0 && diagnostics.holePositions.length > 0) return "出番: 穴を再施工";
  return "様子見";
};

const getMintonCue = () => {
  if (state.deliveryCooldown > 0) return `搬入準備 ${state.deliveryCooldown}手`;
  if (state.repairMaterials <= 2) return "出番: 資材搬入";
  return "資材待機";
};

const renderStageSelection = () => {
  app.querySelectorAll<HTMLButtonElement>("[data-locked-stage]").forEach((button) => {
    const stageId = Number(button.dataset.lockedStage);
    const unlocked = stageId <= unlockedStageId;
    button.disabled = !unlocked;
    button.dataset.locked = unlocked ? "false" : "true";
    const label = button.querySelector<HTMLElement>("[data-stage-lock-label]");
    if (label) label.textContent = unlocked ? "開始する" : "研修クリアで解放";
  });
};

const renderAnalysisLayer = (diagnostics: BoardDiagnostics) => {
  const layer = app.querySelector<HTMLElement>("[data-analysis-layer]");
  if (!layer) return;
  layer.hidden = !state.analysisActive;
  layer.innerHTML = state.analysisActive
    ? state.analysisTargets.map((position) => `<i style="--x:${position.x};--y:${position.y}"></i>`).join("")
    : "";
};

const render = () => {
  const snapshot = engine.getSnapshot();
  const diagnostics = analyzeBoard(snapshot.cells);
  const active = new Map(snapshot.activeCells.map((cell) => [`${cell.x},${cell.y}`, cell.type]));
  const cells = Array.from(app.querySelectorAll<HTMLElement>("[data-board-cell]"));
  cells.forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const fixed = snapshot.cells[y]?.[x] ?? null;
    const activeType = active.get(`${x},${y}`) ?? null;
    cell.dataset.block = activeType ?? fixed ?? "";
    cell.dataset.active = activeType ? "true" : "false";
    cell.dataset.hole = state.analysisActive && state.analysisTargets.some((position) => position.x === x && position.y === y) ? "true" : "false";
    cell.dataset.rebuildable = state.selectedSkill === "rebuild" && !fixed && !activeType && (y === 19 || snapshot.cells[y + 1]?.[x] !== null) ? "true" : "false";
    cell.dataset.effect = state.skillEffect?.position.x === x && state.skillEffect.position.y === y ? "true" : "false";
    cell.dataset.specialEffect = state.specialImpact?.removed.some((position) => position.x === x && position.y === y)
      ? "remove"
      : state.specialImpact?.patched.some((position) => position.x === x && position.y === y)
        ? "patch"
        : "";
    cell.setAttribute("aria-label", `${y + 1}行 ${x + 1}列${activeType ?? fixed ? ` ${activeType ?? fixed}` : ""}`);
  });

  boardFrame()?.setAttribute("data-danger", diagnostics.level);
  boardFrame()?.setAttribute("data-interaction", state.selectedSkill ?? "");
  const [issueTitle, issueDescription] = getIssueCopy(state.activePlan);
  const setText = (selector: string, text: string) => {
    const element = app.querySelector<HTMLElement>(selector);
    if (element) element.textContent = text;
  };
  setText("[data-lines]", `${state.lines} / ${currentStage().targetLines}`);
  setText("[data-stage-name]", currentStage().name);
  setText("[data-danger-value]", String(diagnostics.danger));
  setText("[data-danger-label]", ({ safe: "安全", caution: "注意", danger: "危険", emergency: "緊急", collapse: "崩壊寸前" } as const)[diagnostics.level]);
  setText("[data-chain]", state.managementChain > 1 ? `管理連鎖 x${state.managementChain}` : "待機");
  setText("[data-issue-title]", issueTitle);
  setText("[data-issue-description]", issueDescription);
  setText("[data-ai-state]", state.paused ? "AI 一時停止中" : snapshot.hasActiveTetromino ? "AI 配置中" : "AI 自動配置中");
  setText("[data-toast]", state.toast);
  setText("[data-header-summary]", state.cleared ? "現場復旧完了" : state.gameOver ? "現場が崩壊しました" : state.paused ? "作業を一時停止中" : "AIがプレイ継続中");
  setText("[data-action-guide]", state.selectedSkill === "remove" ? `連続撤去モード: 表面ブロックを続けてタップできます。補修材が${maxRepairMaterials()}個で上限です。` : state.selectedSkill === "rebuild" ? "連続再施工モード: 支えのある空きマスを続けてタップできます。補修材を使うと、再び撤去できます。" : "AIは止まりません。現場を見て、必要な時だけ管理スキルを使ってください。");

  const toast = app.querySelector<HTMLElement>("[data-toast]");
  if (toast) toast.dataset.tone = state.toastTone;
  const next = app.querySelector<HTMLElement>(".m2-next-piece");
  if (next) next.innerHTML = `NEXT ${getTetrominoIcon(state.nextType)}`;
  const fill = app.querySelector<HTMLElement>("[data-danger-fill]");
  if (fill) fill.style.width = `${diagnostics.danger}%`;
  const gauge = app.querySelector<HTMLElement>("[data-special-gauge]");
  if (gauge) gauge.style.width = `${state.specialGauge}%`;
  const label = app.querySelector<HTMLElement>("[data-special-label]");
  if (label) label.textContent = state.specialGauge >= MAX_SPECIAL_GAUGE ? "緊急復旧工事 READY - 発動できます" : `緊急復旧工事 ${state.specialGauge}%`;
  const specialButton = app.querySelector<HTMLButtonElement>("[data-skill='special']");
  if (specialButton) specialButton.disabled = !state.playing || state.paused || state.specialGauge < MAX_SPECIAL_GAUGE;
  setText("[data-special-detail]", state.analysisActive
    ? "分析連動: 光った最大3個を撤去 + 穴2仮設補修"
    : "通常: 露出4撤去 + 穴2仮設補修");
  const removeButton = app.querySelector<HTMLButtonElement>("[data-skill='remove']");
  if (removeButton) removeButton.disabled = !state.playing || state.paused || state.repairMaterials >= maxRepairMaterials();
  const rebuildButton = app.querySelector<HTMLButtonElement>("[data-skill='rebuild']");
  if (rebuildButton) rebuildButton.disabled = !state.playing || state.paused || state.repairMaterials <= 0;
  const deliveryButton = app.querySelector<HTMLButtonElement>("[data-delivery-button]");
  if (deliveryButton) deliveryButton.disabled = !state.playing || state.paused || state.deliveryCooldown > 0 || state.repairMaterials >= maxRepairMaterials();
  setText("[data-repair-count]", `×${state.repairMaterials}`);
  const repairPips = app.querySelector<HTMLElement>("[data-repair-pips]");
  if (repairPips) repairPips.innerHTML = Array.from({ length: maxRepairMaterials() }, (_, index) => `<i data-filled="${index < state.repairMaterials}"></i>`).join("");
  app.querySelectorAll<HTMLElement>("[data-skill]").forEach((button) => {
    button.dataset.selected = button.dataset.skill === state.selectedSkill ? "true" : "false";
  });
  app.querySelectorAll<HTMLElement>("[data-character]").forEach((card) => {
    card.dataset.active = card.dataset.character === state.activeCharacter ? "true" : "false";
  });
  const mistonCue = getMistonCue(state.activePlan, diagnostics);
  const mistonCard = app.querySelector<HTMLElement>("[data-character='miston']");
  if (mistonCard) mistonCard.dataset.ready = mistonCue !== "様子見" ? "true" : "false";
  setText("[data-miston-callout]", mistonCue);
  const mintonCue = getMintonCue();
  const mintonCard = app.querySelector<HTMLElement>("[data-character='minton']");
  if (mintonCard) mintonCard.dataset.ready = mintonCue.startsWith("出番") ? "true" : "false";
  setText("[data-minton-callout]", mintonCue);
  setText("[data-character-copy]", state.characterMessage || (mistonCue !== "様子見" ? `ミストン: ${mistonCue}` : mintonCue.startsWith("出番") ? `ミントン: ${mintonCue}` : "アストン: 現場を監視中です。"));
  const skillFlash = app.querySelector<HTMLElement>("[data-skill-flash]");
  if (skillFlash) {
    skillFlash.hidden = state.skillEffect === null;
    skillFlash.textContent = state.skillEffect?.label ?? "";
  }
  renderAnalysisLayer(diagnostics);
  renderResult();
  renderPause();
  renderStageSelection();
};

const renderResult = () => {
  const modal = app.querySelector<HTMLElement>("[data-result-modal]");
  if (!modal) return;
  modal.hidden = !state.cleared && !state.gameOver;
  if (modal.hidden) return;
  modal.innerHTML = state.cleared
    ? `<span>TRAINING COMPLETE</span><strong>${currentStage().name} 完了！</strong><p>${currentStage().targetLines}ラインを消去しました。管理連鎖の感覚を掴めています。</p><button type="button" data-action="restart-game">もう一度</button>${state.currentStageId < STAGES.length ? `<button type="button" data-action="next-stage">次の現場へ</button>` : ""}<button type="button" data-action="exit-game">現場を出る</button>`
    : `<span>SITE COLLAPSE</span><strong>現場崩壊</strong><p>危険度が限界に達しました。穴と段差を早めに整えて、AIが立て直せる状態へ戻しましょう。</p><button type="button" data-action="restart-game">再挑戦</button><button type="button" data-action="exit-game">現場を出る</button>`;
};

const renderPause = () => {
  const modal = app.querySelector<HTMLElement>("[data-pause-modal]");
  if (modal) modal.hidden = !state.paused;
};

const flashBoard = (kind: "clear" | "danger" | "special") => {
  const frame = boardFrame();
  if (!frame) return;
  frame.dataset.flash = kind;
  clearTimer(flashTimer);
  flashTimer = window.setTimeout(() => {
    delete frame.dataset.flash;
  }, FLASH_MS);
};

const showClearBurst = (message: string) => {
  const burst = app.querySelector<HTMLElement>("[data-clear-burst]");
  if (!burst) return;
  burst.textContent = message;
  burst.hidden = false;
  clearTimer(burstTimer);
  burstTimer = window.setTimeout(() => {
    burst.hidden = true;
  }, 820);
};

const showSkillEffect = (label: string, position: { x: number; y: number }) => {
  state.skillEffect = { label, position };
  clearTimer(skillEffectTimer);
  skillEffectTimer = window.setTimeout(() => {
    state.skillEffect = null;
    render();
  }, 650);
};

const showSpecialImpact = (removed: { x: number; y: number }[], patched: { x: number; y: number }[]) => {
  state.specialImpact = { removed, patched };
  clearTimer(specialImpactTimer);
  specialImpactTimer = window.setTimeout(() => {
    state.specialImpact = null;
    render();
  }, 1150);
};

const addGauge = (amount: number) => {
  state.specialGauge = Math.min(MAX_SPECIAL_GAUGE, state.specialGauge + Math.max(1, Math.round(amount * SPECIAL_GAUGE_GAIN_MULTIPLIER)));
};

const finishGame = (outcome: "clear" | "collapse") => {
  state.playing = false;
  state.paused = false;
  state.cleared = outcome === "clear";
  state.gameOver = outcome === "collapse";
  stopGameTimers();
  if (outcome === "clear") {
    unlockStage(state.currentStageId + 1);
    showToast("現場復旧完了！", "good", 2600);
    speak("miston", "ええ管理やったな。", 2400);
    feedback("special");
    flashBoard("special");
  } else {
    showToast("現場崩壊。早めの介入が必要です。", "warn", 2600);
    speak("asuton", "……修正を推奨します。", 2400);
    feedback("big");
  }
  render();
};

const completeTurn = () => {
  const snapshot = engine.hardDrop();
  state.activePlan = null;
  state.turn += 1;
  if (state.deliveryCooldown > 0) state.deliveryCooldown -= 1;
  let currentSnapshot = snapshot;
  if (snapshot.lastClearedLines > 0) {
    const lines = snapshot.lastClearedLines;
    state.lines += lines;
    engine.clearTemporaryPatches();
    currentSnapshot = engine.getSnapshot();
    addGauge(lines * 14);
    if (state.recoveryWindow > 0) {
      state.managementChain += lines;
      addGauge(20 + lines * 7);
      showToast(`管理連鎖 x${state.managementChain}！`, "good", 1900);
      showClearBurst(`管理連鎖 ×${state.managementChain}`);
      speak("miston", state.managementChain >= 3 ? "ほら、現場が動いた。" : "ええ判断。", 1800);
    } else {
      state.managementChain = 0;
      showClearBurst(lines >= 2 ? `${lines} LINE CLEAR!` : "LINE CLEAR!");
      speak("miston", lines >= 3 ? "一気にいけたな。" : "ええ感じ。", 1600);
    }
    feedback(lines >= 3 ? "big" : "medium");
    flashBoard("clear");
  } else if (state.recoveryWindow > 0) {
    state.recoveryWindow -= 1;
    if (state.recoveryWindow === 0) state.managementChain = 0;
  }

  const diagnostics = analyzeBoard(currentSnapshot.cells);
  if (state.lines >= currentStage().targetLines) {
    finishGame("clear");
    return;
  }
  // 危険度は介入の判断材料。盤面が高いだけで終了させず、実際にAIが置けなくなった時だけ崩壊させる。
  if (currentSnapshot.isGameOver) {
    finishGame("collapse");
    return;
  }
  if (diagnostics.level === "emergency" || diagnostics.level === "danger") {
    speak("asuton", diagnostics.level === "emergency" ? "危険です。即時対応を。" : "この位置が危険です。", 1650);
    flashBoard("danger");
  }
  state.nextType = nextPiece();
  render();
  scheduleAITurn(currentStage().turnGapMs);
};

const continueFallingPiece = () => {
  // このコールバックは実行済みなので、次の落下予約を正しく作り直せるようにする。
  dropTimer = null;
  if (!state.playing || state.paused || state.analysisActive || state.gameOver || state.cleared) return;
  const snapshot = engine.getSnapshot();
  const targetY = state.activePlan?.position.y;

  if (!snapshot.hasActiveTetromino || targetY === undefined || snapshot.activePosition === null || snapshot.activePosition.y >= targetY) {
    completeTurn();
    return;
  }

  engine.moveDown();
  render();
  dropTimer = window.setTimeout(continueFallingPiece, currentStage().fallStepMs);
};

const runAITurn = () => {
  // 発火済みの予約を残さない。予約が消えた場合は進行監視が安全に再開できる。
  aiTurnTimer = null;
  if (!state.playing || state.paused || state.analysisActive || state.gameOver || state.cleared || engine.getSnapshot().hasActiveTetromino) return;
  const type = state.nextType;
  const plan = mistakeAI.choosePlacement(
    type,
    engine.getSnapshot().cells,
    state.turn + 1,
    state.recoveryWindow > 0,
    currentStage().mistakeSeverity,
  );
  state.nextType = nextPiece();
  if (!plan) {
    finishGame("collapse");
    return;
  }
  const supplied = engine.supplyTetromino(type);
  if (supplied.isGameOver) {
    finishGame("collapse");
    return;
  }
  engine.prepareDrop(plan);
  state.activePlan = plan;
  render();
  dropTimer = window.setTimeout(continueFallingPiece, currentStage().fallStepMs);
};

const scheduleAITurn = (delay = currentStage().turnGapMs) => {
  clearTimer(aiTurnTimer);
  aiTurnTimer = window.setTimeout(() => {
    aiTurnTimer = null;
    runAITurn();
  }, delay);
};

// AIの一手が落下中か、次の一手待ちかをここで判定して再開する。
// スキル演出・分析・設定画面から戻る経路で止まりっぱなしにしないための共通入口。
const resumeAIFlow = (delay = currentStage().fallStepMs) => {
  if (!state.playing || state.paused || state.analysisActive || state.gameOver || state.cleared) return;
  clearTimer(aiTurnTimer);
  clearTimer(dropTimer);
  if (engine.getSnapshot().hasActiveTetromino) {
    dropTimer = window.setTimeout(continueFallingPiece, delay);
  } else {
    scheduleAITurn(Math.min(delay, currentStage().turnGapMs));
  }
};

// スキル、設定、演出の切替が重なって予約だけが失われても、プレイを止めないための保険。
const ensureAIProgress = () => {
  if (!state.playing || state.paused || state.analysisActive || state.gameOver || state.cleared) return;
  if (engine.getSnapshot().hasActiveTetromino) {
    if (dropTimer === null) resumeAIFlow(80);
    return;
  }
  if (aiTurnTimer === null) resumeAIFlow(120);
};

const startProgressWatchdog = () => {
  if (progressWatchdogTimer !== null) window.clearInterval(progressWatchdogTimer);
  progressWatchdogTimer = window.setInterval(ensureAIProgress, 250);
};

const startGame = (stageId = state.currentStageId) => {
  stopGameTimers();
  state.currentStageId = STAGES.some((stage) => stage.id === stageId) ? stageId : 1;
  engine.restart();
  engine.seedBoard(createInitialBoard(currentStage()));
  pieceBag = shuffle([...TETROMINO_ORDER]);
  state.playing = true;
  state.paused = false;
  state.gameOver = false;
  state.cleared = false;
  state.turn = 0;
  state.lines = 0;
  state.managementChain = 0;
  state.recoveryWindow = 0;
  state.specialGauge = 0;
  state.repairMaterials = 0;
  state.deliveryCooldown = 0;
  state.selectedSkill = null;
  state.analysisActive = false;
  state.analysisSpecialReady = false;
  state.analysisTargets = [];
  state.activePlan = null;
  state.specialImpact = null;
  state.nextType = nextPiece();
  showToast(`${currentStage().name}: 崩れた現場から復旧を開始します。`, "info", 2300);
  speak("minton", "崩れた現場、資材で整えましょう。", 1800);
  setScreen("game");
  render();
  startProgressWatchdog();
  scheduleAITurn(850);
};

const useSkill = (skill: Skill) => {
  if (!state.playing || state.paused || state.gameOver || state.cleared) return;
  if (skill === "delivery") {
    if (state.deliveryCooldown > 0) {
      showToast(`資材搬入の準備中です。あと${state.deliveryCooldown}手待ってください。`, "warn");
      speak("minton", "今、次の便を準備中です。", 1500);
      render();
      return;
    }
    const delivered = Math.min(2, maxRepairMaterials() - state.repairMaterials);
    if (delivered <= 0) {
      showToast("補修材は満載です。先に再施工で使いましょう。", "info");
      speak("minton", "資材は十分あります。", 1500);
      render();
      return;
    }
    state.repairMaterials += delivered;
    state.deliveryCooldown = 3;
    state.recoveryWindow = Math.max(state.recoveryWindow, 2);
    showToast(`資材搬入完了。補修材 +${delivered}（次の搬入まで3手）`, "good", 2200);
    speak("minton", "補修材、届けました！", 1800);
    showClearBurst(`資材搬入 +${delivered}`);
    feedback("medium");
    flashBoard("clear");
    render();
    return;
  }
  if (skill === "analysis") {
    state.selectedSkill = null;
    state.analysisActive = true;
    state.analysisSpecialReady = true;
    state.analysisTargets = getPriorityRemovalTargets(engine.getSnapshot().cells);
    clearTimer(aiTurnTimer);
    clearTimer(dropTimer);
    const hadActiveTetromino = engine.getSnapshot().hasActiveTetromino;
    clearTimer(analysisTimer);
    analysisTimer = window.setTimeout(() => {
      analysisTimer = null;
      state.analysisActive = false;
      state.analysisSpecialReady = false;
      state.analysisTargets = [];
      render();
      if (!state.playing || state.paused || state.gameOver || state.cleared) return;
      resumeAIFlow(hadActiveTetromino ? currentStage().fallStepMs : 120);
    }, ANALYSIS_MS);
    showToast("優先撤去分析: 点滅中の露出ブロックを優先して撤去してください。AIを2秒停止します。", "info", ANALYSIS_MS);
    speak("asuton", "上に露出した危険ブロックを確認。2秒停止します。", 1900);
    render();
    return;
  }
  if (skill === "special") {
    if (state.specialGauge < MAX_SPECIAL_GAUGE) return;
    runSpecial();
    return;
  }
  if (skill === "rebuild" && state.repairMaterials <= 0) {
    showToast("補修材がありません。先に撤去で回収してください。", "warn");
    speak("miston", "先に資材を回収しよか。", 1500);
    render();
    return;
  }
  if (skill === "remove" && state.repairMaterials >= maxRepairMaterials()) {
    showToast(`補修材が${maxRepairMaterials()}個で上限です。再施工してから次を撤去してください。`, "warn");
    speak("miston", "資材がいっぱいや。先に使おか。", 1500);
    render();
    return;
  }
  const togglingOff = state.selectedSkill === skill;
  state.selectedSkill = togglingOff ? null : skill;
  showToast(
    togglingOff
      ? `${skill === "remove" ? "連続撤去" : "連続再施工"}モードを解除しました。`
      : skill === "remove"
        ? "連続撤去モード: 表面ブロックを続けて選べます。"
        : "連続再施工モード: 支えのある空きマスを続けて選べます。",
    "info",
  );
  speak("miston", skill === "remove" ? "はいはい、俺の出番ね。" : "回収分だけ、きっちり直すで。", 1600);
  render();
};

const applyBoardSkill = (x: number, y: number) => {
  if (!state.playing || !state.selectedSkill) return;
  const skill = state.selectedSkill;
  if (skill === "remove" && state.repairMaterials >= maxRepairMaterials()) {
    state.selectedSkill = null;
    showToast(`補修材が${maxRepairMaterials()}個で上限です。再施工してから次を撤去してください。`, "warn");
    speak("miston", "資材を使って、次の撤去に備えよか。", 1600);
    render();
    return;
  }
  const succeeded = skill === "remove"
    ? engine.removeSurfaceBlock({ x, y })
    : engine.placeRepairBlock({ x, y });
  if (!succeeded) {
    showToast(skill === "remove" ? "撤去できるのは、上に何も積まれていない表面ブロックだけです。" : "再施工は、下に支えがある空きマスへ置けます。", "warn");
    feedback("small");
    render();
    return;
  }
  state.repairMaterials = skill === "remove"
    ? Math.min(maxRepairMaterials(), state.repairMaterials + 1)
    : state.repairMaterials - 1;
  const rebuildMaterialsDepleted = skill === "rebuild" && state.repairMaterials <= 0;
  const removeMaterialsFull = skill === "remove" && state.repairMaterials >= maxRepairMaterials();
  if (rebuildMaterialsDepleted || removeMaterialsFull) state.selectedSkill = null;
  state.recoveryWindow = 4;
  state.managementChain = Math.max(1, state.managementChain);
  addGauge(skill === "remove" ? 12 : 16);
  showToast(
    skill === "remove"
      ? removeMaterialsFull
        ? `撤去完了。補修材が${maxRepairMaterials()}個で上限です。再施工で使ってください。`
        : "撤去完了。補修材 +1。連続撤去中です。"
      : rebuildMaterialsDepleted
        ? "再施工完了。補修材を使い切りました。"
        : "再施工完了。続けて補修する位置を選べます。",
    "good",
  );
  speak("miston", skill === "remove" ? "これで通るやろ。" : "ええ足場できた。", 1500);
  showSkillEffect(skill === "remove" ? "撤去！ 補修材 +1" : "再施工！", { x, y });
  feedback("small");
  flashBoard("clear");
  render();
};

const runSpecial = () => {
  const snapshot = engine.getSnapshot();
  const cells = snapshot.cells;
  const useAnalysisTargets = state.analysisActive && state.analysisSpecialReady && state.analysisTargets.length > 0;
  const removals = useAnalysisTargets
    ? [...state.analysisTargets]
    : Array.from({ length: 10 }, (_, x) => {
      const y = cells.findIndex((row) => row[x] !== null);
      return y >= 0 ? { x, y } : null;
    }).filter((position): position is BoardPosition => position !== null)
      .sort((a, b) => a.x - b.x)
      .slice(0, 4);
  if (useAnalysisTargets) {
    clearTimer(analysisTimer);
    analysisTimer = null;
    state.analysisActive = false;
    state.analysisSpecialReady = false;
    state.analysisTargets = [];
  }
  const removed = removals
    .filter((position) => engine.removeSurfaceBlock(position));
  const diagnostics = analyzeBoard(engine.getSnapshot().cells);
  const patched = diagnostics.holePositions
    .slice(0, 2)
    .filter((position) => engine.placeTemporaryPatch(position));
  state.specialGauge = 0;
  state.recoveryWindow = 5;
  state.managementChain = Math.max(2, state.managementChain + 1);
  showSpecialImpact(removed, patched);
  showClearBurst(`${useAnalysisTargets ? "分析撤去" : "撤去"} ${removed.length} / 補修 ${patched.length}`);
  showToast(useAnalysisTargets
    ? `分析連動・緊急復旧工事: アストンが示した${removed.length}個を撤去、穴を${patched.length}か所仮設補修。`
    : `緊急復旧工事: 露出ブロックを${removed.length}個撤去、穴を${patched.length}か所仮設補修。`, "good", 2600);
  speak(useAnalysisTargets ? "asuton" : "miston", useAnalysisTargets ? "分析箇所を復旧します。" : "現場、まとめて整えたる。", 2200);
  feedback("special");
  flashBoard("special");
  render();
  if (useAnalysisTargets && state.playing && !state.paused && !state.gameOver && !state.cleared) {
    resumeAIFlow(120);
  }
};

const pauseGame = () => {
  if (!state.playing || state.paused) return;
  state.paused = true;
  clearTimer(aiTurnTimer);
  clearTimer(dropTimer);
  render();
};

const resumeGame = () => {
  if (!state.playing || !state.paused) return;
  state.paused = false;
  render();
  resumeAIFlow(260);
};

const exitGame = () => {
  stopGameTimers();
  state.playing = false;
  state.paused = false;
  state.selectedSkill = null;
  setScreen("title");
};

const openSettings = () => {
  if (state.playing && !state.paused) pauseGame();
  setScreen("settings");
  applySettings();
};

const closeSettings = () => {
  const shouldResume = state.playing && state.paused;
  setScreen(state.playing ? "game" : "title");
  if (shouldResume) resumeGame();
  render();
};

const bindEvents = () => {
  app.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "open-stage") setScreen("stage");
    if (action === "open-rulebook") setScreen("rulebook");
    if (action === "show-title") setScreen("title");
    if (action === "open-settings") openSettings();
    if (action === "close-settings") closeSettings();
    if (action === "start-game") startGame(Number(target.closest<HTMLElement>("[data-stage-id]")?.dataset.stageId) || 1);
    if (action === "restart-game") startGame();
    if (action === "next-stage") startGame(state.currentStageId + 1);
    if (action === "pause-game") pauseGame();
    if (action === "resume-game") resumeGame();
    if (action === "exit-game") exitGame();

    const skill = target.closest<HTMLElement>("[data-skill]")?.dataset.skill as Skill | undefined;
    if (skill) useSkill(skill);

    const cell = target.closest<HTMLElement>("[data-board-cell]");
    if (cell) applyBoardSkill(Number(cell.dataset.x), Number(cell.dataset.y));

    const settingInput = target.closest<HTMLInputElement>("[data-setting]");
    if (settingInput) {
      settings[settingInput.dataset.setting as keyof GameSettings] = settingInput.checked;
      saveSettings();
    }
  });
};

export const mountManagerII = () => {
  app.innerHTML = initialMarkup;
  app.addEventListener("dblclick", (event) => event.preventDefault());
  bindEvents();
  setScreen("title");
  applySettings();
  render();
};
