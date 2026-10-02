import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_DRONE_ID, searchDemoTelemetry } from '../src/demoData.ts';

const entireHistory = {
  droneId: DEMO_DRONE_ID,
  from: '2000-01-01T00:00:00.000Z',
  to: '2100-01-01T00:00:00.000Z',
};

test('demo history supports paging and exposes the production index candidates', () => {
  const response = searchDemoTelemetry({
    ...entireHistory,
    bbox: '126.96,37.55,127.01,37.58',
    page: 1,
    size: 500,
  });

  assert.equal(response.page, 1);
  assert.equal(response.items.length, 500);
  assert.equal(response.totalElements, 1_801);
  assert.deepEqual(response.searchMetadata?.candidateIndexes, [
    'idx_telemetry_drone_recorded_at',
    'idx_telemetry_position_gist',
  ]);
});

test('demo history filters danger points and rejects an unknown drone', () => {
  const danger = searchDemoTelemetry({ ...entireHistory, status: 'DANGER', page: 0, size: 500 });
  assert.ok(danger.items.length > 0);
  assert.ok(danger.items.every((item) => item.status === 'DANGER'));

  const missing = searchDemoTelemetry({ ...entireHistory, droneId: 'UNKNOWN', page: 0, size: 500 });
  assert.equal(missing.totalElements, 0);
});
