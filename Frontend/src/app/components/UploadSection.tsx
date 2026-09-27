import React from "react";
import { Upload, FileImage, FileText, File, Sparkles, ExternalLink, Eye, EyeOff, KeyRound } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { apiFetch, API_BASE_URL, resolveApiUrl } from "../lib/api";
import type { ViewerAsset } from "../App";

type UploadSectionProps = {
  setViewerAsset: (asset: ViewerAsset) => void;
  onProjectCreated: () => void;
};

type StatsResponse = {
  totalUploads: number;
  successRate: number;
  avgProcessingTime: string;
};

type ConfigResponse = {
  meshyConfigured: boolean;
  geminiConfigured: boolean;
};

type FloorPlanAnalysis = {
  summary: string;
  spaces: { name: string; location: string; evidence: string }[];
  layoutObservations: string[];
  recommendations: string[];
};

type SavedPlan = {
  id: number;
  title: string;
  source: string;
  type: string;
};

function getUploadedAsset(fileUrl: string): ViewerAsset {
  const normalizedUrl = resolveApiUrl(fileUrl);
  const lower = fileUrl.toLowerCase();
  if (lower.endsWith(".pdf")) return { kind: "pdf", url: normalizedUrl };
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg")) {
    return { kind: "image", url: normalizedUrl };
  }
  return { kind: "file", url: normalizedUrl };
}

function getUploadViewerAsset(data: { modelUrl?: string; iosModelUrl?: string; fileUrl?: string; preserveMaterialColors?: boolean }): ViewerAsset | null {
  if (data.modelUrl) {
    return {
      kind: "model",
      url: data.modelUrl,
      iosUrl: data.iosModelUrl,
      preserveMaterialColors: data.preserveMaterialColors,
    };
  }
  if (data.fileUrl) {
    return getUploadedAsset(data.fileUrl);
  }
  return null;
}

