# 3DVerse Backend

## Setup

1. Install dependencies with `npm install --prefix Backend` from the repository root.
2. Copy `.env.example` to `.env` and add provider keys as needed.
3. Start the API with `npm run dev` from `Backend/`, or `npm run dev:backend` from the root.

The API listens on `http://localhost:5000` by default. See the root `README.md` for full frontend, database, and AR setup.

## Providers

- `GEMINI_API_KEY` optionally refines free-form text prompts. If Gemini is unavailable, the original prompt is used.
- The floor-plan analysis panel can configure Gemini from a local browser. Checking **Remember this key on this computer** stores it in Git-ignored `Backend/.env.local`; otherwise it remains memory-only and clears at restart. The setup endpoint only accepts loopback requests.
- `MESHY_API_KEY` is required to generate new free-form text and object-photo 3D assets. Catalog matches, manual blueprints, and approximate floor-plan extrusion do not require it.
- `GEMINI_MODEL` defaults to `gemini-3.8-flash`.
- `PUBLIC_BASE_URL` can be set to the backend's public origin so phone AR links use a reachable address.

## Endpoints

- `GET /health`
- `GET /config`
- `POST /config/gemini` (local browser only; JSON body `{ "apiKey": "..." }`; memory-only until restart)
- `GET /stats`
- `POST /upload` (form-data key: `file`)
- `POST /generate` (json: `{ "prompt": "..." }`)
- `POST /ai/analyze-floorplan` (multipart form-data image field: `file`; requires `GEMINI_API_KEY`)
- `POST /manual-build` (json: `{ "buildingLength": 12, "buildingWidth": 8, "floors": 1, "rooms": 4, "doors": 1 }`)
- `POST /ar/link` (json: `{ "modelUrl": "..." }`)
- `GET /ar/view` (standalone mobile AR viewer)
- `GET /projects`
- `POST /projects/:projectId/convert-floorplan` (convert an existing image-preview upload)
- `GET /catalog/objects`
- `GET /generate/supported-prompts`

## Behavior

- Uploaded files are stored in `Backend/uploads`; without a Meshy key, uploaded JPG/PNG files are saved as image-preview projects rather than rejected.
- Project metadata is stored in `Backend/data/projects.json`.
- AR endpoint returns:
  - `arUrl` (open in mobile browser)
  - `qrCodeDataUrl` (PNG data URL for QR download/display)
- Text-to-3D first checks `data/objectCatalog.json` for the closest object match.
- `data/objectCatalog.json` is the live catalog used by the website.
- `data/textPromptDataset.csv` contains example prompts mapped to catalog object IDs; use it to expand aliases, test matching, or later train a smarter classifier.
- You can inspect supported prompts from `GET /generate/supported-prompts`.
- Uploads with `mode=floorplan` are converted locally to an approximate single-storey GLB shell using Sharp image decoding and detected wall strokes. The GLB has separate stone-floor, ivory-exterior-wall, and teal-interior-wall materials; use a clear top-down plan.
- `POST /ai/analyze-floorplan` sends the selected floor-plan image to Gemini Vision and returns structured room candidates, layout observations, and recommendations for display in the upload panel. It requires `GEMINI_API_KEY`.
- Uploads with `mode=object` use Meshy for 3D conversion when configured, otherwise they are saved as image previews.
- Run floor-plan conversion tests with `npm test` from `Backend/`.
- Manual Builder validates dimensions and generates a saved 2D SVG blueprint; it does not generate a 3D building.
