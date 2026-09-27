import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import "dotenv/config";
import { convertFloorPlanToGlb } from "./floorPlanToGlb.js";
import { analyzeFloorPlanWithGemini } from "./geminiFloorPlan.js";
import { persistGeminiConfig } from "./geminiConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const localSecretsFile = path.join(rootDir, ".env.local");
dotenv.config({ path: localSecretsFile, override: false });
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(rootDir, "uploads");
const projectsFile = path.join(dataDir, "projects.json");
const objectCatalogFile = path.join(dataDir, "objectCatalog.json");
const textPromptDatasetFile = path.join(dataDir, "textPromptDataset.csv");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const MESHY_API_KEY = process.env.MESHY_API_KEY || "";
let activeGeminiApiKey = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MESHY_API_BASE_URL = "https://api.meshy.ai";
const MESHY_POLL_INTERVAL_MS = 5000;
const MESHY_TIMEOUT_MS = 8 * 60 * 1000;
const DB_TYPE = (process.env.DB_TYPE || "json").toLowerCase();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage });
const analysisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PLACEHOLDER_MODEL_URL =
  "https://modelviewer.dev/shared-assets/models/Astronaut.glb";

const FIXED_TEXT_TO_3D_MODELS = [
  {
    keyword: "chair",
    label: "Wooden Chair",
    modelUrl: "https://modelviewer.dev/assets/ShopifyModels/Chair.glb",
    aliases: ["chair", "wooden chair", "office chair", "dining chair"],
    description: "A wooden chair for seating in a room, office, dining area, classroom, or furniture scene.",
  },
  {
    keyword: "astronaut",
    label: "Astronaut",
    modelUrl: "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
    aliases: ["astronaut", "space suit", "spacesuit", "space man", "space explorer"],
    description: "A human space explorer wearing a white astronaut suit, helmet, boots, and life support pack.",
  },
  {
    keyword: "robot",
    label: "Robot",
    modelUrl: "https://modelviewer.dev/shared-assets/models/RobotExpressive.glb",
    aliases: ["robot", "android", "humanoid robot", "bot"],
    description: "A friendly humanoid robot or android with mechanical body parts for technology scenes.",
  },
  {
    keyword: "horse",
    label: "Horse",
    modelUrl: "https://modelviewer.dev/shared-assets/models/Horse.glb",
    aliases: ["horse", "stallion", "pony"],
    description: "A four legged horse animal, useful for farm, riding, stable, race, or outdoor scenes.",
  },
  {
    keyword: "helmet",
    label: "Helmet",
    modelUrl: "https://modelviewer.dev/shared-assets/models/DamagedHelmet.glb",
    aliases: ["helmet", "damaged helmet", "biker helmet", "motorcycle helmet", "helmate", "helment"],
    description: "A protective sci fi or motorcycle style helmet with worn metal details.",
  },
  {
    keyword: "train",
    label: "Toy Train",
    modelUrl: "https://modelviewer.dev/assets/ShopifyModels/ToyTrain.glb",
    aliases: ["toy train", "train", "locomotive"],
    description: "A toy train or small locomotive for railway, kids toy, transport, or playroom scenes.",
  },
  {
    keyword: "planter",
    label: "Planter",
    modelUrl: "https://modelviewer.dev/assets/ShopifyModels/GeoPlanter.glb",
    aliases: ["planter", "plant pot", "flower pot", "pot"],
    description: "A geometric planter or plant pot for flowers, indoor plants, garden, balcony, or home decor.",
  },
  {
    keyword: "boombox",
    label: "Boombox",
    modelUrl: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb",
    aliases: ["boombox", "speaker", "music player", "radio", "stereo"],
    description: "A portable music speaker or stereo radio with handles and audio controls.",
  },
  {
    keyword: "avocado",
    label: "Avocado",
    modelUrl: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
    aliases: ["avocado", "fruit", "food", "green fruit"],
    description: "A sliced avocado fruit with green flesh and seed, useful for food or kitchen scenes.",
  },
  {
    keyword: "lantern",
    label: "Lantern",
    modelUrl: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb",
    aliases: ["lantern", "lamp", "light", "hanging lamp"],
    description: "A decorative lantern or lamp that represents lighting for rooms, camping, or night scenes.",
  },
];

const MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "into",
  "is",
  "make",
  "model",
  "of",
  "please",
  "show",
  "the",
  "to",
  "with",
]);

let mysqlPool = null;

function shouldUseMysqlCatalog() {
  return DB_TYPE === "mysql";
}

function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "3dverse",
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
  }

  return mysqlPool;
}

function normalizeCatalogObject(entry) {
  const id = String(entry?.id || entry?.keyword || entry?.label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const label = String(entry?.label || entry?.keyword || entry?.id || "").trim();
  const modelUrl = String(entry?.modelUrl || "").trim();
  const aliases = Array.isArray(entry?.aliases)
    ? entry.aliases.map((alias) => String(alias).trim()).filter(Boolean)
    : [];
  const description = String(entry?.description || "").trim();

  if (!id || !label || !modelUrl || !description) return null;

  return {
    id,
    keyword: id,
    label,
    modelUrl,
    aliases: Array.from(new Set([id, label.toLowerCase(), ...aliases])),
    description,
  };
}

function readJsonObjectCatalog() {
  if (!fs.existsSync(objectCatalogFile)) {
    writeJsonObjectCatalog(FIXED_TEXT_TO_3D_MODELS);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(objectCatalogFile, "utf-8"));
    const catalog = Array.isArray(parsed)
      ? parsed.map(normalizeCatalogObject).filter(Boolean)
      : [];
    return catalog.length ? catalog : FIXED_TEXT_TO_3D_MODELS.map(normalizeCatalogObject).filter(Boolean);
  } catch {
    return FIXED_TEXT_TO_3D_MODELS.map(normalizeCatalogObject).filter(Boolean);
  }
}

function readPromptAliasesByObjectId() {
  if (!fs.existsSync(textPromptDatasetFile)) return new Map();

  const aliasesByObjectId = new Map();
  const rows = fs.readFileSync(textPromptDatasetFile, "utf-8").split(/\r?\n/).slice(1);

  for (const row of rows) {
    const match = row.match(/^"?(.*?)"?,([^,]+)$/);
    if (!match) continue;

    const prompt = String(match[1] || "").trim();
    const objectId = String(match[2] || "").trim();
    if (!prompt || !objectId) continue;

    const aliases = aliasesByObjectId.get(objectId) || [];
    aliases.push(prompt);
    aliasesByObjectId.set(objectId, aliases);
  }

  return aliasesByObjectId;
}

function withPromptDatasetAliases(catalog) {
  const aliasesByObjectId = readPromptAliasesByObjectId();
  return catalog.map((entry) => ({
    ...entry,
    aliases: Array.from(new Set([...(entry.aliases || []), ...(aliasesByObjectId.get(entry.id) || [])])),
  }));
}

