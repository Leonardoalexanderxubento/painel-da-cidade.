// Camada de acesso às APIs públicas (todas gratuitas, sem chave e com CORS liberado)
import { nearestNetwork, summarizeStations, haversineKm } from './data.js';

const TIMEOUT_MS = 12000;

/** fetch com timeout e erro legível */
export async function getJSON(url, { timeout = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Tempo esgotado em ${new URL(url).host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Cache simples em sessionStorage para dados que quase não mudam */
async function cached(key, ttlMs, loader) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key));
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  } catch { /* storage indisponível: segue sem cache */ }
  const data = await loader();
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* cota cheia */ }
  return data;
}

const qs = (params) => new URLSearchParams(params).toString();

// ---------- Geocodificação (Open-Meteo) ----------
export async function searchCities(name) {
  const data = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?${qs({ name, count: 6, language: 'pt', format: 'json' })}`);
  return (data?.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1 ?? '',
    country: r.country ?? '',
    countryCode: r.country_code,
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
  }));
}

// ---------- Clima (Open-Meteo Forecast) ----------
export function fetchWeather({ lat, lon }) {
  return getJSON(`https://api.open-meteo.com/v1/forecast?${qs({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation,is_day,pressure_msl',
    hourly: 'temperature_2m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: 7,
  })}`);
}

// ---------- Qualidade do ar (Open-Meteo Air Quality / CAMS) ----------
export function fetchAir({ lat, lon }) {
  return getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${qs({
    latitude: lat,
    longitude: lon,
    current: 'us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,carbon_monoxide',
    hourly: 'us_aqi',
    timezone: 'auto',
    forecast_days: 2,
  })}`);
}

// ---------- Mobilidade: bicicletas compartilhadas (CityBikes) ----------
export async function fetchBikes({ lat, lon }) {
  const networks = await cached('citybikes:networks', 24 * 3600e3, async () =>
    (await getJSON('https://api.citybik.es/v2/networks?fields=id,name,company,location')).networks);
  const network = nearestNetwork(networks, lat, lon);
  if (!network) return null;
  const { network: detail } = await getJSON(`https://api.citybik.es/v2/networks/${network.id}?fields=stations`);
  return { network, ...summarizeStations(detail.stations, lat, lon) };
}

// ---------- Agenda: feriados (Nager.Date) ----------
export async function fetchHolidays({ countryCode }) {
  if (!countryCode) return [];
  return cached(`holidays:${countryCode}`, 12 * 3600e3, async () =>
    (await getJSON(`https://date.nager.at/api/v3/NextPublicHolidays/${countryCode}`)) ?? []);
}

// ---------- Por perto: lugares com artigo na Wikipédia ----------
export async function fetchPlaces({ lat, lon }) {
  const data = await getJSON(`https://pt.wikipedia.org/w/api.php?${qs({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: 10000,
    ggslimit: 12,
    prop: 'coordinates|pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: 120,
    format: 'json',
    origin: '*',
  })}`);
  return Object.values(data?.query?.pages ?? {})
    .filter((p) => p.coordinates?.[0])
    .map((p) => ({
      title: p.title,
      description: p.description ?? '',
      thumb: p.thumbnail?.source ?? null,
      url: `https://pt.wikipedia.org/?curid=${p.pageid}`,
      distanceKm: haversineKm(lat, lon, p.coordinates[0].lat, p.coordinates[0].lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 8);
}
