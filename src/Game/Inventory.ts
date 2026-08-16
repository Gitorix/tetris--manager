import { TETROMINO_ORDER, type TetrominoType } from "./Tetromino";

export type InventoryCounts = Record<TetrominoType, number>;

export const INITIAL_INVENTORY: InventoryCounts = {
  I: 5,
  O: 8,
  T: 6,
  L: 8,
  J: 8,
  S: 8,
  Z: 8
};

export const MAX_INVENTORY: InventoryCounts = {
  I: 8,
  O: 12,
  T: 10,
  L: 12,
  J: 12,
  S: 12,
  Z: 12
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
