export const SAVE_DATA_VERSION = 1;
export const SAVE_STORAGE_KEY = "tetris-manager-save-v1";

export type TrainingRank = "S" | "A" | "B" | "C" | "D";

export type StageRecord = {
  cleared: boolean;
  bestRank: TrainingRank | null;
  bestMatchRate: number;
  bestManagementPower: number;
  bestScore: number;
  fewestMiss: number | null;
};

export type SaveData = {
  version: number;
  firstLaunchDone: boolean;
  lastPlayedStage: string | null;
  totalPlayCount: number;
  totalClearCount: number;
  stages: {
    training1: StageRecord;
  };
};

export const createDefaultSaveData = (): SaveData => ({
  version: SAVE_DATA_VERSION,
  firstLaunchDone: false,
  lastPlayedStage: null,
  totalPlayCount: 0,
  totalClearCount: 0,
  stages: {
    training1: {
      cleared: false,
      bestRank: null,
      bestMatchRate: 0,
      bestManagementPower: 0,
      bestScore: 0,
      fewestMiss: null
    }
  }
});
