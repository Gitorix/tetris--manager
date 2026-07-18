export type SafeAIWeights = {
  lineClear: number;
  totalHeight: number;
  maxHeight: number;
  holes: number;
  bumpiness: number;
  wellDepth: number;
  gameOverRisk: number;
};

export const SAFE_AI_WEIGHTS: SafeAIWeights = {
  lineClear: 120,
  totalHeight: -4,
  maxHeight: -8,
  holes: -45,
  bumpiness: -5,
  wellDepth: -8,
  gameOverRisk: -10000
};

export const SAFE_AI_DEBUG = false;
