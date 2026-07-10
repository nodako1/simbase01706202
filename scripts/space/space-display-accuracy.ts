import { SpaceRenderer, type SpaceFrame } from './space-renderer';
import { ASTRONOMICAL_UNIT_KM, distanceInAu, formatElapsed } from './solar-system';

const FONT = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';

/**
 * Keeps display-only formatting separate from the physical journey model.
 * The renderer intentionally exposes no public UI hooks, so the video entry
 * applies these overrides before generation.
 */
export function applyAccurateSpaceDisplays(): void {
  const prototype = SpaceRenderer.prototype as any;

  prototype.drawDashboard = function drawDashboard(state: SpaceFrame): void {
    const y = this.height * 0.785;
    const cardHeight = this.height * 0.135;
    const gap = this.width * 0.018;
    const cardWidth = (this.width * 0.89 - gap * 2) / 3;
    const startX = this.width * 0.055;
    const cards = [
      { label: '経過時間', value: formatElapsed(state.elapsedSeconds), accent: '#f8fafc' },
      { label: '太陽から', value: compactDistanceAccurate(state.distanceKm), accent: '#67e8f9' },
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
  };

  prototype.drawResult = function drawResult(state: SpaceFrame): void {
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
      { label: '太陽からの距離', value: '約39 AU' },
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
  };
}

function compactDistanceAccurate(distanceKm: number): string {
  if (distanceKm < 1_000_000) return `${Math.round(distanceKm).toLocaleString('ja-JP')}km`;
  if (distanceKm < 100_000_000) return `${Math.round(distanceKm / 10_000).toLocaleString('ja-JP')}万km`;
  if (distanceKm < 1_000_000_000) return `${(distanceKm / 100_000_000).toFixed(1)}億km`;
  if (distanceKm < 1_000_000_000_000) return `${(distanceKm / 100_000_000).toFixed(1)}億km`;
  return `${(distanceKm / 1_000_000_000_000).toFixed(2)}兆km`;
}
