import { Download, Maximize2, RotateCw, Share2, ZoomIn, ZoomOut } from "lucide-react";
import { motion } from "motion/react";
import type { ViewerAsset } from "../App";

type Props = {
  viewerAsset: ViewerAsset | null;
};

function escapeHtmlAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function getEmbeddedViewerSrcDoc(modelUrl: string, iosModelUrl = "", preserveMaterialColors = false) {
  const safeModelUrl = escapeHtmlAttribute(modelUrl);
  const iosModelAttribute = iosModelUrl ? `ios-src="${escapeHtmlAttribute(iosModelUrl)}"` : "";
  const baseColorControl = preserveMaterialColors
    ? `<label>Palette
        <select id="palettePreset">
          <option value="original">Original</option>
          <option value="coastal">Coastal</option>
          <option value="terracotta">Terracotta</option>
          <option value="forest">Forest</option>
          <option value="graphite">Graphite</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>Floor <input data-part-color="floor" type="color" value="#b87a47" /></label>
      <label>Exterior walls <input data-part-color="exterior" type="color" value="#e0d4ad" /></label>
      <label>Interior walls <input data-part-color="interior" type="color" value="#4a949b" /></label>
      <button id="resetColors" type="button">Reset colors</button>`
    : `<label>Base color <input id="baseColor" type="color" value="#ffffff" /></label>
      <button id="resetColors" type="button">Reset colors</button>`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: radial-gradient(circle at top, #111827, #000000 70%);
        overflow: hidden;
      }
      model-viewer {
        width: 100%;
        height: 100%;
        --progress-bar-color: #06b6d4;
        --poster-color: transparent;
      }
      .hint {
        position: absolute;
        left: 16px;
        bottom: 16px;
        padding: 10px 14px;
        color: white;
        background: rgba(0, 0, 0, 0.55);
        border-radius: 10px;
        font: 14px/1.2 sans-serif;
        pointer-events: none;
      }
      .toolbar {
        position: absolute;
        top: 16px;
        left: 16px;
        right: 16px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        pointer-events: none;
      }
      .tabs, .panel {
        display: flex;
        gap: 8px;
        pointer-events: auto;
      }
      button, select, input {
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 10px;
        background: rgba(0,0,0,.58);
        color: white;
        padding: 10px 12px;
        font: 14px/1 sans-serif;
      }
      button.active {
        background: rgba(14,165,233,.9);
      }
      .panel {
        position: absolute;
        top: 64px;
        left: 16px;
        min-width: 240px;
        flex-direction: column;
        padding: 14px;
        border-radius: 16px;
        background: rgba(0,0,0,.66);
        color: white;
        font: 14px/1.4 sans-serif;
      }
      .panel[hidden] {
        display: none;
      }
      label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      input[type="color"] {
        width: 54px;
        height: 36px;
        padding: 4px;
      }
      input[type="range"] {
        width: 120px;
      }
      select {
        min-width: 132px;
        text-align: left;
      }
    </style>
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  </head>
  <body>
    <model-viewer id="viewer"
      src="${safeModelUrl}"
      ${iosModelAttribute}
      camera-controls
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      environment-image="neutral"
      interaction-prompt="auto"
      ar
      ar-modes="webxr scene-viewer quick-look"
    ></model-viewer>
    <div class="toolbar">
      <div class="tabs">
        <button data-tab="edit" class="active">Edit</button>
        <button data-tab="camera">Camera</button>
        <button data-tab="color">Color</button>
      </div>
    </div>
    <div id="edit" class="panel">
      <strong>Edit model</strong>
      <label>
        Auto rotate
        <input id="autorotate" type="checkbox" checked />
      </label>
      <label>
        Rotation speed
        <input id="rotationSpeed" type="range" min="0" max="60" value="30" />
      </label>
      <button id="resetPose">Reset view</button>
    </div>
    <div id="camera" class="panel" hidden>
      <strong>Camera</strong>
      <button data-camera="front">Front</button>
      <button data-camera="side">Side</button>
      <button data-camera="top">Top</button>
      <button data-camera="default">Default</button>
    </div>
    <div id="color" class="panel" hidden>
      <strong>Color</strong>
      ${baseColorControl}
      <label>
        Roughness
        <input id="roughness" type="range" min="0" max="1" step="0.05" value="0.5" />
      </label>
      <label>
        Metalness
        <input id="metalness" type="range" min="0" max="1" step="0.05" value="0.1" />
      </label>
    </div>
    <div class="hint">Drag to rotate. Scroll to zoom.</div>
    <script>
      const viewer = document.getElementById('viewer');
      const tabs = document.querySelectorAll('[data-tab]');
      const panels = document.querySelectorAll('.panel');
      const autoRotate = document.getElementById('autorotate');
      const rotationSpeed = document.getElementById('rotationSpeed');
      const resetPose = document.getElementById('resetPose');
      const baseColor = document.getElementById('baseColor');
      const palettePreset = document.getElementById('palettePreset');
      const partColorInputs = document.querySelectorAll('[data-part-color]');
      const roughness = document.getElementById('roughness');
      const metalness = document.getElementById('metalness');
      let customColorApplied = false;
      const originalPartColors = { floor: '#b87a47', exterior: '#e0d4ad', interior: '#4a949b' };
      const colorPalettes = {
        coastal: { floor: '#a77d59', exterior: '#e6f0e8', interior: '#438a96' },
        terracotta: { floor: '#a95d3c', exterior: '#f0d5b0', interior: '#bd765f' },
        forest: { floor: '#806149', exterior: '#d6d2ad', interior: '#5b805f' },
        graphite: { floor: '#62676d', exterior: '#cbd0d2', interior: '#798d9c' }
      };

      function applyPartColor(partName, color) {
        if (!viewer.model) return;
        viewer.model.materials.forEach((material) => {
          const name = String(material.name || '').toLowerCase();
          const matchesPart = partName === 'floor'
            ? name.includes('floor')
            : partName === 'exterior'
              ? name.includes('exterior')
              : name.includes('interior');
          if (matchesPart) material.pbrMetallicRoughness.setBaseColorFactor(color);
        });
      }

      function applyPalette(palette) {
        const colors = palette === 'original' ? originalPartColors : colorPalettes[palette];
        if (!colors) return;
        partColorInputs.forEach((input) => {
          input.value = colors[input.dataset.partColor];
          applyPartColor(input.dataset.partColor, input.value);
        });
      }

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((item) => item.classList.remove('active'));
          panels.forEach((panel) => panel.hidden = true);
          tab.classList.add('active');
          document.getElementById(tab.dataset.tab).hidden = false;
        });
      });

      autoRotate.addEventListener('change', () => {
        viewer.autoRotate = autoRotate.checked;
      });

      rotationSpeed.addEventListener('input', () => {
        viewer.setAttribute('rotation-per-second', rotationSpeed.value + 'deg');
      });

      resetPose.addEventListener('click', () => {
        viewer.cameraOrbit = '0deg 75deg 105%';
        viewer.cameraTarget = 'auto auto auto';
        viewer.fieldOfView = '45deg';
      });

      document.querySelectorAll('[data-camera]').forEach((button) => {
        button.addEventListener('click', () => {
          const preset = button.dataset.camera;
          const cameraByPreset = {
            front: '0deg 75deg 105%',
            side: '90deg 75deg 105%',
            top: '0deg 0deg 120%',
            default: '0deg 75deg 105%'
          };
          viewer.cameraOrbit = cameraByPreset[preset];
        });
      });

      function updateMaterials() {
        if (!viewer.model) return;
        viewer.model.materials.forEach((material) => {
          if (customColorApplied && baseColor) {
            material.pbrMetallicRoughness.setBaseColorFactor(baseColor.value);
          }
          material.pbrMetallicRoughness.setRoughnessFactor(Number(roughness.value));
          material.pbrMetallicRoughness.setMetallicFactor(Number(metalness.value));
        });
      }

      viewer.addEventListener('load', updateMaterials);
      baseColor?.addEventListener('input', () => {
        customColorApplied = true;
        updateMaterials();
      });
      partColorInputs.forEach((input) => {
        input.addEventListener('input', () => {
          palettePreset.value = 'custom';
          applyPartColor(input.dataset.partColor, input.value);
        });
      });
      palettePreset?.addEventListener('change', () => applyPalette(palettePreset.value));
      document.getElementById('resetColors')?.addEventListener('click', () => {
        if (palettePreset) {
          palettePreset.value = 'original';
          applyPalette('original');
        }
        if (baseColor) {
          baseColor.value = '#ffffff';
          customColorApplied = false;
        }
        roughness.value = '0.5';
        metalness.value = '0.1';
        updateMaterials();
      });
      roughness.addEventListener('input', updateMaterials);
      metalness.addEventListener('input', updateMaterials);
    </script>
  </body>
