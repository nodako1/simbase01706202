import { Simulation } from '../../src/simulation';
import type { Agent, SimulationConfig, SimulationSnapshot, TeamSummary } from '../../src/types';
import type { Timeline, TimelineMoment } from './types';

type Metrics = {
  alive: number;
  food: number;
  leaderTeam: number | null;
  safeRadius: number;
};

export function buildTimeline(config: SimulationConfig): Timeline {
  const simulation = new Simulation(config);
  const snapshots: SimulationSnapshot[] = [];
  const moments: TimelineMoment[] = [];
  const seenMilestones = new Set<number>();
  const sampleEvery = Math.max(1, Math.ceil(config.simulationTicks / 2600));

  let snapshot = cloneSnapshot(simulation.getSnapshot());
  snapshots.push(snapshot);
  let previous = metrics(snapshot);
  simulation.start();

  while (simulation.getSnapshot().status === 'running') {
    simulation.step();
    const current = simulation.getSnapshot();
    const currentMetrics = metrics(current);
    const detected = detectMoments(previous, currentMetrics, current, seenMilestones, config);
    moments.push(...detected);
    if (current.tick % sampleEvery === 0 || detected.length || current.status === 'finished') {
      snapshot = cloneSnapshot(current);
      snapshots.push(snapshot);
    }
    previous = currentMetrics;
  }

  const finalSnapshot = cloneSnapshot(simulation.getSnapshot());
  if (snapshots.at(-1)?.tick !== finalSnapshot.tick) snapshots.push(finalSnapshot);
  moments.push({
    tick: finalSnapshot.tick,
    kind: 'finale',
    title: finalSnapshot.winnerTeam === null ? '生存者ゼロ' : `チーム${finalSnapshot.winnerTeam + 1}が勝利`,
    subtitle: finalSnapshot.winnerTeam === null ? '実験は全滅という結末へ' : '最後まで生き残ったチームが決定',
    score: 10,
    focusAgentId: endangered(finalSnapshot)?.id ?? null,
  });

  return { snapshots, moments: dedupe(moments), finalTick: finalSnapshot.tick };
}

export function buildPlaybackTicks(finalTick: number, moments: TimelineMoment[], frameCount: number): number[] {
  if (finalTick <= 0) return Array.from({ length: frameCount }, () => 0);
  const weights = new Float64Array(finalTick + 1);
  weights.fill(1);
  for (const moment of moments) {
    const radius = Math.max(12, Math.round(finalTick * 0.016));
    for (let offset = -radius; offset <= radius; offset += 1) {
      const tick = moment.tick + offset;
      if (tick < 0 || tick > finalTick) continue;
      const proximity = 1 - Math.abs(offset) / (radius + 1);
      weights[tick] += proximity * moment.score * 0.75;
    }
  }
  const cumulative = new Float64Array(finalTick + 1);
  let total = 0;
  for (let tick = 0; tick <= finalTick; tick += 1) {
    total += weights[tick];
    cumulative[tick] = total;
  }
  return Array.from({ length: frameCount }, (_, index) => {
    const target = ((index + 1) / frameCount) * total;
    return lowerBound(cumulative, target);
  });
}

export function findSnapshot(snapshots: SimulationSnapshot[], tick: number): SimulationSnapshot {
  let low = 0;
  let high = snapshots.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (snapshots[mid].tick <= tick) low = mid;
    else high = mid - 1;
  }
  return snapshots[low];
}

export function leader(teams: TeamSummary[]): { team: number | null; alive: number } {
  const sorted = [...teams].sort((a, b) => b.alive - a.alive || a.team - b.team);
  return sorted[0]?.alive > 0 ? { team: sorted[0].team, alive: sorted[0].alive } : { team: null, alive: 0 };
}

export function endangered(snapshot: SimulationSnapshot): Agent | undefined {
  return [...snapshot.agents].filter((agent) => agent.alive).sort((a, b) => {
    const escape = Number(b.action === 'escaping_water') - Number(a.action === 'escaping_water');
    return escape || a.hunger - b.hunger;
  })[0];
}

