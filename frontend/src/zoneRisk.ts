import type { FlightStatus } from './types';

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEFAULT_WARNING_DISTANCE_METERS = 200;
const BOUNDARY_EPSILON = 1e-10;

export type ZoneCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon>;

export interface ZoneAssessment {
  status: FlightStatus;
  nearestZoneName: string | null;
  distanceMeters: number | null;
}

type Coordinate = [number, number];

interface EvaluatedZone {
  name: string | null;
  altitudeMatches: boolean;
  covered: boolean;
  distanceMeters: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function altitudeRange(properties: Record<string, unknown>): [number, number] {
  return [
    finiteNumber(properties.minAltitude ?? properties.min_altitude, 0),
    finiteNumber(properties.maxAltitude ?? properties.max_altitude, Number.POSITIVE_INFINITY),
  ];
}

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): boolean {
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  if (squaredLength <= BOUNDARY_EPSILON ** 2) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]) <= BOUNDARY_EPSILON;
  }

  const cross = (point[1] - start[1]) * (end[0] - start[0])
    - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > BOUNDARY_EPSILON) return false;

  const dot = (point[0] - start[0]) * (end[0] - start[0])
    + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < -BOUNDARY_EPSILON) return false;

  return dot <= squaredLength + BOUNDARY_EPSILON;
}

function pointOnRingBoundary(point: Coordinate, ring: number[][]): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index] as Coordinate;
    const end = ring[(index + 1) % ring.length] as Coordinate;
    if (pointOnSegment(point, start, end)) return true;
  }
  return false;
}

function pointInRing(point: Coordinate, ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index] as Coordinate;
    const previousPoint = ring[previous] as Coordinate;
    const crossesLatitude = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]);
    if (!crossesLatitude) continue;
    const intersectionLongitude = (previousPoint[0] - currentPoint[0])
      * (point[1] - currentPoint[1])
      / (previousPoint[1] - currentPoint[1])
      + currentPoint[0];
    if (point[0] < intersectionLongitude) inside = !inside;
  }
  return inside;
}

function polygonCoversPoint(point: Coordinate, polygon: GeoJSON.Polygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer) return false;
  if (pointOnRingBoundary(point, outer)) return true;
  if (!pointInRing(point, outer)) return false;
  for (const hole of holes) {
    if (pointOnRingBoundary(point, hole)) return true;
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function toLocalMeters(coordinate: Coordinate, origin: Coordinate): Coordinate {
  const radians = Math.PI / 180;
  return [
    (coordinate[0] - origin[0]) * radians * EARTH_RADIUS_METERS * Math.cos(origin[1] * radians),
    (coordinate[1] - origin[1]) * radians * EARTH_RADIUS_METERS,
  ];
}

function distanceToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const localStart = toLocalMeters(start, point);
  const localEnd = toLocalMeters(end, point);
  const deltaX = localEnd[0] - localStart[0];
  const deltaY = localEnd[1] - localStart[1];
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  if (squaredLength === 0) return Math.hypot(localStart[0], localStart[1]);

  const projection = Math.max(0, Math.min(1,
    -(localStart[0] * deltaX + localStart[1] * deltaY) / squaredLength));
  return Math.hypot(localStart[0] + projection * deltaX, localStart[1] + projection * deltaY);
}

function distanceToPolygonMeters(point: Coordinate, polygon: GeoJSON.Polygon): number {
  if (polygonCoversPoint(point, polygon)) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of polygon.coordinates) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index] as Coordinate;
      const end = ring[(index + 1) % ring.length] as Coordinate;
      nearest = Math.min(nearest, distanceToSegmentMeters(point, start, end));
    }
  }
  return nearest;
}

export function assessPointAgainstZones(
  longitude: number,
  latitude: number,
  altitude: number,
  zones: ZoneCollection,
  warningDistanceMeters = DEFAULT_WARNING_DISTANCE_METERS,
): ZoneAssessment {
  const point: Coordinate = [longitude, latitude];
  const evaluated: EvaluatedZone[] = zones.features
    .filter((zone) => zone.geometry?.type === 'Polygon')
    .map((zone) => {
      const properties = zone.properties ?? {};
      const [minimumAltitude, maximumAltitude] = altitudeRange(properties);
      return {
        name: typeof properties.name === 'string' ? properties.name : null,
        altitudeMatches: altitude >= minimumAltitude && altitude <= maximumAltitude,
        covered: polygonCoversPoint(point, zone.geometry),
        distanceMeters: distanceToPolygonMeters(point, zone.geometry),
      };
    });

  const altitudeMatches = evaluated.filter((zone) => zone.altitudeMatches);
  const danger = altitudeMatches.find((zone) => zone.covered);
  if (danger) {
    return { status: 'DANGER', nearestZoneName: danger.name, distanceMeters: 0 };
  }

  const nearestAtAltitude = altitudeMatches.reduce<EvaluatedZone | null>(
    (nearest, zone) => !nearest || zone.distanceMeters < nearest.distanceMeters ? zone : nearest,
    null,
  );
  if (nearestAtAltitude && nearestAtAltitude.distanceMeters <= warningDistanceMeters) {
    return {
      status: 'WARNING',
      nearestZoneName: nearestAtAltitude.name,
      distanceMeters: nearestAtAltitude.distanceMeters,
    };
  }

  const nearestVisible = evaluated.reduce<EvaluatedZone | null>(
    (nearest, zone) => !nearest || zone.distanceMeters < nearest.distanceMeters ? zone : nearest,
    null,
  );
  return {
    status: 'SAFE',
    nearestZoneName: nearestVisible?.name ?? null,
    distanceMeters: nearestVisible?.distanceMeters ?? null,
  };
}
