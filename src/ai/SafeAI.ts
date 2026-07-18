import type { BoardCell, BoardPosition } from "../Game/Board";
import { Board } from "../Game/Board";
import type { PlacementAI, PlacementAICandidate, PlacementAIMetrics } from "./PlacementAI";
import { SAFE_AI_DEBUG, SAFE_AI_WEIGHTS, type SafeAIWeights } from "./SafeAIConfig";
import {
  TETROMINO_ORDER,
  TetrominoCatalog,
  type TetrominoCell,
  type TetrominoType
} from "../Game/Tetromino";

export class SafeAI implements PlacementAI {
  readonly name = "SafeAI";
  desiredPiece: TetrominoType | null = null;
  secondChoicePiece: TetrominoType | null = null;
  worstChoicePiece: TetrominoType | null = null;
  desiredPieces: TetrominoType[] = [];

  private readonly catalog = new TetrominoCatalog();

  constructor(
    private readonly weights: SafeAIWeights = SAFE_AI_WEIGHTS,
    private readonly debugEnabled = SAFE_AI_DEBUG
  ) {}

  choosePlacement(type: TetrominoType, cells: BoardCell[][]): PlacementAICandidate | null {
    const candidates = this.createCandidates(type, cells);

    if (this.debugEnabled) {
      console.table(
        candidates.map((candidate) => ({
          block: candidate.type,
          rotation: candidate.rotationIndex,
          x: candidate.position.x,
          clearedLines: candidate.clearedLines,
          holes: candidate.holes,
          totalHeight: candidate.totalHeight,
          maxHeight: candidate.maxHeight,
          bumpiness: candidate.bumpiness,
          score: candidate.score
        }))
      );
    }

    return this.selectBestCandidate(candidates);
  }

  updateDesiredPiece(cells: BoardCell[][]): TetrominoType | null {
    const bestCandidates = TETROMINO_ORDER.flatMap((type) => {
      const bestCandidate = this.selectBestCandidate(this.createCandidates(type, cells));
      return bestCandidate ? [bestCandidate] : [];
    });

    const desiredCandidates = this.selectDesiredCandidates(bestCandidates);
    this.desiredPieces = desiredCandidates.map((candidate) => candidate.type);
    this.desiredPiece = this.desiredPieces[0] ?? null;
    this.secondChoicePiece = this.desiredPieces[1] ?? null;
    this.worstChoicePiece = this.desiredPieces.at(-1) ?? null;

    if (this.debugEnabled) {
      console.table(
        bestCandidates.map((candidate) => ({
          desiredCheck: candidate.type,
          rotation: candidate.rotationIndex,
          x: candidate.position.x,
          clearedLines: candidate.clearedLines,
          holes: candidate.holes,
          totalHeight: candidate.totalHeight,
          maxHeight: candidate.maxHeight,
          bumpiness: candidate.bumpiness,
          score: candidate.score
        }))
      );
    }

    return this.desiredPiece;
  }

  private createCandidates(type: TetrominoType, cells: BoardCell[][]): PlacementAICandidate[] {
    const candidates: PlacementAICandidate[] = [];
    const definition = this.catalog.getDefinition(type);

    definition.rotations.forEach((shape, rotationIndex) => {
      const minX = Math.min(...shape.map((cell) => cell.x));
      const maxX = Math.max(...shape.map((cell) => cell.x));
      const minY = Math.min(...shape.map((cell) => cell.y));

      for (let x = -minX; x <= 9 - maxX; x += 1) {
        const board = new Board();
        board.setCells(cells);
        const startPosition = { x, y: -minY };

        if (!board.canPlace(shape, startPosition)) {
          continue;
        }

        let dropPosition = startPosition;

        while (board.canPlace(shape, { x, y: dropPosition.y + 1 })) {
          dropPosition = { x, y: dropPosition.y + 1 };
        }

        board.lockTetromino(type, shape, dropPosition);
        const clearedLines = board.clearCompletedLines();
        const simulatedCells = board.getCells();
        const metrics = this.measureBoard(simulatedCells, clearedLines);
        const score = this.evaluate(metrics);

        candidates.push({
          type,
          rotationIndex,
          position: dropPosition,
          score,
          centerDistance: this.getCenterDistance(shape, dropPosition),
          ...metrics
        });
      }
    });

    return candidates;
  }

