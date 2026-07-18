import { TETROMINO_ORDER, type TetrominoType } from "./Tetromino";

export type InventoryCounts = Record<TetrominoType, number>;

export const INITIAL_INVENTORY: InventoryCounts = {
  I: 2,
  O: 4,
  T: 3,
  L: 4,
  J: 4,
  S: 4,
  Z: 4
};

export const MAX_INVENTORY: InventoryCounts = {
  I: 3,
  O: 5,
  T: 5,
  L: 5,
  J: 5,
  S: 5,
  Z: 5
};

export class Inventory {
  private counts: InventoryCounts;

  constructor() {
    this.counts = { ...INITIAL_INVENTORY };
  }

  reset(): void {
    this.counts = { ...INITIAL_INVENTORY };
  }

  getCount(type: TetrominoType): number {
    return this.counts[type];
  }

  getCounts(): InventoryCounts {
    return { ...this.counts };
  }

  canConsume(type: TetrominoType): boolean {
    return this.counts[type] > 0;
  }

  consume(type: TetrominoType): boolean {
    if (!this.canConsume(type)) {
      return false;
    }

    this.counts[type] -= 1;
    return true;
  }

  add(type: TetrominoType, amount: number): number {
    const before = this.counts[type];
    this.counts[type] = Math.min(MAX_INVENTORY[type], this.counts[type] + amount);
    return this.counts[type] - before;
  }

  getTypes(): TetrominoType[] {
    return [...TETROMINO_ORDER];
  }
}
