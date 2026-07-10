import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/config';
import type { SimulationConfig } from '../src/types';

type VideoJob = {
  scenario?: Partial<SimulationConfig>;
  video?: Record<string, unknown> & { fileName?: string };
};

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceConfigPath = resolve(process.env.SIM_BASE_VIDEO_CONFIG ?? join(rootDir, 'video.config.json'));
const outputDir = resolve(process.env.SIM_BASE_OUTPUT_DIR ?? join(rootDir, 'output'));
const generatedConfigPath = join(rootDir, '.simbase-video.generated.json');
const temporaryFileName = 'sim-base-auto.mp4';

function buildVideoTitle(input: Partial<SimulationConfig>): string {
  const population = toInt(input.population, DEFAULT_CONFIG.population);
  const teams = toInt(input.teams, DEFAULT_CONFIG.teams);
  const foodCount = toInt(input.foodCount, DEFAULT_CONFIG.foodCount);
  const specialRule = input.specialRule ?? DEFAULT_CONFIG.specialRule;
  const seed = toInt(input.seed, DEFAULT_CONFIG.seed);
  const foodRatio = population > 0 ? foodCount / population : 1;

  const candidates: string[] = [];

  if (specialRule === 'sinking_island') {
    candidates.push(
      `沈む島で${population}人が戦った結果…`,
      `${population}人の中に英雄${teams}人、沈む島の結末`,
      `逃げ場ゼロの島で最後に残るのは？`,
    );
  } else if (foodRatio <= 0.3) {
    candidates.push(
      `${population}人に食料${foodCount}個、奪い合った結果…`,
      `食料${foodCount}個を${population}人で奪い合うと？`,
      `英雄${teams}人vs食料不足、生き残るのは？`,
    );
  } else if (teams >= 2) {
    candidates.push(
      `${population}人を${teams}チームで戦わせた結果…`,
      `英雄率いる${teams}チーム、最強はどこ？`,
      `${population}人の生存戦争、最後の勝者は？`,
    );
  } else {
    candidates.push(
      `${population}人を小さな世界に放置した結果…`,
      `${population}人だけの世界、生き残るのは？`,
      `戦うか助けるか、${population}人の最後の結末`,
    );
  }

  return candidates[Math.abs(seed) % candidates.length];
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function toVideoFileName(title: string): string {
  const safeTitle = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 90);

  return `${safeTitle || 'Sim Base 自動生成動画'}.mp4`;
}

function clearOutputDirectory(): void {
  mkdirSync(outputDir, { recursive: true });
  for (const entry of readdirSync(outputDir)) {
    rmSync(join(outputDir, entry), { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (!existsSync(sourceConfigPath)) throw new Error(`Video config was not found: ${sourceConfigPath}`);

  const sourceJob = JSON.parse(readFileSync(sourceConfigPath, 'utf8')) as VideoJob;
  const title = buildVideoTitle(sourceJob.scenario ?? {});
  const finalFileName = toVideoFileName(title);
  const generatedJob: VideoJob = {
    ...sourceJob,
    scenario: {
      ...sourceJob.scenario,
      title,
    },
    video: {
      ...sourceJob.video,
      fileName: temporaryFileName,
    },
  };

  clearOutputDirectory();
  writeFileSync(generatedConfigPath, `${JSON.stringify(generatedJob, null, 2)}\n`);
  process.env.SIM_BASE_VIDEO_CONFIG = generatedConfigPath;

  try {
    await import('./generate-video-quality.ts');

    const temporaryVideoPath = join(outputDir, temporaryFileName);
    const finalVideoPath = join(outputDir, finalFileName);
    if (!existsSync(temporaryVideoPath)) throw new Error(`Generated video was not found: ${temporaryVideoPath}`);

    renameSync(temporaryVideoPath, finalVideoPath);
    rmSync(join(outputDir, 'simulation-summary.json'), { force: true });

    console.log(`Generated title: ${title}`);
    console.log(`Final video: ${finalVideoPath}`);
  } finally {
    rmSync(generatedConfigPath, { force: true });
  }
}

await main();
