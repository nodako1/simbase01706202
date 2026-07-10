import { SeededRandom } from './random';
import type {
  Agent,
  Food,
  SimulationConfig,
  SimulationEvent,
  SimulationSnapshot,
  SimulationStatus,
  TeamSummary,
  Vec2,
} from './types';

const MAX_EVENT_HISTORY = 12;

export class Simulation {
  private random: SeededRandom;
  private agents: Agent[] = [];
  private foods: Food[] = [];
  private events: SimulationEvent[] = [];
  private status: SimulationStatus = 'idle';
  private tickCount = 0;
  private safeRadius = 1;
  private winnerTeam: number | null = null;

  constructor(private readonly config: SimulationConfig) {
    this.random = new SeededRandom(config.seed);
    this.reset();
  }

  reset(): void {
    this.random = new SeededRandom(this.config.seed);
    this.tickCount = 0;
    this.status = 'idle';
    this.safeRadius = 1;
    this.winnerTeam = null;
    this.events = [{ tick: 0, kind: 'info', message: '実験の準備が完了しました' }];
    this.agents = this.createAgents();
    this.foods = this.createFoods();
  }

  start(): void {
    if (this.status === 'finished') this.reset();
    this.status = 'running';
    this.pushEvent('milestone', 'シミュレーション開始');
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused' || this.status === 'idle') this.status = 'running';
  }

  step(): void {
    if (this.status !== 'running') return;

    this.tickCount += 1;
    this.updateSafeRadius();

    for (const agent of this.agents) {
      if (!agent.alive) continue;
      this.updateAgent(agent);
    }

    this.detectMilestones();
    this.evaluateEndCondition();
  }

  getSnapshot(): SimulationSnapshot {
    return {
      status: this.status,
      tick: this.tickCount,
      elapsedSeconds: this.tickCount / this.config.ticksPerSecond,
      safeRadius: this.safeRadius,
      agents: this.agents,
      foods: this.foods,
      events: this.events,
      teams: this.getTeamSummaries(),
      winnerTeam: this.winnerTeam,
    };
  }

  private createAgents(): Agent[] {
    return Array.from({ length: this.config.population }, (_, id) => {
      const position = this.randomPointInIsland(0.88);
      const angle = this.random.angle();
      return {
        id,
        team: id % this.config.teams,
        position,
        velocity: { x: Math.cos(angle), y: Math.sin(angle) },
        hunger: this.random.range(72, 100),
        alive: true,
        action: 'wandering',
        ageTicks: 0,
        targetFoodId: null,
        size: this.random.range(0.75, 1.2),
      };
    });
  }

  private createFoods(): Food[] {
    const centerOnly = this.config.title.includes('中央');
    return Array.from({ length: this.config.foodCount }, (_, id) => ({
      id,
      position: this.randomPointInIsland(centerOnly ? 0.25 : 0.9),
      nutrition: this.config.foodRestore,
      available: true,
    }));
  }

  private updateAgent(agent: Agent): void {
    agent.ageTicks += 1;
    agent.hunger -= this.config.hungerDrainPerTick;

    if (this.isOutsideSafeZone(agent.position)) {
      agent.hunger -= this.config.hungerDrainPerTick * 4;
      agent.action = 'escaping_water';
      this.moveToward(agent, this.worldCenter(), this.config.moveSpeed * 1.35);
    } else if (agent.hunger < 68) {
      const food = this.resolveTargetFood(agent);
      if (food) {
        agent.action = 'seeking_food';
        this.moveToward(agent, food.position, this.config.moveSpeed);
        if (distance(agent.position, food.position) < 1.7) this.consumeFood(agent, food);
      } else {
        this.wander(agent);
      }
    } else {
      this.wander(agent);
    }

    this.keepInWorld(agent.position);

    if (agent.hunger <= 0) {
      agent.alive = false;
      agent.action = 'dead';
      agent.targetFoodId = null;
      this.pushEvent('death', `チーム${agent.team + 1}の住民が空腹で脱落`);
    }
  }

  private resolveTargetFood(agent: Agent): Food | null {
    const current = agent.targetFoodId === null ? undefined : this.foods[agent.targetFoodId];
    if (current?.available && distance(agent.position, current.position) <= this.config.visionRange * 1.5) {
      return current;
    }

    let nearest: Food | null = null;
    let nearestDistance = this.config.visionRange;
    for (const food of this.foods) {
      if (!food.available) continue;
      const d = distance(agent.position, food.position);
      if (d < nearestDistance) {
        nearest = food;
        nearestDistance = d;
      }
    }
    agent.targetFoodId = nearest?.id ?? null;
    return nearest;
  }

