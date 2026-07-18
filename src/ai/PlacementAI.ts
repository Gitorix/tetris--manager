import type { BoardCell, BoardPosition } from "../Game/Board";
import type { TetrominoType } from "../Game/Tetromino";

export type PlacementAIMetrics = {
  clearedLines: number;
  holes: number;
  totalHeight: number;
  maxHeight: number;
  bumpiness: number;
  wellDepth: number;
  gameOverRisk: number;
};

export type PlacementAICandidate = PlacementAIMetrics & {
  type: TetrominoType;
  rotationIndex: number;
  position: BoardPosition;
  score: number;
  centerDistance: number;
};

export interface PlacementAI {
  readonly name: string;
  readonly desiredPiece: TetrominoType | null;
  readonly secondChoicePiece: TetrominoType | null;
  readonly worstChoicePiece: TetrominoType | null;
  readonly desiredPieces: TetrominoType[];
  choosePlacement(type: TetrominoType, cells: BoardCell[][]): PlacementAICandidate | null;
  updateDesiredPiece(cells: BoardCell[][]): TetrominoType | null;
}
