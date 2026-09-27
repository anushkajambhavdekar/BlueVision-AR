# BlueVision

BlueVision is a full-stack web application for creating, previewing, and sharing 3D assets. It combines a React and Vite frontend with a Node.js and Express API. Users can generate models from text or object photos, turn floor plans into approximate 3D building shells, inspect and recolor models, analyze plans with Gemini, create mobile AR links, and build simple 2D blueprints.

For the complete project concept, workflows, feature explanations, and technical limitations, see [Project Description.md](Project%20Description.md).

## Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Provider Setup](#provider-setup)
- [Features](#features)
- [Daily Projects View](#daily-projects-view)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Data and Storage](#data-and-storage)
- [AR Requirements](#ar-requirements)
- [Build and Test](#build-and-test)
- [Project Layout](#project-layout)
- [Troubleshooting](#troubleshooting)

## Requirements

- Node.js 20 or later and npm
- Gemini API key for Gemini floor-plan analysis and optional prompt refinement
- Meshy API key for generated text-to-3D and object-photo-to-3D
- MySQL is optional; JSON files are the default storage for project history and the object catalog

Catalog previews, the local floor-plan-to-GLB converter, the manual 2D blueprint builder, and model viewing do not require provider keys. Gemini analyzes and refines prompts; Meshy generates the downloadable model for free-form text and object-photo workflows. Gemini itself does not generate GLB model files in this application.

## Quick Start

Run these commands from the repository root in PowerShell:

```powershell
npm install
npm install --prefix Backend
npm install --prefix Frontend
Copy-Item Backend/.env.example Backend/.env
npm run dev
```

The default addresses are:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`

The root `npm run dev` starts both applications. To run them separately, start `npm run dev:backend` and `npm run dev:frontend` from the root in two terminals. The root `predev` script stops processes on ports 5000 and 5173 before starting development servers.

If port 5173 is already occupied, Vite may select another port. Use the URL printed by Vite. The frontend API address is configured with `VITE_API_BASE_URL` and defaults to `http://localhost:5000`.

## Provider Setup

### Gemini

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Blueprint to 3D panel, paste it into the Gemini setup field and select **Connect Gemini**.
3. Optionally check **Remember this key on this computer** before connecting. Select a local floor-plan image or choose one of the saved floor plans, then select **Analyze with Gemini**.

A key entered in the local setup panel is never stored in browser storage. With **Remember this key on this computer** checked, the local backend stores it in `Backend/.env.local`, which is ignored by Git and loaded when the backend starts. Without that option, it remains in backend memory and is cleared when the backend restarts. The key-setup endpoint is restricted to a loopback browser/backend connection. The default model is `gemini-3.8-flash`; override it with `GEMINI_MODEL` in `Backend/.env` or `Backend/.env.local` if needed.

Never put a provider key in frontend source code or commit it to a repository. If a key is pasted into chat, screenshots, or another shared location, revoke it and create a replacement before connecting it.

### Meshy

Set `MESHY_API_KEY` in `Backend/.env`, then restart the backend. Meshy is used for free-form text-to-3D and object-photo-to-3D. Catalog matches and local floor-plan extrusion do not need Meshy.

**Secret warning:** `Backend/.env` is tracked in this checkout. Prefer the UI's **Remember this key on this computer** option, which writes to ignored `Backend/.env.local`. Before placing any real key in tracked `Backend/.env`, remove it from Git tracking while retaining your local copy:

```powershell
git rm --cached Backend/.env
```

The `.gitignore` excludes environment files for future untracked files. If a real key was committed or shared previously, revoke it and create a replacement.

## Features

- **Text to 3D:** A prompt is checked against the object catalog. A match opens the catalog GLB directly. Other prompts can be refined by Gemini and are submitted to Meshy for generation. Free-form 3D generation requires Meshy.
- **Blueprint to 3D:** The Floor plan mode accepts JPG/PNG top-down floor plans. Sharp decodes the image; the backend detects prominent horizontal and vertical line segments and extrudes a floor slab and walls into a GLB. The floor, exterior walls, and interior partitions have separate materials and colors. This local conversion requires no provider key.
- **Gemini floor-plan analysis:** Sends a selected image to Gemini Vision and displays a summary, visible-space candidates, layout observations, and suggestions. The analysis is advisory, not a measured plan or a structural/code review.
- **Object photo to 3D:** The Object photo mode accepts JPG/PNG. Without Meshy, it saves an image preview. With Meshy, it requests a generated GLB and a USDZ when the provider supplies one.
- **3D viewer:** Interactive rotation, camera presets, fullscreen, material controls, and AR support. Floor-plan models have separate floor/exterior/interior color pickers, Original/Coastal/Terracotta/Forest/Graphite palettes, reset, roughness, and metalness controls.
- **AR sharing:** Builds a mobile viewer URL and QR code for the currently loaded GLB. iPhone Quick Look requires a USDZ asset; not every catalog model includes one.
- **Manual Blueprint Builder:** Creates a saved 2D SVG floor plan from length, width, floors, rooms, and entrance counts. It is a 2D blueprint tool, not a 3D building generator.
- **Today's Projects:** The gallery displays projects whose stored date matches the user's current local date. Older project records remain in storage and are hidden from this gallery view; they are not deleted.
- **Object catalog:** Catalog records can be read or edited through the backend. The default catalog is JSON; MySQL is optional.

## Daily Projects View

The Recent Projects section is intentionally scoped to today's date. It compares each project's stored `date` with the current browser date formatted as `en-US` (for example, `Sep 27, 2026`). The refresh action reloads project data but keeps the same date filter. Older records remain in `Backend/data/projects.json` and are not removed by this view.

## Configuration

Backend settings are read from `Backend/.env` when the backend starts:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Backend port |
| `HOST` | `0.0.0.0` | Backend bind address |
| `PUBLIC_BASE_URL` | Auto-detected | Backend origin embedded in AR links; set this to a phone-reachable address for local-network use |
| `GEMINI_API_KEY` | Empty | Gemini API key |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model identifier |
| `MESHY_API_KEY` | Empty | Meshy text/image-to-3D API key |
| `DB_TYPE` | `json` | Object catalog storage: `json` or `mysql` |
| `DB_HOST` | `localhost` | MySQL host when using MySQL |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | Empty | MySQL password |
| `DB_NAME` | `BlueVision` | MySQL database |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Frontend API origin; set in `Frontend/.env` and restart Vite |

To use MySQL for the catalog, create the schema with `Database/mysql-schema.sql`, set `DB_TYPE=mysql`, and configure the connection variables. Project history continues to use its JSON file.

## API Reference

The backend defaults to `http://localhost:5000`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend health check |
| `GET` | `/config` | Provider configured status; does not return keys |
| `POST` | `/config/gemini` | Set a memory-only Gemini key from a local browser; JSON `{ "apiKey": "..." }` |
| `GET` | `/stats` | Project/upload summary |
| `GET` | `/projects` | Read all saved project records |
| `GET` | `/catalog/objects` | Read the object catalog |
| `POST` | `/catalog/objects` | Add or update a catalog item |
| `GET` | `/generate/supported-prompts` | List catalog prompt examples |
| `POST` | `/generate` | Load a catalog match or request free-form text-to-3D; JSON `{ "prompt": "a wooden chair" }` |
| `POST` | `/ai/analyze-floorplan` | Gemini image analysis; multipart JPG/PNG field `file` |
| `POST` | `/upload` | Image upload; multipart field `file`, optional `mode=floorplan` or `mode=object` |
| `POST` | `/projects/:projectId/convert-floorplan` | Convert or refresh a saved floor-plan image as a GLB shell |
| `POST` | `/manual-build` | Generate a 2D SVG; JSON `{ "buildingLength": 12, "buildingWidth": 8, "floors": 1, "rooms": 4, "doors": 1 }` |
| `POST` | `/ar/link` | Create a mobile viewer URL and QR; JSON `{ "modelUrl": "https://...", "iosModelUrl": "https://..." }` |
| `GET` | `/ar/view` | Standalone mobile AR viewer |
| `GET` | `/uploads/:filename` | Serve uploaded source images and generated GLBs |

Manual blueprint values are whole numbers in these ranges: length 4-40 m, width 4-30 m, floors 1-5, rooms 1-12, and doors 1-4.

## Data and Storage

- `Backend/data/projects.json`: all generated/uploaded project records, including older records hidden from Today's Projects.
- `Backend/data/objectCatalog.json`: default JSON object catalog.
- `Backend/data/textPromptDataset.csv`: prompt examples and catalog IDs used for catalog matching.
- `Backend/uploads/`: uploaded source images and locally generated floor-plan GLBs.
- `Database/mysql-schema.sql`: optional MySQL schema and initial catalog data.

There is no delete operation in the Today-only gallery change; filtering affects only what the frontend displays.

## AR Requirements

A QR link must point to a backend and a model URL reachable from the phone. `localhost` on a phone refers to the phone, not the development computer. For local testing, use the computer's LAN IP and keep both devices on the same network. Set `PUBLIC_BASE_URL` if the backend cannot infer the right host.

WebXR requires HTTPS except on localhost. Deploy the frontend/backend behind HTTPS for production AR. Android may use WebXR or Scene Viewer. iPhone Quick Look requires USDZ; some catalog GLBs cannot launch Quick Look.

## Build and Test

```powershell
npm run build
npm --prefix Backend test
```

The frontend command creates the Vite production build. Backend tests cover floor-plan GLB conversion and Gemini request parsing with a mocked provider response; they do not call Gemini or Meshy online.

## Project Layout

```text
Backend/       Express API, provider integration, JSON data, uploaded assets, tests
Database/      Optional MySQL schema and setup notes
Frontend/      React, TypeScript, Vite UI, viewer, workflows
README.md      Setup, configuration, API, and operations guide
Project Description.md  Full functional and technical project description
```

## Troubleshooting

- **Frontend cannot reach the API:** Check `VITE_API_BASE_URL`, confirm the backend is running, and open `/health` on the configured API host.
- **Gemini reports not configured:** Enter a key through the local setup panel or set `GEMINI_API_KEY` in `Backend/.env`; restart the backend after environment changes.
- **Gemini model is unavailable:** Set `GEMINI_MODEL` to an available model for the key/account and restart the backend.
- **Gemini analysis is disabled:** Connect Gemini and select a local JPG/PNG or a saved floor-plan project.
- **Text prompt does not create a new model:** Catalog matches load without a provider. New free-form GLB generation requires `MESHY_API_KEY`.
- **Floor plan produces no shell:** Use a clear top-down image with high contrast and long visible horizontal/vertical wall lines. Perspective photos, elevations, decorative plans, and faint lines may not convert.
- **Phone cannot open an AR QR link:** Set `PUBLIC_BASE_URL` to an address reachable from the phone; use HTTPS for deployed WebXR.
- **MySQL connection fails:** Check `DB_TYPE`, database/schema, host, port, and credentials. JSON is the default catalog backend.
#   A R - B l u e V i s i o n  
 #   A R - B l u e V i s i o n  
 #   A R - B l u e V i s i o n  
 #   A R - B l u e V i s i o n  
 