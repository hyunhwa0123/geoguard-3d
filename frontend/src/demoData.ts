import type { PagedResponse, Telemetry, TelemetryQuery } from './types.ts';
import { assessPointAgainstZones, type ZoneCollection } from './zoneRisk.ts';

export const DEMO_DRONE_ID = 'DEMO-HISTORY-01';

export const DEMO_ZONES: ZoneCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'ZONE-SEOUL-01',
      properties: { id: 'ZONE-SEOUL-01', name: '도심 비행 제한구역', minAltitude: 0, maxAltitude: 450 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.977, 37.562], [126.987, 37.562], [126.988, 37.570], [126.976, 37.571], [126.977, 37.562]]],
      },
    },
    {
      type: 'Feature',
      id: 'ZONE-SEOUL-02',
      properties: { id: 'ZONE-SEOUL-02', name: '고도 제한구역', minAltitude: 100, maxAltitude: 320 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126.991, 37.568], [126.997, 37.568], [126.997, 37.574], [126.991, 37.574], [126.991, 37.568]]],
      },
    },
  ],
};

const DEMO_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [126.9710, 37.5650],
  [126.9752, 37.5665],
  [126.9800, 37.5668],
  [126.9850, 37.5670],
  [126.9895, 37.5695],
  [126.9935, 37.5710],
  [126.9960, 37.5720],
  [127.0000, 37.5700],
  [126.9950, 37.5655],
  [126.9860, 37.5620],
  [126.9770, 37.5595],
  [126.9710, 37.5650],
];

const HISTORY_POINT_COUNT = 1_801;
const HISTORY_DURATION_MS = 60 * 60 * 1_000;
const historyEnd = Date.now();
const historyStart = historyEnd - HISTORY_DURATION_MS;

export function sampleDemoRoute(progress: number): { longitude: number; latitude: number; altitude: number } {
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * (DEMO_ROUTE.length - 1);
  const segment = Math.min(Math.floor(scaled), DEMO_ROUTE.length - 2);
  const fraction = scaled - segment;
  const start = DEMO_ROUTE[segment];
  const end = DEMO_ROUTE[segment + 1];
  return {
    longitude: start[0] + (end[0] - start[0]) * fraction,
    latitude: start[1] + (end[1] - start[1]) * fraction,
    altitude: 175 + Math.sin(wrapped * Math.PI * 4) * 35,
  };
}

function buildHistory(): Telemetry[] {
  return Array.from({ length: HISTORY_POINT_COUNT }, (_, index) => {
    const progress = index / (HISTORY_POINT_COUNT - 1);
    const position = sampleDemoRoute(progress);
    const next = sampleDemoRoute(progress + 1 / (HISTORY_POINT_COUNT - 1));
    const heading = (Math.atan2(next.longitude - position.longitude, next.latitude - position.latitude) * 180 / Math.PI + 360) % 360;
    const assessment = assessPointAgainstZones(
      position.longitude,
      position.latitude,
      position.altitude,
      DEMO_ZONES,
    );
    return {
      id: index + 1,
      droneId: DEMO_DRONE_ID,
      recordedAt: new Date(historyStart + progress * HISTORY_DURATION_MS).toISOString(),
      longitude: position.longitude,
      latitude: position.latitude,
      altitude: position.altitude,
      heading,
      status: assessment.status,
      nearestZoneName: assessment.nearestZoneName,
      distanceToZoneMeters: assessment.distanceMeters,
    };
  });
}

const history = buildHistory();

function parseBbox(value?: string): [number, number, number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts as [number, number, number, number];
}

export function searchDemoTelemetry(query: TelemetryQuery): PagedResponse<Telemetry> {
  const startedAt = performance.now();
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  const bbox = parseBbox(query.bbox);
  const page = Math.max(0, query.page ?? 0);
  const size = Math.min(500, Math.max(1, query.size ?? 100));

  const filtered = history.filter((item) => {
    const recordedAt = Date.parse(item.recordedAt);
    if (query.droneId && item.droneId !== query.droneId) return false;
    if (Number.isFinite(from) && recordedAt < from) return false;
    if (Number.isFinite(to) && recordedAt > to) return false;
    if (query.status && item.status !== query.status) return false;
    if (bbox && (
      item.longitude < bbox[0]
      || item.latitude < bbox[1]
      || item.longitude > bbox[2]
      || item.latitude > bbox[3]
    )) return false;
    if (query.zoneDistanceMeters != null && (
      item.distanceToZoneMeters == null || item.distanceToZoneMeters > query.zoneDistanceMeters
    )) return false;
    return true;
  });

  const appliedFilters = [
    ...(query.droneId ? ['DRONE_ID'] : []),
    ...(query.from || query.to ? ['TIME_RANGE'] : []),
    ...(bbox ? ['BBOX'] : []),
    ...(query.status ? ['STATUS'] : []),
    ...(query.zoneDistanceMeters != null ? ['ZONE_DISTANCE'] : []),
  ];
  const candidateIndexes = [
    ...(query.droneId && (query.from || query.to)
      ? ['idx_telemetry_drone_recorded_at']
      : query.from || query.to ? ['idx_telemetry_recorded_at'] : []),
    ...(bbox ? ['idx_telemetry_position_gist'] : []),
    ...(query.status === 'DANGER' && (query.from || query.to)
      ? ['idx_telemetry_danger_recorded_at']
      : []),
  ];
  const start = page * size;
  const total = filtered.length;
  return {
    items: filtered.slice(start, start + size),
    page,
    size,
    total,
    totalElements: total,
    totalPages: total === 0 ? 0 : Math.ceil(total / size),
    searchMetadata: {
      queryTimeMs: performance.now() - startedAt,
      appliedFilters,
      candidateIndexes,
    },
  };
}
