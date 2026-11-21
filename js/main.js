import { searchCities, fetchWeather, fetchAir, fetchBikes, fetchHolidays, fetchPlaces } from './api.js';
import { describeWeather, aqiCategory, uvCategory, sliceHourly, daysBetween, formatDistance, hhmm } from './data.js';
import { lineChart, barChart } from './charts.js';

const REFRESH_MS = 10 * 60 * 1000; // atualiza sozinho a cada 10 minutos
const DEFAULT_CITY = { name: 'São Paulo', admin: 'São Paulo', country: 'Brasil', countryCode: 'BR', lat: -23.5475, lon: -46.63611 };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const dateUTC = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const weekday = (iso) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dateUTC(iso)).replace('.', '');
const monthShort = (iso) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(dateUTC(iso)).replace('.', '');

const state = { city: loadCity(), lastUpdate: null, timer: null, data: {} };

// ---------- Cidade escolhida (URL > localStorage > padrão) ----------
function loadCity() {
  const p = new URLSearchParams(location.search);
  if (p.has('lat') && p.has('lon')) {
    return { name: p.get('name') ?? 'Local', admin: p.get('admin') ?? '', country: p.get('country') ?? '', countryCode: p.get('cc') ?? '', lat: +p.get('lat'), lon: +p.get('lon') };
  }
  try { return JSON.parse(localStorage.getItem('painel:city')) ?? DEFAULT_CITY; } catch { return DEFAULT_CITY; }
}

function setCity(city) {
  state.city = city;
  try { localStorage.setItem('painel:city', JSON.stringify(city)); } catch { /* sem storage */ }
  const p = new URLSearchParams({ name: city.name, admin: city.admin, country: city.country, cc: city.countryCode, lat: city.lat.toFixed(4), lon: city.lon.toFixed(4) });
  history.replaceState(null, '', `?${p}`);
  document.querySelectorAll('.card .body').forEach((b) => { b.innerHTML = '<div class="skeleton"></div>'; });
  refresh();
}

function renderHeader() {
  const c = state.city;
  $('#city-name').textContent = c.name;
  $('#city-meta').textContent = [c.admin, c.country].filter((x) => x && x !== c.name).join(', ') + ` · ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`;
  document.title = `${c.name} · Painel da Cidade`;
}

// ---------- Cards ----------
const body = (id) => $(`#${id} .body`);
const fail = (id, err) => { body(id).innerHTML = `<p class="error">Não foi possível carregar agora (${esc(err.message)}). Nova tentativa na próxima atualização.</p>`; };

function renderNow(w) {
  const c = w.current;
  const d = w.daily;
  const { label, icon } = describeWeather(c.weather_code, c.is_day);
  const uv = d.uv_index_max[0];
  body('card-now').innerHTML = `
    <div class="now-main">
      <div class="now-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="now-temp">${fmt(c.temperature_2m)}<sup>°C</sup></div>
        <div class="now-desc">${label}</div>
        <div class="muted">Sensação de ${fmt(c.apparent_temperature)}° · máx ${fmt(d.temperature_2m_max[0])}° / mín ${fmt(d.temperature_2m_min[0])}°</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Umidade</div><div class="v">${fmt(c.relative_humidity_2m)}<small>%</small></div></div>
      <div class="stat"><div class="k">Vento</div><div class="v">${fmt(c.wind_speed_10m)}<small> km/h</small></div></div>
      <div class="stat"><div class="k">Chuva agora</div><div class="v">${fmt(c.precipitation, 1)}<small> mm</small></div></div>
      <div class="stat"><div class="k">Índice UV máx</div><div class="v">${fmt(uv, 1)} <small>${uvCategory(uv)}</small></div></div>
      <div class="stat"><div class="k">Nascer do sol</div><div class="v">${hhmm(d.sunrise[0])}</div></div>
      <div class="stat"><div class="k">Pôr do sol</div><div class="v">${hhmm(d.sunset[0])}</div></div>
    </div>`;
}

