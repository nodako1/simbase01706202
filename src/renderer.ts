import type { SimulationConfig, SimulationSnapshot, TeamSummary } from './types';

const TEAM_COLORS = ['#2dd4bf', '#fb7185', '#60a5fa', '#fbbf24', '#c084fc', '#4ade80', '#fb923c', '#e879f9'];

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private readonly mapRect: { x: number; y: number; width: number; height: number };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: SimulationConfig,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    this.ctx = ctx;
    this.width = config.videoWidth;
    this.height = config.videoHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.mapRect = {
      x: this.width * 0.06,
      y: this.height * 0.22,
      width: this.width * 0.88,
      height: this.height * 0.61,
    };
  }

  render(snapshot: SimulationSnapshot): void {
    this.drawBackground();
    this.drawHeader(snapshot);
    this.drawMap(snapshot);
    this.drawHud(snapshot);
    if (snapshot.status === 'idle') this.drawOverlay('実験開始', 'STARTを押して世界を動かす');
    if (snapshot.status === 'paused') this.drawOverlay('一時停止', 'RESUMEで再開');
    if (snapshot.status === 'finished') this.drawResult(snapshot);
  }

  private drawBackground(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#07101f');
    gradient.addColorStop(0.55, '#0b1830');
    gradient.addColorStop(1, '#050a14');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = 'rgba(45, 212, 191, 0.06)';
    for (let i = 0; i < 24; i += 1) {
      const x = ((i * 149) % this.width) + 20;
      const y = ((i * 263) % this.height) + 20;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawHeader(snapshot: SimulationSnapshot): void {
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.048)}px system-ui, sans-serif`;
    this.ctx.fillText('SIM BASE', this.width * 0.06, this.height * 0.065);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `800 ${Math.round(this.width * 0.061)}px system-ui, sans-serif`;
    this.drawWrappedText(this.config.title, this.width * 0.06, this.height * 0.115, this.width * 0.88, this.width * 0.074, 2);

    const progress = snapshot.tick / this.config.simulationTicks;
    this.roundRect(this.width * 0.06, this.height * 0.19, this.width * 0.88, 12, 6, '#1e293b');
    this.roundRect(this.width * 0.06, this.height * 0.19, this.width * 0.88 * Math.min(1, progress), 12, 6, '#2dd4bf');
  }

  private drawMap(snapshot: SimulationSnapshot): void {
    const { x, y, width, height } = this.mapRect;
    this.ctx.save();
    this.roundRect(x, y, width, height, 38, '#082f49');
    this.ctx.clip();

    const water = this.ctx.createRadialGradient(x + width / 2, y + height / 2, width * 0.05, x + width / 2, y + height / 2, width * 0.65);
    water.addColorStop(0, '#0e7490');
    water.addColorStop(1, '#082f49');
    this.ctx.fillStyle = water;
    this.ctx.fillRect(x, y, width, height);

    const islandWidth = width * 0.93 * snapshot.safeRadius;
    const islandHeight = height * 0.93 * snapshot.safeRadius;
    const land = this.ctx.createRadialGradient(x + width / 2, y + height / 2, 0, x + width / 2, y + height / 2, Math.max(islandWidth, islandHeight) / 2);
    land.addColorStop(0, '#365314');
    land.addColorStop(0.72, '#3f6212');
    land.addColorStop(0.9, '#a16207');
    land.addColorStop(1, '#fbbf24');
    this.ctx.fillStyle = land;
    this.ctx.beginPath();
    this.ctx.ellipse(x + width / 2, y + height / 2, islandWidth / 2, islandHeight / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    for (const food of snapshot.foods) {
      if (!food.available) continue;
      const point = this.worldToCanvas(food.position.x, food.position.y);
      this.ctx.fillStyle = '#fde047';
      this.ctx.shadowColor = '#facc15';
      this.ctx.shadowBlur = 14;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, Math.max(4, this.width * 0.006), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    for (const agent of snapshot.agents) {
      if (!agent.alive) continue;
      const point = this.worldToCanvas(agent.position.x, agent.position.y);
      const radius = Math.max(5.5, this.width * 0.008) * agent.size;
      this.ctx.fillStyle = TEAM_COLORS[agent.team % TEAM_COLORS.length];
      this.ctx.shadowColor = 'rgba(0,0,0,.75)';
      this.ctx.shadowBlur = 6;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      if (agent.hunger < 20) {
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
    this.ctx.strokeStyle = 'rgba(148, 163, 184, .35)';
    this.ctx.lineWidth = 3;
    this.strokeRoundRect(x, y, width, height, 38);
  }

  private drawHud(snapshot: SimulationSnapshot): void {
    const alive = snapshot.teams.reduce((sum, team) => sum + team.alive, 0);
    const food = snapshot.foods.filter((item) => item.available).length;
    const hudY = this.height * 0.855;

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = `700 ${Math.round(this.width * 0.027)}px system-ui, sans-serif`;
    this.ctx.fillText('SURVIVORS', this.width * 0.06, hudY);
    this.ctx.fillText('FOOD', this.width * 0.39, hudY);
    this.ctx.fillText('TIME', this.width * 0.67, hudY);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.063)}px system-ui, sans-serif`;
    this.ctx.fillText(String(alive), this.width * 0.06, hudY + this.height * 0.043);
    this.ctx.fillText(String(food), this.width * 0.39, hudY + this.height * 0.043);
    this.ctx.fillText(`${snapshot.elapsedSeconds.toFixed(1)}s`, this.width * 0.67, hudY + this.height * 0.043);

    this.drawTeamBars(snapshot.teams, this.height * 0.93);
  }

  private drawTeamBars(teams: TeamSummary[], y: number): void {
    const gap = this.width * 0.018;
    const totalWidth = this.width * 0.88;
    const itemWidth = (totalWidth - gap * (teams.length - 1)) / teams.length;
    teams.forEach((team, index) => {
      const x = this.width * 0.06 + index * (itemWidth + gap);
      this.roundRect(x, y, itemWidth, this.height * 0.045, 12, 'rgba(30, 41, 59, .9)');
      this.ctx.fillStyle = TEAM_COLORS[team.team % TEAM_COLORS.length];
      this.ctx.fillRect(x, y, 8, this.height * 0.045);
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.font = `800 ${Math.round(this.width * 0.024)}px system-ui, sans-serif`;
      this.ctx.fillText(`T${team.team + 1}  ${team.alive}`, x + 18, y + this.height * 0.03);
    });
  }

  private drawOverlay(title: string, subtitle: string): void {
    this.ctx.fillStyle = 'rgba(2, 6, 23, .66)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.075)}px system-ui, sans-serif`;
    this.ctx.fillText(title, this.width / 2, this.height * 0.49);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `600 ${Math.round(this.width * 0.032)}px system-ui, sans-serif`;
    this.ctx.fillText(subtitle, this.width / 2, this.height * 0.535);
    this.ctx.textAlign = 'start';
  }

  private drawResult(snapshot: SimulationSnapshot): void {
    this.ctx.fillStyle = 'rgba(2, 6, 23, .82)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.036)}px system-ui, sans-serif`;
    this.ctx.fillText('EXPERIMENT COMPLETE', this.width / 2, this.height * 0.40);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.082)}px system-ui, sans-serif`;
    const result = snapshot.winnerTeam === null ? '全滅' : `チーム${snapshot.winnerTeam + 1} 勝利`;
    this.ctx.fillText(result, this.width / 2, this.height * 0.49);
    const winner = snapshot.teams.find((team) => team.team === snapshot.winnerTeam);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.037)}px system-ui, sans-serif`;
    this.ctx.fillText(winner ? `最終生存者 ${winner.alive}人` : '生存者 0人', this.width / 2, this.height * 0.55);
    this.ctx.textAlign = 'start';
  }

  private worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: this.mapRect.x + (worldX / this.config.worldWidth) * this.mapRect.width,
      y: this.mapRect.y + (worldY / this.config.worldHeight) * this.mapRect.height,
    };
  }

  private drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    const chars = Array.from(text);
    let line = '';
    let lineIndex = 0;
    for (const char of chars) {
      const testLine = line + char;
      if (this.ctx.measureText(testLine).width > maxWidth && line) {
        this.ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = char;
        lineIndex += 1;
        if (lineIndex >= maxLines - 1) break;
      } else {
        line = testLine;
      }
    }
    if (lineIndex < maxLines) this.ctx.fillText(line, x, y + lineIndex * lineHeight);
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number, fill: string): void {
    this.ctx.fillStyle = fill;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, radius);
    this.ctx.fill();
  }

  private strokeRoundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, radius);
    this.ctx.stroke();
  }
}
