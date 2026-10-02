import type { PagedResponse, Telemetry, TelemetryEnvelope, TelemetryQuery } from './types';
import { DEMO_ZONES, searchDemoTelemetry } from './demoData';

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredApiUrl || window.location.origin).replace(/\/$/, '');

const configuredDemoMode = import.meta.env.VITE_DEMO_MODE?.trim().toLowerCase();
export const IS_DEMO_MODE = configuredDemoMode === 'true'
  || (configuredDemoMode !== 'false' && !['localhost', '127.0.0.1'].includes(window.location.hostname));

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const defaultWsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
export const WS_URL = import.meta.env.VITE_WS_URL?.trim() || defaultWsUrl;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `요청 실패 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getZones(): Promise<GeoJSON.FeatureCollection<GeoJSON.Polygon>> {
  if (IS_DEMO_MODE) return Promise.resolve(DEMO_ZONES);
  return request('/api/zones');
}

export async function getTelemetry(query: TelemetryQuery): Promise<PagedResponse<Telemetry>> {
  if (IS_DEMO_MODE) return searchDemoTelemetry(query);
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const payload = await request<PagedResponse<Telemetry> | Telemetry[]>(`/api/telemetry?${params}`);
  return Array.isArray(payload) ? { items: payload } : payload;
}

export async function getTrack(droneId: string, from: string, to: string): Promise<PagedResponse<Telemetry>> {
  if (IS_DEMO_MODE) return searchDemoTelemetry({ droneId, from, to });
  const params = new URLSearchParams({ from, to });
  const payload = await request<PagedResponse<Telemetry> | Telemetry[]>(
    `/api/drones/${encodeURIComponent(droneId)}/track?${params}`,
  );
  return Array.isArray(payload) ? { items: payload } : payload;
}

export function openTelemetrySocket(
  onTelemetry: (telemetry: Telemetry) => void,
  onStateChange: (connected: boolean) => void,
): () => void {
  if (IS_DEMO_MODE) {
    queueMicrotask(() => onStateChange(false));
    return () => undefined;
  }
  let socket: WebSocket | undefined;
  let retryTimer: number | undefined;
  let closedByClient = false;
  let retryDelay = 1_000;

  const connect = () => {
    socket = new WebSocket(WS_URL);
    socket.addEventListener('open', () => {
      retryDelay = 1_000;
      onStateChange(true);
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as TelemetryEnvelope | Telemetry;
        const telemetry: Telemetry = 'type' in message && 'data' in message && message.type === 'telemetry'
          ? message.data
          : message as Telemetry;
        onTelemetry(telemetry);
      } catch (error) {
        console.warn('알 수 없는 WebSocket 메시지입니다.', error);
      }
    });
    socket.addEventListener('close', () => {
      onStateChange(false);
      if (!closedByClient) {
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    });
    socket.addEventListener('error', () => socket?.close());
  };

  connect();
  return () => {
    closedByClient = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    socket?.close();
  };
}
