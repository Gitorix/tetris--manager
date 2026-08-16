import type { TetrominoCell, TetrominoType } from "./Tetromino";

export type BoardCell = TetrominoType | "PATCH" | "REPAIR" | null;

export type BoardPosition = {
  x: number;
  y: number;
};

export type DrawnTetrominoCell = BoardPosition & {
  type: TetrominoType;
};

export class Board {
  readonly width = 10;
  readonly height = 20;

  private cells: BoardCell[][];

  constructor() {
    this.cells = this.createEmptyCells();
  }

  clear(): void {
    this.cells = this.createEmptyCells();
  }

  getCells(): BoardCell[][] {
    return this.cells.map((row) => [...row]);
  }

  setCells(cells: BoardCell[][]): void {
    this.cells = cells.map((row) => [...row]);
  }

  getCell(position: BoardPosition): BoardCell {
    return this.isInside(position) ? this.cells[position.y][position.x] : null;
  }

  setCell(position: BoardPosition, value: BoardCell): boolean {
    if (!this.isInside(position)) {
      return false;
    }

    this.cells[position.y][position.x] = value;
    return true;
  }

  isSurfaceCell(position: BoardPosition): boolean {
    if (!this.isInside(position) || this.cells[position.y][position.x] === null) {
      return false;
    }

    for (let y = 0; y < position.y; y += 1) {
      if (this.cells[y][position.x] !== null) {
        return false;
      }
    }

    return true;
  }

  isHole(position: BoardPosition): boolean {
    if (!this.isInside(position) || this.cells[position.y][position.x] !== null) {
      return false;
    }

    return this.cells.slice(0, position.y).some((row) => row[position.x] !== null);
  }

  isRebuildableCell(position: BoardPosition): boolean {
    if (!this.isInside(position) || this.cells[position.y][position.x] !== null) {
      return false;
    }

    return position.y === this.height - 1 || this.cells[position.y + 1][position.x] !== null;
  }

  clearTemporaryPatches(): number {
    let cleared = 0;

    this.cells.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === "PATCH") {
          this.cells[y][x] = null;
          cleared += 1;
        }
      });
    });

    return cleared;
  }

  canPlace(shape: TetrominoCell[], position: BoardPosition): boolean {
    return shape.every((shapeCell) => {
      const cell = {
        x: position.x + shapeCell.x,
        y: position.y + shapeCell.y
      };

      if (!this.isInside(cell)) {
        return false;
      }

      return this.cells[cell.y][cell.x] === null;
    });
  }

  lockTetromino(
    type: TetrominoType,
    shape: TetrominoCell[],
    position: BoardPosition
  ): DrawnTetrominoCell[] {
    const lockedCells = this.resolveTetrominoCells(type, shape, position);

    for (const cell of lockedCells) {
      if (this.isInside(cell)) {
        this.cells[cell.y][cell.x] = type;
      }
    }

    return lockedCells;
  }

  clearCompletedLines(): number {
    const remainingRows = this.cells.filter((row) => row.some((cell) => cell === null));
    const clearedLineCount = this.height - remainingRows.length;

    if (clearedLineCount === 0) {
      return 0;
    }

    const emptyRows = Array.from({ length: clearedLineCount }, () =>
      Array.from({ length: this.width }, () => null)
    );

    this.cells = [...emptyRows, ...remainingRows];

    return clearedLineCount;
  }

  resolveTetrominoCells(
    type: TetrominoType,
    shape: TetrominoCell[],
    position: BoardPosition
  ): DrawnTetrominoCell[] {
    return shape.map((cell) => ({
      type,
      x: position.x + cell.x,
      y: position.y + cell.y
    }));
  }

  getCenteredTopPosition(shape: TetrominoCell[]): BoardPosition {
    const minX = Math.min(...shape.map((cell) => cell.x));
    const maxX = Math.max(...shape.map((cell) => cell.x));
    const minY = Math.min(...shape.map((cell) => cell.y));
    const shapeWidth = maxX - minX + 1;

    return {
      x: Math.floor((this.width - shapeWidth) / 2) - minX,
      y: -minY
    };
  }

  private isInside(position: BoardPosition): boolean {
    return (
      position.x >= 0 &&
      position.x < this.width &&
      position.y >= 0 &&
      position.y < this.height
    );
  }

  private createEmptyCells(): BoardCell[][] {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => null)
    );
  }
}
