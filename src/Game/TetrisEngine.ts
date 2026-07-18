import { Board, type BoardCell, type BoardPosition, type DrawnTetrominoCell } from "./Board";
import { TetrominoCatalog, type TetrominoType } from "./Tetromino";

const LINE_SCORE: Record<number, number> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800
};

export type ActiveTetromino = {
  type: TetrominoType;
  rotationIndex: number;
  position: BoardPosition;
};

export type TetrisSnapshot = {
  cells: BoardCell[][];
  activeCells: DrawnTetrominoCell[];
  activeType: TetrominoType | null;
  activePosition: BoardPosition | null;
  activeRotationIndex: number | null;
  score: number;
  lastClearedLines: number;
  isGameOver: boolean;
  hasActiveTetromino: boolean;
};

export type TetrisPlacement = {
  rotationIndex: number;
  position: BoardPosition;
};

export class TetrisEngine {
  readonly board = new Board();

  private readonly catalog = new TetrominoCatalog();
  private active: ActiveTetromino | null = null;
  private score = 0;
  private lastClearedLines = 0;
  private isGameOver = false;

  restart(): TetrisSnapshot {
    this.board.clear();
    this.score = 0;
    this.lastClearedLines = 0;
    this.isGameOver = false;
    this.active = null;

    return this.getSnapshot();
  }

  markGameOver(): TetrisSnapshot {
    this.active = null;
    this.isGameOver = true;

    return this.getSnapshot();
  }

  supplyTetromino(type: TetrominoType): TetrisSnapshot {
    if (this.isGameOver || this.active !== null) {
      return this.getSnapshot();
    }

    const shape = this.catalog.getRotation(type, 0);
    const position = this.board.getCenteredTopPosition(shape);

    this.active = {
      type,
      rotationIndex: 0,
      position
    };

    if (!this.board.canPlace(shape, position)) {
      this.active = null;
      this.isGameOver = true;
    }

    return this.getSnapshot();
  }

  moveLeft(): TetrisSnapshot {
    return this.tryMove({ x: -1, y: 0 });
  }

  moveRight(): TetrisSnapshot {
    return this.tryMove({ x: 1, y: 0 });
  }

  rotate(): TetrisSnapshot {
    if (this.isGameOver || this.active === null) {
      return this.getSnapshot();
    }

    const rotationIndex = (this.active.rotationIndex + 1) % 4;
    const shape = this.catalog.getRotation(this.active.type, rotationIndex);
    const kickCandidates: BoardPosition[] = [
      this.active.position,
      { x: this.active.position.x - 1, y: this.active.position.y },
      { x: this.active.position.x + 1, y: this.active.position.y },
      { x: this.active.position.x, y: this.active.position.y + 1 },
      { x: this.active.position.x - 2, y: this.active.position.y },
      { x: this.active.position.x + 2, y: this.active.position.y }
    ];
    const validPosition = kickCandidates.find((position) => this.board.canPlace(shape, position));

    if (validPosition) {
      this.active = {
        ...this.active,
        rotationIndex,
        position: validPosition
      };
    }

    return this.getSnapshot();
  }

  hardDrop(): TetrisSnapshot {
    if (this.isGameOver || this.active === null) {
      return this.getSnapshot();
    }

    const shape = this.getActiveShape();
    let dropPosition = { ...this.active.position };

    while (this.board.canPlace(shape, { x: dropPosition.x, y: dropPosition.y + 1 })) {
      dropPosition = {
        x: dropPosition.x,
        y: dropPosition.y + 1
      };
    }

    this.active = {
      ...this.active,
      position: dropPosition
    };

    this.board.lockTetromino(this.active.type, shape, this.active.position);
    this.lastClearedLines = this.board.clearCompletedLines();
    this.score += LINE_SCORE[this.lastClearedLines] ?? 0;
    this.active = null;

    return this.getSnapshot();
  }

  previewPlacement(placement: TetrisPlacement): TetrisSnapshot {
    if (this.isGameOver || this.active === null) {
      return this.getSnapshot();
    }

    const shape = this.catalog.getRotation(this.active.type, placement.rotationIndex);

    if (this.board.canPlace(shape, placement.position)) {
      this.active = {
        ...this.active,
        rotationIndex: placement.rotationIndex,
        position: placement.position
      };
    }

    return this.getSnapshot();
  }

  getSnapshot(): TetrisSnapshot {
    return {
      cells: this.board.getCells(),
      activeCells: this.isGameOver || this.active === null
        ? []
        : this.board.resolveTetrominoCells(
            this.active.type,
            this.getActiveShape(),
            this.active.position
          ),
      activeType: this.active?.type ?? null,
      activePosition: this.active ? { ...this.active.position } : null,
      activeRotationIndex: this.active?.rotationIndex ?? null,
      score: this.score,
      lastClearedLines: this.lastClearedLines,
      isGameOver: this.isGameOver,
      hasActiveTetromino: this.active !== null
    };
  }

  private tryMove(delta: BoardPosition): TetrisSnapshot {
    if (this.isGameOver || this.active === null) {
      return this.getSnapshot();
    }

    const shape = this.getActiveShape();
    const position = {
      x: this.active.position.x + delta.x,
      y: this.active.position.y + delta.y
    };

    if (this.board.canPlace(shape, position)) {
      this.active = {
        ...this.active,
        position
      };
    }

    return this.getSnapshot();
  }

  private getActiveShape() {
    if (this.active === null) {
      return [];
    }

    return this.catalog.getRotation(this.active.type, this.active.rotationIndex);
  }
}
