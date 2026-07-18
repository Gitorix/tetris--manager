import {
  SAVE_DATA_VERSION,
  SAVE_STORAGE_KEY,
  createDefaultSaveData,
  type SaveData,
  type TrainingRank
} from "./SaveData";

export type StageResultRecord = {
  cleared: boolean;
  rank: TrainingRank;
  matchRate: number;
  managementPower: number;
  score: number;
  miss: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeSaveData = (value: unknown): SaveData => {
  const fallback = createDefaultSaveData();

  if (!isRecord(value) || value.version !== SAVE_DATA_VERSION || !isRecord(value.stages)) {
    return fallback;
  }

  const stage = isRecord(value.stages.training1) ? value.stages.training1 : {};

  return {
    version: SAVE_DATA_VERSION,
    firstLaunchDone: typeof value.firstLaunchDone === "boolean" ? value.firstLaunchDone : false,
    lastPlayedStage: typeof value.lastPlayedStage === "string" ? value.lastPlayedStage : null,
    totalPlayCount: Number.isFinite(value.totalPlayCount) ? Number(value.totalPlayCount) : 0,
    totalClearCount: Number.isFinite(value.totalClearCount) ? Number(value.totalClearCount) : 0,
    stages: {
      training1: {
        cleared: typeof stage.cleared === "boolean" ? stage.cleared : false,
        bestRank: ["S", "A", "B", "C", "D"].includes(String(stage.bestRank))
          ? (stage.bestRank as TrainingRank)
          : null,
        bestMatchRate: Number.isFinite(stage.bestMatchRate) ? Number(stage.bestMatchRate) : 0,
        bestManagementPower: Number.isFinite(stage.bestManagementPower)
          ? Number(stage.bestManagementPower)
          : 0,
        bestScore: Number.isFinite(stage.bestScore) ? Number(stage.bestScore) : 0,
        fewestMiss: Number.isFinite(stage.fewestMiss) ? Number(stage.fewestMiss) : null
      }
    }
  };
};

export class SaveManager {
  load(): SaveData {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      return raw ? normalizeSaveData(JSON.parse(raw)) : createDefaultSaveData();
    } catch {
      return createDefaultSaveData();
    }
  }

  save(data: SaveData): void {
    try {
      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may be unavailable; gameplay should continue.
    }
  }

  reset(): SaveData {
    const data = createDefaultSaveData();
    try {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable; returning defaults is enough.
    }
    return data;
  }

  markFirstLaunch(data: SaveData): SaveData {
    const next = { ...data, firstLaunchDone: true };
    this.save(next);
    return next;
  }

  recordStageStart(data: SaveData, stageId: string): SaveData {
    const next = {
      ...data,
      firstLaunchDone: true,
      lastPlayedStage: stageId,
      totalPlayCount: data.totalPlayCount + 1
    };
    this.save(next);
    return next;
  }

  recordStageResult(data: SaveData, result: StageResultRecord): SaveData {
    const current = data.stages.training1;
    const next: SaveData = {
      ...data,
      totalClearCount: data.totalClearCount + (result.cleared ? 1 : 0),
      stages: {
        training1: {
          cleared: current.cleared || result.cleared,
          bestRank: this.getBetterRank(current.bestRank, result.rank),
          bestMatchRate: Math.max(current.bestMatchRate, result.matchRate),
          bestManagementPower: Math.max(current.bestManagementPower, result.managementPower),
          bestScore: Math.max(current.bestScore, result.score),
          fewestMiss:
            current.fewestMiss === null ? result.miss : Math.min(current.fewestMiss, result.miss)
        }
      }
    };
    this.save(next);
    return next;
  }

  private getBetterRank(current: TrainingRank | null, next: TrainingRank): TrainingRank {
    const order: TrainingRank[] = ["S", "A", "B", "C", "D"];
    if (!current) return next;
    return order.indexOf(next) < order.indexOf(current) ? next : current;
  }
}
