import './style.css';
import { DEFAULT_CONFIG, PRESETS, sanitizeConfig } from './config';
import { CanvasRecorder } from './recorder';
import { Renderer } from './renderer';
import { Simulation } from './simulation';
import type { SimulationConfig, SimulationSnapshot } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app was not found.');

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="brand-kicker">AUTONOMOUS WORLD VIDEO LAB</p>
        <h1>Sim Base</h1>
        <p class="subtitle">条件を変えるだけで、100人の物語を自動生成する。</p>
      </div>
      <div class="status-pill" id="statusPill">READY</div>
    </header>
    <section class="workspace">
      <aside class="panel settings">
        <div class="panel-title"><h2>実験条件</h2><span>CONFIG</span></div>
        <div class="form-grid">
          <div class="field full">
            <label for="preset">プリセット</label>
            <select id="preset">
              <option value="sinking">沈む島</option>
              <option value="centerFood">中央にしか食料がない世界</option>
              <option value="scarcity">食料不足</option>
            </select>
          </div>
          <div class="field full"><label for="title">動画タイトル</label><textarea id="title"></textarea></div>
          <div class="field"><label for="population">住民数</label><input id="population" type="number" min="2" max="300"></div>
          <div class="field"><label for="teams">チーム数</label><input id="teams" type="number" min="1" max="8"></div>
          <div class="field"><label for="foodCount">食料数</label><input id="foodCount" type="number" min="0" max="500"></div>
          <div class="field"><label for="simulationTicks">実験tick</label><input id="simulationTicks" type="number" min="100" max="10000"></div>
          <div class="field"><label for="playbackSpeed">再生速度</label><input id="playbackSpeed" type="number" min="0.25" max="20" step="0.25"></div>
          <div class="field"><label for="seed">乱数シード</label><input id="seed" type="number"></div>
          <div class="field full">
            <label for="specialRule">特殊ルール</label>
            <select id="specialRule"><option value="sinking_island">沈む島</option><option value="none">なし</option></select>
          </div>
        </div>
        <div class="actions">
          <button class="primary" id="startButton">START</button>
          <button id="pauseButton" disabled>PAUSE</button>
          <button id="resetButton">RESET</button>
          <button id="recordButton">録画開始</button>
          <button class="danger" id="stopRecordButton" disabled>録画停止・保存</button>
          <button id="randomSeedButton">シード変更</button>
        </div>
        <p class="help">設定変更はRESET時に反映されます。録画はChrome / Edge推奨。出力形式は縦型1080×1920のWebMです。</p>
      </aside>
      <section class="panel preview">
        <div class="panel-title"><h2>縦型動画プレビュー</h2><span>1080 × 1920</span></div>
        <div class="canvas-shell"><canvas id="simulationCanvas"></canvas></div>
        <div class="event-log" id="eventLog"></div>
      </section>
    </section>
  </main>
