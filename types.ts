export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export interface DifficultyConfig {
  gridSize: number;
  nodeCount: [number, number]; // min, max
  maxConnections: number;
  scale: number;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.EASY]: {
    gridSize: 5,
    nodeCount: [6, 9],
    maxConnections: 4,
    scale: 1.0,
  },
  [Difficulty.MEDIUM]: {
    gridSize: 7,
    nodeCount: [8, 12],
    maxConnections: 6,
    scale: 0.85,
  },
  [Difficulty.HARD]: {
    gridSize: 10,
    nodeCount: [12, 18],
    maxConnections: 8,
    scale: 0.7,
  },
};

export interface GridPoint {
  x: number;
  y: number;
}

// Logic representation of a House
export interface NodeData {
  id: string;
  x: number;
  y: number;
  requiredConnections: number;
  currentConnections: number;
}

// Logic representation of a Cable
export interface EdgeData {
  nodeA: string;
  nodeB: string;
  count: number; // 1 or 2
}

export interface GameStats {
  easy: { completed: number; time: number };
  medium: { completed: number; time: number };
  hard: { completed: number; time: number };
}

// Events emitted from Phaser to React
export type GameEventType = 'PUZZLE_SOLVED' | 'TIMER_TICK' | 'PUZZLE_IMPOSSIBLE' | 'HISTORY_UPDATE';

export interface GameEvent {
  type: GameEventType;
  payload?: any;
}