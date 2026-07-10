import { SeededRandom } from '../../src/random';
import { Simulation } from '../../src/simulation';
import type { Agent, SimulationConfig, SimulationEvent, SimulationSnapshot, TeamSummary, Vec2 } from '../../src/types';

const MAX_DRAMA_EVENTS = 40;

/**
 * ブラウザ版の軽量シミュレーションを土台に、動画専用の能力差・戦闘・協力を追加する。
 * 基盤側を壊さず、同じAgentオブジェクトへ追加状態を保持する構成。
 */
export class DramaticSimulation {
  private readonly base: Simulation;
  private readonly random: SeededRandom;
  private readonly dramaEvents: SimulationEvent[] = [];
  private readonly announcedHeroKills = new Set<string>();

  constructor(private readonly config: SimulationConfig) {
    this.base = new Simulation(config);
    this.random = new SeededRandom(config.seed ^ 0x5f3759df);
    this.decorateAgents();
  }

  start(): void {
    this.base.start();
    for (const agent of this.base.getSnapshot().agents) {
      if (agent.hero) {
        this.pushEvent('hero', `チーム${agent.team + 1}の英雄 #${agent.id + 1} が参戦`, agent);
      }
    }
  }

  step(): void {
    if (this.base.getSnapshot().status !== 'running') return;
    this.base.step();
    const snapshot = this.base.getSnapshot();
    if (snapshot.status !== 'running') return;

    this.reduceCooldowns(snapshot.agents);
    this.applyTraitMovement(snapshot);
    this.applyCooperation(snapshot);
    this.applyCombat(snapshot);
  }

  getSnapshot(): SimulationSnapshot {
    const snapshot = this.base.getSnapshot();
    const events = [...snapshot.events, ...this.dramaEvents]
      .sort((a, b) => a.tick - b.tick)
      .slice(-24);
    const teams = this.teamSummaries(snapshot.agents);
    const livingTeams = teams.filter((team) => team.alive > 0);
    let winnerTeam = snapshot.winnerTeam;
    if (snapshot.status === 'finished' && winnerTeam === null && livingTeams.length) {
      winnerTeam = [...teams].sort((a, b) => b.alive - a.alive || a.team - b.team)[0]?.team ?? null;
    }

    return { ...snapshot, events, teams, winnerTeam };
  }

  private decorateAgents(): void {
    const agents = this.base.getSnapshot().agents;
    for (const agent of agents) {
      agent.maxHealth = this.random.range(88, 112);
      agent.health = agent.maxHealth;
      agent.strength = this.random.range(0.78, 1.28);
      agent.speedTrait = this.random.range(0.86, 1.18);
      agent.kindness = this.random.range(0.05, 1);
      agent.bravery = this.random.range(0.05, 1);
      agent.hero = false;
      agent.kills = 0;
      agent.shares = 0;
      agent.rescues = 0;
      agent.attackCooldown = this.random.range(0, 12);
      agent.supportCooldown = this.random.range(0, 30);
      agent.targetAgentId = null;
    }

    for (let team = 0; team < this.config.teams; team += 1) {
      const members = agents.filter((agent) => agent.team === team);
      const hero = [...members].sort((a, b) => this.heroScore(b) - this.heroScore(a))[0];
      if (!hero) continue;
      hero.hero = true;
      hero.maxHealth = 138;
      hero.health = hero.maxHealth;
      hero.strength = Math.max(hero.strength ?? 1, 1.48);
      hero.speedTrait = Math.max(hero.speedTrait ?? 1, 1.12);
      hero.bravery = Math.max(hero.bravery ?? 0, 0.9);
      hero.size *= 1.13;
    }
  }

  private heroScore(agent: Agent): number {
    return (agent.strength ?? 1) * 2 + (agent.speedTrait ?? 1) + (agent.bravery ?? 0) + (agent.kindness ?? 0) * 0.45;
  }

  private reduceCooldowns(agents: readonly Agent[]): void {
    for (const agent of agents) {
      if (!agent.alive) continue;
      agent.attackCooldown = Math.max(0, (agent.attackCooldown ?? 0) - 1);
      agent.supportCooldown = Math.max(0, (agent.supportCooldown ?? 0) - 1);
      agent.targetAgentId = null;
    }
  }