  private selectBestCandidate(candidates: PlacementAICandidate[]): PlacementAICandidate | null {
    return [...candidates].sort((a, b) => this.compareCandidates(a, b))[0] ?? null;
  }

  private selectDesiredCandidates(
    candidates: PlacementAICandidate[]
  ): PlacementAICandidate[] {
    const rankedCandidates = [...candidates].sort((a, b) => this.compareDesiredCandidates(a, b));
    const iTetrisCandidate = rankedCandidates.find(
      (candidate) => candidate.type === "I" && candidate.clearedLines >= 4
    );

    if (iTetrisCandidate) {
      return [
        iTetrisCandidate,
        ...rankedCandidates.filter((candidate) => candidate.type !== iTetrisCandidate.type)
      ];
    }

    return rankedCandidates;
  }

  private measureBoard(cells: BoardCell[][], clearedLines: number): PlacementAIMetrics {
    const heights = this.getColumnHeights(cells);
    const holes = this.countHoles(cells, heights);
    const totalHeight = heights.reduce((sum, height) => sum + height, 0);
    const maxHeight = Math.max(...heights);
    const bumpiness = heights
      .slice(0, -1)
      .reduce((sum, height, index) => sum + Math.abs(height - heights[index + 1]), 0);
    const wellDepth = this.countWellDepth(heights);

    return {
      clearedLines,
      holes,
      totalHeight,
      maxHeight,
      bumpiness,
      wellDepth,
      gameOverRisk: maxHeight >= 18 ? 1 : 0
    };
  }

  private evaluate(metrics: PlacementAIMetrics): number {
    return (
      metrics.clearedLines * this.weights.lineClear +
      metrics.totalHeight * this.weights.totalHeight +
      metrics.maxHeight * this.weights.maxHeight +
      metrics.holes * this.weights.holes +
      metrics.bumpiness * this.weights.bumpiness +
      metrics.wellDepth * this.weights.wellDepth +
      metrics.gameOverRisk * this.weights.gameOverRisk
    );
  }

  private compareCandidates(a: PlacementAICandidate, b: PlacementAICandidate): number {
    if (b.score !== a.score) return b.score - a.score;
    if (a.maxHeight !== b.maxHeight) return a.maxHeight - b.maxHeight;
    if (a.holes !== b.holes) return a.holes - b.holes;
    if (a.bumpiness !== b.bumpiness) return a.bumpiness - b.bumpiness;
    if (a.centerDistance !== b.centerDistance) return a.centerDistance - b.centerDistance;
    return a.position.x - b.position.x;
  }

  private compareDesiredCandidates(a: PlacementAICandidate, b: PlacementAICandidate): number {
    const candidateComparison = this.compareCandidates(a, b);

    if (candidateComparison !== 0) {
      return candidateComparison;
    }

    return TETROMINO_ORDER.indexOf(a.type) - TETROMINO_ORDER.indexOf(b.type);
  }

  private getColumnHeights(cells: BoardCell[][]): number[] {
    return Array.from({ length: 10 }, (_, x) => {
      const firstFilledY = cells.findIndex((row) => row[x] !== null);
      return firstFilledY === -1 ? 0 : 20 - firstFilledY;
    });
  }

  private countHoles(cells: BoardCell[][], heights: number[]): number {
    return heights.reduce((holes, height, x) => {
      if (height === 0) return holes;

      const firstFilledY = 20 - height;
      let columnHoles = 0;

      for (let y = firstFilledY + 1; y < 20; y += 1) {
        if (cells[y][x] === null) {
          columnHoles += 1;
        }
      }

      return holes + columnHoles;
    }, 0);
  }

  private countWellDepth(heights: number[]): number {
    return heights.reduce((sum, height, x) => {
      const left = x === 0 ? 20 : heights[x - 1];
      const right = x === heights.length - 1 ? 20 : heights[x + 1];
      const depth = Math.min(left, right) - height;
      return depth > 2 ? sum + depth * depth : sum;
    }, 0);
  }

  private getCenterDistance(shape: TetrominoCell[], position: BoardPosition): number {
    const absoluteXs = shape.map((cell) => position.x + cell.x);
    const center = absoluteXs.reduce((sum, x) => sum + x, 0) / absoluteXs.length;
    return Math.abs(center - 4.5);
  }
}
