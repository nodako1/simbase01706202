import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { sanitizeConfig } from '../src/config';
import type { SimulationConfig, SimulationSnapshot } from '../src/types';
import { AutoDirector } from './quality/director';
import { QualityRenderer } from './quality/renderer';
import { buildPlaybackTicks, buildTimeline, findSnapshot } from './quality/timeline';
import type { Phase, VideoSettings } from './quality/types';

type VideoJob = { scenario?: Partial<SimulationConfig>; video?: VideoSettings };

async function main(): Promise<void> {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const configPath = resolve(process.env.SIM_BASE_VIDEO_CONFIG ?? join(rootDir, 'video.config.json'));
  const outputDir = resolve(process.env.SIM_BASE_OUTPUT_DIR ?? join(rootDir, 'output'));
  const framesDir = resolve(process.env.SIM_BASE_FRAMES_DIR ?? join(rootDir, '.simbase-frames'));
  if (!existsSync(configPath)) throw new Error(`Video config was not found: ${configPath}`);

  const job = JSON.parse(readFileSync(configPath, 'utf8')) as VideoJob;
  const video = normalize(job.video ?? {});
  const config = sanitizeConfig({ ...job.scenario, videoWidth: video.renderWidth, videoHeight: video.renderHeight, framesPerSecond: video.sourceFps });
  mkdirSync(outputDir, { recursive: true });
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  console.log('Pre-simulating world and detecting dramatic moments...');
  const timeline = buildTimeline(config);
  console.log(`Timeline ready: ${timeline.finalTick} ticks, ${timeline.moments.length} highlighted moments`);

  const canvas = createCanvas(video.renderWidth, video.renderHeight);
  const renderer = new QualityRenderer(canvas.getContext('2d'), video.renderWidth, video.renderHeight, config);
  const director = new AutoDirector(timeline.moments, video.sourceFps, config);
  const totalFrames = Math.round(video.durationSeconds * video.sourceFps);
  const introFrames = Math.round(video.introSeconds * video.sourceFps);
  const resultFrames = Math.round(video.resultSeconds * video.sourceFps);
  const simulationFrames = Math.max(1, totalFrames - introFrames - resultFrames);
  const playbackTicks = buildPlaybackTicks(timeline.finalTick, timeline.moments, simulationFrames);
  const initialSnapshot = timeline.snapshots[0];
  const finalSnapshot = timeline.snapshots.at(-1) ?? initialSnapshot;

  console.log(`Generating ${totalFrames} directed frames (${video.renderWidth}x${video.renderHeight} @ ${video.sourceFps}fps)`);
  for (let frame = 0; frame < totalFrames; frame += 1) {
    let phase: Phase;
    let snapshot: SimulationSnapshot;
    if (frame < introFrames) {
      phase = 'intro'; snapshot = initialSnapshot;
    } else if (frame < introFrames + simulationFrames) {
      phase = 'simulation'; snapshot = findSnapshot(timeline.snapshots, playbackTicks[frame - introFrames]);
    } else {
      phase = 'result'; snapshot = finalSnapshot;
    }
    renderer.render(snapshot, phase, director.update(snapshot, phase));
    writeFileSync(join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`), await canvas.encode('png'));
    if ((frame + 1) % Math.max(1, Math.floor(totalFrames / 10)) === 0 || frame === totalFrames - 1) console.log(`Frames: ${frame + 1}/${totalFrames}`);
  }

  const safeFileName = sanitizeFileName(video.fileName);
  const outputPath = join(outputDir, safeFileName);
  const ffmpeg = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'warning', '-framerate', String(video.sourceFps),
    '-i', join(framesDir, 'frame-%05d.png'),
    '-vf', `scale=${video.finalWidth}:${video.finalHeight}:flags=lanczos,fps=${video.outputFps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', '-metadata', `title=${config.title}`, outputPath,
  ], { stdio: 'inherit' });
  if (ffmpeg.error) throw ffmpeg.error;
  if (ffmpeg.status !== 0) throw new Error(`FFmpeg exited with status ${ffmpeg.status}`);

  writeFileSync(join(outputDir, 'simulation-summary.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(), sourceConfig: basename(configPath), video: { ...video, outputPath: safeFileName }, scenario: config,
    direction: { highlightedMoments: timeline.moments },
    result: { tick: finalSnapshot.tick, winnerTeam: finalSnapshot.winnerTeam, teams: finalSnapshot.teams, survivors: finalSnapshot.teams.reduce((sum, team) => sum + team.alive, 0), foodRemaining: finalSnapshot.foods.filter((food) => food.available).length, events: finalSnapshot.events },
  }, null, 2)}\n`);
  if (process.env.SIM_BASE_KEEP_FRAMES !== 'true') rmSync(framesDir, { recursive: true, force: true });
  console.log(`Video generated: ${outputPath}`);
}

function normalize(input: VideoSettings): Required<VideoSettings> {
  const sourceFps = clampInt(input.sourceFps ?? 15, 5, 30);
  const durationSeconds = clamp(input.durationSeconds ?? 30, 8, 60);
  const introSeconds = clamp(input.introSeconds ?? 2, 0, durationSeconds - 2);
  const resultSeconds = clamp(input.resultSeconds ?? 3, 1, durationSeconds - introSeconds - 1);
  return {
    durationSeconds, introSeconds, resultSeconds, sourceFps,
    outputFps: clampInt(input.outputFps ?? 30, sourceFps, 60),
    renderWidth: clampInt(input.renderWidth ?? 540, 360, 1080), renderHeight: clampInt(input.renderHeight ?? 960, 640, 1920),
    finalWidth: clampInt(input.finalWidth ?? 1080, 360, 2160), finalHeight: clampInt(input.finalHeight ?? 1920, 640, 3840),
    fileName: input.fileName ?? 'sim-base.mp4',
  };
}
function sanitizeFileName(fileName: string): string { const normalized = fileName.replace(/[^a-zA-Z0-9._-]/g, '-'); return normalized.toLowerCase().endsWith('.mp4') ? normalized : `${normalized}.mp4`; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number(value))); }
function clampInt(value: number, min: number, max: number): number { return Math.round(clamp(value, min, max)); }

await main();