  private applyTraitMovement(snapshot: SimulationSnapshot): void {
    const agents = snapshot.agents;
    for (const agent of agents) {
      if (!agent.alive) continue;
      const speedBonus = ((agent.speedTrait ?? 1) - 1) * this.config.moveSpeed * 0.32;
      agent.position.x += agent.velocity.x * speedBonus;
      agent.position.y += agent.velocity.y * speedBonus;
      this.keepInWorld(agent.position);

      if ((agent.health ?? 100) < 28) {
        const enemy = this.nearest(agent, agents, (candidate) => candidate.team !== agent.team, 9);
        if (enemy) {
          agent.action = 'fleeing';
          this.moveAway(agent, enemy.position, this.config.moveSpeed * 0.65);
        }
        continue;
      }

      if ((agent.bravery ?? 0) > 0.62 && agent.hunger > 38 && this.random.next() < 0.075) {
        const enemy = this.nearest(agent, agents, (candidate) => candidate.team !== agent.team, 13);
        if (enemy) this.moveToward(agent, enemy.position, this.config.moveSpeed * 0.28);
      }
    }
  }

  private applyCooperation(snapshot: SimulationSnapshot): void {
    const agents = snapshot.agents;
    for (const receiver of agents) {
      if (!receiver.alive || (receiver.supportCooldown ?? 0) > 0) continue;

      if (receiver.hunger < 28) {
        const donor = this.nearest(
          receiver,
          agents,
          (candidate) => candidate.team === receiver.team && candidate.hunger > 68 && (candidate.kindness ?? 0) > 0.58 && (candidate.supportCooldown ?? 0) <= 0,
          5.2,
        );
        if (donor && this.random.next() < 0.14) {
          const amount = Math.min(18, donor.hunger - 54);
          donor.hunger -= amount;
          receiver.hunger = Math.min(100, receiver.hunger + amount);
          donor.action = 'sharing_food';
          receiver.action = 'sharing_food';
          donor.shares = (donor.shares ?? 0) + 1;
          donor.supportCooldown = 48;
          receiver.supportCooldown = 24;
          this.pushEvent('cooperation', `#${donor.id + 1} が仲間へ食料を分配`, donor, receiver);
          continue;
        }
      }

      if ((receiver.health ?? 100) < 48) {
        const helper = this.nearest(
          receiver,
          agents,
          (candidate) => candidate.team === receiver.team && (candidate.health ?? 0) > 62 && (candidate.kindness ?? 0) > 0.72 && candidate.hunger > 34 && (candidate.supportCooldown ?? 0) <= 0,
          4.6,
        );
        if (helper && this.random.next() < 0.1) {
          const heal = helper.hero ? 16 : 11;
          receiver.health = Math.min(receiver.maxHealth ?? 100, (receiver.health ?? 0) + heal);
          helper.hunger -= 4;
          helper.action = 'helping';
          receiver.action = 'helping';
          helper.rescues = (helper.rescues ?? 0) + 1;
          helper.supportCooldown = 65;
          receiver.supportCooldown = 30;
          this.pushEvent('cooperation', `#${helper.id + 1} が負傷した仲間を救助`, helper, receiver);
        }
      }
    }
  }

  private applyCombat(snapshot: SimulationSnapshot): void {
    const agents = snapshot.agents;
    const aliveCount = agents.reduce((sum, agent) => sum + Number(agent.alive), 0);
    const foodCount = snapshot.foods.reduce((sum, food) => sum + Number(food.available), 0);
    const scarcity = foodCount / Math.max(1, aliveCount) < 0.38;

    for (const attacker of agents) {
      if (!attacker.alive || (attacker.attackCooldown ?? 0) > 0 || (attacker.health ?? 0) <= 0) continue;
      const target = this.nearest(attacker, agents, (candidate) => candidate.team !== attacker.team, 5.4);
      if (!target) continue;

      const aggression = 0.025 + (attacker.bravery ?? 0) * 0.055 + (scarcity ? 0.045 : 0) + (attacker.hero ? 0.025 : 0);
      if (this.random.next() > aggression) continue;

      if ((attacker.health ?? 100) < 24 && !attacker.hero) {
        attacker.action = 'fleeing';
        this.moveAway(attacker, target.position, this.config.moveSpeed * 0.9);
        attacker.attackCooldown = 6;
        continue;
      }

      const damage = this.random.range(5.2, 9.8) * (attacker.strength ?? 1) * (attacker.hero ? 1.08 : 1);
      target.health = Math.max(0, (target.health ?? 100) - damage);
      attacker.action = 'fighting';
      target.action = 'fighting';
      attacker.targetAgentId = target.id;
      target.targetAgentId = attacker.id;
      attacker.attackCooldown = this.random.range(7, 13) / Math.max(0.75, attacker.speedTrait ?? 1);
      target.hunger = Math.max(0, target.hunger - 0.7);

      if ((target.health ?? 0) <= 0) this.defeat(attacker, target, snapshot.tick);
    }
  }