</html>`;
}

export function ViewerSection({ viewerAsset }: Props) {
  const assetUrl = viewerAsset?.url || "";
  const viewerSrcDoc = viewerAsset?.kind === "model"
    ? getEmbeddedViewerSrcDoc(assetUrl, viewerAsset.iosUrl, viewerAsset.preserveMaterialColors)
    : "";

  const openAsset = () => {
    if (!assetUrl) return alert("No file loaded yet");
    window.open(assetUrl, "_blank", "noopener,noreferrer");
  };

  const shareAsset = async () => {
    if (!assetUrl) return alert("No file loaded yet");
    try {
      await navigator.clipboard.writeText(assetUrl);
      alert("Link copied successfully.");
    } catch {
      alert("Unable to copy link");
    }
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden"
    >
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">3D Viewer</h2>
          <p className="text-gray-400">
            {viewerAsset?.kind === "model"
              ? "Interactive model preview with 360 rotation and AR support"
              : "Uploaded image preview"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={openAsset}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={shareAsset}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative aspect-video bg-black">
        {!viewerAsset ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Upload an image or generate a model to see it here
          </div>
        ) : viewerAsset.kind === "model" ? (
          <iframe
            key={assetUrl}
            srcDoc={viewerSrcDoc}
            title="3D model viewer"
            className="h-full w-full border-0"
            allow="camera; fullscreen; xr-spatial-tracking"
          />
        ) : viewerAsset.kind === "image" ? (
          <img src={assetUrl} alt="Uploaded source" className="h-full w-full object-contain" />
        ) : viewerAsset.kind === "pdf" ? (
          <iframe
            key={assetUrl}
            src={assetUrl}
            title="Uploaded PDF"
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-gray-300 px-6">
            <div>This file type cannot be previewed directly in the browser.</div>
            <button
              onClick={openAsset}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition"
            >
              Open Uploaded File
            </button>
          </div>
        )}

        {viewerAsset && (
          <div className="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-none">
            <div className="px-4 py-2 bg-black/60 text-white text-sm rounded">
              {viewerAsset.kind === "model" ? "Model Loaded" : "Image Loaded"}
            </div>
            <div className="px-4 py-2 bg-black/60 text-white text-sm rounded">
              {viewerAsset.kind === "model" ? "Drag to rotate" : "Scroll to inspect"}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-white/10 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() =>
              alert(
                viewerAsset?.kind === "model"
                  ? "Drag inside the viewer to rotate the 3D model"
                  : "Use the viewer area to inspect the uploaded image"
              )
            }
            className="px-4 py-2 bg-white/5 text-white rounded flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Rotate
          </button>
          <button
            onClick={() =>
              alert(
                viewerAsset?.kind === "model"
                  ? "Use your mouse wheel or trackpad pinch inside the viewer to zoom in"
                  : "Browser zoom controls apply to uploaded image previews"
              )
            }
            className="px-4 py-2 bg-white/5 text-white rounded flex items-center gap-2"
          >
            <ZoomIn className="w-4 h-4" />
            Zoom In
          </button>
          <button
            onClick={() =>
              alert(
                viewerAsset?.kind === "model"
                  ? "Use your mouse wheel or trackpad pinch inside the viewer to zoom out"
                  : "Browser zoom controls apply to uploaded image previews"
              )
            }
            className="px-4 py-2 bg-white/5 text-white rounded flex items-center gap-2"
          >
            <ZoomOut className="w-4 h-4" />
            Zoom Out
          </button>
          <button
            onClick={() => {
              if (viewerAsset?.kind !== "model") {
                openAsset();
                return;
              }
              const iframe = document.querySelector('iframe[title="3D model viewer"]') as HTMLIFrameElement | null;
              iframe?.requestFullscreen?.();
            }}
            className="px-4 py-2 bg-white/5 text-white rounded flex items-center gap-2"
          >
            <Maximize2 className="w-4 h-4" />
            {viewerAsset?.kind === "model" ? "Fullscreen" : "Open File"}
          </button>
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 bg-cyan-500/20 text-cyan-400 text-sm">
            {viewerAsset?.kind === "model" ? "3D Mode" : "Image Mode"}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
