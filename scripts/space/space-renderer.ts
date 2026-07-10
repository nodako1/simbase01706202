import type { SolarBody } from './solar-system';
import {
  ASTRONOMICAL_UNIT_KM,
  SPEED_OF_LIGHT_KM_S,
  distanceInAu,
  formatDistance,
  formatElapsed,
} from './solar-system';

export type SpacePhase = 'intro' | 'journey' | 'result';

export type SpaceFrame = {
  phase: SpacePhase;
  frame: number;
  elapsedSeconds: number;
  distanceKm: number;
  journeyProgress: number;
  activeBody: SolarBody;
  nextBody: SolarBody | null;
  activeStrength: number;
  passedBodyIds: ReadonlySet<string>;
  title: string;
};

const FONT = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';

export class SpaceRenderer {
  private readonly stars: Array<{ x: number; y: number; size: number; depth: number; phase: number }>;

  constructor(
    private readonly ctx: any,
    private readonly width: number,
    private readonly height: number,
    private readonly bodies: readonly SolarBody[],
  ) {
    this.stars = Array.from({ length: 190 }, (_, index) => ({
      x: hash(index * 13 + 7),
      y: hash(index * 29 + 11),
      size: 0.45 + hash(index * 41 + 17) * 1.8,
      depth: 0.25 + hash(index * 53 + 23) * 0.95,
      phase: hash(index * 67 + 31) * Math.PI * 2,
    }));
  }

  render(state: SpaceFrame): void {
    this.drawSpace(state);
    this.drawHeader(state);
    this.drawJourneyViewport(state);
    this.drawProgressRail(state);
    this.drawDashboard(state);
    this.drawSourceNote();

    if (state.phase === 'intro') this.drawIntro(state);
    if (state.phase === 'result') this.drawResult(state);
  }

  private drawSpace(state: SpaceFrame): void {
    const gradient = this.ctx.createRadialGradient(
      this.width * 0.52,
      this.height * 0.32,
      this.width * 0.04,
      this.width * 0.5,
      this.height * 0.45,
      this.height * 0.8,
    );
    gradient.addColorStop(0, '#102a56');
    gradient.addColorStop(0.42, '#071426');
    gradient.addColorStop(1, '#02050c');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const warp = state.phase === 'journey' ? 0.35 + state.journeyProgress * 0.65 : 0.15;
    for (const star of this.stars) {
      const travel = (state.frame * (0.45 + star.depth * 1.6) * warp) / this.height;
      const yNorm = (star.y + travel) % 1;
      const perspective = 0.35 + yNorm * 1.25;
      const x = this.width * 0.5 + (star.x - 0.5) * this.width * perspective;
      const y = this.height * (0.11 + yNorm * 0.67);
      const alpha = 0.25 + star.depth * 0.65;
      this.ctx.strokeStyle = `rgba(226,232,240,${alpha})`;
      this.ctx.lineWidth = star.size * (0.65 + yNorm * 0.7);
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x, y + (2 + 15 * warp * star.depth * yNorm));
      this.ctx.stroke();
    }

