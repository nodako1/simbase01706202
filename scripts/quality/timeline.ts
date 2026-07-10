import type { Agent, SimulationConfig, SimulationSnapshot, TeamSummary } from '../../src/types';
import { DramaticSimulation } from './drama-simulation';
import type { Timeline, TimelineMoment, TimelineSelection } from './types';

type Metrics = {
  alive: number;
  food: number;
  leaderTeam: number | null;
  safeRadius: number;
  kills: number;
  shares: number;
  rescues: number;
  killsByAgent: Map<number, number>;
  sharesByAgent: Map<number, number>;
  rescuesByAgent: Map<number, number>;
};

export function selectBestTimeline(config: SimulationConfig, requestedAttempts = 6): TimelineSelection {
  const attempts = clampInt(requestedAttempts, 1, 12);
  let best: TimelineSelection | null = null;

  for (let index = 0; index < attempts; index += 1) {
    const candidateConfig = { ...config, seed: config.seed + index * 7919 };
    const timeline = buildTimeline(candidateConfig);
    const score = scoreTimeline(timeline);
    console.log(`Candidate ${index + 1}/${attempts}: seed=${candidateConfig.seed}, dramaScore=${score.toFixed(1)}`);
    if (!best || score > best.score) best = { timeline, config: candidateConfig, score, attempts };
  }

  if (!best) throw new Error('No simulation timeline was generated.');
  return best;
}

export function buildTimeline(config: SimulationConfig): Timeline {
  const simulation = new DramaticSimulation(config);
  const snapshots: SimulationSnapshot[] = [];
  const moments: TimelineMoment[] = [];
  const seen = new Set<string>();
  const sampleEvery = Math.max(1, Math.ceil(config.simulationTicks / 2600));

  let snapshot = cloneSnapshot(simulation.getSnapshot());
  snapshots.push(snapshot);
  let previous = metrics(snapshot);
  simulation.start();

  while (simulation.getSnapshot().status === 'running') {
    simulation.step();
    const current = simulation.getSnapshot();
    const currentMetrics = metrics(current);
    const detected = detectMoments(previous, currentMetrics, current, seen, config);
    moments.push(...detected);
    if (current.tick % sampleEvery === 0 || detected.length || current.status === 'finished') {
      snapshot = cloneSnapshot(current);
      snapshots.push(snapshot);
    }
    previous = currentMetrics;
  }

  const finalSnapshot = cloneSnapshot(simulation.getSnapshot());
  if (snapshots.at(-1)?.tick !== finalSnapshot.tick) snapshots.push(finalSnapshot);
  const champion = topPerformer(finalSnapshot);
  moments.push({
    tick: finalSnapshot.tick,
    kind: 'finale',
    title: finalSnapshot.winnerTeam === null ? '生存者ゼロ' : `チーム${finalSnapshot.winnerTeam + 1}が勝利`,
    subtitle: champion
      ? `MVP #${champion.id + 1}　撃破${champion.kills ?? 0}・救助${champion.rescues ?? 0}`
      : finalSnapshot.winnerTeam === null ? '実験は全滅という結末へ' : '最後まで生き残ったチームが決定',
    score: 10,
    focusAgentId: champion?.id ?? endangered(finalSnapshot)?.id ?? null,
  });

  return { snapshots, moments: dedupe(moments), finalTick: finalSnapshot.tick };
}

export function buildPlaybackTicks(finalTick: number, moments: TimelineMoment[], frameCount: number): number[] {
  if (finalTick <= 0) return Array.from({ length: frameCount }, () => 0);
  const weights = new Float64Array(finalTick + 1);
  weights.fill(1);
  for (const moment of moments) {
    const radius = Math.max(12, Math.round(finalTick * (moment.kind === 'combat' || moment.kind === 'hero' ? 0.022 : 0.016)));
    for (let offset = -radius; offset <= radius; offset += 1) {
      const tick = moment.tick + offset;
      if (tick < 0 || tick > finalTick) continue;
      const proximity = 1 - Math.abs(offset) / (radius + 1);
      weights[tick] += proximity * moment.score * 0.78;
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
    const escape = Number(b.action === 'escaping_water' || b.action === 'fleeing') - Number(a.action === 'escaping_water' || a.action === 'fleeing');
    const health = (a.health ?? 100) - (b.health ?? 100);
    return escape || health || a.hunger - b.hunger;
  })[0];
}

