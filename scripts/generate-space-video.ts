import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { SpaceRenderer, type SpaceFrame, type SpacePhase } from './space/space-renderer';
import { SOLAR_BODIES, lightTravelSeconds, type SolarBody } from './space/solar-system';

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
};

type SpaceSettings = {
  title?: string;
  destination?: string;
};

type VideoJob = {
  mode?: string;
  space?: SpaceSettings;
  video?: VideoSettings;
};

type NormalizedVideo = Required<VideoSettings>;

type JourneyAnchor = {
  body: SolarBody;
  videoSecond: number;
};

const DEFAULT_TITLE = '光速で太陽系を進むと、どこまで行ける？';
const BASE_ANCHOR_SECONDS = [0, 2.2, 4.0, 6.0, 8.1, 12.0, 15.1, 18.5, 21.7, 25.0];

async function main(): Promise<void> {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const configPath = resolve(process.env.SIM_BASE_VIDEO_CONFIG ?? join(rootDir, 'video.config.json'));
  const outputDir = resolve(process.env.SIM_BASE_OUTPUT_DIR ?? join(rootDir, 'output'));
  const framesDir = resolve(process.env.SIM_BASE_FRAMES_DIR ?? join(rootDir, '.simbase-space-frames'));

  if (!existsSync(configPath)) throw new Error(`Video config was not found: ${configPath}`);
  const job = JSON.parse(readFileSync(configPath, 'utf8')) as VideoJob;
  if (job.mode && job.mode !== 'light_speed_solar_system') {
    throw new Error(`Unsupported video mode: ${job.mode}`);
  }

  const video = normalizeVideo(job.video ?? {});
  const title = normalizeTitle(job.space?.title);
  const destination = job.space?.destination ?? 'pluto';
  const destinationIndex = SOLAR_BODIES.findIndex((body) => body.id === destination);
  if (destinationIndex < 1) throw new Error(`Unknown space destination: ${destination}`);
  const bodies = SOLAR_BODIES.slice(0, destinationIndex + 1);
  const destinationBody = bodies.at(-1)!;

  clearDirectory(outputDir);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const canvas = createCanvas(video.renderWidth, video.renderHeight);
  const renderer = new SpaceRenderer(canvas.getContext('2d'), video.renderWidth, video.renderHeight, bodies);
  const totalFrames = Math.round(video.durationSeconds * video.sourceFps);
  const introFrames = Math.round(video.introSeconds * video.sourceFps);
  const resultFrames = Math.round(video.resultSeconds * video.sourceFps);
  const journeyFrames = Math.max(1, totalFrames - introFrames - resultFrames);
  const journeySeconds = journeyFrames / video.sourceFps;
  const anchors = buildAnchors(bodies, journeySeconds);

  console.log(`Space Engine: ${title}`);
  console.log(`Route: Sun -> ${destinationBody.englishName}`);
  console.log(`Physical distance: ${destinationBody.distanceKm.toLocaleString('en-US')} km`);
  console.log(`Light travel time: ${lightTravelSeconds(destinationBody.distanceKm).toFixed(1)} seconds`);
  console.log(`Generating ${totalFrames} frames (${video.renderWidth}x${video.renderHeight} @ ${video.sourceFps}fps)`);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const state = buildFrameState({
      frame,
      introFrames,
      journeyFrames,
      totalFrames,
      video,
      title,
      bodies,
      anchors,
      destinationBody,
    });
    renderer.render(state);
    const framePath = join(framesDir, `frame-${String(frame).padStart(5, '0')}.png`);
    writeFileSync(framePath, await canvas.encode('png'));

    if ((frame + 1) % Math.max(1, Math.floor(totalFrames / 10)) === 0 || frame === totalFrames - 1) {
      console.log(`Frames: ${frame + 1}/${totalFrames}`);
    }
  }

  const fileName = toVideoFileName(title);
  const outputPath = join(outputDir, fileName);
  const ffmpeg = spawnSync('ffmpeg', [
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
    '18',
    '-movflags',
    '+faststart',
    '-metadata',
    `title=${title}`,
    '-metadata',
    'comment=Solar-system distances use rounded NASA average heliocentric values. Visual scale is logarithmic.',
    outputPath,
  ], { stdio: 'inherit' });

  if (ffmpeg.error) throw ffmpeg.error;
  if (ffmpeg.status !== 0) throw new Error(`FFmpeg exited with status ${ffmpeg.status}`);

  if (process.env.SIM_BASE_KEEP_FRAMES !== 'true') {
    rmSync(framesDir, { recursive: true, force: true });
  }

  console.log(`Completed video: ${outputPath}`);
}

