const EARTH_RADIUS_METERS = 6_371_000;

export const DEFAULT_PATROL_WAYPOINTS = [
  { name: '서울역 위험구역', longitude: 126.9724, latitude: 37.5545, altitude: 90 },
  { name: '서울역 동쪽 이탈', longitude: 126.9780, latitude: 37.5545, altitude: 120 },
  { name: '남산 위험구역', longitude: 126.9870, latitude: 37.5510, altitude: 180 },
  { name: '남산 남쪽 이탈', longitude: 126.9900, latitude: 37.5440, altitude: 160 },
  { name: '용산 이동 구간', longitude: 126.9750, latitude: 37.5350, altitude: 130 },
  { name: '용산 위험구역', longitude: 126.9620, latitude: 37.5250, altitude: 120 },
  { name: '용산 서쪽 이탈', longitude: 126.9550, latitude: 37.5300, altitude: 110 },
  { name: '서울역 복귀 구간', longitude: 126.9660, latitude: 37.5450, altitude: 100 },
];

function toRadians(value) {
  return value * Math.PI / 180;
}

function distanceMeters(from, to) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

function headingDegrees(from, to) {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function zoneBounds(feature) {
  const rings = feature?.geometry?.type === 'Polygon'
    ? feature.geometry.coordinates
    : feature?.geometry?.type === 'MultiPolygon'
      ? feature.geometry.coordinates.flat()
      : [];
  const points = rings.flat().filter((point) => Array.isArray(point) && point.length >= 2);
  if (points.length === 0) return undefined;
  const longitudes = points.map((point) => Number(point[0])).filter(Number.isFinite);
  const latitudes = points.map((point) => Number(point[1])).filter(Number.isFinite);
  if (longitudes.length === 0 || latitudes.length === 0) return undefined;
  return {
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
  };
}

/**
 * GeoJSON 위험구역마다 내부의 네 지점을 만들어 각 구역을 한 바퀴 도는 순환 경로를 만든다.
 * 현재 포트폴리오의 직사각형/볼록 다각형 구역을 대상으로 한 가벼운 시뮬레이션이다.
 */
export function patrolWaypointsFromZones(collection) {
  const waypoints = [];
  for (const [index, feature] of (collection?.features ?? []).entries()) {
    const bounds = zoneBounds(feature);
    if (!bounds) continue;
    const properties = feature.properties ?? {};
    const name = String(properties.name ?? properties.zoneName ?? feature.id ?? `위험구역 ${index + 1}`);
    const minimumAltitude = Number(properties.minAltitude ?? properties.min_altitude ?? 0);
    const maximumAltitude = Number(properties.maxAltitude ?? properties.max_altitude ?? minimumAltitude + 150);
    const altitude = Number.isFinite(minimumAltitude) && Number.isFinite(maximumAltitude)
      ? minimumAltitude + (maximumAltitude - minimumAltitude) * 0.55
      : 100;
    const longitude = (bounds.west + bounds.east) / 2;
    const latitude = (bounds.south + bounds.north) / 2;
    const longitudeRadius = (bounds.east - bounds.west) * 0.22;
    const latitudeRadius = (bounds.north - bounds.south) * 0.22;
    waypoints.push(
      { name: `${name} 서측`, longitude: longitude - longitudeRadius, latitude, altitude },
      { name: `${name} 북측`, longitude, latitude: latitude + latitudeRadius, altitude },
      { name: `${name} 동측`, longitude: longitude + longitudeRadius, latitude, altitude },
      { name: `${name} 남측`, longitude, latitude: latitude - latitudeRadius, altitude },
    );
  }
  return waypoints;
}

export function createPatrolRoute({
  waypoints = DEFAULT_PATROL_WAYPOINTS,
  intervalMs = 1_000,
  cruiseSpeedMetersPerSecond = 45,
} = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error('순환 경로에는 두 개 이상의 지점이 필요합니다.');
  }
  if (!(intervalMs > 0) || !(cruiseSpeedMetersPerSecond > 0)) {
    throw new Error('전송 간격과 순항 속도는 0보다 커야 합니다.');
  }

  const intervalSeconds = intervalMs / 1_000;
  const points = [];
  for (let legIndex = 0; legIndex < waypoints.length; legIndex += 1) {
    const from = waypoints[legIndex];
    const to = waypoints[(legIndex + 1) % waypoints.length];
    const distance = distanceMeters(from, to);
    const steps = Math.max(1, Math.ceil(distance / (cruiseSpeedMetersPerSecond * intervalSeconds)));
    const heading = headingDegrees(from, to);
    const speed = distance / (steps * intervalSeconds);
    for (let step = 0; step < steps; step += 1) {
      const ratio = step / steps;
      points.push({
        longitude: from.longitude + (to.longitude - from.longitude) * ratio,
        latitude: from.latitude + (to.latitude - from.latitude) * ratio,
        altitude: from.altitude + (to.altitude - from.altitude) * ratio,
        heading,
        speed,
        segment: `${from.name} → ${to.name}`,
      });
    }
  }

  return {
    totalPoints: points.length,
    cycleDurationSeconds: points.length * intervalSeconds,
    zoneCount: Math.floor(waypoints.length / 4),
    pointAt(index) {
      const normalizedIndex = ((index % points.length) + points.length) % points.length;
      return { ...points[normalizedIndex] };
    },
  };
}
