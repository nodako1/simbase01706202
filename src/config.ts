import type { SimulationConfig } from './types';

export const DEFAULT_CONFIG: SimulationConfig = {
  title: '100人を沈む島に放ったらどうなる？',
  worldWidth: 100,
  worldHeight: 100,
  population: 100,
  teams: 4,
  foodCount: 80,
  simulationTicks: 1200,
  ticksPerSecond: 20,
  playbackSpeed: 4,
  framesPerSecond: 30,
  videoWidth: 1080,
  videoHeight: 1920,
  hungerDrainPerTick: 0.12,
  foodRestore: 44,
  moveSpeed: 0.72,
  visionRange: 30,
  specialRule: 'sinking_island',
  winCondition: 'most_survivors',
  seed: 20260711,
};

export const PRESETS: Record<string, Partial<SimulationConfig>> = {
  sinking: {
    title: '100人を沈む島に放ったらどうなる？',
    specialRule: 'sinking_island',
    foodCount: 80,
    teams: 4,
    seed: 20260711,
  },
  centerFood: {
    title: '食料が中央にしかない世界で生き残るのは？',
    specialRule: 'none',
    foodCount: 45,
    teams: 4,
    seed: 10045,
  },
  scarcity: {
    title: '100人に食料20個だけ与えたらどうなる？',
    specialRule: 'none',
    foodCount: 20,
    teams: 5,
    seed: 20020,
  },
};

export function sanitizeConfig(input: Partial<SimulationConfig>): SimulationConfig {
  const merged = { ...DEFAULT_CONFIG, ...input };
  return {
    ...merged,
    title: String(merged.title).slice(0, 80),
    worldWidth: clampInt(merged.worldWidth, 40, 240),
    worldHeight: clampInt(merged.worldHeight, 40, 240),
    population: clampInt(merged.population, 2, 300),
    teams: clampInt(merged.teams, 1, 8),
    foodCount: clampInt(merged.foodCount, 0, 500),
    simulationTicks: clampInt(merged.simulationTicks, 100, 10_000),
    ticksPerSecond: clampInt(merged.ticksPerSecond, 5, 60),
    playbackSpeed: clamp(merged.playbackSpeed, 0.25, 20),
    framesPerSecond: clampInt(merged.framesPerSecond, 15, 60),
    videoWidth: clampInt(merged.videoWidth, 360, 2160),
    videoHeight: clampInt(merged.videoHeight, 640, 3840),
    hungerDrainPerTick: clamp(merged.hungerDrainPerTick, 0.01, 2),
    foodRestore: clamp(merged.foodRestore, 1, 100),
    moveSpeed: clamp(merged.moveSpeed, 0.05, 4),
    visionRange: clamp(merged.visionRange, 1, 200),
    seed: Math.trunc(Number.isFinite(merged.seed) ? merged.seed : DEFAULT_CONFIG.seed),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
