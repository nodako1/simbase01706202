export type Vec2 = { x: number; y: number };

export type SpecialRule = 'none' | 'sinking_island';
export type WinCondition = 'most_survivors' | 'last_team_standing';
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'finished';
export type AgentAction =
  | 'wandering'
  | 'seeking_food'
  | 'eating'
  | 'escaping_water'
  | 'fighting'
  | 'fleeing'
  | 'sharing_food'
  | 'helping'
  | 'dead';

export interface SimulationConfig {
  title: string;
  worldWidth: number;
  worldHeight: number;
  population: number;
  teams: number;
  foodCount: number;
  simulationTicks: number;
  ticksPerSecond: number;
  playbackSpeed: number;
  framesPerSecond: number;
  videoWidth: number;
  videoHeight: number;
  hungerDrainPerTick: number;
  foodRestore: number;
  moveSpeed: number;
  visionRange: number;
  specialRule: SpecialRule;
  winCondition: WinCondition;
  seed: number;
}

export interface Agent {
  id: number;
  team: number;
  position: Vec2;
  velocity: Vec2;
  hunger: number;
  alive: boolean;
  action: AgentAction;
  ageTicks: number;
  targetFoodId: number | null;
  size: number;

  // 動画生成用ドラマエンジンで付与される能力値。ブラウザ版では未設定でも動作する。
  health?: number;
  maxHealth?: number;
  strength?: number;
  speedTrait?: number;
  kindness?: number;
  bravery?: number;
  hero?: boolean;
  kills?: number;
  shares?: number;
  rescues?: number;
  attackCooldown?: number;
  supportCooldown?: number;
  targetAgentId?: number | null;
}

export interface Food {
  id: number;
  position: Vec2;
  nutrition: number;
  available: boolean;
}

export interface SimulationEvent {
  tick: number;
  kind: 'info' | 'warning' | 'death' | 'milestone' | 'result' | 'combat' | 'cooperation' | 'hero';
  message: string;
  agentId?: number;
  targetAgentId?: number;
  team?: number;
}

export interface TeamSummary {
  team: number;
  alive: number;
  total: number;
}

export interface SimulationSnapshot {
  status: SimulationStatus;
  tick: number;
  elapsedSeconds: number;
  safeRadius: number;
  agents: readonly Agent[];
  foods: readonly Food[];
  events: readonly SimulationEvent[];
  teams: TeamSummary[];
  winnerTeam: number | null;
}