  private defeat(attacker: Agent, target: Agent, tick: number): void {
    target.alive = false;
    target.action = 'dead';
    target.targetFoodId = null;
    target.targetAgentId = attacker.id;
    target.health = 0;
    attacker.kills = (attacker.kills ?? 0) + 1;
    this.dramaEvents.push({
      tick,
      kind: 'combat',
      message: `${attacker.hero ? '英雄 ' : ''}#${attacker.id + 1} が #${target.id + 1} を撃破`,
      agentId: attacker.id,
      targetAgentId: target.id,
      team: attacker.team,
    });
    this.trimEvents();

    const killKey = `${attacker.id}:${attacker.kills}`;
    if (attacker.hero && ((attacker.kills ?? 0) === 1 || (attacker.kills ?? 0) === 3) && !this.announcedHeroKills.has(killKey)) {
      this.announcedHeroKills.add(killKey);
      this.pushEvent('hero', `英雄 #${attacker.id + 1} が${attacker.kills}人目を撃破`, attacker, target);
    }
  }

  private nearest(
    origin: Agent,
    agents: readonly Agent[],
    predicate: (candidate: Agent) => boolean,
    range: number,
  ): Agent | undefined {
    let nearestAgent: Agent | undefined;
    let nearestDistance = range;
    for (const candidate of agents) {
      if (!candidate.alive || candidate.id === origin.id || !predicate(candidate)) continue;
      const currentDistance = distance(origin.position, candidate.position);
      if (currentDistance < nearestDistance) {
        nearestAgent = candidate;
        nearestDistance = currentDistance;
      }
    }
    return nearestAgent;
  }

  private moveToward(agent: Agent, target: Vec2, speed: number): void {
    const dx = target.x - agent.position.x;
    const dy = target.y - agent.position.y;
    const length = Math.hypot(dx, dy) || 1;
    agent.velocity = { x: dx / length, y: dy / length };
    agent.position.x += agent.velocity.x * speed;
    agent.position.y += agent.velocity.y * speed;
    this.keepInWorld(agent.position);
  }

  private moveAway(agent: Agent, threat: Vec2, speed: number): void {
    const dx = agent.position.x - threat.x;
    const dy = agent.position.y - threat.y;
    const length = Math.hypot(dx, dy) || 1;
    agent.velocity = { x: dx / length, y: dy / length };
    agent.position.x += agent.velocity.x * speed;
    agent.position.y += agent.velocity.y * speed;
    this.keepInWorld(agent.position);
  }

  private keepInWorld(position: Vec2): void {
    position.x = Math.max(0, Math.min(this.config.worldWidth, position.x));
    position.y = Math.max(0, Math.min(this.config.worldHeight, position.y));
  }

  private teamSummaries(agents: readonly Agent[]): TeamSummary[] {
    return Array.from({ length: this.config.teams }, (_, team) => {
      const members = agents.filter((agent) => agent.team === team);
      return { team, alive: members.filter((agent) => agent.alive).length, total: members.length };
    });
  }

  private pushEvent(kind: SimulationEvent['kind'], message: string, agent?: Agent, target?: Agent): void {
    const tick = this.base.getSnapshot().tick;
    const latest = this.dramaEvents.at(-1);
    if (latest?.message === message && tick - latest.tick < 20) return;
    this.dramaEvents.push({ tick, kind, message, agentId: agent?.id, targetAgentId: target?.id, team: agent?.team });
    this.trimEvents();
  }

  private trimEvents(): void {
    if (this.dramaEvents.length > MAX_DRAMA_EVENTS) this.dramaEvents.splice(0, this.dramaEvents.length - MAX_DRAMA_EVENTS);
  }
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
