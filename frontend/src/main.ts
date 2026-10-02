import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  Credit,
  EllipsoidTerrainProvider,
  Entity,
  GeoJsonDataSource,
  HeadingPitchRoll,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  Ion,
  JulianDate,
  Math as CesiumMath,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  Transforms,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import './style.css';
import { getTelemetry, getZones, IS_DEMO_MODE, openTelemetrySocket } from './api';
import { DEMO_ZONES, sampleDemoRoute } from './demoData';
import type { FlightStatus, PagedResponse, Telemetry, TelemetryQuery } from './types';
import { assessPointAgainstZones, type ZoneCollection } from './zoneRisk';

Ion.defaultAccessToken = '';

const FALLBACK_HOME = { longitude: 126.9750, latitude: 37.5400, altitude: 5_000 };
const MAX_LIVE_POINTS = 900;
const SEARCH_PAGE_SIZE = 500;
const OFFLINE_DEMO_DRONE_ID = 'DRONE-01';
const $ = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`필수 UI 요소를 찾을 수 없습니다: ${selector}`);
  return element;
};

const osmProvider = new OpenStreetMapImageryProvider({
  url: 'https://tile.openstreetmap.org/',
  credit: new Credit('© OpenStreetMap contributors'),
});

const viewer = new Viewer('cesiumContainer', {
  animation: false,
  baseLayer: new ImageryLayer(osmProvider),
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  terrainProvider: new EllipsoidTerrainProvider(),
});

viewer.scene.globe.baseColor = Color.fromCssColorString('#10252d');
viewer.scene.globe.enableLighting = true;
viewer.scene.backgroundColor = Color.fromCssColorString('#050d14');
viewer.scene.fog.enabled = true;
viewer.clock.shouldAnimate = true;

const droneEntities = new Map<string, Entity>();
const livePositions = new Map<string, Cartesian3[]>();
let activeDroneId = 'DRONE-01';
let latestTelemetry: Telemetry | undefined;
let historicalTrack: Entity | undefined;
let demoTimer: number | undefined;
let receivedRealTelemetry = false;
let backendConnected = false;
let followDrone = false;
let displayedZones = DEMO_ZONES;
let restrictedZoneSource: GeoJsonDataSource | undefined;
let activeSearch: Omit<TelemetryQuery, 'page' | 'size'> | undefined;
let currentSearchPage = 0;
let currentSearchTotalPages = 0;

const statusCopy: Record<FlightStatus, string> = {
  SAFE: '안전 비행 중',
  WARNING: '위험구역 접근 중',
  DANGER: '위험구역 진입',
};

function normalizeStatus(value: unknown): FlightStatus {
  const normalized = String(value ?? 'SAFE').toUpperCase();
  return normalized === 'DANGER' || normalized === 'WARNING' ? normalized : 'SAFE';
}

function normalizeTelemetry(value: Telemetry): Telemetry {
  const zoneDistance = value.distanceToZoneMeters ?? value.distanceMeters;
  return {
    ...value,
    droneId: value.droneId || 'UNKNOWN',
    recordedAt: value.recordedAt || new Date().toISOString(),
    longitude: Number(value.longitude),
    latitude: Number(value.latitude),
    altitude: Number(value.altitude),
    heading: value.heading == null ? undefined : Number(value.heading),
    status: normalizeStatus(value.status),
    distanceToZoneMeters: zoneDistance == null ? null : Number(zoneDistance),
  };
}

function flyHome(duration = 1.4) {
  if (restrictedZoneSource) {
    void viewer.flyTo(restrictedZoneSource, {
      duration,
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(15),
        CesiumMath.toRadians(-55),
        7_000,
      ),
    });
    return;
  }
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      FALLBACK_HOME.longitude,
      FALLBACK_HOME.latitude,
      FALLBACK_HOME.altitude,
    ),
    orientation: { heading: CesiumMath.toRadians(15), pitch: CesiumMath.toRadians(-55), roll: 0 },
    duration,
  });
}

