import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function findRuns(mask, minimumLength, gapTolerance) {
  const runs = [];
  let start = -1;
  let lastInk = -1;

  for (let index = 0; index <= mask.length; index += 1) {
    if (index < mask.length && mask[index]) {
      if (start < 0) start = index;
      lastInk = index;
      continue;
    }

    if (index < mask.length && start >= 0 && index - lastInk - 1 <= gapTolerance) continue;
    if (start >= 0 && lastInk - start + 1 >= minimumLength) {
      runs.push([start, lastInk]);
    }
    start = -1;
    lastInk = -1;
  }

  return runs;
}

function collectLines(pixels, width, height, horizontal) {
  const lineCount = horizontal ? height : width;
  const lineLength = horizontal ? width : height;
  const minLength = Math.max(12, Math.round(lineLength * 0.09));
  const gapTolerance = Math.max(2, Math.round(lineLength * 0.004));
  const mergeTolerance = Math.max(2, Math.round(lineCount * 0.012));
  const groups = [];

  for (let line = 0; line < lineCount; line += 1) {
    const mask = new Uint8Array(lineLength);
    for (let position = 0; position < lineLength; position += 1) {
      const x = horizontal ? position : line;
      const y = horizontal ? line : position;
      mask[position] = pixels[y * width + x];
    }

    for (const [start, end] of findRuns(mask, minLength, gapTolerance)) {
      const matching = groups.find((group) =>
        Math.abs(group.position - line) <= mergeTolerance &&
        Math.min(group.end, end) - Math.max(group.start, start) >=
          Math.min(group.end - group.start, end - start) * 0.5
      );

      if (matching) {
        matching.position = (matching.position * matching.samples + line) / (matching.samples + 1);
        matching.start = Math.min(matching.start, start);
        matching.end = Math.max(matching.end, end);
        matching.samples += 1;
      } else {
        groups.push({ position: line, start, end, samples: 1 });
      }
    }
  }

  const minimumFinalLength = Math.max(16, Math.round(lineLength * 0.12));
  return groups
    .filter((group) => group.end - group.start + 1 >= minimumFinalLength)
    .map(({ position, start, end }) => ({ position, start, end }));
}

function addBox(positions, normals, indices, minX, minY, minZ, maxX, maxY, maxZ) {
  const faces = [
    { normal: [0, 0, 1], points: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] },
    { normal: [0, 0, -1], points: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]] },
    { normal: [1, 0, 0], points: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]] },
    { normal: [-1, 0, 0], points: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]] },
    { normal: [0, 1, 0], points: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]] },
    { normal: [0, -1, 0], points: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]] },
  ];

  for (const face of faces) {
    const firstVertex = positions.length / 3;
    for (const point of face.points) {
      positions.push(...point);
      normals.push(...face.normal);
    }
    indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
  }
}