export function topPerformer(snapshot: SimulationSnapshot): Agent | undefined {
  return [...snapshot.agents].sort((a, b) => performanceScore(b) - performanceScore(a))[0];
}

function detectMoments(
  previous: Metrics,
  current: Metrics,
  snapshot: SimulationSnapshot,
  seen: Set<string>,
  config: SimulationConfig,
): TimelineMoment[] {
  const result: TimelineMoment[] = [];
  const loss = previous.alive - current.alive;
  const focus = endangered(snapshot)?.id ?? null;
  const combatDelta = current.kills - previous.kills;
  const shareDelta = current.shares - previous.shares;
  const rescueDelta = current.rescues - previous.rescues;

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

  if (combatDelta > 0) {
    const attacker = changedAgent(snapshot, previous.killsByAgent, 'kills');
    result.push({
      tick: snapshot.tick,
      kind: 'combat',
      title: combatDelta > 1 ? `${combatDelta}人が戦闘で脱落` : '戦闘で1人脱落',
      subtitle: attacker
        ? `${attacker.hero ? '英雄 ' : ''}#${attacker.id + 1}　通算${attacker.kills ?? 0}撃破`
        : `生存者は残り${current.alive}人`,
      score: combatDelta > 1 ? 9 : 7.5,
      focusAgentId: attacker?.id ?? focus,
    });
  }

  const hero = [...snapshot.agents].filter((agent) => agent.hero).sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))[0];
  if (hero) {
    for (const threshold of [1, 3, 5]) {
      const key = `hero:${hero.id}:${threshold}`;
      if (!seen.has(key) && (hero.kills ?? 0) >= threshold) {
        seen.add(key);
        result.push({
          tick: snapshot.tick,
          kind: 'hero',
          title: threshold === 1 ? '英雄が初撃破' : `英雄が${threshold}人撃破`,
          subtitle: `チーム${hero.team + 1}の #${hero.id + 1} が戦況を変える`,
          score: threshold >= 3 ? 9.5 : 8,
          focusAgentId: hero.id,
        });
      }
    }
  }

  if (shareDelta > 0) {
    const helper = changedAgent(snapshot, previous.sharesByAgent, 'shares');
    result.push({
      tick: snapshot.tick,
      kind: 'cooperation',
      title: '仲間へ食料を分配',
      subtitle: helper ? `#${helper.id + 1} の判断がチームを救う` : '協力行動が発生',
      score: 6.5,
      focusAgentId: helper?.id ?? focus,
    });
  }

  if (rescueDelta > 0) {
    const helper = changedAgent(snapshot, previous.rescuesByAgent, 'rescues');
    result.push({
      tick: snapshot.tick,
      kind: 'cooperation',
      title: '負傷した仲間を救助',
      subtitle: helper ? `#${helper.id + 1} が脱落寸前の仲間を回復` : 'チームの救助行動',
      score: 7,
      focusAgentId: helper?.id ?? focus,
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
    const key = `alive:${count}`;
    if (!seen.has(key) && previous.alive > count && current.alive <= count) {
      seen.add(key);
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
    result.push({ tick: snapshot.tick, kind: 'resource', title: '食料が残り10個', subtitle: '資源不足で戦闘が激化する', score: 7, focusAgentId: focus });
  } else if (previous.food > 0 && current.food === 0) {
    result.push({ tick: snapshot.tick, kind: 'resource', title: '食料が尽きた', subtitle: '協力するか、奪い合うか', score: 9, focusAgentId: focus });
  }

  if (config.specialRule === 'sinking_island' && previous.safeRadius > 0.72 && current.safeRadius <= 0.72) {
    result.push({ tick: snapshot.tick, kind: 'danger', title: '安全地帯が急縮小', subtitle: '逃げ場をめぐる戦闘が始まる', score: 8, focusAgentId: focus });
  }
  return result;
}

function scoreTimeline(timeline: Timeline): number {
  const finalSnapshot = timeline.snapshots.at(-1);
  if (!finalSnapshot) return 0;
  const kinds = new Set(timeline.moments.map((moment) => moment.kind));
  const leaderChanges = timeline.moments.filter((moment) => moment.kind === 'leader').length;
  const combatMoments = timeline.moments.filter((moment) => moment.kind === 'combat').length;
  const cooperationMoments = timeline.moments.filter((moment) => moment.kind === 'cooperation').length;
  const heroMoments = timeline.moments.filter((moment) => moment.kind === 'hero').length;
  const totalKills = finalSnapshot.agents.reduce((sum, agent) => sum + (agent.kills ?? 0), 0);
  const totalSupport = finalSnapshot.agents.reduce((sum, agent) => sum + (agent.shares ?? 0) + (agent.rescues ?? 0), 0);
  const survivors = finalSnapshot.teams.reduce((sum, team) => sum + team.alive, 0);
  const ranking = [...finalSnapshot.teams].sort((a, b) => b.alive - a.alive || a.team - b.team);
  const margin = (ranking[0]?.alive ?? 0) - (ranking[1]?.alive ?? 0);

  let score = timeline.moments.reduce((sum, moment) => sum + moment.score, 0);
  score += kinds.size * 7;
  score += leaderChanges * 5 + combatMoments * 3 + cooperationMoments * 3.5 + heroMoments * 5;
  score += Math.min(24, totalKills * 0.9) + Math.min(14, totalSupport * 0.7);
  if (survivors > 0 && survivors <= Math.max(8, Math.ceil(finalSnapshot.agents.length * 0.28))) score += 12;
  if (survivors === 0) score += 3;
  if (ranking[1]?.alive && margin <= 3) score += 10;
  return score;
}

function metrics(snapshot: SimulationSnapshot): Metrics {
  const killsByAgent = new Map<number, number>();
  const sharesByAgent = new Map<number, number>();
  const rescuesByAgent = new Map<number, number>();
  for (const agent of snapshot.agents) {
    killsByAgent.set(agent.id, agent.kills ?? 0);
    sharesByAgent.set(agent.id, agent.shares ?? 0);
    rescuesByAgent.set(agent.id, agent.rescues ?? 0);
  }
  return {
    alive: snapshot.teams.reduce((sum, team) => sum + team.alive, 0),
    food: snapshot.foods.filter((food) => food.available).length,
    leaderTeam: leader(snapshot.teams).team,
    safeRadius: snapshot.safeRadius,
    kills: snapshot.agents.reduce((sum, agent) => sum + (agent.kills ?? 0), 0),
    shares: snapshot.agents.reduce((sum, agent) => sum + (agent.shares ?? 0), 0),
    rescues: snapshot.agents.reduce((sum, agent) => sum + (agent.rescues ?? 0), 0),
    killsByAgent,
    sharesByAgent,
    rescuesByAgent,
  };
}

function changedAgent(snapshot: SimulationSnapshot, previous: Map<number, number>, field: 'kills' | 'shares' | 'rescues'): Agent | undefined {
  return [...snapshot.agents]
    .filter((agent) => (agent[field] ?? 0) > (previous.get(agent.id) ?? 0))
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0];
}

function representative(snapshot: SimulationSnapshot, team: number): Agent | undefined {
  return [...snapshot.agents]
    .filter((agent) => agent.alive && agent.team === team)
    .sort((a, b) => Number(b.hero) - Number(a.hero) || performanceScore(b) - performanceScore(a))[0];
}

function performanceScore(agent: Agent): number {
  return (agent.alive ? 3 : 0) + (agent.kills ?? 0) * 5 + (agent.rescues ?? 0) * 2.5 + (agent.shares ?? 0) * 1.5 + (agent.hero ? 2 : 0) + (agent.health ?? 0) / 100;
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

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}