async function loadRestrictedZones() {
  try {
    displayedZones = await getZones() as ZoneCollection;
  } catch (error) {
    console.info('API 위험구역을 불러오지 못해 데모 구역을 표시합니다.', error);
    displayedZones = DEMO_ZONES;
  }
  const source = await GeoJsonDataSource.load(
    displayedZones as Parameters<typeof GeoJsonDataSource.load>[0],
    { clampToGround: false },
  );
  for (const entity of source.entities.values) {
    if (!entity.polygon) continue;
    const properties = entity.properties?.getValue(JulianDate.now()) as Record<string, unknown> | undefined;
    const minAltitude = Number(properties?.minAltitude ?? properties?.min_altitude ?? 0);
    const maxAltitude = Number(properties?.maxAltitude ?? properties?.max_altitude ?? 450);
    entity.polygon.height = new ConstantProperty(minAltitude);
    entity.polygon.extrudedHeight = new ConstantProperty(maxAltitude);
    entity.polygon.material = new ColorMaterialProperty(
      Color.fromCssColorString('#ff506d').withAlpha(0.2),
    );
    entity.polygon.outline = new ConstantProperty(true);
    entity.polygon.outlineColor = new ConstantProperty(
      Color.fromCssColorString('#ff6c82').withAlpha(0.9),
    );
    entity.polygon.closeTop = new ConstantProperty(true);
    entity.polygon.closeBottom = new ConstantProperty(true);
  }
  await viewer.dataSources.add(source);
  restrictedZoneSource = source;
}