    this.ctx.fillStyle = `rgba(59,130,246,${0.025 + Math.sin(state.frame * 0.025) * 0.01})`;
    this.ctx.fillRect(0, this.height * 0.16, this.width, this.height * 0.61);
  }

  private drawHeader(state: SpaceFrame): void {
    this.ctx.fillStyle = '#67e8f9';
    this.ctx.font = `900 ${Math.round(this.width * 0.038)}px ${FONT}`;
    this.ctx.fillText('SIM BASE  /  SPACE ENGINE', this.width * 0.055, this.height * 0.046);

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.052)}px ${FONT}`;
    this.drawWrappedText(state.title, this.width * 0.055, this.height * 0.092, this.width * 0.89, this.width * 0.06, 2);

    const barX = this.width * 0.055;
    const barY = this.height * 0.166;
    const barWidth = this.width * 0.89;
    this.fillRound(barX, barY, barWidth, 7, 4, 'rgba(30,41,59,.95)');
    this.fillRound(barX, barY, barWidth * state.journeyProgress, 7, 4, '#22d3ee');
    this.ctx.fillStyle = '#e0f2fe';
    this.ctx.beginPath();
    this.ctx.arc(barX + barWidth * state.journeyProgress, barY + 3.5, 5.5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawJourneyViewport(state: SpaceFrame): void {
    const x = this.width * 0.045;
    const y = this.height * 0.196;
    const width = this.width * 0.91;
    const height = this.height * 0.52;

    this.ctx.save();
    this.roundPath(x, y, width, height, 22);
    this.ctx.clip();

    const viewportGradient = this.ctx.createLinearGradient(0, y, 0, y + height);
    viewportGradient.addColorStop(0, 'rgba(8,25,52,.48)');
    viewportGradient.addColorStop(0.72, 'rgba(2,8,20,.16)');
    viewportGradient.addColorStop(1, 'rgba(2,6,23,.76)');
    this.ctx.fillStyle = viewportGradient;
    this.ctx.fillRect(x, y, width, height);

    this.drawWarpTunnel(x, y, width, height, state);
    this.drawScaleMarkers(x, y, width, height, state);
    this.drawLightBeam(x, y, width, height, state);
    this.drawActivePlanet(x, y, width, height, state);
    this.drawPassingBanner(x, y, width, height, state);

    this.ctx.restore();

    this.ctx.strokeStyle = state.activeStrength > 0.28 ? 'rgba(103,232,249,.78)' : 'rgba(148,163,184,.32)';
    this.ctx.lineWidth = state.activeStrength > 0.28 ? 2.5 : 1.5;
    this.roundPath(x, y, width, height, 22);
    this.ctx.stroke();
  }

  private drawWarpTunnel(x: number, y: number, width: number, height: number, state: SpaceFrame): void {
    const vanishX = x + width * 0.5;
    const vanishY = y + height * 0.12;
    const pulse = (state.frame * 0.018) % 1;

    this.ctx.strokeStyle = 'rgba(56,189,248,.12)';
    this.ctx.lineWidth = 1;
    for (let lane = -4; lane <= 4; lane += 1) {
      const bottomX = x + width * (0.5 + lane * 0.145);
      this.ctx.beginPath();
      this.ctx.moveTo(vanishX, vanishY);
      this.ctx.lineTo(bottomX, y + height);
      this.ctx.stroke();
    }

    for (let ring = 0; ring < 11; ring += 1) {
      const progress = (ring / 11 + pulse) % 1;
      const eased = progress * progress;
      const ringWidth = width * (0.05 + eased * 1.2);
      const ringHeight = height * (0.018 + eased * 0.34);
      this.ctx.strokeStyle = `rgba(34,211,238,${0.04 + progress * 0.13})`;
      this.ctx.beginPath();
      this.ctx.ellipse(vanishX, vanishY + eased * height * 0.88, ringWidth / 2, ringHeight / 2, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawScaleMarkers(x: number, y: number, width: number, height: number, state: SpaceFrame): void {
    const currentLog = Math.log10(Math.max(1, state.distanceKm));
    const markerValues = [1e6, 1e7, 1e8, 1e9];
    for (const marker of markerValues) {
      const delta = Math.log10(marker) - currentLog;
      if (Math.abs(delta) > 1.45) continue;
      const markerY = y + height * (0.56 - delta * 0.24);
      this.ctx.strokeStyle = 'rgba(148,163,184,.18)';
      this.ctx.setLineDash([5, 7]);
      this.ctx.beginPath();
      this.ctx.moveTo(x + width * 0.08, markerY);
      this.ctx.lineTo(x + width * 0.92, markerY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#64748b';
      this.ctx.font = `700 ${Math.round(this.width * 0.016)}px ${FONT}`;
      this.ctx.fillText(formatDistance(marker), x + width * 0.08, markerY - 5);
    }
  }

  private drawLightBeam(x: number, y: number, width: number, height: number, state: SpaceFrame): void {
    const beamX = x + width * 0.5;
    const topY = y + height * 0.12;
    const bottomY = y + height * 0.96;
    const glow = this.ctx.createLinearGradient(0, topY, 0, bottomY);
    glow.addColorStop(0, 'rgba(255,255,255,.08)');
    glow.addColorStop(0.65, 'rgba(103,232,249,.45)');
    glow.addColorStop(1, 'rgba(255,255,255,.96)');
    this.ctx.strokeStyle = glow;
    this.ctx.lineWidth = 3.5;
    this.ctx.shadowColor = '#22d3ee';
    this.ctx.shadowBlur = 14;
    this.ctx.beginPath();
    this.ctx.moveTo(beamX, topY);
    this.ctx.lineTo(beamX, bottomY);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    const lightY = bottomY - ((state.frame * 5.4) % (height * 0.31));
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = '#67e8f9';
    this.ctx.shadowBlur = 24;
    this.ctx.beginPath();
    this.ctx.arc(beamX, lightY, 4.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  private drawActivePlanet(x: number, y: number, width: number, height: number, state: SpaceFrame): void {
    const body = state.activeBody;
    const strength = state.phase === 'journey' ? state.activeStrength : 0.75;
    const planetX = x + width * (0.52 + Math.sin(state.frame * 0.012) * 0.025);
    const planetY = y + height * 0.48;
    const diameterScale = Math.log10(body.diameterKm + 1000) / Math.log10(1_400_000);
    const radius = this.width * (0.055 + diameterScale * 0.105) * (0.78 + strength * 0.34);

    if (body.id === 'sun') {
      this.drawSun(planetX, planetY, radius * 1.25, state.frame);
    } else {
      this.drawPlanet(body, planetX, planetY, radius, state.frame);
    }

    const cardX = x + width * 0.07;
    const cardY = y + height * 0.68;
    const cardWidth = width * 0.86;
    const cardHeight = height * 0.19;
    this.fillRound(cardX, cardY, cardWidth, cardHeight, 14, 'rgba(2,6,23,.8)');
    this.ctx.fillStyle = body.accentColor;
    this.ctx.font = `900 ${Math.round(this.width * 0.022)}px ${FONT}`;
    this.ctx.fillText(body.englishName, cardX + 16, cardY + cardHeight * 0.29);
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = `900 ${Math.round(this.width * 0.046)}px ${FONT}`;
    this.ctx.fillText(body.name, cardX + 16, cardY + cardHeight * 0.67);

    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.019)}px ${FONT}`;
    const bodyTime = body.distanceKm / SPEED_OF_LIGHT_KM_S;
    this.ctx.fillText(body.id === 'sun' ? '出発地点' : `到達 ${formatElapsed(bodyTime)}`, cardX + cardWidth - 16, cardY + cardHeight * 0.35);
    this.ctx.fillText(body.note, cardX + cardWidth - 16, cardY + cardHeight * 0.69);
    this.ctx.textAlign = 'start';
  }

  private drawPlanet(body: SolarBody, x: number, y: number, radius: number, frame: number): void {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(Math.sin(frame * 0.006) * 0.04);

    if (body.hasRings) {
      this.ctx.strokeStyle = 'rgba(254,243,199,.72)';
      this.ctx.lineWidth = Math.max(3, radius * 0.17);
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, radius * 1.9, radius * 0.48, -0.18, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.strokeStyle = 'rgba(146,64,14,.38)';
      this.ctx.lineWidth = Math.max(1, radius * 0.055);
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, radius * 1.55, radius * 0.37, -0.18, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    const gradient = this.ctx.createRadialGradient(-radius * 0.32, -radius * 0.35, radius * 0.08, 0, 0, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.16, body.primaryColor);
    gradient.addColorStop(0.72, body.secondaryColor);
    gradient.addColorStop(1, '#030712');
    this.ctx.fillStyle = gradient;
    this.ctx.shadowColor = body.accentColor;
    this.ctx.shadowBlur = 20;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius * 0.97, 0, Math.PI * 2);
    this.ctx.clip();
    this.drawPlanetTexture(body, radius, frame);
    this.ctx.restore();

    this.ctx.strokeStyle = 'rgba(255,255,255,.33)';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawPlanetTexture(body: SolarBody, radius: number, frame: number): void {
    if (body.id === 'earth') {
      this.ctx.fillStyle = 'rgba(74,222,128,.72)';
      for (let i = 0; i < 7; i += 1) {
        const angle = i * 1.9 + frame * 0.005;
        this.ctx.beginPath();
        this.ctx.ellipse(Math.cos(angle) * radius * 0.52, Math.sin(angle * 1.4) * radius * 0.46, radius * 0.22, radius * 0.11, angle, 0, Math.PI * 2);
        this.ctx.fill();
      }
      return;
    }

    if (body.id === 'jupiter' || body.id === 'saturn') {
      for (let i = -5; i <= 5; i += 1) {
        this.ctx.strokeStyle = i % 2 ? 'rgba(120,53,15,.32)' : 'rgba(255,247,237,.25)';
        this.ctx.lineWidth = radius * 0.095;
        this.ctx.beginPath();
        this.ctx.moveTo(-radius, i * radius * 0.17);
        this.ctx.lineTo(radius, i * radius * 0.17 + Math.sin(frame * 0.012 + i) * 2);
        this.ctx.stroke();
      }
      if (body.id === 'jupiter') {
        this.ctx.fillStyle = 'rgba(153,27,27,.65)';
        this.ctx.beginPath();
        this.ctx.ellipse(radius * 0.35, radius * 0.25, radius * 0.22, radius * 0.12, -0.12, 0, Math.PI * 2);
        this.ctx.fill();
      }
      return;
    }

    this.ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 12; i += 1) {
      const angle = i * 2.27 + frame * 0.002;
      const px = Math.cos(angle) * radius * (0.15 + (i % 4) * 0.18);
      const py = Math.sin(angle * 1.31) * radius * 0.68;
      this.ctx.beginPath();
      this.ctx.arc(px, py, radius * (0.035 + (i % 3) * 0.018), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawSun(x: number, y: number, radius: number, frame: number): void {
    for (let ring = 4; ring >= 1; ring -= 1) {
      this.ctx.fillStyle = `rgba(251,191,36,${0.025 * ring})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius * (1 + ring * 0.18 + Math.sin(frame * 0.03 + ring) * 0.03), 0, Math.PI * 2);
      this.ctx.fill();
    }
    const gradient = this.ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.26, '#fef08a');
    gradient.addColorStop(0.72, '#f59e0b');
    gradient.addColorStop(1, '#b45309');
    this.ctx.fillStyle = gradient;
    this.ctx.shadowColor = '#fbbf24';
    this.ctx.shadowBlur = 35;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  private drawPassingBanner(x: number, y: number, width: number, height: number, state: SpaceFrame): void {
    if (state.phase !== 'journey' || state.activeStrength < 0.32) return;
    const body = state.activeBody;
    const alpha = Math.min(1, state.activeStrength * 1.5);
    const bannerWidth = width * 0.62;
    const bannerX = x + (width - bannerWidth) / 2;
    const bannerY = y + height * 0.055;
    this.ctx.globalAlpha = alpha;
    this.fillRound(bannerX, bannerY, bannerWidth, height * 0.092, 13, 'rgba(2,6,23,.88)');
    this.ctx.fillStyle = body.accentColor;
    this.ctx.font = `900 ${Math.round(this.width * 0.027)}px ${FONT}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(body.id === 'sun' ? '光速の旅、開始' : `${body.name}軌道を通過`, this.width / 2, bannerY + height * 0.04);
    this.ctx.fillStyle = '#e2e8f0';
    this.ctx.font = `700 ${Math.round(this.width * 0.018)}px ${FONT}`;
    this.ctx.fillText(body.id === 'sun' ? '速度 299,792 km/s' : `太陽から ${formatDistance(body.distanceKm)}`, this.width / 2, bannerY + height * 0.072);
    this.ctx.textAlign = 'start';
    this.ctx.globalAlpha = 1;
  }

  private drawProgressRail(state: SpaceFrame): void {
    const x = this.width * 0.07;
    const y = this.height * 0.742;
    const width = this.width * 0.86;
    this.ctx.strokeStyle = 'rgba(100,116,139,.5)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + width, y);
    this.ctx.stroke();

    const maxLog = Math.log10(this.bodies.at(-1)?.distanceKm ?? 1);
    for (const body of this.bodies.slice(1)) {
      const position = Math.log10(body.distanceKm) / maxLog;
      const dotX = x + width * position;
      const passed = state.passedBodyIds.has(body.id);
      const active = body.id === state.activeBody.id;
      this.ctx.fillStyle = active ? '#ffffff' : passed ? '#22d3ee' : '#334155';
      this.ctx.shadowColor = active ? body.accentColor : 'transparent';
      this.ctx.shadowBlur = active ? 12 : 0;
      this.ctx.beginPath();
      this.ctx.arc(dotX, y, active ? 5.5 : 3.2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    const currentPosition = Math.log10(Math.max(1, state.distanceKm)) / maxLog;
    this.ctx.fillStyle = '#67e8f9';
    this.ctx.beginPath();
    this.ctx.moveTo(x + width * currentPosition, y - 10);
    this.ctx.lineTo(x + width * currentPosition - 5, y - 18);
    this.ctx.lineTo(x + width * currentPosition + 5, y - 18);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawDashboard(state: SpaceFrame): void {
    const y = this.height * 0.785;
    const cardHeight = this.height * 0.135;
    const gap = this.width * 0.018;
    const cardWidth = (this.width * 0.89 - gap * 2) / 3;
    const startX = this.width * 0.055;
    const cards = [
      { label: '経過時間', value: formatElapsed(state.elapsedSeconds), accent: '#f8fafc' },
      { label: '太陽から', value: compactDistance(state.distanceKm), accent: '#67e8f9' },
      { label: '現在速度', value: '299,792', unit: 'km/s', accent: '#fbbf24' },
    ];

    cards.forEach((card, index) => {
      const cardX = startX + index * (cardWidth + gap);
      this.fillRound(cardX, y, cardWidth, cardHeight, 12, 'rgba(15,23,42,.86)');
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = `700 ${Math.round(this.width * 0.018)}px ${FONT}`;
      this.ctx.fillText(card.label, cardX + 11, y + cardHeight * 0.28);
      this.ctx.fillStyle = card.accent;
      this.ctx.font = `900 ${Math.round(this.width * (index === 1 ? 0.029 : 0.031))}px ${FONT}`;
      this.ctx.fillText(card.value, cardX + 11, y + cardHeight * 0.65);
      if (card.unit) {
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.font = `700 ${Math.round(this.width * 0.015)}px ${FONT}`;
        this.ctx.fillText(card.unit, cardX + 11, y + cardHeight * 0.84);
      } else if (index === 1 && state.distanceKm > ASTRONOMICAL_UNIT_KM * 0.1) {
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = `700 ${Math.round(this.width * 0.014)}px ${FONT}`;
        this.ctx.fillText(`${distanceInAu(state.distanceKm).toFixed(1)} AU`, cardX + 11, y + cardHeight * 0.84);
      }
    });
  }

  private drawSourceNote(): void {
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = `600 ${Math.round(this.width * 0.014)}px ${FONT}`;
    this.ctx.fillText('NASA平均距離を使用｜天体は距離順に配置｜映像の縮尺は対数表現', this.width / 2, this.height * 0.965);
    this.ctx.textAlign = 'start';
  }

  private drawIntro(state: SpaceFrame): void {
    const x = this.width * 0.045;
    const y = this.height * 0.196;
    const width = this.width * 0.91;
    const height = this.height * 0.52;
    this.ctx.fillStyle = 'rgba(2,6,23,.84)';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#67e8f9';
    this.ctx.font = `900 ${Math.round(this.width * 0.029)}px ${FONT}`;
    this.ctx.fillText('LIGHT SPEED JOURNEY', this.width / 2, y + height * 0.19);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `900 ${Math.round(this.width * 0.071)}px ${FONT}`;
    this.ctx.fillText('秒速 29万9,792 km', this.width / 2, y + height * 0.35);
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.font = `900 ${Math.round(this.width * 0.044)}px ${FONT}`;
    this.ctx.fillText('1秒で地球を約7.5周', this.width / 2, y + height * 0.47);
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.024)}px ${FONT}`;
    this.ctx.fillText('その速さで太陽から冥王星まで進みます', this.width / 2, y + height * 0.61);
    this.fillRound(this.width * 0.18, y + height * 0.7, this.width * 0.64, height * 0.12, 12, 'rgba(15,23,42,.95)');
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = `700 ${Math.round(this.width * 0.018)}px ${FONT}`;
    this.ctx.fillText('30秒の映像 ＝ 光が進む約5時間28分', this.width / 2, y + height * 0.77);
    this.ctx.textAlign = 'start';
  }

  private drawResult(state: SpaceFrame): void {
    const x = this.width * 0.045;
    const y = this.height * 0.196;
    const width = this.width * 0.91;
    const height = this.height * 0.52;
    this.ctx.fillStyle = 'rgba(2,6,23,.9)';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#67e8f9';
    this.ctx.font = `900 ${Math.round(this.width * 0.029)}px ${FONT}`;
    this.ctx.fillText('JOURNEY COMPLETE', this.width / 2, y + height * 0.16);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `900 ${Math.round(this.width * 0.071)}px ${FONT}`;
    this.ctx.fillText('冥王星軌道に到達', this.width / 2, y + height * 0.31);

    const stats = [
      { label: '経過時間', value: formatElapsed(state.elapsedSeconds) },
      { label: '移動距離', value: '約59億 km' },
      { label: '地球から見た距離', value: '約39 AU' },
    ];
    stats.forEach((stat, index) => {
      const cardY = y + height * (0.4 + index * 0.13);
      this.fillRound(this.width * 0.17, cardY, this.width * 0.66, height * 0.1, 11, 'rgba(15,23,42,.9)');
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = `700 ${Math.round(this.width * 0.019)}px ${FONT}`;
      this.ctx.fillText(stat.label, this.width * 0.2, cardY + height * 0.063);
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = index === 0 ? '#fbbf24' : '#f8fafc';
      this.ctx.font = `900 ${Math.round(this.width * 0.027)}px ${FONT}`;
      this.ctx.fillText(stat.value, this.width * 0.8, cardY + height * 0.066);
    });
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = `700 ${Math.round(this.width * 0.021)}px ${FONT}`;
    this.ctx.fillText('光速でも、太陽系は想像以上に広い。', this.width / 2, y + height * 0.86);
    this.ctx.textAlign = 'start';
  }

  private drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    const chars = Array.from(text);
    let line = '';
    let lineIndex = 0;
    for (const char of chars) {
      const test = line + char;
      if (line && this.ctx.measureText(test).width > maxWidth) {
        this.ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = char;
        lineIndex += 1;
        if (lineIndex >= maxLines - 1) break;
      } else {
        line = test;
      }
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

function compactDistance(distanceKm: number): string {
  if (distanceKm < 100_000_000) return `${Math.round(distanceKm / 10_000) / 100}万km`;
  if (distanceKm < 1_000_000_000) return `${(distanceKm / 100_000_000).toFixed(1)}億km`;
  return `${(distanceKm / 1_000_000_000).toFixed(2)}兆km`;
}

function hash(value: number): number {
  const result = Math.sin(value * 12.9898) * 43758.5453;
  return result - Math.floor(result);
}
