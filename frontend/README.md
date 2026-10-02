# GeoGuard 3D Frontend

CesiumJS 기반의 실시간 3D 드론 관제 화면입니다. 외부 Cesium Ion 토큰을 사용하지 않으며, 기본 타원체 지형과 OpenStreetMap 타일을 표시합니다.

## 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

프로덕션 빌드는 `npm run build`로 생성합니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | 현재 프런트엔드 origin | REST API 서버 주소 |
| `VITE_WS_URL` | 현재 origin의 `/ws/telemetry` | Raw WebSocket 주소 |
| `VITE_DRONE_MODEL_URL` | `/models/geoguard-drone.glb` | GLB/glTF 주소. 저장소에서 생성한 드론 GLB를 기본 사용 |

## 사용 API

- `GET /api/zones`: GeoJSON `FeatureCollection`
- `GET /api/telemetry`: `droneId`, `bbox`, `from`, `to`, `page`, `size` 조건 조회
- `GET /api/drones/{id}/track`: 시간 범위 과거 경로 조회
- `WS /ws/telemetry`: `{ "type": "telemetry", "data": Telemetry }`

백엔드가 연결되지 않으면 시연과 UI 검토를 위해 내장 위험구역과 모의 드론 경로가 자동 표시됩니다. WebSocket 실데이터를 수신하는 즉시 모의 이동은 중단됩니다.
