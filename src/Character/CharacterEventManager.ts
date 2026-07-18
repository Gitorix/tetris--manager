import type { TetrominoType } from "../Game/Tetromino";

export type CharacterId = "miston" | "minton" | "asuton";

export type CharacterEventType =
  | "managerPerfect"
  | "managerGood"
  | "managerMiss"
  | "lineClear"
  | "replenishmentCountdown"
  | "replenishmentArrived"
  | "stockShortage"
  | "boardDanger"
  | "aiHintUnlocked"
  | "aiThinking"
  | "stageClear"
  | "gameOver"
  | "result";

export type CharacterEventPayload = {
  lineCount?: number;
  shortageType?: TetrominoType;
  turnsUntilReplenishment?: number;
  message?: string;
};

type CharacterReaction = {
  actor: CharacterId;
  reaction: string;
  bubbles: string[];
  duration: number;
  mood?: string;
};

type CharacterEventManagerOptions = {
  root: HTMLElement | null;
  bubble: HTMLElement | null;
};

export class CharacterEventManager {
  private reactionTimer: number | null = null;
  private readonly bubbleTimers: Partial<Record<CharacterId, number>> = {};

  constructor(private readonly options: CharacterEventManagerOptions) {}

  emit(type: CharacterEventType, payload: CharacterEventPayload = {}): void {
    const reaction = this.resolveReaction(type, payload);

    if (!reaction || !this.options.root) {
      return;
    }

    this.clearReactionTimer();
    this.options.root.dataset.characterActor = reaction.actor;
    this.options.root.dataset.characterEvent = type;
    this.options.root.dataset.operatorReaction = reaction.reaction;

    if (payload.shortageType) {
      this.options.root.dataset.shortageType = payload.shortageType;
    } else {
      delete this.options.root.dataset.shortageType;
    }

    if (payload.lineCount) {
      this.options.root.dataset.lineCount = String(payload.lineCount);
    } else {
      delete this.options.root.dataset.lineCount;
    }

    if (reaction.mood) {
      this.options.root.dataset.replenishmentMood = reaction.mood;
    }

    this.showBubble(reaction.actor, payload.message ?? this.selectBubble(reaction.bubbles), reaction.duration);
    this.reactionTimer = window.setTimeout(() => {
      this.clearReaction();
    }, reaction.duration);
  }

  clear(): void {
    this.clearReactionTimer();
    this.clearBubbleTimers();
    this.clearReaction();
    this.hideBubbles();
  }

  notify(actor: CharacterId, message: string, duration = 1800): void {
    this.showBubble(actor, message, duration);
  }

  private resolveReaction(
    type: CharacterEventType,
    payload: CharacterEventPayload
  ): CharacterReaction | null {
    switch (type) {
      case "managerPerfect":
        return { actor: "miston", reaction: "perfect", bubbles: ["ナイス！", "最高！", "よっしゃ！"], duration: 1750 };
      case "managerGood":
        return { actor: "miston", reaction: "good", bubbles: ["いいぞ！", "ナイス！", "よっしゃ！"], duration: 1650 };
      case "managerMiss":
        return { actor: "miston", reaction: "miss", bubbles: ["大丈夫！", "切り替えよう！", "惜しい！"], duration: 1750 };
      case "lineClear":
        return this.resolveLineClearReaction(payload.lineCount ?? 1);
      case "replenishmentCountdown":
        return {
          actor: "minton",
          reaction: payload.turnsUntilReplenishment && payload.turnsUntilReplenishment <= 1
            ? "replenish"
            : "count",
          bubbles: payload.turnsUntilReplenishment && payload.turnsUntilReplenishment <= 2
            ? ["急ぎます！", "運びます！"]
            : ["準備OK！", "補充確認"],
          duration: 1600,
          mood: payload.turnsUntilReplenishment && payload.turnsUntilReplenishment <= 1 ? "soon" : "waiting"
        };
      case "replenishmentArrived":
        return {
          actor: "minton",
          reaction: "replenish",
          bubbles: ["補充します！", "運びます！", "補充完了！", "準備OK！"],
          duration: 1800,
          mood: "arrived"
        };
      case "stockShortage":
        return {
          actor: "asuton",
          reaction: "shortage",
          bubbles: payload.shortageType
            ? [`${payload.shortageType}不足！`, "補充推奨！", "在庫注意！"]
            : ["補充推奨！", "在庫注意！"],
          duration: 1800
        };
      case "boardDanger":
        return {
          actor: "asuton",
          reaction: "shortage",
          bubbles: ["危険！", "要注意！"],
          duration: 1800
        };
      case "aiHintUnlocked":
        return { actor: "asuton", reaction: "hint", bubbles: ["分析完了！", "見えた！", "要確認！"], duration: 1800 };
      case "aiThinking":
        return { actor: "asuton", reaction: "thinking", bubbles: ["分析中…", "最適解を検索中"], duration: 1700 };
      case "stageClear":
        return { actor: "miston", reaction: "clear", bubbles: ["最高！", "よっしゃ！", "やった！"], duration: 1900 };
      case "gameOver":
        return { actor: "miston", reaction: "gameover", bubbles: ["お疲れさま！"], duration: 1900 };
      case "result":
        return { actor: "asuton", reaction: "result", bubbles: ["分析中…", "記録確認"], duration: 1650 };
    }
  }

