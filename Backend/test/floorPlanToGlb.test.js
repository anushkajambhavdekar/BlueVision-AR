import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { convertFloorPlanToGlb } from "../src/floorPlanToGlb.js";

async function createTestDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), "3dverse-floorplan-test-"));
}

function createFloorPlanSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="white" />
    <g fill="none" stroke="#111" stroke-width="6">
      <path d="M32 32 H224 V224 H32 Z" />
      <path d="M128 32 V224 M32 128 H224" />
    </g>
  </svg>`);
}

test("converts a floor plan image into a GLB with extruded wall geometry", async (context) => {
  const directory = await createTestDirectory();
  context.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, "plan.png");
  await sharp(createFloorPlanSvg()).png().toFile(imagePath);

  const result = await convertFloorPlanToGlb(imagePath, directory);
  const glb = await fs.readFile(result.modelPath);

  assert.equal(glb.toString("ascii", 0, 4), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.ok(result.wallSegments >= 6);
  assert.ok(result.dimensions.width > 0);
  assert.ok(result.dimensions.depth > 0);

  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
  assert.equal(gltf.asset.version, "2.0");
  assert.equal(gltf.materials.length, 3);
  assert.deepEqual(gltf.materials.map((material) => material.name), [
    "Floor | warm stone",
    "Exterior walls | soft ivory",
    "Interior walls | muted teal",
  ]);
  assert.ok(gltf.meshes[0].primitives.some((primitive) => primitive.material === 0));
  assert.ok(gltf.meshes[0].primitives.some((primitive) => primitive.material === 1));
  assert.ok(gltf.meshes[0].primitives.some((primitive) => primitive.material === 2));
  assert.ok(gltf.accessors.length >= 9);
});

test("rejects images without detectable floor-plan walls", async (context) => {
  const directory = await createTestDirectory();
  context.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, "blank.png");
  await sharp({ create: { width: 256, height: 256, channels: 3, background: "white" } })
    .png()
    .toFile(imagePath);

  await assert.rejects(
    convertFloorPlanToGlb(imagePath, directory),
    /No clear floor-plan walls were found/
  );
});
