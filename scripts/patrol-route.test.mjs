import assert from 'node:assert/strict';
import test from 'node:test';
import { createPatrolRoute, patrolWaypointsFromZones } from './lib/patrol-route.mjs';

const zones = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '서울역 위험구역', minAltitude: 0, maxAltitude: 150 },
      geometry: { type: 'Polygon', coordinates: [[[126.9700, 37.5528], [126.9748, 37.5528], [126.9748, 37.5562], [126.9700, 37.5562], [126.9700, 37.5528]]] },
    },
    {
      type: 'Feature',
      properties: { name: '용산 강변 위험구역', minAltitude: 30, maxAltitude: 220 },
      geometry: { type: 'Polygon', coordinates: [[[126.9590, 37.5230], [126.9650, 37.5230], [126.9650, 37.5270], [126.9590, 37.5270], [126.9590, 37.5230]]] },
    },
    {
      type: 'Feature',
      properties: { name: '남산 고도 위험구역', minAltitude: 100, maxAltitude: 350 },
      geometry: { type: 'Polygon', coordinates: [[[126.9830, 37.5480], [126.9910, 37.5480], [126.9910, 37.5540], [126.9830, 37.5540], [126.9830, 37.5480]]] },
    },
  ],
};

test('위험구역 GeoJSON에서 모든 구역을 순회하는 경로를 만든다', () => {
  const waypoints = patrolWaypointsFromZones(zones);
  assert.equal(waypoints.length, 12);
  const route = createPatrolRoute({ waypoints, intervalMs: 1_000, cruiseSpeedMetersPerSecond: 45 });
  const samples = Array.from({ length: route.totalPoints }, (_, index) => route.pointAt(index));

  for (const feature of zones.features) {
    const ring = feature.geometry.coordinates[0];
    const west = Math.min(...ring.map(([longitude]) => longitude));
    const east = Math.max(...ring.map(([longitude]) => longitude));
    const south = Math.min(...ring.map(([, latitude]) => latitude));
    const north = Math.max(...ring.map(([, latitude]) => latitude));
    const minimumAltitude = feature.properties.minAltitude;
    const maximumAltitude = feature.properties.maxAltitude;
    assert.ok(samples.some((point) => (
      point.longitude >= west && point.longitude <= east
      && point.latitude >= south && point.latitude <= north
      && point.altitude >= minimumAltitude && point.altitude <= maximumAltitude
    )), `${feature.properties.name} 내부를 경로가 통과해야 합니다.`);
  }
});

test('마지막 지점 다음에는 첫 지점으로 자연스럽게 반복된다', () => {
  const route = createPatrolRoute({ waypoints: patrolWaypointsFromZones(zones) });
  assert.deepEqual(route.pointAt(route.totalPoints), route.pointAt(0));
  assert.ok(route.totalPoints > 100);
  assert.ok(route.cycleDurationSeconds > 0);
});

test('각 위치는 유효한 방향과 실제 이동 속도를 가진다', () => {
  const route = createPatrolRoute({ waypoints: patrolWaypointsFromZones(zones) });
  for (let index = 0; index < route.totalPoints; index += 1) {
    const point = route.pointAt(index);
    assert.ok(point.heading >= 0 && point.heading < 360);
    assert.ok(point.speed > 0 && point.speed <= 45);
    assert.ok(Number.isFinite(point.longitude));
    assert.ok(Number.isFinite(point.latitude));
    assert.ok(Number.isFinite(point.altitude));
  }
});
