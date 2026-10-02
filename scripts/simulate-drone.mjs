import {
  createPatrolRoute,
  DEFAULT_PATROL_WAYPOINTS,
  patrolWaypointsFromZones,
} from './lib/patrol-route.mjs';

const apiBase = (process.env.GEOGUARD_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const droneId = process.env.GEOGUARD_DRONE_ID || 'DRONE-LIVE-001';
const intervalMs = Number(process.env.GEOGUARD_INTERVAL_MS || 1000);
const cruiseSpeedMetersPerSecond = Number(process.env.GEOGUARD_CRUISE_SPEED_MPS || 45);

let step = 0;
let stopped = false;
let route;

async function loadRoute() {
  let waypoints = DEFAULT_PATROL_WAYPOINTS;
  let source = '내장 3개 구역';
  try {
    const response = await fetch(`${apiBase}/api/zones`);
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const zoneWaypoints = patrolWaypointsFromZones(await response.json());
    if (zoneWaypoints.length >= 2) {
      waypoints = zoneWaypoints;
      source = `API 위험구역 ${zoneWaypoints.length / 4}개`;
    }
  } catch (error) {
    console.warn('위험구역 조회 실패, 내장 순환 경로를 사용합니다:', error instanceof Error ? error.message : error);
  }
  const loadedRoute = createPatrolRoute({ waypoints, intervalMs, cruiseSpeedMetersPerSecond });
  console.log(`순환 경로: ${source} · ${loadedRoute.totalPoints}개 위치 · 약 ${Math.ceil(loadedRoute.cycleDurationSeconds)}초/회`);
  return loadedRoute;
}

async function send() {
  const point = route.pointAt(step++);
  const item = {
    droneId,
    recordedAt: new Date().toISOString(),
    longitude: point.longitude,
    latitude: point.latitude,
    altitude: point.altitude,
    heading: point.heading,
    speed: point.speed,
  };
  const response = await fetch(`${apiBase}/api/telemetry/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [item] }),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  const result = await response.json();
  const accepted = result.items?.[0];
  console.log(`${accepted?.recordedAt ?? item.recordedAt} ${droneId} ${accepted?.status ?? 'UNKNOWN'} · ${point.segment}`);
}

process.on('SIGINT', () => {
  stopped = true;
  console.log('\n시뮬레이터를 종료합니다.');
});

console.log(`GeoGuard simulator → ${apiBase} (${intervalMs}ms 간격)`);
route = await loadRoute();
while (!stopped) {
  const startedAt = Date.now();
  try {
    await send();
  } catch (error) {
    console.error('텔레메트리 전송 실패:', error instanceof Error ? error.message : error);
  }
  const remaining = Math.max(0, intervalMs - (Date.now() - startedAt));
  await new Promise((resolve) => setTimeout(resolve, remaining));
}