function detectMoments(
  previous: Metrics,
  current: Metrics,
  snapshot: SimulationSnapshot,
  seen: Set<number>,
  config: SimulationConfig,
): TimelineMoment[] {
  const result: TimelineMoment[] = [];
  const loss = previous.alive - current.alive;
  const focus = endangered(snapshot)?.id ?? null;

  if (previous.leaderTeam !== null && current.leaderTeam !== null && previous.leaderTeam !== current.leaderTeam) {
    result.push({
      tick: snapshot.tick,
      kind: 'leader',
      title: '首位交代',
      subtitle: `チーム${current.leaderTeam + 1}がトップに浮上`,
      score: 7,
      focusAgentId: representative(snapshot, current.leaderTeam)?.id ?? focus,
    });
  }
  if (loss >= Math.max(3, Math.ceil(config.population * 0.04))) {
    result.push({
      tick: snapshot.tick,
      kind: 'collapse',
      title: `${loss}人が一気に脱落`,
      subtitle: `生存者は残り${current.alive}人`,
      score: 9,
      focusAgentId: focus,
    });
  }
  for (const threshold of [75, 50, 25, 10, 5]) {
    const count = Math.min(config.population, threshold);
    if (!seen.has(count) && previous.alive > count && current.alive <= count) {
      seen.add(count);
      result.push({
        tick: snapshot.tick,
        kind: count <= 10 ? 'finale' : 'milestone',
        title: `生存者、残り${current.alive}人`,
        subtitle: count <= 10 ? '一人の判断が勝敗を分ける' : '実験は次の局面へ',
        score: count <= 10 ? 9 : 6,
        focusAgentId: focus,
      });
    }
  }
  if (previous.food > 10 && current.food <= 10) {
    result.push({ tick: snapshot.tick, kind: 'resource', title: '食料が残り10個', subtitle: '資源不足が一気に深刻化', score: 7, focusAgentId: focus });
  } else if (previous.food > 0 && current.food === 0) {
    result.push({ tick: snapshot.tick, kind: 'resource', title: '食料が尽きた', subtitle: 'ここから先は空腹との戦い', score: 9, focusAgentId: focus });
  }
  if (config.specialRule === 'sinking_island' && previous.safeRadius > 0.72 && current.safeRadius <= 0.72) {
    result.push({ tick: snapshot.tick, kind: 'danger', title: '安全地帯が急縮小', subtitle: '逃げ遅れた住民が危険にさらされる', score: 8, focusAgentId: focus });
  }
  return result;
}

function metrics(snapshot: SimulationSnapshot): Metrics {
  return {
    alive: snapshot.teams.reduce((sum, team) => sum + team.alive, 0),
    food: snapshot.foods.filter((food) => food.available).length,
    leaderTeam: leader(snapshot.teams).team,
    safeRadius: snapshot.safeRadius,
  };
}

function representative(snapshot: SimulationSnapshot, team: number): Agent | undefined {
  return [...snapshot.agents].filter((agent) => agent.alive && agent.team === team).sort((a, b) => b.hunger - a.hunger)[0];
}

function cloneSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  return {
    status: snapshot.status,
    tick: snapshot.tick,
    elapsedSeconds: snapshot.elapsedSeconds,
    safeRadius: snapshot.safeRadius,
    agents: snapshot.agents.map((agent) => ({ ...agent, position: { ...agent.position }, velocity: { ...agent.velocity } })),
    foods: snapshot.foods.map((food) => ({ ...food, position: { ...food.position } })),
    events: snapshot.events.map((event) => ({ ...event })),
    teams: snapshot.teams.map((team) => ({ ...team })),
    winnerTeam: snapshot.winnerTeam,
  };
}

function dedupe(moments: TimelineMoment[]): TimelineMoment[] {
  const sorted = [...moments].sort((a, b) => a.tick - b.tick || b.score - a.score);
  const result: TimelineMoment[] = [];
  for (const moment of sorted) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.tick - moment.tick) < 8 && previous.kind === moment.kind) {
      if (moment.score > previous.score) result[result.length - 1] = moment;
    } else result.push(moment);
  }
  return result;
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}