function writeJsonObjectCatalog(catalog) {
  const normalized = catalog.map(normalizeCatalogObject).filter(Boolean);
  fs.writeFileSync(objectCatalogFile, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

async function readMysqlObjectCatalog() {
  const [rows] = await getMysqlPool().query(
    "SELECT id, label, model_url AS modelUrl, aliases, description FROM object_catalog ORDER BY label ASC"
  );

  return rows.map((row) =>
    normalizeCatalogObject({
      id: row.id,
      label: row.label,
      modelUrl: row.modelUrl,
      aliases: typeof row.aliases === "string" ? JSON.parse(row.aliases) : row.aliases,
      description: row.description,
    })
  ).filter(Boolean);
}

async function seedMysqlObjectCatalogIfEmpty() {
  const [[{ count }]] = await getMysqlPool().query("SELECT COUNT(*) AS count FROM object_catalog");
  if (Number(count) > 0) return;

  for (const entry of readJsonObjectCatalog()) {
    await upsertMysqlCatalogObject(entry);
  }
}

async function readObjectCatalog() {
  if (!shouldUseMysqlCatalog()) return withPromptDatasetAliases(readJsonObjectCatalog());

  await seedMysqlObjectCatalogIfEmpty();
  return withPromptDatasetAliases(await readMysqlObjectCatalog());
}

async function upsertMysqlCatalogObject(entry) {
  const object = normalizeCatalogObject(entry);
  if (!object) return null;

  await getMysqlPool().execute(
    `INSERT INTO object_catalog (id, label, model_url, aliases, description)
     VALUES (:id, :label, :modelUrl, :aliases, :description)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       model_url = VALUES(model_url),
       aliases = VALUES(aliases),
       description = VALUES(description)`,
    {
      id: object.id,
      label: object.label,
      modelUrl: object.modelUrl,
      aliases: JSON.stringify(object.aliases),
      description: object.description,
    }
  );

  return object;
}

async function upsertCatalogObject(entry) {
  const object = normalizeCatalogObject(entry);
  if (!object) return null;

  if (shouldUseMysqlCatalog()) {
    return upsertMysqlCatalogObject(object);
  }

  const catalog = readJsonObjectCatalog();
  const existingIndex = catalog.findIndex((item) => item.id === object.id);
  if (existingIndex >= 0) {
    catalog[existingIndex] = object;
  } else {
    catalog.push(object);
  }
  writeJsonObjectCatalog(catalog);
  return object;
}

function hasMeshyApiKey() {
  return Boolean(MESHY_API_KEY && MESHY_API_KEY !== "your_meshy_api_key_here");
}

function hasGeminiApiKey() {
  return Boolean(activeGeminiApiKey && activeGeminiApiKey !== "your_gemini_api_key_here");
}

async function enhancePromptWithGemini(prompt) {
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(activeGeminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "Rewrite the user's request as one concise, detailed visual prompt for generating a single 3D asset. Preserve the requested object, style, materials, colors, and useful distinctive details. Do not add commentary, markdown, or unrelated objects.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed with status ${response.status}`);
  }

  const enhancedPrompt = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join(" ")
    .trim();
  if (!enhancedPrompt) throw new Error("Gemini returned an empty prompt.");
  return enhancedPrompt.slice(0, 1000);
}

function requireMeshyApiKey() {
  if (!hasMeshyApiKey()) {
    throw new Error("MESHY_API_KEY is missing. Add a real Meshy API key in Backend/.env.");
  }
}

async function meshyRequest(endpoint, { method = "GET", body } = {}) {
  requireMeshyApiKey();

  const res = await fetch(`${MESHY_API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!res.ok) {
    const message =
      payload?.task_error?.message ||
      payload?.message ||
      `Meshy request failed with status ${res.status}`;
    throw new Error(message);
  }

  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollMeshyTask(endpoint) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MESHY_TIMEOUT_MS) {
    const task = await meshyRequest(endpoint);
    const status = String(task?.status || "");

    if (status === "SUCCEEDED") return task;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(task?.task_error?.message || `Meshy task ${status.toLowerCase()}.`);
    }

    await sleep(MESHY_POLL_INTERVAL_MS);
  }

  throw new Error("Meshy task timed out before completing.");
}

function toDataUri(filePath, ext) {
  const mimeByExt = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  const mimeType = mimeByExt[ext];
  if (!mimeType) {
    throw new Error("Meshy image-to-3D currently supports JPG and PNG uploads.");
  }
  const buffer = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function generateModelFromImage(filePath, ext) {
  const createTask = await meshyRequest("/openapi/v1/image-to-3d", {
    method: "POST",
    body: {
      image_url: toDataUri(filePath, ext),
      model_type: "standard",
      target_formats: ["glb", "usdz"],
      moderation: false,
    },
  });

  const task = await pollMeshyTask(`/openapi/v1/image-to-3d/${createTask.id}`);
  const modelUrl = task?.model_urls?.glb;
  const iosModelUrl = task?.model_urls?.usdz || "";

  if (!modelUrl) {
    throw new Error("Meshy finished without returning a GLB model URL.");
  }

  return {
    taskId: task.id,
    modelUrl,
    iosModelUrl,
  };
}

async function generateModelFromText(prompt) {
  const previewTask = await meshyRequest("/openapi/v2/text-to-3d", {
    method: "POST",
    body: {
      mode: "preview",
      prompt,
      ai_model: "latest",
      target_formats: ["glb", "usdz"],
      moderation: false,
    },
  });

  const completedPreview = await pollMeshyTask(`/openapi/v2/text-to-3d/${previewTask.id}`);

  const refineTask = await meshyRequest("/openapi/v2/text-to-3d", {
    method: "POST",
    body: {
      mode: "refine",
      preview_task_id: completedPreview.id,
      ai_model: "latest",
      texture_prompt: prompt,
      target_formats: ["glb", "usdz"],
      moderation: false,
    },
  });

  const completedRefine = await pollMeshyTask(`/openapi/v2/text-to-3d/${refineTask.id}`);
  const modelUrl = completedRefine?.model_urls?.glb;
  const iosModelUrl = completedRefine?.model_urls?.usdz || "";

  if (!modelUrl) {
    throw new Error("Meshy finished without returning a GLB model URL.");
  }

  return {
    previewTaskId: completedPreview.id,
    taskId: completedRefine.id,
    modelUrl,
    iosModelUrl,
  };
}

function readProjects() {
  if (!fs.existsSync(projectsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), "utf-8");
}

function createProject({ title, type, source = "", modelUrl = PLACEHOLDER_MODEL_URL, iosModelUrl = "", conversion = "" }) {
  const projects = readProjects();
  const now = new Date();
  const project = {
    id: Date.now(),
    title,
    type,
    source,
    modelUrl,
    iosModelUrl,
    ...(conversion ? { conversion } : {}),
    polygons: Math.floor(Math.random() * 70000 + 5000).toLocaleString(),
    date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    createdAt: now.toISOString(),
  };
  projects.unshift(project);
  writeProjects(projects);
  return project;
}

function getStats() {
  const projects = readProjects();
  const totalUploads = projects.filter((p) => p.type === "Image to 3D" || p.type === "Image Upload").length;
  const totalProjects = projects.length;
  const successRate = totalProjects === 0 ? 100 : Math.round((totalProjects / Math.max(totalProjects, 1)) * 100);
  return {
    totalUploads,
    totalProjects,
    successRate,
    avgProcessingTime: "~2min",
  };
}

async function resolveModelFromPrompt(rawPrompt) {
  const normalized = String(rawPrompt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return null;

  const promptTokens = new Set(getMatchTokens(normalized));
  let bestMatch = null;

  for (const entry of await readObjectCatalog()) {
    const score = scoreTextTo3dModel(normalized, promptTokens, entry);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { entry, score };
    }
  }

  if (!bestMatch || bestMatch.score < 18) return null;

  return {
    keyword: bestMatch.entry.id || bestMatch.entry.keyword,
    label: bestMatch.entry.label,
    modelUrl: bestMatch.entry.modelUrl,
    iosModelUrl: "",
    score: bestMatch.score,
  };
}

function getMatchTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 2 && !MATCH_STOP_WORDS.has(token));
}

function scoreTextTo3dModel(normalizedPrompt, promptTokens, entry) {
  let score = 0;

  if (normalizedPrompt.includes(String(entry.label || entry.keyword).toLowerCase())) {
    score += 100;
  }

  for (const alias of entry.aliases) {
    const normalizedAlias = String(alias).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (normalizedPrompt.includes(normalizedAlias)) {
      score += 120;
    }

    for (const token of getMatchTokens(alias)) {
      if (promptTokens.has(token)) score += 18;
    }
  }

  for (const token of getMatchTokens(entry.description)) {
    if (promptTokens.has(token)) score += 6;
  }

  return score;
}

function getLocalIpv4Address() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const requestHost = String(req.get("host") || `${getLocalIpv4Address()}:${PORT}`);
  const normalizedHost =
    requestHost.includes("localhost") || requestHost.includes("127.0.0.1") || requestHost.includes("0.0.0.0")
      ? `${getLocalIpv4Address()}:${PORT}`
      : requestHost;

  const protocol = req.protocol || "http";
  return `${protocol}://${normalizedHost}`;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "3dverse-backend" });
});

app.get("/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/config", (_req, res) => {
  res.json({
    meshyConfigured: hasMeshyApiKey(),
    geminiConfigured: hasGeminiApiKey(),
  });
});

app.post("/config/gemini", (req, res) => {
  const origin = String(req.get("origin") || "");
  let originHostname = "";
  try {
    originHostname = new URL(origin).hostname;
  } catch {
    originHostname = "";
  }
  const localOrigin = ["localhost", "127.0.0.1", "::1"].includes(originHostname);
  const localAddress = String(req.ip || "").replace(/^::ffff:/, "");
  const localClient = ["127.0.0.1", "::1"].includes(localAddress);
  if (!localOrigin || !localClient) {
    return res.status(403).json({ error: "Gemini keys can only be set from the local development browser." });
  }

  const apiKey = String(req.body?.apiKey || "").trim();
  if (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey)) {
    return res.status(400).json({ error: "Enter a valid Gemini API key." });
  }

  const persist = req.body?.persist === true;
  if (persist) {
    try {
      persistGeminiConfig(localSecretsFile, apiKey, GEMINI_MODEL);
    } catch (error) {
      console.error("Failed to persist local Gemini configuration:", error.message);
      return res.status(500).json({ error: "Could not save the Gemini key locally. You can still connect it for this session." });
    }
  }

  activeGeminiApiKey = apiKey;
  return res.json({ geminiConfigured: true, saved: persist ? "local-file" : "memory" });
});

app.get("/catalog/objects", (_req, res) => {
  Promise.resolve().then(async () => {
    return res.json({
      source: shouldUseMysqlCatalog() ? "mysql" : "json",
      objects: await readObjectCatalog(),
    });
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: "Failed to load object catalog" });
  });
});

