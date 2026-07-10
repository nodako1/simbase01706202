import type { SimulationSnapshot, Vec2 } from '../../src/types';

export type Phase = 'intro' | 'simulation' | 'result';
export type CueKind = 'leader' | 'danger' | 'milestone' | 'collapse' | 'resource' | 'finale';

export type TimelineMoment = {
  tick: number;
  kind: CueKind;
  title: string;
  subtitle: string;
  score: number;
  focusAgentId: number | null;
};

export type Timeline = {
  snapshots: SimulationSnapshot[];
  moments: TimelineMoment[];
  finalTick: number;
};

export type DirectorFrame = {
  cue: TimelineMoment | null;
  cueProgress: number;
  focusAgentId: number | null;
  leaderTeam: number | null;
  zoom: number;
  cameraCenter: Vec2;
  urgency: number;
};

export type VideoSettings = {
  durationSeconds?: number;
  introSeconds?: number;
  resultSeconds?: number;
  sourceFps?: number;
  outputFps?: number;
  renderWidth?: number;
  renderHeight?: number;
  finalWidth?: number;
  finalHeight?: number;
  fileName?: string;
};
