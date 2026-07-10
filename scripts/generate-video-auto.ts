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
      `${population}人を沈み続ける島に放置した結果…`,
      `逃げ場が消える島で${population}人は何人生き残る？`,
      `島が沈み続けたら${population}人は全滅するのか？`,
    );
  } else if (foodRatio <= 0.3) {
    candidates.push(
      `${population}人に食料${foodCount}個だけ与えた結果…`,
      `食料${foodCount}個を${population}人で奪い合ったらどうなる？`,
      `${population}人vs食料${foodCount}個、最後に残るのは？`,
    );
  } else if (teams >= 2) {
    candidates.push(
      `${population}人を${teams}チームに分けて生存競争させた結果…`,
      `${teams}チーム${population}人、最後まで生き残るのはどこ？`,
      `${population}人のサバイバル、最強チームが決まる瞬間`,
    );
  } else {
    candidates.push(
      `${population}人を小さな世界に放置した結果…`,
      `${population}人だけの世界で最後まで生き残るのは？`,
      `食料を求める${population}人、最後に待っていた結末`,
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