function renderAir(a) {
  const c = a.current;
  const cat = aqiCategory(c.us_aqi);
  const pos = Math.min(c.us_aqi ?? 0, 300) / 300 * 100;
  const hourly = sliceHourly(a.hourly.time, a.hourly.us_aqi, c.time, 24).filter((p) => p.value != null);
  const el = body('card-air');
  el.innerHTML = `
    <div class="air-top">
      <div class="aqi-badge"><span class="aqi-value">${fmt(c.us_aqi)}</span><span class="muted">US AQI</span></div>
      <div>
        <span class="pill lvl-${cat.level}">${cat.label}</span>
        <p class="aqi-advice">${cat.advice}</p>
      </div>
    </div>
    <div class="meter" role="img" aria-label="Escala do índice: ${fmt(c.us_aqi)} de 300">
      <span style="background:var(--good)"></span><span style="background:var(--warning)"></span>
      <span style="background:var(--serious)"></span><span style="background:var(--critical)"></span>
      <span style="background:var(--critical);opacity:.65"></span>
      <i class="marker" style="left:${pos}%"></i>
    </div>
    <div class="meter-scale">${[0, 50, 100, 150, 200, 300].map((v) => `<span style="left:${(v / 300) * 100}%">${v === 300 ? '300+' : v}</span>`).join('')}</div>
    <div class="pollutants">
      <div class="stat"><div class="k">PM2.5</div><div class="v">${fmt(c.pm2_5, 1)}<small> µg/m³</small></div></div>
      <div class="stat"><div class="k">PM10</div><div class="v">${fmt(c.pm10, 1)}<small> µg/m³</small></div></div>
      <div class="stat"><div class="k">Ozônio</div><div class="v">${fmt(c.ozone)}<small> µg/m³</small></div></div>
      <div class="stat"><div class="k">NO₂</div><div class="v">${fmt(c.nitrogen_dioxide, 1)}<small> µg/m³</small></div></div>
    </div>
    <p class="chart-title">Previsão do índice nas próximas 24 h</p>
    <div id="air-chart"></div>`;
  if (hourly.length) {
    barChart($('#air-chart', el), hourly.map((p) => {
      const k = aqiCategory(p.value);
      return { label: `${p.time.slice(11, 13)}h`, value: p.value, cls: `lvl-${k.level}`, tip: `<b>${p.value}</b> · ${k.label} · ${hhmm(p.time)}` };
    }), { height: 140, ariaLabel: 'Índice de qualidade do ar por hora' });
  }
}

function renderHourly(w) {
  const temps = sliceHourly(w.hourly.time, w.hourly.temperature_2m, w.current.time, 24);
  const rain = sliceHourly(w.hourly.time, w.hourly.precipitation_probability, w.current.time, 24);
  const el = body('card-hourly');
  el.innerHTML = `
    <p class="chart-title">Temperatura (°C)</p><div id="temp-chart"></div>
    <p class="chart-title">Chance de chuva (%)</p><div id="rain-chart"></div>`;
  lineChart($('#temp-chart', el), temps.map((p) => ({ label: `${p.time.slice(11, 13)}h`, value: p.value, tip: `<b>${fmt(p.value, 1)}°C</b> · ${hhmm(p.time)}` })),
    { height: 190, unit: '°', ariaLabel: 'Temperatura nas próximas 24 horas' });
  barChart($('#rain-chart', el), rain.map((p) => ({ label: `${p.time.slice(11, 13)}h`, value: p.value ?? 0, tip: `<b>${p.value ?? 0}%</b> de chance · ${hhmm(p.time)}` })),
    { height: 120, max: 100, ariaLabel: 'Probabilidade de chuva nas próximas 24 horas', yFmt: (t) => `${t}%` });
}