export function UploadSection({ setViewerAsset, onProjectCreated }: UploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [uploadMode, setUploadMode] = useState<"floorplan" | "object">("floorplan");
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState<StatsResponse>({
    totalUploads: 0,
    successRate: 100,
    avgProcessingTime: "~2min",
  });
  const [meshyConfigured, setMeshyConfigured] = useState(true);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [analysis, setAnalysis] = useState<FloorPlanAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [rememberGeminiKey, setRememberGeminiKey] = useState(false);
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);
  const [geminiSetupMessage, setGeminiSetupMessage] = useState("");

  const loadStats = async () => {
    try {
      const data = await apiFetch<StatsResponse>("/stats");
      setStats(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadConfig = async () => {
    try {
      const data = await apiFetch<ConfigResponse>("/config");
      setMeshyConfigured(data.meshyConfigured);
      setGeminiConfigured(data.geminiConfigured);
    } catch (error) {
      console.error(error);
    }
  };

  const loadSavedPlans = async () => {
    try {
      const data = await apiFetch<{ projects: SavedPlan[] }>("/projects");
      const plans = data.projects.filter((project) =>
        ["Blueprint to 3D", "Image Upload"].includes(project.type) && /\.(png|jpe?g)$/i.test(project.source)
      );
      setSavedPlans(plans);
      setSelectedPlanId((currentId) =>
        plans.some((plan) => String(plan.id) === currentId) ? currentId : String(plans[0]?.id || "")
      );
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadStats();
    loadConfig();
    loadSavedPlans();
  }, []);

  const analyzeFloorPlan = async () => {
    if (!file && !selectedPlanId) {
      setAnalysisError("Choose a JPG or PNG floor plan first.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      } else {
        const selectedPlan = savedPlans.find((plan) => String(plan.id) === selectedPlanId);
        if (!selectedPlan) throw new Error("The selected saved plan is no longer available.");
        const imageResponse = await fetch(resolveApiUrl(selectedPlan.source));
        if (!imageResponse.ok) throw new Error("Could not load the selected saved floor plan.");
        const imageBlob = await imageResponse.blob();
        const fileName = selectedPlan.source.split("/").pop() || "floor-plan.jpg";
        formData.append("file", imageBlob, fileName);
      }

      const response = await fetch(`${API_BASE_URL}/ai/analyze-floorplan`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Gemini analysis failed.");
      setAnalysis(data.analysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Gemini analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveGeminiApiKey = async () => {
    setGeminiSetupMessage("");
    try {
      setIsSavingGeminiKey(true);
      const result = await apiFetch<{ geminiConfigured: boolean; saved: "memory" | "local-file" }>("/config/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiApiKey, persist: rememberGeminiKey }),
      });
      setGeminiApiKey("");
      setGeminiConfigured(true);
      setGeminiSetupMessage(result.saved === "local-file"
        ? "Gemini key saved in the ignored Backend/.env.local file and will be available after backend restarts."
        : "Gemini is ready for this backend session. The key will be cleared when the backend restarts.");
    } catch (error) {
      setGeminiSetupMessage(error instanceof Error ? error.message : "Could not configure Gemini.");
    } finally {
      setIsSavingGeminiKey(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a JPG or PNG image.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", uploadMode);

    try {
      setIsUploading(true);
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      const viewerAsset = getUploadViewerAsset(data);
      if (viewerAsset) {
        setViewerAsset(viewerAsset);
      }

      onProjectCreated();
      loadStats();
      loadSavedPlans();
      alert(data.modelUrl
        ? data.message || "3D model generated successfully."
        : "Image uploaded. It is available in the viewer and Recent Projects; add a Meshy key to convert it to 3D.");
      setFile(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8"
    >
      <h2 className="text-2xl font-bold text-white mb-2">Blueprint to 3D</h2>
      <p className="text-gray-400 mb-6">
        Convert a top-down floor plan into an approximate 3D building shell, or choose an object photo for image-to-3D.
      </p>
      <div className="mb-6 flex w-fit max-w-full gap-1 rounded-lg border border-white/10 bg-black/20 p-1" role="group" aria-label="Upload type">
        <button
          type="button"
          aria-pressed={uploadMode === "floorplan"}
          onClick={() => setUploadMode("floorplan")}
          className={`rounded-md px-4 py-2 text-sm transition ${uploadMode === "floorplan" ? "bg-cyan-500 text-white" : "text-gray-300 hover:bg-white/10"}`}
        >
          Floor plan
        </button>
        <button
          type="button"
          aria-pressed={uploadMode === "object"}
          onClick={() => setUploadMode("object")}
          className={`rounded-md px-4 py-2 text-sm transition ${uploadMode === "object" ? "bg-cyan-500 text-white" : "text-gray-300 hover:bg-white/10"}`}
        >
          Object photo
        </button>
      </div>
      {uploadMode === "object" && !meshyConfigured && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Object image upload and preview are available. Object-to-3D conversion needs a Meshy API key in `Backend/.env`.
        </div>
      )}

      <div
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);

          const droppedFile = e.dataTransfer.files[0];
          if (droppedFile) {
            setFile(droppedFile);
            setSelectedPlanId("");
            setAnalysis(null);
            setAnalysisError("");
          }
        }}
        className={`relative rounded-xl border-2 border-dashed p-12 transition-all ${
          isDragging
            ? "border-cyan-500 bg-cyan-500/10"
            : "border-white/20 hover:border-cyan-500/50 hover:bg-white/5"
        }`}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center mb-4">
            <Upload className="w-10 h-10 text-cyan-400" />
          </div>

          <h3 className="text-xl font-semibold text-white mb-2">
            Drop your image here, or{" "}
            <label className="text-cyan-400 cursor-pointer">
              browse
              <input
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    setFile(selectedFile);
                    setSelectedPlanId("");
                    setAnalysis(null);
                    setAnalysisError("");
                  }
                }}
              />
            </label>
          </h3>

          <p className="text-gray-400 mb-4">
            {uploadMode === "floorplan"
              ? "Use a clear top-down plan with high-contrast horizontal and vertical wall lines. The generated shell is approximate."
              : "Use a clear image with one main object centered for the best 3D result."}
          </p>

          {file && (
            <p className="text-green-400 text-sm mb-4">
              Selected: {file.name}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <FileImage className="w-4 h-4 shrink-0" />
              <span>PNG, JPG, JPEG</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Real object photo</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <File className="w-4 h-4 shrink-0" />
              <span>{uploadMode === "floorplan" || meshyConfigured ? "3D view + AR QR" : "Image preview"}</span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleUpload}
        disabled={isUploading}
        className="mt-6 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl transition"
      >
        {isUploading
          ? uploadMode === "floorplan" || meshyConfigured ? "Generating 3D..." : "Uploading..."
          : uploadMode === "floorplan" ? "Generate 3D Building" : meshyConfigured ? "Upload and Generate 3D" : "Upload Image Preview"}
      </button>

      {uploadMode === "floorplan" && (
        <section className="mt-6 border-t border-white/10 pt-6" aria-labelledby="gemini-analysis-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex max-w-2xl gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h3 id="gemini-analysis-heading" className="font-semibold text-white">Gemini Floor Plan Analysis</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Ask Gemini to identify visible spaces, describe circulation, and suggest layout improvements from your selected plan.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={analyzeFloorPlan}
              disabled={!geminiConfigured || (!file && !selectedPlanId) || isAnalyzing}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-4 w-4" />
              {isAnalyzing ? "Analyzing plan..." : "Analyze with Gemini"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:max-w-xl">
            <label htmlFor="gemini-plan-source" className="text-sm font-medium text-gray-300">
              Plan to analyze
            </label>
            <select
              id="gemini-plan-source"
              value={file ? "current-file" : selectedPlanId}
              onChange={(event) => {
                setFile(null);
                setSelectedPlanId(event.target.value);
                setAnalysis(null);
                setAnalysisError("");
              }}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
            >
              {file && <option value="current-file">Selected image: {file.name}</option>}
              {!file && <option value="">Choose a saved floor plan</option>}
              {savedPlans.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.title}{plan.type === "Image Upload" ? " (image preview)" : ""}
                </option>
              ))}
            </select>
            {savedPlans.length === 0 && !file && (
              <p className="text-xs text-gray-500">Upload a floor plan or select one from Recent Projects to begin analysis.</p>
            )}
          </div>

          {!geminiConfigured && (
            <div className="mt-4 space-y-3 rounded-md border border-amber-300/20 bg-amber-300/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-amber-100/90">Connect your Gemini key to enable image analysis.</p>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-cyan-200 underline underline-offset-4 hover:text-white"
                >
                  Get a Gemini key <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveGeminiApiKey();
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Gemini API key</span>
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showGeminiApiKey ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={(event) => setGeminiApiKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste Gemini API key"
                    className="w-full rounded-md border border-white/10 bg-black/30 py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
                  />
                  <button
                    type="button"
                    aria-label={showGeminiApiKey ? "Hide Gemini API key" : "Show Gemini API key"}
                    title={showGeminiApiKey ? "Hide key" : "Show key"}
                    onClick={() => setShowGeminiApiKey((visible) => !visible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    {showGeminiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
                <button
                  type="submit"
                  disabled={isSavingGeminiKey || geminiApiKey.trim().length < 20}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <KeyRound className="h-4 w-4" />
                  {isSavingGeminiKey ? "Connecting..." : "Connect Gemini"}
                </button>
              </form>
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={rememberGeminiKey}
                  onChange={(event) => setRememberGeminiKey(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-cyan-400"
                />
                <span>Remember this key on this computer</span>
              </label>
              <p className="text-xs leading-5 text-gray-400">
                The key is sent only to this local backend, never to browser storage. When remembered, it is saved in the Git-ignored `Backend/.env.local`; otherwise it is kept in memory until the backend restarts.
              </p>
            </div>
          )}
          {geminiConfigured && (
            <p className="mt-4 flex items-center gap-2 text-sm text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Gemini is connected for this backend session.
            </p>
          )}
          {geminiSetupMessage && (
            <p role="status" className="mt-3 text-sm text-cyan-100">{geminiSetupMessage}</p>
          )}
          {analysisError && (
            <p role="alert" className="mt-4 rounded-md border border-red-300/20 bg-red-300/5 px-3 py-2 text-sm text-red-100">
              {analysisError}
            </p>
          )}
          {isAnalyzing && (
            <p role="status" className="mt-4 text-sm text-cyan-100/80">Gemini is reviewing the selected image...</p>
          )}
          {analysis && (
            <div className="mt-5 space-y-5 rounded-lg border border-white/10 bg-black/20 p-5">
              <p className="text-sm leading-6 text-gray-200">{analysis.summary}</p>
              {analysis.spaces.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-white">Visible spaces</h4>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {analysis.spaces.map((space, index) => (
                      <li key={`${space.name}-${index}`} className="border-l-2 border-cyan-300/50 pl-3 text-sm">
                        <span className="font-medium text-cyan-100">{space.name}</span>
                        <span className="text-gray-400"> · {space.location}</span>
                        {space.evidence && <p className="mt-1 text-xs leading-5 text-gray-500">{space.evidence}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.layoutObservations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-white">Layout observations</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-5 text-gray-300">
                    {analysis.layoutObservations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              )}
              {analysis.recommendations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-white">Suggestions</h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm leading-5 text-gray-300">
                    {analysis.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              )}
              <p className="border-t border-white/10 pt-3 text-xs text-gray-500">
                AI interpretation only. Verify room identities and all architectural dimensions against the original drawing.
              </p>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <p className="text-2xl font-bold text-white">{stats.totalUploads}</p>
          <p className="text-sm text-gray-400">Total Uploads</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <p className="text-2xl font-bold text-white">{stats.successRate}%</p>
          <p className="text-sm text-gray-400">Success Rate</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <p className="text-2xl font-bold text-white">{stats.avgProcessingTime}</p>
          <p className="text-sm text-gray-400">Avg. Processing</p>
        </div>
      </div>
    </motion.section>
  );
}
