export const SPEED_OF_LIGHT_KM_S = 299_792.458;
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;

export type SolarBody = {
  id: string;
  name: string;
  englishName: string;
  distanceKm: number;
  diameterKm: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  hasRings?: boolean;
  note: string;
};

/**
 * Average heliocentric distances. Values follow NASA's rounded public fact
 * sheets so the numbers displayed in the video match the source material.
 * The bodies are visualized in distance order; they are not assumed to be
 * physically aligned at the same instant.
 */
export const SOLAR_BODIES: SolarBody[] = [
  {
    id: 'sun',
    name: '太陽',
    englishName: 'SUN',
    distanceKm: 0,
    diameterKm: 1_392_700,
    primaryColor: '#fff7ae',
    secondaryColor: '#f59e0b',
    accentColor: '#fde047',
    note: '光の旅はここから始まる',
  },
  {
    id: 'mercury',
    name: '水星',
    englishName: 'MERCURY',
    distanceKm: 58_000_000,
    diameterKm: 4_880,
    primaryColor: '#cbd5e1',
    secondaryColor: '#64748b',
    accentColor: '#e2e8f0',
    note: '太陽に最も近い惑星',
  },
  {
    id: 'venus',
    name: '金星',
    englishName: 'VENUS',
    distanceKm: 108_000_000,
    diameterKm: 12_104,
    primaryColor: '#fde68a',
    secondaryColor: '#d97706',
    accentColor: '#fbbf24',
    note: '厚い雲に覆われた灼熱の惑星',
  },
  {
    id: 'earth',
    name: '地球',
    englishName: 'EARTH',
    distanceKm: 149_600_000,
    diameterKm: 12_756,
    primaryColor: '#60a5fa',
    secondaryColor: '#1d4ed8',
    accentColor: '#4ade80',
    note: '太陽光は約8分19秒で到着',
  },
  {
    id: 'mars',
    name: '火星',
    englishName: 'MARS',
    distanceKm: 228_000_000,
    diameterKm: 6_792,
    primaryColor: '#fb923c',
    secondaryColor: '#9a3412',
    accentColor: '#fdba74',
    note: '赤く見える岩石惑星',
  },
  {
    id: 'jupiter',
    name: '木星',
    englishName: 'JUPITER',
    distanceKm: 778_000_000,
    diameterKm: 139_820,
    primaryColor: '#fed7aa',
    secondaryColor: '#92400e',
    accentColor: '#f97316',
    note: '太陽系最大の惑星',
  },
  {
    id: 'saturn',
    name: '土星',
    englishName: 'SATURN',
    distanceKm: 1_400_000_000,
    diameterKm: 120_500,
    primaryColor: '#fde68a',
    secondaryColor: '#a16207',
    accentColor: '#fef3c7',
    hasRings: true,
    note: '巨大な環を持つガス惑星',
  },
  {
    id: 'uranus',
    name: '天王星',
    englishName: 'URANUS',
    distanceKm: 2_900_000_000,
    diameterKm: 51_118,
    primaryColor: '#a5f3fc',
    secondaryColor: '#0891b2',
    accentColor: '#cffafe',
    note: '横倒しに自転する氷の惑星',
  },
  {
    id: 'neptune',
    name: '海王星',
    englishName: 'NEPTUNE',
    distanceKm: 4_500_000_000,
    diameterKm: 49_528,
    primaryColor: '#60a5fa',
    secondaryColor: '#1e3a8a',
    accentColor: '#93c5fd',
    note: '太陽から最も遠い惑星',
  },
  {
    id: 'pluto',
    name: '冥王星',
    englishName: 'PLUTO',
    distanceKm: 5_900_000_000,
    diameterKm: 2_377,
    primaryColor: '#d6d3d1',
    secondaryColor: '#78716c',
    accentColor: '#f5f5f4',
    note: '太陽光が届くまで約5時間28分',
  },
];

export const DISTANCE_MILESTONES = [
  { distanceKm: 384_400, label: '月までの距離', shortLabel: '月軌道' },
  { distanceKm: 420_000_000, label: '小惑星帯の中心付近', shortLabel: '小惑星帯' },
  { distanceKm: 4_500_000_000, label: 'カイパーベルト入口', shortLabel: 'カイパーベルト' },
];

export function lightTravelSeconds(distanceKm: number): number {
  return distanceKm / SPEED_OF_LIGHT_KM_S;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours === 0) return `${minutes}分${remainingSeconds.toString().padStart(2, '0')}秒`;
  return `${hours}時間${minutes.toString().padStart(2, '0')}分`;
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1_000_000) return `${Math.round(distanceKm).toLocaleString('ja-JP')} km`;
  if (distanceKm < 1_000_000_000) return `${(distanceKm / 100_000_000).toFixed(2)}億 km`;
  return `${(distanceKm / 1_000_000_000).toFixed(2)}兆 km`;
}

export function distanceInAu(distanceKm: number): number {
  return distanceKm / ASTRONOMICAL_UNIT_KM;
}
