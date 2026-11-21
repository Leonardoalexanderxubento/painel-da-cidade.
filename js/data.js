// Funções puras de transformação de dados (sem DOM) — testadas em tests/data.test.js

/** Códigos de tempo WMO usados pelo Open-Meteo → [descrição, ícone] */
const WMO = {
  0: ['Céu limpo', '☀️'],
  1: ['Predomínio de sol', '🌤️'],
  2: ['Parcialmente nublado', '⛅'],
  3: ['Nublado', '☁️'],
  45: ['Neblina', '🌫️'],
  48: ['Neblina com geada', '🌫️'],
  51: ['Garoa fraca', '🌦️'],
  53: ['Garoa', '🌦️'],
  55: ['Garoa forte', '🌧️'],
  56: ['Garoa congelante', '🌧️'],
  57: ['Garoa congelante forte', '🌧️'],
  61: ['Chuva fraca', '🌦️'],
  63: ['Chuva', '🌧️'],
  65: ['Chuva forte', '🌧️'],
  66: ['Chuva congelante', '🌧️'],
  67: ['Chuva congelante forte', '🌧️'],
  71: ['Neve fraca', '🌨️'],
  73: ['Neve', '🌨️'],
  75: ['Neve forte', '❄️'],
  77: ['Grãos de neve', '🌨️'],
  80: ['Pancadas de chuva', '🌦️'],
  81: ['Pancadas de chuva', '🌧️'],
  82: ['Pancadas fortes', '⛈️'],
  85: ['Pancadas de neve', '🌨️'],
  86: ['Pancadas fortes de neve', '❄️'],
  95: ['Trovoadas', '⛈️'],
  96: ['Trovoadas com granizo', '⛈️'],
  99: ['Trovoadas com granizo forte', '⛈️'],
};

export function describeWeather(code, isDay = 1) {
  const [label, icon] = WMO[code] ?? ['Indisponível', '❔'];
  if (!isDay && (code === 0 || code === 1)) return { label, icon: '🌙' };
  return { label, icon };
}

/** Faixas do US AQI (EPA) → nível de status */
const AQI_BANDS = [
  { max: 50, label: 'Boa', level: 'good', advice: 'Ótimo para atividades ao ar livre.' },
  { max: 100, label: 'Moderada', level: 'warning', advice: 'Pessoas muito sensíveis devem reduzir esforço prolongado ao ar livre.' },
  { max: 150, label: 'Ruim p/ sensíveis', level: 'serious', advice: 'Crianças, idosos e pessoas com doenças respiratórias devem evitar esforço ao ar livre.' },
  { max: 200, label: 'Ruim', level: 'critical', advice: 'Evite esforço prolongado ao ar livre.' },
  { max: 300, label: 'Muito ruim', level: 'critical', advice: 'Evite atividades ao ar livre.' },
  { max: Infinity, label: 'Perigosa', level: 'critical', advice: 'Fique em ambientes fechados.' },
];

export function aqiCategory(aqi) {
  if (aqi == null || Number.isNaN(aqi)) return { label: 'Sem dados', level: 'none', advice: '' };
  return AQI_BANDS.find((b) => aqi <= b.max);
}

/** Índice UV (OMS) */
export function uvCategory(uv) {
  if (uv == null) return 'sem dados';
  if (uv < 3) return 'baixo';
  if (uv < 6) return 'moderado';
  if (uv < 8) return 'alto';
  if (uv < 11) return 'muito alto';
  return 'extremo';
}

/** Distância em km entre dois pontos (fórmula de haversine) */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Rede de bicicletas compartilhadas mais próxima, se estiver dentro de maxKm */
export function nearestNetwork(networks, lat, lon, maxKm = 40) {
  let best = null;
  for (const n of networks) {
    const d = haversineKm(lat, lon, n.location.latitude, n.location.longitude);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { ...n, distanceKm: d };
  }
  return best;
}

/** Resume estações: total de bikes, vagas e lista das mais próximas */
export function summarizeStations(stations, lat, lon, limit = 6) {
  const withDist = stations
    .map((s) => ({ ...s, distanceKm: haversineKm(lat, lon, s.latitude, s.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const sum = (f) => stations.reduce((acc, s) => acc + (f(s) || 0), 0);
  return {
    stations: stations.length,
    bikes: sum((s) => s.free_bikes),
    ebikes: sum((s) => s.extra?.ebikes),
    emptySlots: sum((s) => s.empty_slots),
    emptyStations: stations.filter((s) => !s.free_bikes).length,
    nearest: withDist.slice(0, limit),
    all: withDist,
  };
}

/**
 * Recorta séries horárias a partir da hora atual (no fuso da cidade).
 * `nowIso` vem de current.time da API, ex. "2026-11-21T16:15".
 */
export function sliceHourly(times, values, nowIso, hours = 24) {
  const hourPrefix = nowIso.slice(0, 13); // "YYYY-MM-DDTHH"
  let start = times.findIndex((t) => t.slice(0, 13) === hourPrefix);
  if (start < 0) start = 0;
  return times.slice(start, start + hours).map((t, i) => ({ time: t, value: values[start + i] }));
}

/** Dias inteiros entre duas datas ISO (YYYY-MM-DD) */
export function daysBetween(fromIso, toIso) {
  const a = Date.UTC(...fromIso.slice(0, 10).split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  const b = Date.UTC(...toIso.slice(0, 10).split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((b - a) / 86400000);
}

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

/** "2026-11-21T05:12" → "05:12" */
export const hhmm = (iso) => iso?.slice(11, 16) ?? '--:--';
