import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeWeather, aqiCategory, uvCategory, haversineKm, nearestNetwork,
  summarizeStations, sliceHourly, daysBetween, formatDistance, hhmm,
} from '../js/data.js';

test('describeWeather traduz códigos WMO e usa lua à noite', () => {
  assert.equal(describeWeather(63).label, 'Chuva');
  assert.equal(describeWeather(0, 0).icon, '🌙');
  assert.equal(describeWeather(999).label, 'Indisponível');
});

test('aqiCategory respeita os limites da EPA', () => {
  assert.equal(aqiCategory(0).level, 'good');
  assert.equal(aqiCategory(50).level, 'good');
  assert.equal(aqiCategory(51).level, 'warning');
  assert.equal(aqiCategory(150).level, 'serious');
  assert.equal(aqiCategory(162).label, 'Ruim');
  assert.equal(aqiCategory(500).label, 'Perigosa');
  assert.equal(aqiCategory(null).level, 'none');
});

test('uvCategory', () => {
  assert.equal(uvCategory(2), 'baixo');
  assert.equal(uvCategory(11.5), 'extremo');
});

test('haversineKm: São Paulo → Rio ≈ 360 km', () => {
  const d = haversineKm(-23.5475, -46.6361, -22.9068, -43.1729);
  assert.ok(d > 350 && d < 370, `obtido ${d}`);
});

test('nearestNetwork escolhe a mais próxima dentro do raio', () => {
  const nets = [
    { id: 'rio', location: { latitude: -22.9, longitude: -43.17 } },
    { id: 'sp', location: { latitude: -23.55, longitude: -46.64 } },
  ];
  assert.equal(nearestNetwork(nets, -23.54, -46.63).id, 'sp');
  assert.equal(nearestNetwork(nets, 0, 0), null);
});

test('summarizeStations soma e ordena por distância', () => {
  const s = summarizeStations([
    { name: 'longe', latitude: 1, longitude: 1, free_bikes: 2, empty_slots: 3, extra: { ebikes: 1 } },
    { name: 'perto', latitude: 0, longitude: 0.001, free_bikes: 0, empty_slots: 5 },
  ], 0, 0);
  assert.equal(s.bikes, 2);
  assert.equal(s.ebikes, 1);
  assert.equal(s.emptySlots, 8);
  assert.equal(s.emptyStations, 1);
  assert.equal(s.nearest[0].name, 'perto');
});

test('sliceHourly começa na hora atual', () => {
  const times = ['2026-11-21T14:00', '2026-11-21T15:00', '2026-11-21T16:00', '2026-11-21T17:00'];
  const out = sliceHourly(times, [1, 2, 3, 4], '2026-11-21T16:15', 24);
  assert.deepEqual(out.map((p) => p.value), [3, 4]);
});

test('daysBetween e formatação', () => {
  assert.equal(daysBetween('2026-11-21T16:15', '2026-12-25'), 34);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(formatDistance(0.42), '420 m');
  assert.equal(formatDistance(3.14), '3,1 km');
  assert.equal(hhmm('2026-11-21T05:12'), '05:12');
});
