import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { sanitizeConfig } from '../src/config';
import { Simulation } from '../src/simulation';
import type { SimulationConfig, SimulationSnapshot, TeamSummary } from '../src/types';

type Phase = 'intro' | 'simulation' | 'result';

type VideoSettings = {
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

type VideoJob = {
  scenario?: Partial<SimulationConfig>;
  video?: VideoSettings;
};

const TEAM_COLORS = ['#2dd4bf', '#fb7185', '#60a5fa', '#fbbf24', '#c084fc', '#4ade80', '#fb923c', '#e879f9'];

class HeadlessRenderer {
  private readonly mapRect: { x: number; y: number; width: number; height: number };

  constructor(
    private readonly ctx: any,
    private readonly width: number,
    private readonly height: number,
    private readonly config: SimulationConfig,
  ) {
    this.mapRect = {
      x: this.width * 0.06,
      y: this.height * 0.215,
      width: this.width * 0.88,
      height: this.height * 0.59,
    };
  }

  render(snapshot: SimulationSnapshot, phase: Phase): void {
    this.drawBackground();
    this.drawHeader(snapshot);
    this.drawMap(snapshot);
    this.drawHud(snapshot);
    this.drawLatestEvent(snapshot);
    if (phase === 'intro') this.drawIntro();
    if (phase === 'result') this.drawResult(snapshot);
  }

  private drawBackground(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#07101f');
    gradient.addColorStop(0.56, '#0b1830');
    gradient.addColorStop(1, '#050a14');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = 'rgba(45, 212, 191, 0.08)';
    for (let i = 0; i < 24; i += 1) {
      const x = ((i * 149) % this.width) + 10;
      const y = ((i * 263) % this.height) + 10;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawHeader(snapshot: SimulationSnapshot): void {
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.045)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('SIM BASE', this.width * 0.06, this.height * 0.055);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `800 ${Math.round(this.width * 0.056)}px "Noto Sans CJK JP", sans-serif`;
    this.drawWrappedText(this.config.title, this.width * 0.06, this.height * 0.105, this.width * 0.88, this.width * 0.068, 2);

    const progress = Math.min(1, snapshot.tick / this.config.simulationTicks);
    this.fillRoundedRect(this.width * 0.06, this.height * 0.184, this.width * 0.88, 7, 4, '#1e293b');
    this.fillRoundedRect(this.width * 0.06, this.height * 0.184, this.width * 0.88 * progress, 7, 4, '#2dd4bf');
  }

  private drawMap(snapshot: SimulationSnapshot): void {
    const { x, y, width, height } = this.mapRect;
    this.ctx.save();
    this.roundedRectPath(x, y, width, height, 20);
    this.ctx.clip();

    const water = this.ctx.createRadialGradient(
      x + width / 2,
      y + height / 2,
      width * 0.05,
      x + width / 2,
      y + height / 2,
      width * 0.68,
    );
    water.addColorStop(0, '#0e7490');
    water.addColorStop(1, '#082f49');
    this.ctx.fillStyle = water;
    this.ctx.fillRect(x, y, width, height);

    const islandWidth = width * 0.93 * snapshot.safeRadius;
    const islandHeight = height * 0.93 * snapshot.safeRadius;
    const land = this.ctx.createRadialGradient(
      x + width / 2,
      y + height / 2,
      0,
      x + width / 2,
      y + height / 2,
      Math.max(islandWidth, islandHeight) / 2,
    );
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
      this.ctx.shadowBlur = 7;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, Math.max(2.5, this.width * 0.0055), 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    for (const agent of snapshot.agents) {
      if (!agent.alive) continue;
      const point = this.worldToCanvas(agent.position.x, agent.position.y);
      const radius = Math.max(3, this.width * 0.0075) * agent.size;
      this.ctx.fillStyle = TEAM_COLORS[agent.team % TEAM_COLORS.length];
      this.ctx.shadowColor = 'rgba(0,0,0,.75)';
      this.ctx.shadowBlur = 4;
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      if (agent.hunger < 20) {
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
    this.ctx.strokeStyle = 'rgba(148, 163, 184, .35)';
    this.ctx.lineWidth = 2;
    this.roundedRectPath(x, y, width, height, 20);
    this.ctx.stroke();
  }

  private drawHud(snapshot: SimulationSnapshot): void {
    const alive = snapshot.teams.reduce((sum, team) => sum + team.alive, 0);
    const food = snapshot.foods.filter((item) => item.available).length;
    const hudY = this.height * 0.838;

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = `700 ${Math.round(this.width * 0.024)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('SURVIVORS', this.width * 0.06, hudY);
    this.ctx.fillText('FOOD', this.width * 0.39, hudY);
    this.ctx.fillText('TIME', this.width * 0.67, hudY);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.058)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(String(alive), this.width * 0.06, hudY + this.height * 0.041);
    this.ctx.fillText(String(food), this.width * 0.39, hudY + this.height * 0.041);
    this.ctx.fillText(`${snapshot.elapsedSeconds.toFixed(1)}s`, this.width * 0.67, hudY + this.height * 0.041);
    this.drawTeamBars(snapshot.teams, this.height * 0.905);
  }

  private drawTeamBars(teams: TeamSummary[], y: number): void {
    const gap = this.width * 0.012;
    const totalWidth = this.width * 0.88;
    const itemWidth = (totalWidth - gap * (teams.length - 1)) / teams.length;

    teams.forEach((team, index) => {
      const x = this.width * 0.06 + index * (itemWidth + gap);
      this.fillRoundedRect(x, y, itemWidth, this.height * 0.04, 7, 'rgba(30, 41, 59, .92)');
      this.ctx.fillStyle = TEAM_COLORS[team.team % TEAM_COLORS.length];
      this.ctx.fillRect(x, y, 4, this.height * 0.04);
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.font = `800 ${Math.round(this.width * 0.021)}px "Noto Sans CJK JP", sans-serif`;
      this.ctx.fillText(`T${team.team + 1} ${team.alive}`, x + 9, y + this.height * 0.027);
    });
  }

  private drawLatestEvent(snapshot: SimulationSnapshot): void {
    const latest = snapshot.events.at(-1);
    if (!latest) return;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = latest.kind === 'warning' || latest.kind === 'death' ? '#fde68a' : '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.023)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText(latest.message, this.width / 2, this.height * 0.976);
    this.ctx.textAlign = 'start';
  }

  private drawIntro(): void {
    this.ctx.fillStyle = 'rgba(2, 6, 23, .72)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.033)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('100人の自律実験', this.width / 2, this.height * 0.42);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.078)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('実験開始', this.width / 2, this.height * 0.49);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `600 ${Math.round(this.width * 0.029)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('最後まで生き残るのはどのチーム？', this.width / 2, this.height * 0.54);
    this.ctx.textAlign = 'start';
  }

  private drawResult(snapshot: SimulationSnapshot): void {
    this.ctx.fillStyle = 'rgba(2, 6, 23, .84)';
    this.ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#5eead4';
    this.ctx.font = `800 ${Math.round(this.width * 0.032)}px "Noto Sans CJK JP", sans-serif`;
    this.ctx.fillText('EXPERIMENT COMPLETE', this.width / 2, this.height * 0.40);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.075)}px "Noto Sans CJK JP", sans-serif`;
    const result = snapshot.winnerTeam === null ? '全滅' : `チーム${snapshot.winnerTeam + 1} 勝利`;
    this.ctx.fillText(result, this.width / 2, this.height * 0.49);
    const winner = snapshot.teams.find((team) => team.team === snapshot.winnerTeam);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.034)}px "Noto Sans CJK JP", sans-serif`;
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

  private fillRoundedRect(x: number, y: number, width: number, height: number, radius: number, fill: string): void {
    if (width <= 0 || height <= 0) return;
    this.ctx.fillStyle = fill;
    this.roundedRectPath(x, y, width, height, Math.min(radius, width / 2, height / 2));
    this.ctx.fill();
  }

  private roundedRectPath(x: number, y: number, width: number, height: number, radius: number): void {
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

function normalizeVideoSettings(input: VideoSettings): Required<VideoSettings> {
  const sourceFps = clampInt(input.sourceFps ?? 15, 5, 30);
  const durationSeconds = clamp(input.durationSeconds ?? 30, 8, 60);
  const introSeconds = clamp(input.introSeconds ?? 2, 0, durationSeconds - 2);
  const resultSeconds = clamp(input.resultSeconds ?? 3, 1, durationSeconds - introSeconds - 1);

  return {
    durationSeconds,
    introSeconds,
    resultSeconds,
    sourceFps,
    outputFps: clampInt(input.outputFps ?? 30, sourceFps, 60),
    renderWidth: clampInt(input.renderWidth ?? 540, 360, 1080),
    renderHeight: clampInt(input.renderHeight ?? 960, 640, 1920),
    finalWidth: clampInt(input.finalWidth ?? 1080, 360, 2160),
    finalHeight: clampInt(input.finalHeight ?? 1920, 640, 3840),
    fileName: input.fileName ?? 'sim-base.mp4',
  };
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
  return normalized.toLowerCase().endsWith('.mp4') ? normalized : `${normalized}.mp4`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

async function main(): Promise<void> {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const configPath = resolve(process.env.SIM_BASE_VIDEO_CONFIG ?? join(rootDir, 'video.config.json'));
  const outputDir = resolve(process.env.SIM_BASE_OUTPUT_DIR ?? join(rootDir, 'output'));
  const framesDir = resolve(process.env.SIM_BASE_FRAMES_DIR ?? join(rootDir, '.simbase-frames'));

  if (!existsSync(configPath)) throw new Error(`Video config was not found: ${configPath}`);

  const job = JSON.parse(readFileSync(configPath, 'utf8')) as VideoJob;
  const video = normalizeVideoSettings(job.video ?? {});
  const config = sanitizeConfig({
    ...job.scenario,
    videoWidth: video.renderWidth,
    videoHeight: video.renderHeight,
    framesPerSecond: video.sourceFps,
  });

  mkdirSync(outputDir, { recursive: true });
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const canvas = createCanvas(video.renderWidth, video.renderHeight);
  const ctx = canvas.getContext('2d');
  const renderer = new HeadlessRenderer(ctx, video.renderWidth, video.renderHeight, config);
  const simulation = new Simulation(config);

  const totalFrames = Math.round(video.durationSeconds * video.sourceFps);
  const introFrames = Math.round(video.introSeconds * video.sourceFps);
  const resultFrames = Math.round(video.resultSeconds * video.sourceFps);
  const simulationFrames = Math.max(1, totalFrames - introFrames - resultFrames);
  let snapshot = simulation.getSnapshot();

  console.log(`Generating ${totalFrames} frames (${video.renderWidth}x${video.renderHeight} @ ${video.sourceFps}fps)`);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    let phase: Phase = 'intro';

    if (frame >= introFrames && frame < introFrames + simulationFrames) {
      phase = 'simulation';
      if (snapshot.status === 'idle') {
        simulation.start();
        snapshot = simulation.getSnapshot();
      }
      const simulationFrame = frame - introFrames + 1;
      const targetTick = Math.min(
        config.simulationTicks,
        Math.ceil((simulationFrame / simulationFrames) * config.simulationTicks),
      );
      while (snapshot.tick < targetTick && snapshot.status === 'running') {
        simulation.step();
        snapshot = simulation.getSnapshot();
      }
    } else if (frame >= introFrames + simulationFrames) {
      phase = 'result';
      if (snapshot.status === 'idle') {
        simulation.start();
        snapshot = simulation.getSnapshot();
      }
      while (snapshot.status === 'running') {
        simulation.step();
        snapshot = simulation.getSnapshot();
      }
    }

    renderer.render(snapshot, phase);
    const framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`);
    writeFileSync(framePath, await canvas.encode('png'));

    if ((frame + 1) % Math.max(1, Math.floor(totalFrames / 10)) === 0 || frame === totalFrames - 1) {
      console.log(`Frames: ${frame + 1}/${totalFrames}`);
    }
  }

  const safeFileName = sanitizeFileName(video.fileName);
  const outputPath = join(outputDir, safeFileName);
  const ffmpegArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-framerate',
    String(video.sourceFps),
    '-i',
    join(framesDir, 'frame-%05d.png'),
    '-vf',
    `scale=${video.finalWidth}:${video.finalHeight}:flags=lanczos,fps=${video.outputFps},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    '-metadata',
    `title=${config.title}`,
    outputPath,
  ];

  console.log('Encoding MP4 with FFmpeg...');
  const ffmpeg = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  if (ffmpeg.error) throw ffmpeg.error;
  if (ffmpeg.status !== 0) throw new Error(`FFmpeg exited with status ${ffmpeg.status}`);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceConfig: basename(configPath),
    video: { ...video, outputPath: safeFileName },
    scenario: config,
    result: {
      tick: snapshot.tick,
      winnerTeam: snapshot.winnerTeam,
      teams: snapshot.teams,
      survivors: snapshot.teams.reduce((sum, team) => sum + team.alive, 0),
      foodRemaining: snapshot.foods.filter((food) => food.available).length,
      events: snapshot.events,
    },
  };

  writeFileSync(join(outputDir, 'simulation-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (process.env.SIM_BASE_KEEP_FRAMES !== 'true') rmSync(framesDir, { recursive: true, force: true });

  console.log(`Video generated: ${outputPath}`);
  console.log(`Summary generated: ${join(outputDir, 'simulation-summary.json')}`);
}

await main();