app.post("/catalog/objects", (req, res) => {
  Promise.resolve().then(async () => {
    const nextObject = await upsertCatalogObject(req.body);
    if (!nextObject) {
      return res.status(400).json({
        error: "Object requires id or label, modelUrl, description, and optional aliases.",
      });
    }

    const objects = await readObjectCatalog();
    return res.status(201).json({
      source: shouldUseMysqlCatalog() ? "mysql" : "json",
      object: nextObject,
      objects,
    });
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: "Failed to save object catalog item" });
  });
});

app.post("/generate", (req, res) => {
  Promise.resolve().then(async () => {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    if (prompt.length > 500) {
      return res.status(400).json({ error: "Prompt must be 500 characters or fewer." });
    }

    const presetMatch = await resolveModelFromPrompt(prompt);
    let generationPrompt = prompt;
    let geminiEnhanced = false;
    if (!presetMatch && hasGeminiApiKey()) {
      try {
        generationPrompt = await enhancePromptWithGemini(prompt);
        geminiEnhanced = true;
      } catch (error) {
        console.warn("Gemini prompt enhancement failed; using the original prompt:", error.message);
      }
    }
    const result = presetMatch
      ? {
          taskId: null,
          previewTaskId: null,
          modelUrl: presetMatch.modelUrl,
          iosModelUrl: presetMatch.iosModelUrl || "",
        }
      : await generateModelFromText(generationPrompt);

    const project = createProject({
      title: prompt.length > 32 ? `${prompt.slice(0, 29)}...` : prompt,
      type: "Text to 3D",
      source: prompt,
      modelUrl: result.modelUrl,
      iosModelUrl: result.iosModelUrl || "",
    });

    return res.json({
      message: presetMatch
        ? `Closest catalog 3D model loaded: ${presetMatch.label || presetMatch.keyword}`
        : "3D model generated from text prompt",
      modelUrl: project.modelUrl,
      iosModelUrl: project.iosModelUrl,
      project,
      meshyTaskId: result.taskId,
      meshyPreviewTaskId: result.previewTaskId,
      matchedKeyword: presetMatch?.keyword || null,
      matchScore: presetMatch?.score || null,
      geminiEnhanced,
      generationPrompt,
    });
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: error.message || "Failed to generate 3D model" });
  });
});

