const apiBase = (process.env.API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const droneId = process.env.DEMO_DRONE_ID || 'DEMO-HISTORY-01';
const pointCount = 181;
const endTime = Date.now();
const startTime = endTime - 30 * 60 * 1000;

const items = Array.from({ length: pointCount }, (_, index) => {
  const progress = index / (pointCount - 1);
  return {
    droneId,
    recordedAt: new Date(startTime + progress * (endTime - startTime)).toISOString(),
    longitude: 126.9660 + progress * 0.0140,
    latitude: 37.5545 + Math.sin(progress * Math.PI * 2) * 0.0006,
    altitude: 95 + Math.sin(progress * Math.PI) * 20,
    heading: 90,
    speed: 14,
  };
});

const response = await fetch(`${apiBase}/api/telemetry/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ items }),
});

if (!response.ok) {
  throw new Error(`예시 경로 적재 실패 (${response.status}): ${await response.text()}`);
}

const payload = await response.json();
const counts = payload.items.reduce((result, item) => {
  result[item.status] = (result[item.status] || 0) + 1;
  return result;
}, { SAFE: 0, WARNING: 0, DANGER: 0 });

console.log(JSON.stringify({
  droneId,
  accepted: payload.accepted,
  from: items[0].recordedAt,
  to: items.at(-1).recordedAt,
  statuses: counts,
}, null, 2));
