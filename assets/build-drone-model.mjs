import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(assetRoot, 'raw/geoguard-drone.obj');
const outputPath = resolve(assetRoot, 'processed/geoguard-drone.glb');

const source = await readFile(sourcePath, 'utf8');
const sourcePositions = [];
const triangles = [];

for (const untrimmedLine of source.split(/\r?\n/)) {
  const line = untrimmedLine.trim();
  if (!line || line.startsWith('#')) continue;

  const parts = line.split(/\s+/);
  if (parts[0] === 'v') {
    if (parts.length < 4) throw new Error(`Invalid vertex: ${line}`);
    sourcePositions.push(parts.slice(1, 4).map(Number));
  } else if (parts[0] === 'f') {
    const face = parts.slice(1).map((token) => {
      const index = Number(token.split('/')[0]);
      if (!Number.isInteger(index) || index === 0) throw new Error(`Invalid face: ${line}`);
      return index > 0 ? index - 1 : sourcePositions.length + index;
    });
    for (let i = 1; i < face.length - 1; i += 1) {
      triangles.push([face[0], face[i], face[i + 1]]);
    }
  }
}

if (!sourcePositions.length || !triangles.length) {
  throw new Error('OBJ must contain vertices and faces.');
}
if (sourcePositions.length > 65535) {
  throw new Error('This dependency-free converter supports at most 65,535 vertices.');
}

const normals = sourcePositions.map(() => [0, 0, 0]);
for (const [a, b, c] of triangles) {
  const p0 = sourcePositions[a];
  const p1 = sourcePositions[b];
  const p2 = sourcePositions[c];
  if (!p0 || !p1 || !p2) throw new Error('Face references a missing vertex.');

  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0];
  const vy = p2[1] - p0[1];
  const vz = p2[2] - p0[2];
  const faceNormal = [
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  ];
  for (const index of [a, b, c]) {
    normals[index][0] += faceNormal[0];
    normals[index][1] += faceNormal[1];
    normals[index][2] += faceNormal[2];
  }
}

for (const normal of normals) {
  const length = Math.hypot(...normal) || 1;
  normal[0] /= length;
  normal[1] /= length;
  normal[2] /= length;
}

const indices = triangles.flat();
const positionBytes = Buffer.alloc(sourcePositions.length * 3 * 4);
const normalBytes = Buffer.alloc(normals.length * 3 * 4);
const indexBytes = Buffer.alloc(indices.length * 2);

sourcePositions.flat().forEach((value, index) => positionBytes.writeFloatLE(value, index * 4));
normals.flat().forEach((value, index) => normalBytes.writeFloatLE(value, index * 4));
indices.forEach((value, index) => indexBytes.writeUInt16LE(value, index * 2));

const pad4 = (buffer, fill = 0) => {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
};

const positionChunk = pad4(positionBytes);
const normalChunk = pad4(normalBytes);
const indexChunk = pad4(indexBytes);
const binaryChunk = Buffer.concat([positionChunk, normalChunk, indexChunk]);
const bounds = [0, 1, 2].map((axis) => ({
  min: Math.min(...sourcePositions.map((position) => position[axis])),
  max: Math.max(...sourcePositions.map((position) => position[axis])),
}));

const gltf = {
  asset: { version: '2.0', generator: 'GeoGuard dependency-free OBJ to GLB converter' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'GeoGuard Drone' }],
  meshes: [{
    name: 'Low-poly quadcopter',
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
  }],
  materials: [{
    name: 'Safety orange',
    pbrMetallicRoughness: {
      baseColorFactor: [0.95, 0.27, 0.06, 1],
      metallicFactor: 0.15,
      roughnessFactor: 0.68,
    },
    doubleSided: true,
  }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: sourcePositions.length,
      type: 'VEC3',
      min: bounds.map((bound) => bound.min),
      max: bounds.map((bound) => bound.max),
    },
    { bufferView: 1, componentType: 5126, count: normals.length, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: positionChunk.length,
      byteLength: normalBytes.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: positionChunk.length + normalChunk.length,
      byteLength: indexBytes.length,
      target: 34963,
    },
  ],
  buffers: [{ byteLength: binaryChunk.length }],
};

const jsonChunk = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binaryChunk.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.concat([
  header,
  jsonHeader,
  jsonChunk,
  binaryHeader,
  binaryChunk,
]));

const [sourceInfo, outputInfo] = await Promise.all([stat(sourcePath), stat(outputPath)]);
console.log(`OBJ: ${sourceInfo.size} bytes -> GLB: ${outputInfo.size} bytes`);
console.log(`Vertices: ${sourcePositions.length}; triangles: ${triangles.length}`);
console.log(outputPath);

