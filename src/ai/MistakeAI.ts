import { Board, type BoardCell, type BoardPosition } from "../Game/Board";
import { analyzeBoard, type BoardDiagnostics } from "../Game/BoardDiagnostics";
import { TetrominoCatalog, type TetrominoType } from "../Game/Tetromino";

export type MistakePlacement = {
  type: TetrominoType;
  rotationIndex: number;
  position: BoardPosition;
  diagnostics: BoardDiagnostics;
  clearedLines: number;
  issue: "hole" | "step" | "bias" | "tunnel" | "recovery";
};

type Candidate = MistakePlacement & {
  riskScore: number;
  recoveryScore: number;
};

/**
 * A deliberately imperfect player. It makes readable mistakes while avoiding
 * immediate dead ends, so the manager gets problems worth solving.
 */
export class MistakeAI {
  private readonly catalog = new TetrominoCatalog();

  choosePlacement(
    type: TetrominoType,
    cells: BoardCell[][],
    turn: number,
    prioritizeRecovery = false,
    mistakeSeverity = 0.48,
  ): MistakePlacement | null {
    const candidates = this.createCandidates(type, cells);
    if (candidates.length === 0) return null;

    const safeCandidates = candidates.filter((candidate) => candidate.diagnostics.height < 19);
    const pool = safeCandidates.length > 0 ? safeCandidates : candidates;
    // A successful management action gives the AI a short, visible recovery
    // window. This turns player intervention into a real setup rather than
    // a purely cosmetic correction.
    if (prioritizeRecovery) {
      return [...pool].sort((a, b) => b.recoveryScore - a.recoveryScore)[0] ?? null;
    }

    const sorted = [...pool].sort((a, b) => b.riskScore - a.riskScore);
    // Without a management action, the AI keeps choosing risky placements.
    // Pressure rises gradually so every stage needs intervention, while the
    // safe-candidate filter still avoids instant, unreadable failures.
    const escalatingSeverity = Math.min(.95, mistakeSeverity + Math.floor(turn / 8) * .035);
    const riskIndex = 1 - Math.min(Math.max(escalatingSeverity, 0), 0.95);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * riskIndex)));
    return sorted[index] ?? sorted[0] ?? null;
  }

  private createCandidates(type: TetrominoType, cells: BoardCell[][]): Candidate[] {
    const candidates: Candidate[] = [];
    const definition = this.catalog.getDefinition(type);

    definition.rotations.forEach((shape, rotationIndex) => {
      const minX = Math.min(...shape.map((cell) => cell.x));
      const maxX = Math.max(...shape.map((cell) => cell.x));
      const minY = Math.min(...shape.map((cell) => cell.y));

      for (let x = -minX; x <= 9 - maxX; x += 1) {
        const board = new Board();
        board.setCells(cells);
        const start = { x, y: -minY };
        if (!board.canPlace(shape, start)) continue;

        let position = start;
        while (board.canPlace(shape, { x: position.x, y: position.y + 1 })) {
          position = { x: position.x, y: position.y + 1 };
        }

        board.lockTetromino(type, shape, position);
        const clearedLines = board.clearCompletedLines();
        const diagnostics = analyzeBoard(board.getCells());
        const center = position.x + (minX + maxX) / 2;
        const sideBias = Math.abs(center - 4.5);
        const riskScore = diagnostics.holes * 17 + diagnostics.sealedHoles * 11 + diagnostics.bumpiness * 3 + sideBias * 2 - clearedLines * 18;
        const recoveryScore = clearedLines * 45 - diagnostics.holes * 7 - diagnostics.height * 3 - diagnostics.bumpiness;
        const issue = diagnostics.holes > 0
          ? "hole"
          : diagnostics.bumpiness >= 8
            ? "step"
            : sideBias >= 2.5
              ? "bias"
              : diagnostics.height >= 13
                ? "tunnel"
                : "recovery";

        candidates.push({ type, rotationIndex, position, diagnostics, clearedLines, issue, riskScore, recoveryScore });
      }
    });

    return candidates;
  }
}
