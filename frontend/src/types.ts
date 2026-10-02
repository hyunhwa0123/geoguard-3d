export type FlightStatus = 'SAFE' | 'WARNING' | 'DANGER';

export interface Telemetry {
  id?: number;
  droneId: string;
  recordedAt: string;
  longitude: number;
  latitude: number;
  altitude: number;
  heading?: number;
  status: FlightStatus;
  nearestZoneName?: string | null;
  distanceMeters?: number | null;
  distanceToZoneMeters?: number | null;
}

export interface PagedResponse<T> {
  items: T[];
  page?: number;
  size?: number;
  totalElements?: number;
  total?: number;
  totalPages?: number;
  searchMetadata?: SearchMetadata | null;
}

export interface SearchMetadata {
  queryTimeMs: number;
  appliedFilters: string[];
  candidateIndexes: string[];
}

export interface TelemetryQuery {
  droneId: string;
  from: string;
  to: string;
  bbox?: string;
  status?: FlightStatus;
  zoneDistanceMeters?: number;
  page?: number;
  size?: number;
}

export interface TelemetryEnvelope {
  type: 'telemetry';
  data: Telemetry;
}