`;

const elements = {
  canvas: getElement<HTMLCanvasElement>('simulationCanvas'),
  statusPill: getElement<HTMLDivElement>('statusPill'),
  eventLog: getElement<HTMLDivElement>('eventLog'),
  preset: getElement<HTMLSelectElement>('preset'),
  title: getElement<HTMLTextAreaElement>('title'),
  population: getElement<HTMLInputElement>('population'),
  teams: getElement<HTMLInputElement>('teams'),
  foodCount: getElement<HTMLInputElement>('foodCount'),
  simulationTicks: getElement<HTMLInputElement>('simulationTicks'),
  playbackSpeed: getElement<HTMLInputElement>('playbackSpeed'),
  seed: getElement<HTMLInputElement>('seed'),
  specialRule: getElement<HTMLSelectElement>('specialRule'),
  startButton: getElement<HTMLButtonElement>('startButton'),
  pauseButton: getElement<HTMLButtonElement>('pauseButton'),
  resetButton: getElement<HTMLButtonElement>('resetButton'),
  recordButton: getElement<HTMLButtonElement>('recordButton'),
  stopRecordButton: getElement<HTMLButtonElement>('stopRecordButton'),
  randomSeedButton: getElement<HTMLButtonElement>('randomSeedButton'),
};

let config = DEFAULT_CONFIG;
let simulation = new Simulation(config);
let renderer = new Renderer(elements.canvas, config);
let recorder = new CanvasRecorder(elements.canvas, config.framesPerSecond);
let accumulator = 0;
let previousTime = performance.now();
let lastRenderedEventCount = -1;

applyConfigToForm(config);
renderer.render(simulation.getSnapshot());
requestAnimationFrame(loop);

function loop(now: number): void {
  const deltaSeconds = Math.min(0.1, (now - previousTime) / 1000);
  previousTime = now;
  const snapshot = simulation.getSnapshot();

  if (snapshot.status === 'running') {
    accumulator += deltaSeconds * config.ticksPerSecond * config.playbackSpeed;
    const maxStepsPerFrame = Math.max(1, Math.ceil(config.playbackSpeed * 2));
    let steps = 0;
    while (accumulator >= 1 && steps < maxStepsPerFrame) {
      simulation.step();
      accumulator -= 1;
      steps += 1;
    }
  }

  const nextSnapshot = simulation.getSnapshot();
  renderer.render(nextSnapshot);
  updateUi(nextSnapshot);
  requestAnimationFrame(loop);
}

elements.startButton.addEventListener('click', () => {
  const status = simulation.getSnapshot().status;
  if (status === 'paused') simulation.resume();
  else simulation.start();
});

elements.pauseButton.addEventListener('click', () => simulation.pause());
elements.resetButton.addEventListener('click', rebuildSimulation);
elements.preset.addEventListener('change', () => {
  const preset = PRESETS[elements.preset.value] ?? {};
  applyConfigToForm(sanitizeConfig({ ...readConfigFromForm(), ...preset }));
  rebuildSimulation();
});
elements.randomSeedButton.addEventListener('click', () => {
  elements.seed.value = String(Math.floor(Math.random() * 2_147_483_647));
  rebuildSimulation();
});

elements.recordButton.addEventListener('click', () => {
  try {
    recorder.start();
    elements.recordButton.disabled = true;
    elements.stopRecordButton.disabled = false;
    if (simulation.getSnapshot().status !== 'running') simulation.start();
  } catch (error) {
    alert(error instanceof Error ? error.message : '録画を開始できませんでした。');
  }
});

elements.stopRecordButton.addEventListener('click', async () => {
  try {
    const blob = await recorder.stop();
    recorder.download(blob, `sim-base-${Date.now()}.webm`);
  } catch (error) {
    alert(error instanceof Error ? error.message : '録画を保存できませんでした。');
  } finally {
    elements.recordButton.disabled = false;
    elements.stopRecordButton.disabled = true;
  }
});

function rebuildSimulation(): void {
  config = sanitizeConfig(readConfigFromForm());
  simulation = new Simulation(config);
  renderer = new Renderer(elements.canvas, config);
  recorder = new CanvasRecorder(elements.canvas, config.framesPerSecond);
  accumulator = 0;
  lastRenderedEventCount = -1;
  renderer.render(simulation.getSnapshot());
}

function updateUi(snapshot: SimulationSnapshot): void {
  elements.statusPill.textContent = recorder.isRecording ? `● REC / ${snapshot.status.toUpperCase()}` : snapshot.status.toUpperCase();
  elements.startButton.textContent = snapshot.status === 'paused' ? 'RESUME' : snapshot.status === 'finished' ? 'RESTART' : 'START';
  elements.pauseButton.disabled = snapshot.status !== 'running';

  if (snapshot.events.length !== lastRenderedEventCount) {
    lastRenderedEventCount = snapshot.events.length;
    elements.eventLog.innerHTML = snapshot.events
      .slice(-4)
      .reverse()
      .map((event) => `<div class="event-item ${event.kind}">T${event.tick} — ${escapeHtml(event.message)}</div>`)
      .join('');
  }
}

function readConfigFromForm(): Partial<SimulationConfig> {
  return {
    ...config,
    title: elements.title.value,
    population: Number(elements.population.value),
    teams: Number(elements.teams.value),
    foodCount: Number(elements.foodCount.value),
    simulationTicks: Number(elements.simulationTicks.value),
    playbackSpeed: Number(elements.playbackSpeed.value),
    seed: Number(elements.seed.value),
    specialRule: elements.specialRule.value as SimulationConfig['specialRule'],
  };
}

function applyConfigToForm(value: SimulationConfig): void {
  elements.title.value = value.title;
  elements.population.value = String(value.population);
  elements.teams.value = String(value.teams);
  elements.foodCount.value = String(value.foodCount);
  elements.simulationTicks.value = String(value.simulationTicks);
  elements.playbackSpeed.value = String(value.playbackSpeed);
  elements.seed.value = String(value.seed);
  elements.specialRule.value = value.specialRule;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} was not found.`);
  return element as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}
