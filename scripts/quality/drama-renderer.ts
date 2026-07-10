import type { Agent, SimulationConfig, SimulationSnapshot, TeamSummary, Vec2 } from '../../src/types';
import { leader, topPerformer } from './timeline';
import type { DirectorFrame, Phase } from './types';

const TEAM_COLORS = ['#2dd4bf', '#fb7185', '#60a5fa', '#fbbf24', '#c084fc', '#4ade80', '#fb923c', '#e879f9'];
const CUE_COLORS = {
  leader: '#60a5fa',
  danger: '#fb923c',
  milestone: '#facc15',
  collapse: '#fb7185',
  resource: '#a3e635',
  combat: '#ef4444',
  cooperation: '#34d399',
  hero: '#fbbf24',
  finale: '#c084fc',
} as const;

export class DramaRenderer {
  private readonly mapRect: { x: number; y: number; width: number; height: number };
  private cameraX: number;
  private cameraY: number;
  private cameraZoom = 1;
  private readonly trails = new Map<number, Vec2[]>();
  private frame = 0;

  constructor(
    private readonly ctx: any,
    private readonly width: number,
    private readonly height: number,
    private readonly config: SimulationConfig,
  ) {
    this.mapRect = { x: width * 0.055, y: height * 0.205, width: width * 0.89, height: height * 0.585 };
    this.cameraX = config.worldWidth / 2;
    this.cameraY = config.worldHeight / 2;
  }

  render(snapshot: SimulationSnapshot, phase: Phase, direction: DirectorFrame): void {
    this.frame += 1;
    this.updateCamera(direction, phase);
    this.updateTrails(snapshot);
    this.drawBackground(direction.urgency);
    this.drawHeader(snapshot, direction);
    this.drawMap(snapshot, direction);
    this.drawHud(snapshot, direction);
    this.drawTicker(snapshot);
    if (phase === 'simulation' && direction.cue) this.drawCue(direction);
    if (phase === 'intro') this.drawIntro();
    if (phase === 'result') this.drawResult(snapshot);
  }

  private updateCamera(direction: DirectorFrame, phase: Phase): void {
    const targetZoom = phase === 'simulation' ? direction.zoom : 1;
    const targetX = phase === 'simulation' ? direction.cameraCenter.x : this.config.worldWidth / 2;
    const targetY = phase === 'simulation' ? direction.cameraCenter.y : this.config.worldHeight / 2;
    this.cameraZoom += (targetZoom - this.cameraZoom) * 0.12;
    this.cameraX += (targetX - this.cameraX) * 0.1;
    this.cameraY += (targetY - this.cameraY) * 0.1;
  }