function renderWeek(w) {
  const d = w.daily;
  const lo = Math.min(...d.temperature_2m_min);
  const hi = Math.max(...d.temperature_2m_max);
  const span = hi - lo || 1;
  body('card-week').innerHTML = `<ul class="week">${d.time.map((t, i) => {
    const { label, icon } = describeWeather(d.weather_code[i]);
    const left = ((d.temperature_2m_min[i] - lo) / span) * 100;
    const width = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
    return `<li title="${label}">
      <span class="day">${i === 0 ? 'Hoje' : weekday(t)}<br><span class="rain">💧${fmt(d.precipitation_probability_max[i])}%</span></span>
      <span aria-label="${label}">${icon}</span>
      <span class="range"><i style="left:${left}%;width:${Math.max(width, 3)}%"></i></span>
      <span class="temps"><span class="min">${fmt(d.temperature_2m_min[i])}°</span><b>${fmt(d.temperature_2m_max[i])}°</b></span>
    </li>`;
  }).join('')}</ul>`;
}

let map = null;
function renderBikes(b) {
  const el = body('card-bikes');
  if (!b) {
    el.innerHTML = '<p class="error">Nenhum sistema de bicicletas compartilhadas encontrado num raio de 40 km desta cidade.</p>';
    return;
  }
  const level = (s) => (!s.free_bikes ? 'critical' : s.free_bikes < 3 ? 'warning' : 'good');
  el.innerHTML = `
    <div class="bikes">
      <div>
        <p class="muted">${esc(b.network.name)}${b.network.company ? ` · ${esc([].concat(b.network.company)[0])}` : ''}</p>
        <div class="stats">
          <div class="stat"><div class="k">Bikes livres</div><div class="v">${fmt(b.bikes)}</div></div>
          <div class="stat"><div class="k">Elétricas</div><div class="v">${fmt(b.ebikes)}</div></div>
          <div class="stat"><div class="k">Vagas livres</div><div class="v">${fmt(b.emptySlots)}</div></div>
          <div class="stat"><div class="k">Estações</div><div class="v">${fmt(b.stations)} <small>${fmt(b.emptyStations)} vazias</small></div></div>
        </div>
        <p class="chart-title">Estações mais próximas do centro</p>
        <ul class="station-list">${b.nearest.map((s) => `
          <li><span class="name"><span class="pill lvl-${level(s)}" style="padding:0 6px 0 4px;background:none"></span>${esc(s.name)}</span>
          <span class="count">🚲 ${s.free_bikes ?? 0} · 🅿️ ${s.empty_slots ?? 0} · ${formatDistance(s.distanceKm)}</span></li>`).join('')}
        </ul>
      </div>
      <div>
        <div id="bike-map" role="img" aria-label="Mapa das estações de bicicleta"></div>
        <p class="muted" style="font-size:12px;margin-top:6px">
          <span class="pill lvl-good" style="background:none">3+ bikes</span>
          <span class="pill lvl-warning" style="background:none">1–2 bikes</span>
          <span class="pill lvl-critical" style="background:none">vazia</span>
        </p>
      </div>
    </div>`;

  if (!window.L) return;
  if (map) { map.remove(); map = null; }
  map = L.map('bike-map', { scrollWheelZoom: false }).setView([state.city.lat, state.city.lon], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const css = getComputedStyle(document.documentElement);
  const colors = { good: css.getPropertyValue('--good'), warning: css.getPropertyValue('--warning'), critical: css.getPropertyValue('--critical') };
  for (const s of b.all) {
    L.circleMarker([s.latitude, s.longitude], { radius: 6, weight: 2, color: css.getPropertyValue('--surface'), fillColor: colors[level(s)], fillOpacity: 1 })
      .bindTooltip(`<b>${esc(s.name)}</b><br>🚲 ${s.free_bikes ?? 0} livres · 🅿️ ${s.empty_slots ?? 0} vagas`)
      .addTo(map);
  }
}

function renderHolidays(list, today) {
  const el = body('card-holidays');
  if (!list?.length) { el.innerHTML = '<p class="error">Sem calendário de feriados disponível para este país.</p>'; return; }
  el.innerHTML = `<ul class="holidays">${list.slice(0, 5).map((h) => {
    const n = daysBetween(today, h.date);
    const when = n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias · ${weekday(h.date)}`;
    return `<li><span class="date-chip"><b>${+h.date.slice(8, 10)}</b><small>${monthShort(h.date)}</small></span>
      <span><b>${esc(h.localName)}</b><br><span class="when">${when}${h.global ? '' : ' · regional'}</span></span></li>`;
  }).join('')}</ul>`;
}

function renderPlaces(list) {
  const el = body('card-places');
  if (!list.length) { el.innerHTML = '<p class="error">Nenhum lugar com artigo na Wikipédia num raio de 10 km.</p>'; return; }
  el.innerHTML = `<div class="places">${list.map((p) => `
    <a class="place" href="${p.url}" target="_blank" rel="noopener">
      ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : '<span class="ph" aria-hidden="true">📍</span>'}
      <div><div class="t">${esc(p.title)}</div><div class="d">${formatDistance(p.distanceKm)}${p.description ? ` · ${esc(p.description)}` : ''}</div></div>
    </a>`).join('')}</div>`;
}

// ---------- Ciclo de atualização ----------
async function refresh() {
  clearTimeout(state.timer);
  const btn = $('#refresh-btn');
  btn.classList.add('spinning');
  renderHeader();
  const city = state.city;

  const [weather, air, bikes, places] = await Promise.allSettled([
    fetchWeather(city), fetchAir(city), fetchBikes(city), fetchPlaces(city),
  ]);
  if (city !== state.city) return; // usuário trocou de cidade no meio do caminho

  if (weather.status === 'fulfilled') {
    state.data.weather = weather.value;
    renderNow(weather.value); renderHourly(weather.value); renderWeek(weather.value);
  } else ['card-now', 'card-hourly', 'card-week'].forEach((id) => fail(id, weather.reason));

  if (air.status === 'fulfilled') { state.data.air = air.value; renderAir(air.value); } else fail('card-air', air.reason);
  bikes.status === 'fulfilled' ? renderBikes(bikes.value) : fail('card-bikes', bikes.reason);
  places.status === 'fulfilled' ? renderPlaces(places.value) : fail('card-places', places.reason);

  const today = weather.value?.current?.time ?? new Date().toISOString();
  fetchHolidays(city).then((h) => renderHolidays(h, today)).catch((e) => fail('card-holidays', e));

  state.lastUpdate = Date.now();
  btn.classList.remove('spinning');
  tick();
  state.timer = setTimeout(refresh, REFRESH_MS);
}

function tick() {
  if (!state.lastUpdate) return;
  const ago = Math.floor((Date.now() - state.lastUpdate) / 60000);
  const next = Math.max(0, Math.ceil((state.lastUpdate + REFRESH_MS - Date.now()) / 60000));
  $('#updated').textContent = `${ago ? `Atualizado há ${ago} min` : 'Atualizado agora'} · próxima em ${next} min`;
}
setInterval(tick, 30000);

// Ao voltar para a aba, atualiza se os dados estiverem velhos
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - (state.lastUpdate ?? 0) > REFRESH_MS) refresh();
});

// Redesenha gráficos ao redimensionar (eles medem a largura do contêiner)
let resizeT;
let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW) return;
  lastW = innerWidth;
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (state.data.weather) renderHourly(state.data.weather);
    if (state.data.air) renderAir(state.data.air);
  }, 200);
});

$('#refresh-btn').addEventListener('click', refresh);

// ---------- Busca de cidade ----------
const input = $('#search-input');
const results = $('#search-results');
let found = [];
let searchT;
input.addEventListener('input', () => {
  clearTimeout(searchT);
  const q = input.value.trim();
  if (q.length < 2) { results.hidden = true; return; }
  searchT = setTimeout(async () => {
    try { found = await searchCities(q); } catch { found = []; }
    results.innerHTML = found.length
      ? found.map((c, i) => `<li role="option" data-i="${i}">${esc(c.name)} <small>${esc([c.admin, c.country].filter(Boolean).join(', '))}</small></li>`).join('')
      : '<li aria-disabled="true"><small>Nenhuma cidade encontrada</small></li>';
    results.hidden = false;
  }, 250);
});
results.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  pick(found[+li.dataset.i]);
});
$('#search').addEventListener('submit', (e) => { e.preventDefault(); if (found[0]) pick(found[0]); });
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) results.hidden = true; });
function pick(city) {
  results.hidden = true;
  input.value = '';
  input.blur();
  setCity(city);
}

refresh();