app.get("/generate/supported-prompts", (_req, res) => {
  Promise.resolve().then(async () => {
    return res.json({
      prompts: (await readObjectCatalog()).map((entry) => ({
        keyword: entry.id || entry.keyword,
        label: entry.label,
        aliases: entry.aliases,
        description: entry.description,
      })).sort((a, b) => a.label.localeCompare(b.label)),
      note: "Type an object name or describe it. The backend scores your prompt against this catalog and returns the closest model.",
    });
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: "Failed to load supported prompts" });
  });
});

app.post("/ai/analyze-floorplan", analysisUpload.single("file"), (req, res) => {
  Promise.resolve().then(async () => {
    if (!hasGeminiApiKey()) {
      return res.status(503).json({ error: "Gemini analysis is not configured. Add GEMINI_API_KEY to Backend/.env and restart the backend." });
    }
    let imageBuffer = req.file?.buffer || null;
    let originalName = req.file?.originalname || "";
    if (!imageBuffer && req.body?.projectId) {
      const project = readProjects().find((item) => String(item.id) === String(req.body.projectId));
      if (!project || !["Blueprint to 3D", "Image Upload"].includes(project.type)) {
        return res.status(404).json({ error: "Saved floor-plan image was not found." });
      }
      const filename = path.basename(String(project.source || ""));
      if (!filename || filename !== String(project.source).replace(/^\/uploads\//, "") || filename.includes("..")) {
        return res.status(400).json({ error: "Saved project does not reference a valid uploaded image." });
      }
      originalName = filename;
      const imagePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ error: "The original uploaded image is no longer available." });
      }
      imageBuffer = fs.readFileSync(imagePath);
    }
    if (!imageBuffer) {
      return res.status(400).json({ error: "Choose a floor-plan image to analyze." });
    }

    const ext = path.extname(originalName).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : [".jpg", ".jpeg"].includes(ext) ? "image/jpeg" : "";
    if (!mimeType) {
      return res.status(400).json({ error: "Gemini floor-plan analysis supports JPG and PNG images." });
    }

    const analysis = await analyzeFloorPlanWithGemini(imageBuffer, mimeType, {
      apiKey: activeGeminiApiKey,
      model: GEMINI_MODEL,
    });
    return res.json({ analysis, provider: "Gemini", model: GEMINI_MODEL });
  }).catch((error) => {
    console.error("Floor-plan Gemini analysis failed:", error.message);
    return res.status(error.status || 500).json({ error: error.message || "Gemini floor-plan analysis failed." });
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  Promise.resolve().then(async () => {
    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) {
      fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      return res.status(400).json({
        error: "Image to 3D currently supports JPG and PNG uploads only.",
      });
    }

    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    if (String(req.body?.mode || "") === "floorplan") {
      const result = await convertFloorPlanToGlb(uploadedFilePath, uploadsDir);
      const modelUrl = `${getPublicBaseUrl(req)}${result.modelUrl}`;
      const project = createProject({
        title: `${path.parse(req.file.originalname).name} 3D building`,
        type: "Blueprint to 3D",
        source: `/uploads/${req.file.filename}`,
        modelUrl,
        conversion: "approximate-floor-plan-extrusion",
      });

      return res.json({
        message: `3D building shell generated from ${result.wallSegments} detected wall segments.`,
        fileUrl: `/uploads/${req.file.filename}`,
        modelUrl: project.modelUrl,
        preserveMaterialColors: true,
        project,
        conversion: "approximate-floor-plan-extrusion",
        dimensions: result.dimensions,
        wallSegments: result.wallSegments,
      });
    }

    if (!hasMeshyApiKey()) {
      const fileUrl = `/uploads/${req.file.filename}`;
      const project = createProject({
        title: req.file.originalname,
        type: "Image Upload",
        source: fileUrl,
        modelUrl: "",
      });

      return res.json({
        message: "Image uploaded for preview. Configure Meshy to convert it to 3D.",
        fileUrl,
        project,
      });
    }

    const result = await generateModelFromImage(uploadedFilePath, ext);
    const project = createProject({
      title: req.file.originalname,
      type: "Image to 3D",
      source: `/uploads/${req.file.filename}`,
      modelUrl: result.modelUrl,
      iosModelUrl: result.iosModelUrl || "",
    });

    return res.json({
      message: "Image uploaded and converted to a 3D model",
      fileUrl: `/uploads/${req.file.filename}`,
      modelUrl: project.modelUrl,
      iosModelUrl: project.iosModelUrl,
      project,
      meshyTaskId: result.taskId,
    });
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: error.message || "Failed to convert image to 3D model" });
  });
});