  private consumeFood(agent: Agent, food: Food): void {
    if (!food.available) return;
    food.available = false;
    agent.hunger = Math.min(100, agent.hunger + food.nutrition);
    agent.targetFoodId = null;
    agent.action = 'eating';
    if (this.availableFoodCount() % 20 === 0) {
      this.pushEvent('warning', `残り食料は${this.availableFoodCount()}個`);
    }
  }

  private wander(agent: Agent): void {
    agent.action = 'wandering';
    if (this.random.next() < 0.055) {
      const angle = this.random.angle();
      agent.velocity.x = Math.cos(angle);
      agent.velocity.y = Math.sin(angle);
    }
    agent.position.x += agent.velocity.x * this.config.moveSpeed * 0.58;
    agent.position.y += agent.velocity.y * this.config.moveSpeed * 0.58;
  }

  private moveToward(agent: Agent, target: Vec2, speed: number): void {
    const dx = target.x - agent.position.x;
    const dy = target.y - agent.position.y;
    const length = Math.hypot(dx, dy) || 1;
    agent.velocity.x = dx / length;
    agent.velocity.y = dy / length;
    agent.position.x += agent.velocity.x * speed;
    agent.position.y += agent.velocity.y * speed;
  }

  private updateSafeRadius(): void {
    if (this.config.specialRule !== 'sinking_island') return;
    const progress = this.tickCount / this.config.simulationTicks;
    this.safeRadius = Math.max(0.24, 1 - Math.max(0, progress - 0.08) * 0.72);
    if (this.tickCount === Math.floor(this.config.simulationTicks * 0.35)) {
      this.pushEvent('warning', '島の沈下が加速しています');
    }
  }

  private isOutsideSafeZone(position: Vec2): boolean {
    if (this.config.specialRule !== 'sinking_island') return false;
    const center = this.worldCenter();
    const nx = (position.x - center.x) / (this.config.worldWidth / 2);
    const ny = (position.y - center.y) / (this.config.worldHeight / 2);
    return Math.hypot(nx, ny) > this.safeRadius;
  }

  private detectMilestones(): void {
    const alive = this.aliveCount();
    const thresholds = [75, 50, 25, 10];
    for (const threshold of thresholds) {
      if (alive === threshold) this.pushEvent('milestone', `生存者が${threshold}人になりました`);
    }
  }

  private evaluateEndCondition(): void {
    const summaries = this.getTeamSummaries();
    const livingTeams = summaries.filter((team) => team.alive > 0);
    const timedOut = this.tickCount >= this.config.simulationTicks;
    const noSurvivors = livingTeams.length === 0;
    const oneTeamLeft = livingTeams.length === 1;
    const stopOnOneTeam = this.config.winCondition === 'last_team_standing' && oneTeamLeft;

    if (!timedOut && !noSurvivors && !stopOnOneTeam) return;

    this.status = 'finished';
    const sorted = [...summaries].sort((a, b) => b.alive - a.alive || a.team - b.team);
    this.winnerTeam = sorted[0]?.alive > 0 ? sorted[0].team : null;
    this.pushEvent(
      'result',
      this.winnerTeam === null
        ? '生存者なし。実験は全滅で終了しました'
        : `チーム${this.winnerTeam + 1}が${sorted[0].alive}人生存で勝利`,
    );
  }

  private getTeamSummaries(): TeamSummary[] {
    return Array.from({ length: this.config.teams }, (_, team) => {
      const members = this.agents.filter((agent) => agent.team === team);
      return {
        team,
        alive: members.filter((agent) => agent.alive).length,
        total: members.length,
      };
    });
  }

  private availableFoodCount(): number {
    return this.foods.reduce((count, food) => count + Number(food.available), 0);
  }

  private aliveCount(): number {
    return this.agents.reduce((count, agent) => count + Number(agent.alive), 0);
  }

  private randomPointInIsland(radiusScale: number): Vec2 {
    const center = this.worldCenter();
    const angle = this.random.angle();
    const radius = Math.sqrt(this.random.next()) * radiusScale;
    return {
      x: center.x + Math.cos(angle) * radius * this.config.worldWidth * 0.47,
      y: center.y + Math.sin(angle) * radius * this.config.worldHeight * 0.47,
    };
  }

  private worldCenter(): Vec2 {
    return { x: this.config.worldWidth / 2, y: this.config.worldHeight / 2 };
  }

  private keepInWorld(position: Vec2): void {
    position.x = Math.max(0, Math.min(this.config.worldWidth, position.x));
    position.y = Math.max(0, Math.min(this.config.worldHeight, position.y));
  }

  private pushEvent(kind: SimulationEvent['kind'], message: string): void {
    const latest = this.events.at(-1);
    if (latest?.message === message && this.tickCount - latest.tick < 15) return;
    this.events.push({ tick: this.tickCount, kind, message });
    if (this.events.length > MAX_EVENT_HISTORY) this.events.shift();
  }
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