function calculateBearing(previous: Telemetry | undefined, current: Telemetry): number {
  if (current.heading != null && Number.isFinite(current.heading)) return current.heading;
  if (!previous || previous.droneId !== current.droneId) return 0;
  const lat1 = CesiumMath.toRadians(previous.latitude);
  const lat2 = CesiumMath.toRadians(current.latitude);
  const deltaLongitude = CesiumMath.toRadians(current.longitude - previous.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
  return (CesiumMath.toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function createDroneEntity(telemetry: Telemetry, position: Cartesian3, heading: number): Entity {
  const modelUrl = import.meta.env.VITE_DRONE_MODEL_URL?.trim() || '/models/geoguard-drone.glb';
  return viewer.entities.add({
    id: `drone-${telemetry.droneId}`,
    name: telemetry.droneId,
    position,
    orientation: Transforms.headingPitchRollQuaternion(position, new HeadingPitchRoll(CesiumMath.toRadians(heading), 0, 0)),
    ...(modelUrl
      ? {
          model: {
            uri: modelUrl,
            minimumPixelSize: 44,
            maximumScale: 160,
            silhouetteColor: Color.fromCssColorString('#41e2d0'),
            silhouetteSize: 1.5,
          },
        }
      : {
          ellipsoid: {
            radii: new Cartesian3(12, 12, 4),
            material: Color.fromCssColorString('#41e2d0'),
            outline: true,
            outlineColor: Color.WHITE.withAlpha(0.8),
            heightReference: HeightReference.NONE,
          },
        }),
    label: {
      text: telemetry.droneId,
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#071019'),
      outlineWidth: 3,
      font: '600 12px monospace',
      pixelOffset: new Cartesian2(0, -30),
      verticalOrigin: VerticalOrigin.BOTTOM,
      scaleByDistance: new NearFarScalar(500, 1, 25_000, 0.45),
    },
  });
}

function updateDrone(telemetryInput: Telemetry, real = true) {
  const telemetry = normalizeTelemetry(telemetryInput);
  if (![telemetry.longitude, telemetry.latitude, telemetry.altitude].every(Number.isFinite)) return;
  if (real && !receivedRealTelemetry) {
    receivedRealTelemetry = true;
    stopDemo();
    removeOfflineDemo();
  }

  const previous = latestTelemetry;
  const heading = calculateBearing(previous, telemetry);
  const position = Cartesian3.fromDegrees(telemetry.longitude, telemetry.latitude, Math.max(telemetry.altitude, 1));
  let drone = droneEntities.get(telemetry.droneId);
  if (!drone) {
    drone = createDroneEntity(telemetry, position, heading);
    droneEntities.set(telemetry.droneId, drone);
  } else {
    drone.position = new ConstantPositionProperty(position);
    drone.orientation = new ConstantProperty(
      Transforms.headingPitchRollQuaternion(
        position,
        new HeadingPitchRoll(CesiumMath.toRadians(heading), 0, 0),
      ),
    );
  }

  const positions = livePositions.get(telemetry.droneId) ?? [];
  positions.push(position);
  if (positions.length > MAX_LIVE_POINTS) positions.shift();
  livePositions.set(telemetry.droneId, positions);
  const trailId = `live-trail-${telemetry.droneId}`;
  const existingTrail = viewer.entities.getById(trailId);
  if (existingTrail?.polyline) {
    existingTrail.polyline.positions = new ConstantProperty([...positions]);
  } else {
    viewer.entities.add({
      id: trailId,
      polyline: { positions, width: 3, material: Color.fromCssColorString('#41e2d0').withAlpha(0.85) },
    });
  }

  activeDroneId = telemetry.droneId;
  latestTelemetry = { ...telemetry, heading };
  renderTelemetry(latestTelemetry);
  addEvent(latestTelemetry);
  if (followDrone) viewer.trackedEntity = drone;
}

function renderTelemetry(telemetry: Telemetry) {
  const status = telemetry.status;
  $('#drone-id').textContent = telemetry.droneId;
  $('#latitude').textContent = telemetry.latitude.toFixed(6);
  $('#longitude').textContent = telemetry.longitude.toFixed(6);
  $('#altitude').textContent = `${telemetry.altitude.toFixed(1)} m`;
  $('#heading').textContent = `${Math.round(telemetry.heading ?? 0)}°`;
  $('#status-label').textContent = status;
  $('#status-korean').textContent = statusCopy[status];
  $('#status-mini').textContent = status;
  $('#nearest-zone').textContent = telemetry.nearestZoneName || '도심 비행 제한구역';
  $('#zone-distance').textContent = telemetry.distanceToZoneMeters == null
    ? '-- m'
    : `${Math.round(telemetry.distanceToZoneMeters).toLocaleString()} m`;

  const orb = $('#status-orb');
  orb.className = `status-orb ${status.toLowerCase()}`;
  const mini = $('#status-mini');
  mini.style.color = `var(--${status.toLowerCase()})`;
  mini.style.borderColor = `var(--${status.toLowerCase()})`;
}

function addEvent(telemetry: Telemetry) {
  const list = $('#event-list');
  list.querySelector('.empty')?.remove();
  const item = document.createElement('li');
  item.className = telemetry.status.toLowerCase();
  const time = new Date(telemetry.recordedAt);
  const eventTime = document.createElement('time');
  eventTime.textContent = Number.isNaN(time.getTime())
    ? '--:--:--'
    : time.toLocaleTimeString('ko-KR', { hour12: false });
  const droneName = document.createElement('b');
  droneName.textContent = telemetry.droneId;
  const eventStatus = document.createElement('span');
  eventStatus.textContent = telemetry.status;
  item.append(eventTime, droneName, eventStatus);
  list.prepend(item);
  while (list.children.length > 5) list.lastElementChild?.remove();
  $('#event-count').textContent = String(list.children.length);
}

function currentBbox(): string | undefined {
  const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rectangle) return undefined;
  return [rectangle.west, rectangle.south, rectangle.east, rectangle.north]
    .map((radian) => CesiumMath.toDegrees(radian).toFixed(6))
    .join(',');
}

function drawHistoricalTrack(items: Telemetry[]) {
  if (historicalTrack) viewer.entities.remove(historicalTrack);
  const positions = items
    .filter((item) => [item.longitude, item.latitude, item.altitude].every(Number.isFinite))
    .map((item) => Cartesian3.fromDegrees(item.longitude, item.latitude, item.altitude));
  if (positions.length < 2) return;
  historicalTrack = viewer.entities.add({
    id: 'historical-track',
    name: '과거 비행 경로',
    polyline: { positions, width: 4, material: Color.fromCssColorString('#ffd166').withAlpha(0.92) },
  });
  void viewer.flyTo(historicalTrack, { duration: 1.2, offset: new HeadingPitchRange(0, CesiumMath.toRadians(-70), 1100) });
}

function setSearchDefaults() {
  const to = new Date();
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  const localInput = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  ($('#search-from') as HTMLInputElement).value = localInput(from);
  ($('#search-to') as HTMLInputElement).value = localInput(to);
}

function readSearchQuery(): Omit<TelemetryQuery, 'page' | 'size'> {
  const droneId = ($('#search-drone-id') as HTMLInputElement).value.trim();
  const fromValue = ($('#search-from') as HTMLInputElement).value;
  const toValue = ($('#search-to') as HTMLInputElement).value;
  const statusValue = ($('#search-status') as HTMLSelectElement).value as FlightStatus | '';
  const useViewport = ($('#use-viewport') as HTMLInputElement).checked;
  const bbox = useViewport ? currentBbox() : undefined;
  if (useViewport && !bbox) throw new Error('현재 지도 범위를 계산할 수 없습니다. 지도를 조금 이동한 뒤 다시 시도해 주세요.');
  return {
    droneId,
    from: new Date(fromValue).toISOString(),
    to: new Date(toValue).toISOString(),
    bbox,
    status: statusValue || undefined,
  };
}

const filterLabels: Record<string, string> = {
  DRONE_ID: '드론 ID',
  TIME_RANGE: '시간 범위',
  BBOX: '지도 BBOX',
  STATUS: '비행 상태',
  ZONE_DISTANCE: '위험구역 거리',
};

function updateSearchDiagnostics(response: PagedResponse<Telemetry>, query: Omit<TelemetryQuery, 'page' | 'size'>) {
  const metadata = response.searchMetadata;
  const indexes = metadata?.candidateIndexes ?? [];
  const hasSpatial = indexes.includes('idx_telemetry_position_gist');
  const hasTemporal = indexes.some((index) => index.includes('recorded_at'));
  $('#search-query-time').textContent = metadata
    ? `${metadata.queryTimeMs.toFixed(3)} ms${IS_DEMO_MODE ? ' · 브라우저 데모' : ''}`
    : '측정 정보 없음';
  $('#search-filters').textContent = metadata?.appliedFilters.length
    ? metadata.appliedFilters.map((filter) => filterLabels[filter] ?? filter).join(' + ')
    : '조건 없음';
  $('#search-indexes').textContent = indexes.length ? indexes.join(' + ') : '순차 탐색 가능';
  $('#search-window').textContent = query.bbox ? query.bbox : '지도 범위 제한 없음';
  $('#search-index-badge').textContent = IS_DEMO_MODE
    ? 'DEMO DATA'
    : hasSpatial && hasTemporal ? 'BITMAPAND 가능' : indexes.length ? 'INDEX 후보' : 'SEQ 가능';
}

function updateSearchPagination(response: PagedResponse<Telemetry>, itemCount: number) {
  const page = response.page ?? currentSearchPage;
  const size = response.size ?? SEARCH_PAGE_SIZE;
  const total = response.total ?? response.totalElements ?? itemCount;
  const totalPages = response.totalPages ?? (total === 0 ? 0 : Math.ceil(total / size));
  currentSearchPage = page;
  currentSearchTotalPages = totalPages;
  $('#search-pagination').hidden = totalPages <= 1;
  ($('#search-prev') as HTMLButtonElement).disabled = page <= 0;
  ($('#search-next') as HTMLButtonElement).disabled = totalPages === 0 || page >= totalPages - 1;
  $('#search-page').textContent = totalPages === 0 ? '0 / 0' : `${page + 1} / ${totalPages}`;
  return { page, size, total, totalPages };
}

function setSearchBusy(busy: boolean) {
  const button = $('#track-form').querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = busy;
  if (busy) {
    ($('#search-prev') as HTMLButtonElement).disabled = true;
    ($('#search-next') as HTMLButtonElement).disabled = true;
  } else {
    ($('#search-prev') as HTMLButtonElement).disabled = currentSearchPage <= 0;
    ($('#search-next') as HTMLButtonElement).disabled = currentSearchTotalPages === 0
      || currentSearchPage >= currentSearchTotalPages - 1;
  }
}

async function runSearch(page: number) {
  if (!activeSearch || page < 0) return;
  const result = $('#search-result');
  setSearchBusy(true);
  result.className = 'search-result';
  result.textContent = '공간·시간 조건으로 경로를 검색하고 있습니다...';
  try {
    const response = await getTelemetry({ ...activeSearch, page, size: SEARCH_PAGE_SIZE });
    const items = response.items.map(normalizeTelemetry).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    drawHistoricalTrack(items);
    const pagination = updateSearchPagination(response, items.length);
    updateSearchDiagnostics(response, activeSearch);
    if (items.length === 0) {
      result.className = 'search-result';
      result.textContent = '조건에 맞는 저장 경로가 없습니다. 시간 범위를 넓히거나 BBOX를 해제해 보세요.';
      return;
    }
    const safeCount = items.filter((item) => item.status === 'SAFE').length;
    const warningCount = items.filter((item) => item.status === 'WARNING').length;
    const dangerCount = items.filter((item) => item.status === 'DANGER').length;
    const first = pagination.page * pagination.size + 1;
    const last = first + items.length - 1;
    result.className = 'search-result success';
    result.textContent = `${first.toLocaleString()}–${last.toLocaleString()} / 전체 ${pagination.total.toLocaleString()}개 · 현재 페이지 SAFE ${safeCount.toLocaleString()} · WARNING ${warningCount.toLocaleString()} · DANGER ${dangerCount.toLocaleString()}${activeSearch.bbox ? ' · GiST BBOX' : ''}${IS_DEMO_MODE ? ' · 합성 데모' : ''}`;
  } catch (error) {
    result.className = 'search-result error';
    result.textContent = error instanceof Error ? error.message : '경로 검색에 실패했습니다.';
  } finally {
    setSearchBusy(false);
  }
}

function searchTrack(event: SubmitEvent) {
  event.preventDefault();
  try {
    activeSearch = readSearchQuery();
    currentSearchPage = 0;
    void runSearch(0);
  } catch (error) {
    const result = $('#search-result');
    result.className = 'search-result error';
    result.textContent = error instanceof Error ? error.message : '검색 조건을 확인해 주세요.';
  }
}

function setConnectionState(connected: boolean) {
  backendConnected = connected;
  const connection = $('#connection');
  connection.className = connected ? 'connection connected' : 'connection demo';
  connection.innerHTML = connected
    ? '<i></i>실시간 연결'
    : IS_DEMO_MODE ? '<i></i>공개 데모'
      : receivedRealTelemetry ? '<i></i>연결 재시도' : '<i></i>오프라인 데모';
  if (connected) {
    stopDemo();
    removeOfflineDemo();
  }
  if (!connected && !receivedRealTelemetry) startDemo();
}

function startDemo() {
  if (demoTimer || backendConnected || receivedRealTelemetry) return;
  let step = 0;
  const tick = () => {
    const { longitude, latitude, altitude } = sampleDemoRoute(step / 180);
    const assessment = assessPointAgainstZones(longitude, latitude, altitude, displayedZones);
    updateDrone({
      droneId: OFFLINE_DEMO_DRONE_ID,
      recordedAt: new Date().toISOString(),
      longitude,
      latitude,
      altitude,
      heading: undefined,
      status: assessment.status,
      nearestZoneName: assessment.nearestZoneName,
      distanceToZoneMeters: assessment.distanceMeters,
    }, false);
    step += 1;
  };
  tick();
  demoTimer = window.setInterval(tick, 1_000);
}

function stopDemo() {
  if (demoTimer) window.clearInterval(demoTimer);
  demoTimer = undefined;
}

function removeOfflineDemo() {
  const offlineDrone = droneEntities.get(OFFLINE_DEMO_DRONE_ID);
  if (offlineDrone) viewer.entities.remove(offlineDrone);
  viewer.entities.removeById(`live-trail-${OFFLINE_DEMO_DRONE_ID}`);
  droneEntities.delete(OFFLINE_DEMO_DRONE_ID);
  livePositions.delete(OFFLINE_DEMO_DRONE_ID);
  if (latestTelemetry?.droneId !== OFFLINE_DEMO_DRONE_ID) return;
  latestTelemetry = undefined;
  activeDroneId = '';
  $('#drone-id').textContent = '수신 대기';
  $('#latitude').textContent = '--';
  $('#longitude').textContent = '--';
  $('#altitude').textContent = '--';
  $('#heading').textContent = '--';
  $('#status-label').textContent = 'WAIT';
  $('#status-korean').textContent = '백엔드 데이터 수신 대기';
  $('#status-mini').textContent = 'WAIT';
  $('#status-mini').removeAttribute('style');
  $('#nearest-zone').textContent = '--';
  $('#zone-distance').textContent = '-- m';
  $('#status-orb').className = 'status-orb';
}

function bindUi() {
  $('#home-camera').addEventListener('click', () => {
    followDrone = false;
    viewer.trackedEntity = undefined;
    $('#follow-drone').classList.remove('active');
    flyHome();
  });
  $('#follow-drone').addEventListener('click', () => {
    followDrone = !followDrone;
    $('#follow-drone').classList.toggle('active', followDrone);
    viewer.trackedEntity = followDrone ? droneEntities.get(activeDroneId) : undefined;
  });
  $('#track-form').addEventListener('submit', (event) => searchTrack(event as SubmitEvent));
  $('#search-prev').addEventListener('click', () => void runSearch(currentSearchPage - 1));
  $('#search-next').addEventListener('click', () => void runSearch(currentSearchPage + 1));
  window.setInterval(() => {
    $('#clock').textContent = `${new Date().toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })} KST`;
  }, 1_000);
}

async function initialize() {
  bindUi();
  setSearchDefaults();
  await loadRestrictedZones();
  flyHome(0);
  window.setTimeout(() => {
    if (!backendConnected && !receivedRealTelemetry && !latestTelemetry) startDemo();
  }, 2_000);
  openTelemetrySocket(updateDrone, setConnectionState);
}

void initialize();
