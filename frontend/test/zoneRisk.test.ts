import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPointAgainstZones, type ZoneCollection } from '../src/zoneRisk.ts';

const zones: ZoneCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: 'Seoul Station Safety Zone',
      minAltitude: 0,
      maxAltitude: 150,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [126.9700, 37.5528],
        [126.9748, 37.5528],
        [126.9748, 37.5562],
        [126.9700, 37.5562],
        [126.9700, 37.5528],
      ]],
    },
  }],
};

test('displayed polygon interior is DANGER', () => {
  const result = assessPointAgainstZones(126.9724, 37.5545, 100, zones);
  assert.equal(result.status, 'DANGER');
  assert.equal(result.distanceMeters, 0);
});

test('within 200 meters of the displayed polygon is WARNING', () => {
  const result = assessPointAgainstZones(126.9760, 37.5545, 100, zones);
  assert.equal(result.status, 'WARNING');
  assert.ok(result.distanceMeters !== null && result.distanceMeters > 100 && result.distanceMeters < 200);
});

test('outside the displayed polygon and warning buffer is SAFE', () => {
  const result = assessPointAgainstZones(126.9820, 37.5665, 100, zones);
  assert.equal(result.status, 'SAFE');
});

test('horizontal interior outside the altitude range is SAFE', () => {
  const result = assessPointAgainstZones(126.9724, 37.5545, 300, zones);
  assert.equal(result.status, 'SAFE');
});