  private resolveLineClearReaction(lineCount: number): CharacterReaction {
    if (lineCount >= 4) {
      return { actor: "miston", reaction: "tetris", bubbles: ["最高！", "よっしゃ！"], duration: 1900 };
    }

    if (lineCount === 3) {
      return { actor: "miston", reaction: "line3", bubbles: ["最高！", "いいぞ！"], duration: 1800 };
    }

    if (lineCount === 2) {
      return { actor: "miston", reaction: "line2", bubbles: ["いいぞ！", "ナイス！"], duration: 1700 };
    }

    return { actor: "miston", reaction: "line1", bubbles: ["ナイス！", "いいぞ！"], duration: 1600 };
  }

  private selectBubble(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)] ?? messages[0] ?? "";
  }

  private showBubble(actor: CharacterId, message: string, duration: number): void {
    const bubble = this.getCharacterBubble(actor) ?? this.options.bubble;

    if (!bubble) {
      return;
    }

    this.clearBubbleTimer(actor);
    bubble.hidden = true;
    bubble.textContent = message.slice(0, 12);
    void bubble.offsetWidth;
    bubble.hidden = false;
    this.bubbleTimers[actor] = window.setTimeout(() => {
      this.hideBubble(actor);
      delete this.bubbleTimers[actor];
    }, Math.min(Math.max(duration, 1500), 2000));
  }

  private hideBubble(actor: CharacterId): void {
    const bubble = this.getCharacterBubble(actor) ?? this.options.bubble;

    if (!bubble) {
      return;
    }

    bubble.hidden = true;
    bubble.textContent = "";
  }

  private hideBubbles(): void {
    (["miston", "minton", "asuton"] as const).forEach((actor) => this.hideBubble(actor));

    if (this.options.bubble) {
      this.options.bubble.hidden = true;
      this.options.bubble.textContent = "";
    }
  }

  private getCharacterBubble(actor: CharacterId): HTMLElement | null {
    return this.options.root?.querySelector<HTMLElement>(`[data-character-bubble="${actor}"]`) ?? null;
  }

  private clearReaction(): void {
    if (!this.options.root) {
      return;
    }

    delete this.options.root.dataset.characterActor;
    delete this.options.root.dataset.characterEvent;
    delete this.options.root.dataset.operatorReaction;
    delete this.options.root.dataset.shortageType;
    delete this.options.root.dataset.lineCount;
  }

  private clearReactionTimer(): void {
    if (this.reactionTimer !== null) {
      window.clearTimeout(this.reactionTimer);
      this.reactionTimer = null;
    }
  }

  private clearBubbleTimer(actor: CharacterId): void {
    const timer = this.bubbleTimers[actor];

    if (timer != null) {
      window.clearTimeout(timer);
      delete this.bubbleTimers[actor];
    }
  }

  private clearBubbleTimers(): void {
    (["miston", "minton", "asuton"] as const).forEach((actor) => this.clearBubbleTimer(actor));
  }
}
