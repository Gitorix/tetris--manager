import type { BoardCell, BoardPosition } from "./Board";

export type BoardDiagnostics = {
  height: number;
  holes: number;
  sealedHoles: number;
  bumpiness: number;
  danger: number;
  level: "safe" | "caution" | "danger" | "emergency" | "collapse";
  holePositions: BoardPosition[];
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

export const analyzeBoard = (cells: BoardCell[][]): BoardDiagnostics => {
  const heights = Array.from({ length: BOARD_WIDTH }, (_, x) => {
    const firstFilledRow = cells.findIndex((row) => row[x] !== null);
    return firstFilledRow === -1 ? 0 : BOARD_HEIGHT - firstFilledRow;
  });
  const holePositions: BoardPosition[] = [];
  let sealedHoles = 0;

  heights.forEach((height, x) => {
    if (height === 0) return;

    const firstFilledY = BOARD_HEIGHT - height;
    for (let y = firstFilledY + 1; y < BOARD_HEIGHT; y += 1) {
      if (cells[y][x] !== null) continue;
      holePositions.push({ x, y });
      if (cells.slice(y + 1).some((row) => row[x] !== null)) {
        sealedHoles += 1;
      }
    }
  });

  const bumpiness = heights.slice(0, -1).reduce(
    (total, height, index) => total + Math.abs(height - heights[index + 1]),
    0
  );
  const height = Math.max(...heights);
  const holes = holePositions.length;
  // Holes should demand attention, but a single sloppy AI turn must still give
  // the manager enough time to read the board and intervene.
  const danger = Math.min(
    100,
    Math.round(height * 2.4 + holes * 1.3 + sealedHoles * 1.2 + bumpiness * 0.7 + Math.max(0, height - 14) * 5)
  );

  return {
    height,
    holes,
    sealedHoles,
    bumpiness,
    danger,
    level: danger >= 95 ? "collapse" : danger >= 75 ? "emergency" : danger >= 50 ? "danger" : danger >= 25 ? "caution" : "safe",
    holePositions
  };
};
