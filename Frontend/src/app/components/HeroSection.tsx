import React from "react";
import { Upload, Sparkles, QrCode } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { TEXT_TO_3D_PRESETS, getPresetAssetFromPrompt, type TextTo3dCatalogObject } from '../lib/textTo3d';
import type { ViewerAsset } from '../App';

type HeroSectionProps = {
  setViewerAsset: (asset: ViewerAsset) => void;
  onProjectCreated?: () => void;
};

export function HeroSection({ setViewerAsset, onProjectCreated }: HeroSectionProps) {
  const [prompt, setPrompt] = useState("chair");
  const [isGenerating, setIsGenerating] = useState(false);
  const [catalog, setCatalog] = useState<TextTo3dCatalogObject[]>(TEXT_TO_3D_PRESETS);
  const [geminiConfigured, setGeminiConfigured] = useState(false);

  useEffect(() => {
    apiFetch<{ objects: TextTo3dCatalogObject[] }>("/catalog/objects")
      .then((data) => setCatalog(data.objects))
      .catch((error) => console.error(error));
    apiFetch<{ geminiConfigured: boolean }>("/config")
      .then((data) => setGeminiConfigured(data.geminiConfigured))
      .catch((error) => console.error(error));
  }, []);

  const handleUpload = () => {
    window.scrollTo({ top: 700, behavior: "smooth" });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Please enter a meaningful prompt");
      return;
    }

    try {
      setIsGenerating(true);
      const data = await apiFetch<{ modelUrl: string; iosModelUrl?: string; message?: string }>("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });
      setViewerAsset({ kind: "model", url: data.modelUrl, iosUrl: data.iosModelUrl });
      onProjectCreated?.();
      alert(data.message || "3D model is ready.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to generate 3D model ❌");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAR = () => {
    window.scrollTo({ top: 1500, behavior: "smooth" });
  };

  const handlePresetClick = (keyword: string) => {
    setPrompt(keyword);
    const presetAsset = getPresetAssetFromPrompt(keyword, catalog);
    if (presetAsset) {
      setViewerAsset(presetAsset);
    }
  };

  return (
    <motion.section className="p-12">
      <h1 className="text-5xl text-white mb-6">
        Convert Ideas into 3D Instantly
      </h1>

      <div className="mb-4 max-w-xl">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Try: a music speaker, green fruit, camping light, wooden seat'
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
      </div>
      <p className="mb-4 text-sm text-gray-400">
        Gemini prompt refinement {geminiConfigured ? "is enabled" : "is optional and not configured"}.
      </p>
      <div className="mb-6 flex max-w-3xl flex-wrap gap-2">
        {catalog.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.aliases[0])}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/20 hover:text-white"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex gap-4">

        <motion.button
          onClick={handleUpload}
          className="px-6 py-3 bg-blue-500 text-white rounded-xl flex gap-2"
        >
          <Upload className="w-5 h-5" />
          Upload Blueprint
        </motion.button>

        <motion.button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-6 py-3 bg-gray-700 text-white rounded-xl flex gap-2"
        >
          <Sparkles className="w-5 h-5" />
          {isGenerating ? "Generating..." : "Generate 3D"}
        </motion.button>

        <motion.button
          onClick={handleAR}
          className="px-6 py-3 bg-gray-700 text-white rounded-xl flex gap-2"
        >
          <QrCode className="w-5 h-5" />
          Try AR
        </motion.button>

      </div>
    </motion.section>
  );
}