app.post("/manual-build", (req, res) => {
  const ranges = {
    buildingLength: [4, 40],
    buildingWidth: [4, 30],
    floors: [1, 5],
    rooms: [1, 12],
    doors: [1, 4],
  };
  const values = {};
  for (const [field, [minimum, maximum]] of Object.entries(ranges)) {
    const value = Number(req.body?.[field]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      return res.status(400).json({
        error: `${field} must be a whole number from ${minimum} to ${maximum}.`,
      });
    }
    values[field] = value;
  }
  const { buildingLength, buildingWidth, floors, rooms, doors } = values;

  const cols = Math.ceil(Math.sqrt(Number(rooms)));
  const rows = Math.ceil(Number(rooms) / cols);
  const roomWidth = 300 / cols;
  const roomHeight = 250 / rows;
  const innerWalls = [
    ...Array.from({ length: Math.max(0, cols - 1) }, (_, index) => {
      const x = 60 + (index + 1) * roomWidth;
      return `<line x1="${x}" y1="70" x2="${x}" y2="320" stroke="#7dd3fc" stroke-width="4" />`;
    }),
    ...Array.from({ length: Math.max(0, rows - 1) }, (_, index) => {
      const y = 70 + (index + 1) * roomHeight;
      return `<line x1="60" y1="${y}" x2="360" y2="${y}" stroke="#7dd3fc" stroke-width="4" />`;
    }),
  ].join("");
  const roomLabels = Array.from({ length: Number(rooms) }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 74 + col * roomWidth;
    const y = 96 + row * roomHeight;
    return `<text x="${x}" y="${y}" fill="#bae6fd" font-size="14">Room ${index + 1}</text>`;
  }).join("");
  const doorMarks = Array.from({ length: Number(doors) }, (_, index) => {
    const x = 95 + index * 72;
    return `<line x1="${x}" y1="320" x2="${x + 34}" y2="320" stroke="#07111f" stroke-width="8" />
      <path d="M ${x} 320 A 34 34 0 0 1 ${x + 34} 286" fill="none" stroke="#fbbf24" stroke-width="3" />`;
  }).join("");
  const blueprintSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="840" viewBox="0 0 420 420">
    <rect width="420" height="420" fill="#07111f"/>
    <rect x="60" y="70" width="300" height="250" fill="none" stroke="#e0f2fe" stroke-width="6"/>
    ${innerWalls}
    ${roomLabels}
    ${doorMarks}
    <line x1="60" y1="48" x2="360" y2="48" stroke="#f8fafc" stroke-width="2"/>
    <text x="210" y="36" fill="#f8fafc" font-size="16" text-anchor="middle">${buildingLength} m</text>
    <line x1="382" y1="70" x2="382" y2="320" stroke="#f8fafc" stroke-width="2"/>
    <text x="398" y="198" fill="#f8fafc" font-size="16" text-anchor="middle" transform="rotate(90 398 198)">${buildingWidth} m</text>
    <text x="60" y="356" fill="#bae6fd" font-size="14">${floors} floor(s) • ${rooms} room(s) • ${doors} entrance(s)</text>
  </svg>`;
  const blueprintSvgDataUrl = `data:image/svg+xml;base64,${Buffer.from(blueprintSvg).toString("base64")}`;

  const project = createProject({
    title: `Blueprint ${buildingLength}x${buildingWidth}m`,
    type: "Manual Blueprint",
    source: blueprintSvgDataUrl,
    modelUrl: "",
  });
  return res.json({
    message: "Blueprint generated",
    blueprintSvgDataUrl,
    project,
  });
});

app.get("/projects", (_req, res) => {
  return res.json({ projects: readProjects() });
});

app.post("/projects/:projectId/convert-floorplan", (req, res) => {
  Promise.resolve().then(async () => {
    const project = readProjects().find((item) => String(item.id) === String(req.params.projectId));
    if (!project || !["Image Upload", "Blueprint to 3D"].includes(project.type)) {
      return res.status(404).json({ error: "Saved floor-plan project not found." });
    }

    const filename = path.basename(String(project.source || ""));
    if (!filename || filename !== String(project.source).replace(/^\/uploads\//, "") || filename.includes("..")) {
      return res.status(400).json({ error: "Project does not reference a valid uploaded image." });
    }

    const imagePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: "The original uploaded image is no longer available." });
    }

    const result = await convertFloorPlanToGlb(imagePath, uploadsDir);
    project.type = "Blueprint to 3D";
    project.modelUrl = `${getPublicBaseUrl(req)}${result.modelUrl}`;
    project.iosModelUrl = "";
    project.conversion = "approximate-floor-plan-extrusion";
    writeProjects(readProjects().map((item) => item.id === project.id ? project : item));

    return res.json({
      message: `3D building shell generated from ${result.wallSegments} detected wall segments.`,
      modelUrl: project.modelUrl,
      iosModelUrl: project.iosModelUrl,
      project,
      dimensions: result.dimensions,
      wallSegments: result.wallSegments,
    });
  }).catch((error) => {
    console.error(error);
    const isPlanError = /floor plan|floor-plan|wall area/i.test(error.message || "");
    return res.status(isPlanError ? 422 : 500).json({ error: error.message || "Failed to convert floor plan." });
  });
});

function normalizeModelUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

app.post("/ar/link", (req, res) => {
  const modelUrl = normalizeModelUrl(req.body?.modelUrl);
  const iosModelUrl = req.body?.iosModelUrl ? normalizeModelUrl(req.body.iosModelUrl) : "";
  if (!modelUrl || (req.body?.iosModelUrl && !iosModelUrl)) {
    return res.status(400).json({ error: "A valid HTTP or HTTPS model URL is required." });
  }
  const arUrl = `${getPublicBaseUrl(req)}/ar/view?model=${encodeURIComponent(modelUrl)}${
    iosModelUrl ? `&ios=${encodeURIComponent(iosModelUrl)}` : ""
  }`;

  QRCode.toDataURL(arUrl, { width: 320, margin: 1 })
    .then((qrCodeDataUrl) => {
      return res.json({
        arUrl,
        qrCodeDataUrl,
      });
    })
    .catch(() => {
      return res.json({
        arUrl,
        qrCodeDataUrl: null,
      });
    });
});

app.get("/ar/view", (req, res) => {
  const modelUrl = normalizeModelUrl(req.query?.model) || PLACEHOLDER_MODEL_URL;
  const iosModelUrl = normalizeModelUrl(req.query?.ios);
  const safeModelUrl = escapeHtmlAttribute(modelUrl);
  const iosAttribute = iosModelUrl ? `ios-src="${escapeHtmlAttribute(iosModelUrl)}"` : "";

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3DVerse AR Viewer</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Arial, sans-serif;
        color: white;
        background:
          radial-gradient(circle at top, rgba(34, 211, 238, 0.28), transparent 30%),
          linear-gradient(180deg, #0f172a, #020617 70%);
      }
      .layout {
        display: grid;
        grid-template-rows: auto 1fr auto;
        min-height: 100vh;
      }
      .header,
      .footer {
        padding: 18px 20px;
        text-align: center;
      }
      .header h1 {
        margin: 0 0 8px;
        font-size: 1.4rem;
      }
      .header p,
      .footer p {
        margin: 0;
        color: rgba(226, 232, 240, 0.9);
        line-height: 1.5;
      }
      model-viewer {
        width: 100%;
        height: 100%;
        min-height: 60vh;
        --poster-color: transparent;
        --progress-bar-color: #22d3ee;
        background: transparent;
      }
    </style>
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  </head>
  <body>
    <div class="layout">
      <div class="header">
        <h1>AR View Ready</h1>
        <p>Use the AR button under the model to place this object in your space.</p>
      </div>
      <model-viewer
        src="${safeModelUrl}"
        ${iosAttribute}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        shadow-intensity="1"
        exposure="1"
        environment-image="neutral"
      ></model-viewer>
      <div class="footer">
        <p>Android uses Scene Viewer or WebXR. iPhone uses Quick Look when a USDZ version is available.</p>
      </div>
    </div>
  </body>
</html>`);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`Backend running at http://${HOST}:${PORT}`);
});