function createGlb(parts) {
  const binaryChunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const appendBufferView = (buffer, target) => {
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    binaryChunks.push(buffer);
    byteOffset += buffer.length;
    return index;
  };

  const primitives = parts.filter((part) => part.indices.length).map((part) => {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const indexBuffer = Buffer.from(new Uint32Array(part.indices).buffer);
    const positionValues = Array.from({ length: part.positions.length / 3 }, (_, index) => part.positions.slice(index * 3, index * 3 + 3));
    const minimum = [0, 1, 2].map((axis) => Math.min(...positionValues.map((point) => point[axis])));
    const maximum = [0, 1, 2].map((axis) => Math.max(...positionValues.map((point) => point[axis])));
    const positionView = appendBufferView(positionBuffer, 34962);
    const normalView = appendBufferView(normalBuffer, 34962);
    const indexView = appendBufferView(indexBuffer, 34963);
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min: minimum, max: maximum });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: 5125, count: part.indices.length, type: "SCALAR", min: [0], max: [part.positions.length / 3 - 1] });

    return {
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
      indices: indexAccessor,
      material: part.material,
      mode: 4,
    };
  });
  const binaryBuffer = Buffer.concat(binaryChunks);
  const gltf = {
    asset: { version: "2.0", generator: "3DVerse floor-plan shell converter" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Floor plan building shell" }],
    meshes: [{
      name: "Color-separated extruded floor plan",
      primitives,
    }],
    materials: [
      {
        name: "Floor | warm stone",
        pbrMetallicRoughness: { baseColorFactor: [0.72, 0.48, 0.28, 1], metallicFactor: 0, roughnessFactor: 0.9 },
      },
      {
        name: "Exterior walls | soft ivory",
        pbrMetallicRoughness: { baseColorFactor: [0.88, 0.83, 0.68, 1], metallicFactor: 0, roughnessFactor: 0.86 },
      },
      {
        name: "Interior walls | muted teal",
        pbrMetallicRoughness: { baseColorFactor: [0.29, 0.58, 0.61, 1], metallicFactor: 0, roughnessFactor: 0.84 },
      },
    ],
    buffers: [{ byteLength: binaryBuffer.length }],
    bufferViews,
    accessors,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const binaryPadding = (4 - (binaryBuffer.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const paddedBinary = Buffer.concat([binaryBuffer, Buffer.alloc(binaryPadding)]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryChunkHeader = Buffer.alloc(8);
  binaryChunkHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryChunkHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonChunkHeader, paddedJson, binaryChunkHeader, paddedBinary]);
}

export async function convertFloorPlanToGlb(imagePath, uploadsDir) {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  if (width < 64 || height < 64) {
    throw new Error("The uploaded floor plan is too small to convert. Use a clear image at least 64 pixels wide and tall.");
  }

  const borderSamples = [];
  const borderStepX = Math.max(1, Math.floor(width / 40));
  const borderStepY = Math.max(1, Math.floor(height / 40));
  for (let x = 0; x < width; x += borderStepX) {
    borderSamples.push(data[x], data[(height - 1) * width + x]);
  }
  for (let y = 0; y < height; y += borderStepY) {
    borderSamples.push(data[y * width], data[y * width + width - 1]);
  }
  borderSamples.sort((a, b) => a - b);
  const backgroundIsDark = borderSamples[Math.floor(borderSamples.length / 2)] < 128;
  const threshold = backgroundIsDark ? 190 : 150;
  const ink = new Uint8Array(width * height);
  for (let index = 0; index < ink.length; index += 1) {
    ink[index] = backgroundIsDark ? data[index] > threshold : data[index] < threshold;
  }

  const horizontal = collectLines(ink, width, height, true);
  const vertical = collectLines(ink, width, height, false);
  if (horizontal.length + vertical.length < 4 || horizontal.length < 2 || vertical.length < 2) {
    throw new Error("No clear floor-plan walls were found. Upload a high-contrast, top-down floor plan with visible horizontal and vertical wall lines.");
  }

  const minPlanX = Math.min(...horizontal.map((line) => line.start), ...vertical.map((line) => line.position));
  const maxPlanX = Math.max(...horizontal.map((line) => line.end), ...vertical.map((line) => line.position));
  const minPlanY = Math.min(...vertical.map((line) => line.start), ...horizontal.map((line) => line.position));
  const maxPlanY = Math.max(...vertical.map((line) => line.end), ...horizontal.map((line) => line.position));
  const planWidth = maxPlanX - minPlanX;
  const planDepth = maxPlanY - minPlanY;
  if (planWidth < 24 || planDepth < 24) {
    throw new Error("The floor-plan wall area is too small to create a building model.");
  }

  const scale = 12 / Math.max(planWidth, planDepth);
  const wallHeight = 2.8;
  const wallThickness = 0.18;
  const floorThickness = 0.16;
  const parts = [
    { name: "floor", material: 0, positions: [], normals: [], indices: [] },
    { name: "exteriorWalls", material: 1, positions: [], normals: [], indices: [] },
    { name: "interiorWalls", material: 2, positions: [], normals: [], indices: [] },
  ];
  const halfWidth = (planWidth * scale) / 2;
  const halfDepth = (planDepth * scale) / 2;
  const [floor, exteriorWalls, interiorWalls] = parts;
  addBox(floor.positions, floor.normals, floor.indices, -halfWidth, 0, -halfDepth, halfWidth, floorThickness, halfDepth);
  const exteriorTolerance = Math.max(3, Math.round(Math.min(width, height) * 0.025));

  for (const line of horizontal) {
    const startX = (line.start - minPlanX) * scale - halfWidth;
    const endX = (line.end - minPlanX) * scale - halfWidth;
    const z = (line.position - minPlanY) * scale - halfDepth;
    const part = Math.abs(line.position - minPlanY) <= exteriorTolerance || Math.abs(line.position - maxPlanY) <= exteriorTolerance
      ? exteriorWalls
      : interiorWalls;
    addBox(part.positions, part.normals, part.indices, startX, floorThickness, z - wallThickness / 2, endX, floorThickness + wallHeight, z + wallThickness / 2);
  }
  for (const line of vertical) {
    const x = (line.position - minPlanX) * scale - halfWidth;
    const startZ = (line.start - minPlanY) * scale - halfDepth;
    const endZ = (line.end - minPlanY) * scale - halfDepth;
    const part = Math.abs(line.position - minPlanX) <= exteriorTolerance || Math.abs(line.position - maxPlanX) <= exteriorTolerance
      ? exteriorWalls
      : interiorWalls;
    addBox(part.positions, part.normals, part.indices, x - wallThickness / 2, floorThickness, startZ, x + wallThickness / 2, floorThickness + wallHeight, endZ);
  }

  const modelName = `${path.parse(imagePath).name}-building-${Date.now()}.glb`;
  const modelPath = path.join(uploadsDir, modelName);
  await fs.writeFile(modelPath, createGlb(parts));

  return {
    modelPath,
    modelUrl: `/uploads/${modelName}`,
    wallSegments: horizontal.length + vertical.length,
    dimensions: { width: Number((planWidth * scale).toFixed(1)), depth: Number((planDepth * scale).toFixed(1)), height: wallHeight },
  };
}
