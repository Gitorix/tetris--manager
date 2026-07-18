export type TetrominoType = "I" | "O" | "T" | "L" | "J" | "S" | "Z";

export type TetrominoCell = {
  x: number;
  y: number;
};

export type TetrominoDefinition = {
  type: TetrominoType;
  rotations: TetrominoCell[][];
};

export const TETROMINO_ORDER: TetrominoType[] = ["I", "O", "T", "L", "J", "S", "Z"];

export class TetrominoCatalog {
  private readonly definitions: Record<TetrominoType, TetrominoDefinition>;

  constructor() {
    this.definitions = {
      I: {
        type: "I",
        rotations: [
          [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 3, y: 1 }
          ],
          [
            { x: 2, y: 0 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
            { x: 2, y: 3 }
          ],
          [
            { x: 0, y: 2 },
            { x: 1, y: 2 },
            { x: 2, y: 2 },
            { x: 3, y: 2 }
          ],
          [
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 1, y: 2 },
            { x: 1, y: 3 }
          ]
        ]
      },
      O: {
        type: "O",
        rotations: [
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ]
        ]
      },
      T: {
        type: "T",
        rotations: [
          [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 1, y: 2 }
          ],
          [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 1, y: 2 }
          ],
          [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 1, y: 2 }
          ]
        ]
      },
      L: {
        type: "L",
        rotations: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 1 },
            { x: 2, y: 2 }
          ],
          [
            { x: 2, y: 1 },
            { x: 0, y: 2 },
            { x: 1, y: 2 },
            { x: 2, y: 2 }
          ],
          [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: 2 },
            { x: 1, y: 2 }
          ]
        ]
      },
      J: {
        type: "J",
        rotations: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 1 }
          ],
          [
            { x: 2, y: 0 },
            { x: 2, y: 1 },
            { x: 1, y: 2 },
            { x: 2, y: 2 }
          ],
          [
            { x: 0, y: 1 },
            { x: 0, y: 2 },
            { x: 1, y: 2 },
            { x: 2, y: 2 }
          ],
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: 2 }
          ]
        ]
      },
      S: {
        type: "S",
        rotations: [
          [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 }
          ],
          [
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 }
          ],
          [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 0, y: 2 },
            { x: 1, y: 2 }
          ],
          [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 1, y: 2 }
          ]
        ]
      },
      Z: {
        type: "Z",
        rotations: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 }
          ],
          [
            { x: 2, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 1, y: 2 }
          ],
          [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 1, y: 2 },
            { x: 2, y: 2 }
          ],
          [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: 2 }
          ]
        ]
      }
    };
  }

  getDefinition(type: TetrominoType): TetrominoDefinition {
    return this.definitions[type];
  }

  getRotation(type: TetrominoType, rotationIndex: number): TetrominoCell[] {
    const definition = this.getDefinition(type);
    const index = rotationIndex % definition.rotations.length;
    return definition.rotations[index] ?? definition.rotations[0];
  }
}
