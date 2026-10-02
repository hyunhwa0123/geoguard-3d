# GeoGuard 3D Backend

Spring Boot 3 / Java 21 백엔드다. PostGIS에서 텔레메트리를 저장·검색하고 제한구역과의 수평 거리 및 고도 중첩을 판정한 뒤, 커밋된 위치를 WebSocket으로 전달한다.

## 실행

PostgreSQL에 PostGIS 확장이 설치되어 있어야 한다. Flyway가 테이블, 공간 인덱스, 데모 제한구역을 생성한다.

```powershell
$env:DB_URL='jdbc:postgresql://localhost:5432/geoguard'
$env:DB_USERNAME='geoguard'
$env:DB_PASSWORD='geoguard_local_only'
$env:APP_CORS_ALLOWED_ORIGINS='http://localhost:5173'
./gradlew.bat bootRun
```

기본값은 위 예시와 같다. Swagger UI는 `http://localhost:8080/swagger-ui.html`, OpenAPI JSON은 `/v3/api-docs`에서 확인한다.

## API 계약

- `POST /api/telemetry/batch`: `{ "items": [{ "droneId", "recordedAt", "longitude", "latitude", "altitude", "heading"?, "speed"? }] }`
- `GET /api/telemetry`: `droneId`, `bbox=minLon,minLat,maxLon,maxLat`, `from`, `to`, `status`, `zoneDistanceMeters`, `page`, `size`
- `GET /api/drones/{id}/track`: `from`, `to`, `limit`
- `GET /api/zones`: GeoJSON `FeatureCollection`
- `GET /api/events`: `status=WARNING|DANGER`, `droneId`, `from`, `to`, `page`, `size`
- `POST /api/routes/analyze`: 저장 없이 경로 지점별 위험도를 분석
- `WS /ws/telemetry`: 커밋된 항목을 `{ "type": "telemetry", "data": {...} }` 형태로 전송

판정 우선순위는 제한 고도와 겹치는 경우 `내부 또는 경계 = DANGER`, `경계에서 200m 이내 = WARNING`, 그 외 `SAFE`다. WARNING과 DANGER는 `risk_event`에도 저장된다.

오류 응답은 `timestamp`, `status`, `error`, `code`, `message`, `path`, `fieldErrors` 형식을 공통으로 사용한다. 한 번의 수집은 최대 1,000건, 일반 검색은 페이지당 최대 1,000건으로 제한한다.

## 테스트

```powershell
./gradlew.bat test
```

단위 테스트는 bbox 파싱과 경로 위험 집계를 검증한다. Docker가 사용 가능하면 Testcontainers의 `postgis/postgis:16-3.4`로 실제 공간 판정, 텔레메트리 저장, bbox·시간·상태 검색, 이벤트 및 오류 응답 통합 테스트도 실행한다. Docker가 없으면 해당 통합 테스트만 자동으로 건너뛴다.