  private updateTrails(snapshot: SimulationSnapshot): void {
    const alive = new Set<number>();
    for (const agent of snapshot.agents) {
      if (!agent.alive) continue;
      alive.add(agent.id);
      const trail = this.trails.get(agent.id) ?? [];
      const latest = trail.at(-1);
      if (!latest || Math.hypot(latest.x - agent.position.x, latest.y - agent.position.y) > 0.35) {
        trail.push({ ...agent.position });
      }
      if (trail.length > 8) trail.shift();
      this.trails.set(agent.id, trail);
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
  }

  private drawBackground(urgency: number): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, urgency > 0.5 ? '#190b1d' : '#07101f');
    gradient.addColorStop(0.56, urgency > 0.5 ? '#211020' : '#0b1830');
    gradient.addColorStop(1, '#050a14');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = urgency > 0.5 ? 'rgba(251,113,133,.08)' : 'rgba(45,212,191,.08)';
    for (let i = 0; i < 28; i += 1) {
      this.ctx.beginPath();
      this.ctx.arc(((i * 149 + this.frame * 0.15) % this.width) + 5, ((i * 263) % this.height) + 10, 1 + (i % 3), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawHeader(snapshot: SimulationSnapshot, direction: DirectorFrame): void {
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.042)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('SIM BASE', this.width * 0.055, this.height * 0.05);
    if (direction.leaderTeam !== null) this.drawLeaderBadge(direction.leaderTeam);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `800 ${Math.round(this.width * 0.054)}px "Noto Sans CJK JP", sans-serif`;
    this.drawWrappedText(this.config.title, this.width * 0.055, this.height * 0.097, this.width * 0.89, this.width * 0.064, 2);
    const progress = Math.min(1, snapshot.tick / this.config.simulationTicks);
    this.fillRound(this.width * 0.055, this.height * 0.178, this.width * 0.89, 7, 4, '#1e293b');
    this.fillRound(this.width * 0.055, this.height * 0.178, this.width * 0.89 * progress, 7, 4, direction.urgency > 0.5 ? '#fb7185' : '#2dd4bf');
  }

  private drawLeaderBadge(team: number): void {
    const label = `首位  T${team + 1}`;
    this.ctx.font = `800 ${Math.round(this.width * 0.022)}px "Noto Sans CJK JP", sans-serif`;
    const badgeWidth = this.ctx.measureText(label).width + this.width * 0.045;
    const x = this.width * 0.945 - badgeWidth;
    this.fillRound(x, this.height * 0.024, badgeWidth, this.height * 0.038, 12, 'rgba(15,23,42,.92)');
    this.ctx.fillStyle = TEAM_COLORS[team % TEAM_COLORS.length];
    this.ctx.beginPath();
    this.ctx.arc(x + 12, this.height * 0.043, 4, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillText(label, x + 22, this.height * 0.051);
  }

  private drawMap(snapshot: SimulationSnapshot, direction: DirectorFrame): void {
    const { x, y, width, height } = this.mapRect;
    this.ctx.save();
    this.roundPath(x, y, width, height, 22);
    this.ctx.clip();

    const water = this.ctx.createRadialGradient(x + width / 2, y + height / 2, width * 0.04, x + width / 2, y + height / 2, width * 0.7);
    water.addColorStop(0, '#0e7490');
    water.addColorStop(1, '#082f49');
    this.ctx.fillStyle = water;
    this.ctx.fillRect(x, y, width, height);
    this.drawWater();

    const center = this.worldToCanvas(this.config.worldWidth / 2, this.config.worldHeight / 2);
    const islandWidth = width * 0.93 * snapshot.safeRadius * this.cameraZoom;
    const islandHeight = height * 0.93 * snapshot.safeRadius * this.cameraZoom;
    const land = this.ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(islandWidth, islandHeight) / 2);
    land.addColorStop(0, '#4d7c0f');
    land.addColorStop(0.68, '#3f6212');
    land.addColorStop(0.88, '#a16207');
    land.addColorStop(1, '#fbbf24');
    this.ctx.fillStyle = land;
    this.ctx.shadowColor = 'rgba(0,0,0,.45)';
    this.ctx.shadowBlur = 10;
    this.ctx.beginPath();
    this.ctx.ellipse(center.x, center.y, islandWidth / 2, islandHeight / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    if (this.config.specialRule === 'sinking_island') this.drawDangerRing(center, islandWidth, islandHeight, direction.urgency);

    this.drawGrid();
    this.drawTrails(snapshot, direction);
    this.drawCombatLinks(snapshot);
    for (const food of snapshot.foods) if (food.available) this.drawFood(food.id, food.position);
    for (const agent of snapshot.agents) if (agent.alive) this.drawAgent(agent, direction.focusAgentId === agent.id);

    this.ctx.restore();
    this.ctx.strokeStyle = direction.urgency > 0.5 ? 'rgba(251,113,133,.72)' : 'rgba(148,163,184,.42)';
    this.ctx.lineWidth = direction.urgency > 0.5 ? 3 : 2;
    this.roundPath(x, y, width, height, 22);
    this.ctx.stroke();
  }

  private drawWater(): void {
    const { x, y, width, height } = this.mapRect;
    this.ctx.strokeStyle = 'rgba(125,211,252,.08)';
    this.ctx.lineWidth = 1;
    for (let row = 0; row < 12; row += 1) {
      const lineY = y + (row / 11) * height;
      this.ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const px = x + (i / 24) * width;
        const py = lineY + Math.sin(i * 0.8 + row + this.frame * 0.06) * 2;
        if (!i) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();
    }
  }

  private drawDangerRing(center: { x: number; y: number }, width: number, height: number, urgency: number): void {
    const pulse = 0.62 + Math.sin(this.frame * 0.25) * 0.22;
    this.ctx.strokeStyle = `rgba(251,113,133,${Math.max(0.22, pulse * (0.55 + urgency * 0.45))})`;
    this.ctx.lineWidth = 2 + urgency * 2;
    this.ctx.setLineDash([8, 7]);
    this.ctx.beginPath();
    this.ctx.ellipse(center.x, center.y, width / 2, height / 2, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private drawGrid(): void {
    const { x, y, width, height } = this.mapRect;
    this.ctx.strokeStyle = 'rgba(255,255,255,.035)';
    this.ctx.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + width * i / 8, y);
      this.ctx.lineTo(x + width * i / 8, y + height);
      this.ctx.stroke();
    }
    for (let i = 1; i < 10; i += 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + height * i / 10);
      this.ctx.lineTo(x + width, y + height * i / 10);
      this.ctx.stroke();
    }
  }

  private drawTrails(snapshot: SimulationSnapshot, direction: DirectorFrame): void {
    for (const agent of snapshot.agents) {
      if (!agent.alive) continue;
      const trail = this.trails.get(agent.id);
      if (!trail || trail.length < 2) continue;
      const focused = direction.focusAgentId === agent.id;
      this.ctx.strokeStyle = alpha(TEAM_COLORS[agent.team % TEAM_COLORS.length], focused ? 0.75 : 0.16);
      this.ctx.lineWidth = focused ? 2.2 : 0.8;
      this.ctx.beginPath();
      trail.forEach((position, index) => {
        const point = this.worldToCanvas(position.x, position.y);
        if (!index) this.ctx.moveTo(point.x, point.y);
        else this.ctx.lineTo(point.x, point.y);
      });
      this.ctx.stroke();
    }
  }

  private drawCombatLinks(snapshot: SimulationSnapshot): void {
    const agents = new Map(snapshot.agents.map((agent) => [agent.id, agent]));
    const drawn = new Set<string>();
    for (const agent of snapshot.agents) {
      if (!agent.alive || agent.action !== 'fighting' || agent.targetAgentId == null) continue;
      const target = agents.get(agent.targetAgentId);
      if (!target) continue;
      const key = [agent.id, target.id].sort((a, b) => a - b).join(':');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const from = this.worldToCanvas(agent.position.x, agent.position.y);
      const to = this.worldToCanvas(target.position.x, target.position.y);
      this.ctx.strokeStyle = 'rgba(248,113,113,.78)';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(to.x, to.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  private drawFood(id: number, position: Vec2): void {
    const point = this.worldToCanvas(position.x, position.y);
    if (!this.inMap(point)) return;
    const pulse = 1 + Math.sin((this.frame + id * 7) * 0.18) * 0.18;
    const radius = Math.max(2.6, this.width * 0.0054) * Math.sqrt(this.cameraZoom) * pulse;
    this.ctx.fillStyle = '#fde047';
    this.ctx.shadowColor = '#facc15';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  private drawAgent(agent: Agent, focused: boolean): void {
    const point = this.worldToCanvas(agent.position.x, agent.position.y);
    if (!this.inMap(point, 22)) return;
    const color = TEAM_COLORS[agent.team % TEAM_COLORS.length];
    const radius = Math.max(3.2, this.width * 0.0072) * agent.size * Math.sqrt(this.cameraZoom);
    const length = Math.hypot(agent.velocity.x, agent.velocity.y) || 1;
    const dx = agent.velocity.x / length;
    const dy = agent.velocity.y / length;

    if (agent.hero) {
      const heroPulse = 1.75 + Math.sin(this.frame * 0.22 + agent.id) * 0.14;
      this.ctx.fillStyle = 'rgba(251,191,36,.13)';
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius * heroPulse, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 1.6;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius * 1.52, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    if (focused) {
      const pulse = 1.9 + Math.sin(this.frame * 0.32) * 0.18;
      this.ctx.strokeStyle = 'rgba(255,255,255,.96)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius * pulse, 0, Math.PI * 2);
      this.ctx.stroke();
      this.fillRound(point.x - 27, point.y - radius * 3.7, 54, 14, 5, 'rgba(2,6,23,.88)');
      this.ctx.fillStyle = '#fff';
      this.ctx.font = `800 ${Math.round(this.width * 0.014)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${agent.hero ? '★' : ''}#${agent.id + 1}`, point.x, point.y - radius * 2.75);
      this.ctx.textAlign = 'start';
    }

    const bodyX = point.x - dx * radius * 0.25;
    const bodyY = point.y - dy * radius * 0.25;
    const headX = point.x + dx * radius * 0.55;
    const headY = point.y + dy * radius * 0.55;
    this.ctx.fillStyle = color;
    this.ctx.shadowColor = 'rgba(0,0,0,.8)';
    this.ctx.shadowBlur = 4;
    this.ctx.beginPath();
    this.ctx.arc(bodyX, bodyY, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(headX, headY, radius * 0.58, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(255,255,255,.65)';
    this.ctx.lineWidth = focused || agent.hero ? 1.5 : 0.7;
    this.ctx.beginPath();
    this.ctx.arc(bodyX, bodyY, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    this.drawAgentHealth(agent, point, radius, focused);
    this.drawAgentAction(agent, point, radius);
  }

  private drawAgentHealth(agent: Agent, point: { x: number; y: number }, radius: number, focused: boolean): void {
    const healthRatio = Math.max(0, Math.min(1, (agent.health ?? 100) / Math.max(1, agent.maxHealth ?? 100)));
    if (healthRatio < 0.98 || focused || agent.hero) {
      const barWidth = radius * 2.8;
      const y = point.y + radius * 1.7;
      this.fillRound(point.x - barWidth / 2, y, barWidth, 2.6, 2, 'rgba(15,23,42,.82)');
      this.fillRound(point.x - barWidth / 2, y, barWidth * healthRatio, 2.6, 2, healthRatio < 0.3 ? '#fb7185' : '#34d399');
    }
    if (agent.hunger < 35) {
      this.ctx.strokeStyle = agent.hunger < 15 ? '#fb7185' : '#fbbf24';
      this.ctx.lineWidth = focused ? 2.5 : 1.3;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, agent.hunger / 35));
      this.ctx.stroke();
    }
  }

  private drawAgentAction(agent: Agent, point: { x: number; y: number }, radius: number): void {
    let symbol = '';
    let color = '#fff';
    if (agent.action === 'fighting') { symbol = '⚔'; color = '#fecaca'; }
    else if (agent.action === 'sharing_food') { symbol = '♥'; color = '#6ee7b7'; }
    else if (agent.action === 'helping') { symbol = '+'; color = '#a7f3d0'; }
    else if (agent.action === 'escaping_water' || agent.action === 'fleeing') { symbol = '!'; color = '#fdba74'; }
    if (!symbol) return;
    this.ctx.fillStyle = color;
    this.ctx.font = `900 ${Math.round(Math.max(8, radius * 1.7))}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(symbol, point.x, point.y - radius * 1.65);
    this.ctx.textAlign = 'start';
  }

  private drawHud(snapshot: SimulationSnapshot, direction: DirectorFrame): void {
    const alive = snapshot.teams.reduce((sum, team) => sum + team.alive, 0);
    const food = snapshot.foods.filter((item) => item.available).length;
    const kills = snapshot.agents.reduce((sum, agent) => sum + (agent.kills ?? 0), 0);
    const top = leader(snapshot.teams);
    const hudY = this.height * 0.825;
    const stats = [
      { label: '生存者', value: `${alive}` },
      { label: '食料', value: `${food}` },
      { label: '撃破', value: `${kills}` },
      { label: '首位', value: top.team === null ? '-' : `T${top.team + 1}` },
    ];
    stats.forEach((stat, index) => {
      const cellX = this.width * (0.055 + index * 0.225);
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = `700 ${Math.round(this.width * 0.018)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(stat.label, cellX, hudY);
      this.ctx.fillStyle = index === 3 && top.team !== null ? TEAM_COLORS[top.team % TEAM_COLORS.length] : index === 2 ? '#fca5a5' : '#f8fafc';
      this.ctx.font = `900 ${Math.round(this.width * 0.046)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(stat.value, cellX, hudY + this.height * 0.041);
    });
    if (direction.urgency > 0.55) {
      this.ctx.fillStyle = '#fb7185';
      this.ctx.font = `900 ${Math.round(this.width * 0.018)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.textAlign = 'right';
      this.ctx.fillText('FINAL PHASE', this.width * 0.945, hudY - 3);
      this.ctx.textAlign = 'start';
    }
    this.drawTeamBars(snapshot.teams, this.height * 0.892, direction.leaderTeam);
  }

  private drawTeamBars(teams: TeamSummary[], y: number, leaderTeam: number | null): void {
    const gap = this.width * 0.011;
    const totalWidth = this.width * 0.89;
    const itemWidth = (totalWidth - gap * (teams.length - 1)) / teams.length;
    teams.forEach((team, index) => {
      const x = this.width * 0.055 + index * (itemWidth + gap);
      const isLeader = team.team === leaderTeam && team.alive > 0;
      this.fillRound(x, y, itemWidth, this.height * 0.052, 8, isLeader ? 'rgba(30,41,59,.98)' : 'rgba(30,41,59,.78)');
      this.fillRound(x, y + this.height * 0.043, itemWidth * (team.total ? team.alive / team.total : 0), this.height * 0.009, 4, TEAM_COLORS[team.team % TEAM_COLORS.length]);
      this.ctx.fillStyle = TEAM_COLORS[team.team % TEAM_COLORS.length];
      this.ctx.beginPath();
      this.ctx.arc(x + 11, y + this.height * 0.021, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.font = `800 ${Math.round(this.width * 0.018)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(`${isLeader ? '★' : ''}T${team.team + 1}`, x + 20, y + this.height * 0.026);
      this.ctx.textAlign = 'right';
      this.ctx.fillText(String(team.alive), x + itemWidth - 8, y + this.height * 0.026);
      this.ctx.textAlign = 'start';
    });
  }

  private drawTicker(snapshot: SimulationSnapshot): void {
    const latest = snapshot.events.at(-1);
    if (!latest) return;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = latest.kind === 'combat' || latest.kind === 'death' ? '#fca5a5' : latest.kind === 'cooperation' ? '#6ee7b7' : latest.kind === 'hero' ? '#fcd34d' : latest.kind === 'warning' ? '#fde68a' : '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.021)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(latest.message, this.width / 2, this.height * 0.977);
    this.ctx.textAlign = 'start';
  }

  private drawCue(direction: DirectorFrame): void {
    const cue = direction.cue!;
    const accent = CUE_COLORS[cue.kind];
    const fade = Math.max(0.15, Math.min(1, direction.cueProgress * 3));
    const panelWidth = this.width * 0.8;
    const panelHeight = this.height * 0.094;
    const x = (this.width - panelWidth) / 2;
    const y = this.mapRect.y + this.height * 0.022;
    this.ctx.globalAlpha = fade;
    this.fillRound(x, y, panelWidth, panelHeight, 14, 'rgba(2,6,23,.92)');
    this.ctx.fillStyle = accent;
    this.ctx.fillRect(x, y, 5, panelHeight);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = accent;
    this.ctx.font = `900 ${Math.round(this.width * 0.028)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(cue.title, this.width / 2, y + panelHeight * 0.43);
    this.ctx.fillStyle = '#e2e8f0';
    this.ctx.font = `700 ${Math.round(this.width * 0.019)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(cue.subtitle, this.width / 2, y + panelHeight * 0.73);
    this.ctx.textAlign = 'start';
    this.ctx.globalAlpha = 1;
  }

  private drawIntro(): void {
    this.ctx.fillStyle = 'rgba(2,6,23,.82)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.028)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('AUTONOMOUS SURVIVAL TEST', this.width / 2, this.height * 0.345);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.065)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('英雄たちの生存戦争', this.width / 2, this.height * 0.415);

    const cards = [
      { label: '住民', value: `${this.config.population}人` },
      { label: 'チーム', value: `${this.config.teams}` },
      { label: '英雄', value: `${this.config.teams}人` },
      { label: '食料', value: `${this.config.foodCount}個` },
    ];
    const cardWidth = this.width * 0.185;
    const gap = this.width * 0.018;
    const total = cardWidth * cards.length + gap * (cards.length - 1);
    cards.forEach((card, index) => {
      const x = (this.width - total) / 2 + index * (cardWidth + gap);
      const y = this.height * 0.465;
      this.fillRound(x, y, cardWidth, this.height * 0.09, 12, 'rgba(15,23,42,.94)');
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = `700 ${Math.round(this.width * 0.017)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(card.label, x + cardWidth / 2, y + this.height * 0.031);
      this.ctx.fillStyle = card.label === '英雄' ? '#fbbf24' : '#fff';
      this.ctx.font = `900 ${Math.round(this.width * 0.031)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(card.value, x + cardWidth / 2, y + this.height * 0.067);
    });
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `800 ${Math.round(this.width * 0.022)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('戦うか、分け合うか。能力と判断で運命が変わる', this.width / 2, this.height * 0.605);
    this.ctx.fillStyle = this.config.specialRule === 'sinking_island' ? '#fb923c' : '#94a3b8';
    this.ctx.fillText(this.config.specialRule === 'sinking_island' ? 'さらに島は時間とともに沈む' : '最後に残るチームはどこ？', this.width / 2, this.height * 0.645);
    this.ctx.textAlign = 'start';
  }

  private drawResult(snapshot: SimulationSnapshot): void {
    this.ctx.fillStyle = 'rgba(2,6,23,.92)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.026)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('EXPERIMENT COMPLETE', this.width / 2, this.height * 0.325);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.064)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(snapshot.winnerTeam === null ? '全滅' : `チーム${snapshot.winnerTeam + 1} 勝利`, this.width / 2, this.height * 0.395);

    const mvp = topPerformer(snapshot);
    if (mvp) {
      const panelWidth = this.width * 0.7;
      const x = (this.width - panelWidth) / 2;
      const y = this.height * 0.425;
      this.fillRound(x, y, panelWidth, this.height * 0.075, 12, 'rgba(120,53,15,.35)');
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.font = `900 ${Math.round(this.width * 0.024)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(`MVP ${mvp.hero ? '英雄 ' : ''}#${mvp.id + 1}`, this.width / 2, y + this.height * 0.03);
      this.ctx.fillStyle = '#fde68a';
      this.ctx.font = `700 ${Math.round(this.width * 0.019)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(`撃破 ${mvp.kills ?? 0}　食料分配 ${mvp.shares ?? 0}　救助 ${mvp.rescues ?? 0}`, this.width / 2, y + this.height * 0.058);
    }

    const ranking = [...snapshot.teams].sort((a, b) => b.alive - a.alive || a.team - b.team).slice(0, 3);
    const rowWidth = this.width * 0.68;
    ranking.forEach((team, index) => {
      const y = this.height * (0.525 + index * 0.061);
      const x = (this.width - rowWidth) / 2;
      this.fillRound(x, y, rowWidth, this.height * 0.047, 10, index ? 'rgba(15,23,42,.82)' : 'rgba(30,41,59,.98)');
      this.ctx.fillStyle = TEAM_COLORS[team.team % TEAM_COLORS.length];
      this.ctx.beginPath();
      this.ctx.arc(x + 18, y + this.height * 0.0235, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.font = `800 ${Math.round(this.width * 0.021)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(`${index + 1}位  チーム${team.team + 1}`, x + 34, y + this.height * 0.031);
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${team.alive}人生存`, x + rowWidth - 16, y + this.height * 0.031);
    });

    const totalKills = snapshot.agents.reduce((sum, agent) => sum + (agent.kills ?? 0), 0);
    const totalSupport = snapshot.agents.reduce((sum, agent) => sum + (agent.shares ?? 0) + (agent.rescues ?? 0), 0);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = `700 ${Math.round(this.width * 0.019)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(`戦闘 ${totalKills}件  /  協力 ${totalSupport}件  /  残り食料 ${snapshot.foods.filter((food) => food.available).length}個`, this.width / 2, this.height * 0.735);
    this.ctx.textAlign = 'start';
  }

  private worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: this.mapRect.x + this.mapRect.width / 2 + (worldX - this.cameraX) / this.config.worldWidth * this.mapRect.width * this.cameraZoom,
      y: this.mapRect.y + this.mapRect.height / 2 + (worldY - this.cameraY) / this.config.worldHeight * this.mapRect.height * this.cameraZoom,
    };
  }

  private inMap(point: { x: number; y: number }, margin = 8): boolean {
    return point.x >= this.mapRect.x - margin && point.x <= this.mapRect.x + this.mapRect.width + margin && point.y >= this.mapRect.y - margin && point.y <= this.mapRect.y + this.mapRect.height + margin;
  }

  private drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    const chars = Array.from(text);
    let line = '';
    let lineIndex = 0;
    for (const char of chars) {
      const test = line + char;
      if (this.ctx.measureText(test).width > maxWidth && line) {
        this.ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = char;
        lineIndex += 1;
        if (lineIndex >= maxLines - 1) break;
      } else line = test;
    }
    if (lineIndex < maxLines) this.ctx.fillText(line, x, y + lineIndex * lineHeight);
  }

  private fillRound(x: number, y: number, width: number, height: number, radius: number, fill: string): void {
    if (width <= 0 || height <= 0) return;
    this.ctx.fillStyle = fill;
    this.roundPath(x, y, width, height, Math.min(radius, width / 2, height / 2));
    this.ctx.fill();
  }

  private roundPath(x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }
}

function alpha(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  return `rgba(${Number.parseInt(value.slice(0, 2), 16)},${Number.parseInt(value.slice(2, 4), 16)},${Number.parseInt(value.slice(4, 6), 16)},${opacity})`;
}