function buildFrameState(input: {
  frame: number;
  introFrames: number;
  journeyFrames: number;
  totalFrames: number;
  video: NormalizedVideo;
  title: string;
  bodies: readonly SolarBody[];
  anchors: readonly JourneyAnchor[];
  destinationBody: SolarBody;
}): SpaceFrame {
  const { frame, introFrames, journeyFrames, totalFrames, video, title, bodies, anchors, destinationBody } = input;
  let phase: SpacePhase;
  let journeyFrame: number;

  if (frame < introFrames) {
    phase = 'intro';
    journeyFrame = 0;
  } else if (frame < introFrames + journeyFrames) {
    phase = 'journey';
    journeyFrame = frame - introFrames;
  } else {
    phase = 'result';
    journeyFrame = journeyFrames;
  }

  const journeySecond = Math.min(journeyFrames / video.sourceFps, journeyFrame / video.sourceFps);
  const journeyProgress = clamp01(journeyFrame / Math.max(1, journeyFrames));
  const segment = findSegment(anchors, journeySecond);
  const segmentDuration = Math.max(0.001, segment.next.videoSecond - segment.current.videoSecond);
  const rawSegmentProgress = clamp01((journeySecond - segment.current.videoSecond) / segmentDuration);
  const segmentProgress = smootherStep(rawSegmentProgress);
  const distanceKm = lerp(segment.current.body.distanceKm, segment.next.body.distanceKm, segmentProgress);
  const elapsedSeconds = lightTravelSeconds(distanceKm);

  const nearest = nearestAnchor(anchors, journeySecond);
  const activeWindow = Math.max(0.62, (anchors.at(-1)?.videoSecond ?? 25) * 0.034);
  const activeStrength = clamp01(1 - Math.abs(journeySecond - nearest.videoSecond) / activeWindow);
  const activeIndex = bodies.findIndex((body) => body.id === nearest.body.id);
  const nextBody = bodies[activeIndex + 1] ?? null;
  const passedBodyIds = new Set(
    anchors.filter((anchor) => anchor.videoSecond <= journeySecond + 0.02).map((anchor) => anchor.body.id),
  );

  if (phase === 'intro') {
    return {
      phase,
      frame,
      elapsedSeconds: 0,
      distanceKm: 1,
      journeyProgress: 0,
      activeBody: bodies[0],
      nextBody: bodies[1] ?? null,
      activeStrength: 1,
      passedBodyIds: new Set(['sun']),
      title,
    };
  }

  if (phase === 'result') {
    return {
      phase,
      frame,
      elapsedSeconds: lightTravelSeconds(destinationBody.distanceKm),
      distanceKm: destinationBody.distanceKm,
      journeyProgress: 1,
      activeBody: destinationBody,
      nextBody: null,
      activeStrength: 1,
      passedBodyIds: new Set(bodies.map((body) => body.id)),
      title,
    };
  }

  return {
    phase,
    frame: Math.min(frame, totalFrames - 1),
    elapsedSeconds,
    distanceKm: Math.max(1, distanceKm),
    journeyProgress,
    activeBody: nearest.body,
    nextBody,
    activeStrength,
    passedBodyIds,
    title,
  };
}

function buildAnchors(bodies: readonly SolarBody[], journeySeconds: number): JourneyAnchor[] {
  const availableBase = BASE_ANCHOR_SECONDS.slice(0, bodies.length);
  if (availableBase.length !== bodies.length) {
    return bodies.map((body, index) => ({
      body,
      videoSecond: (index / Math.max(1, bodies.length - 1)) * journeySeconds,
    }));
  }
  const baseTotal = availableBase.at(-1) ?? 25;
  return bodies.map((body, index) => ({
    body,
    videoSecond: (availableBase[index] / baseTotal) * journeySeconds,
  }));
}

function findSegment(anchors: readonly JourneyAnchor[], second: number): { current: JourneyAnchor; next: JourneyAnchor } {
  for (let index = 0; index < anchors.length - 1; index += 1) {
    if (second <= anchors[index + 1].videoSecond) {
      return { current: anchors[index], next: anchors[index + 1] };
    }
  }
  const final = anchors.at(-1)!;
  return { current: final, next: final };
}

function nearestAnchor(anchors: readonly JourneyAnchor[], second: number): JourneyAnchor {
  return anchors.reduce((nearest, anchor) => {
    return Math.abs(anchor.videoSecond - second) < Math.abs(nearest.videoSecond - second) ? anchor : nearest;
  }, anchors[0]);
}

function normalizeVideo(input: VideoSettings): NormalizedVideo {
  const sourceFps = clampInt(input.sourceFps ?? 15, 8, 30);
  const durationSeconds = clamp(input.durationSeconds ?? 30, 12, 60);
  const introSeconds = clamp(input.introSeconds ?? 2.4, 1, durationSeconds - 4);
  const resultSeconds = clamp(input.resultSeconds ?? 3.2, 2, durationSeconds - introSeconds - 2);
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
  };
}

function normalizeTitle(input: string | undefined): string {
  const title = input?.trim() || DEFAULT_TITLE;
  return title.slice(0, 48);
}

function toVideoFileName(title: string): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 90);
  return `${safeTitle || '光速で太陽系を進む旅'}.mp4`;
}

function clearDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true });
  for (const entry of readdirSync(directory)) {
    rmSync(join(directory, entry), { recursive: true, force: true });
  }
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

await main();
