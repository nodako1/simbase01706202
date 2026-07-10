import type { SimulationConfig, SimulationSnapshot } from '../../src/types';
import { endangered, leader, topPerformer } from './timeline';
import type { DirectorFrame, Phase, TimelineMoment } from './types';

export class AutoDirector {
  private activeCue: TimelineMoment | null = null;
  private remaining = 0;
  private total = 1;
  private momentIndex = 0;
  private previousTick = 0;

  constructor(
    private readonly moments: TimelineMoment[],
    private readonly sourceFps: number,
    private readonly config: SimulationConfig,
  ) {}

  update(snapshot: SimulationSnapshot, phase: Phase): DirectorFrame {
    if (phase === 'simulation') this.consume(snapshot.tick);
    if (this.remaining > 0) this.remaining -= 1;
    if (this.remaining <= 0) this.activeCue = null;

    const aliveAgents = snapshot.agents.filter((agent) => agent.alive);
    const alive = aliveAgents.length;
    let focusAgentId = this.activeCue?.focusAgentId ?? null;
    if (focusAgentId !== null && !aliveAgents.some((agent) => agent.id === focusAgentId)) focusAgentId = null;

    if (focusAgentId === null && alive <= 16) {
      focusAgentId = topPerformer(snapshot)?.id ?? endangered(snapshot)?.id ?? null;
    }
    if (focusAgentId === null && this.activeCue?.kind === 'cooperation') {
      focusAgentId = [...aliveAgents].sort((a, b) => ((b.shares ?? 0) + (b.rescues ?? 0)) - ((a.shares ?? 0) + (a.rescues ?? 0)))[0]?.id ?? null;
    }

    const focus = focusAgentId === null ? undefined : aliveAgents.find((agent) => agent.id === focusAgentId);
    const urgency = phase === 'result' ? 1 : clamp01((24 - alive) / 24);
    const dramaticCue = this.activeCue?.kind === 'combat' || this.activeCue?.kind === 'hero';
    const cooperationCue = this.activeCue?.kind === 'cooperation';

    this.previousTick = snapshot.tick;
    return {
      cue: this.activeCue,
      cueProgress: this.activeCue ? this.remaining / this.total : 0,
      focusAgentId,
      leaderTeam: leader(snapshot.teams).team,
      zoom: phase === 'simulation'
        ? focus
          ? dramaticCue ? 1.72 : cooperationCue ? 1.58 : 1.42 + urgency * 0.18
          : 1 + urgency * 0.18
        : 1,
      cameraCenter: focus?.position ?? { x: this.config.worldWidth / 2, y: this.config.worldHeight / 2 },
      urgency,
    };
  }

  private consume(tick: number): void {
    while (this.momentIndex < this.moments.length && this.moments[this.momentIndex].tick <= tick) {
      const moment = this.moments[this.momentIndex];
      if (moment.tick > this.previousTick) this.activate(moment);
      this.momentIndex += 1;
    }
  }

  private activate(moment: TimelineMoment): void {
    if (this.activeCue && this.activeCue.score > moment.score && this.remaining > this.sourceFps * 0.45) return;
    this.activeCue = moment;
    const multiplier = moment.kind === 'combat' || moment.kind === 'hero' ? 2.05 : moment.kind === 'cooperation' ? 1.7 : moment.score >= 8 ? 1.75 : 1.25;
    this.total = Math.max(10, Math.round(this.sourceFps * multiplier));
    this.remaining = this.total;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
