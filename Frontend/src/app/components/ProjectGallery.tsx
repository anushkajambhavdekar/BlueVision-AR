import React from "react";
import { Eye, Download, MoreVertical, Calendar, Layers, Cuboid, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useEffect, useState } from 'react';
import { apiFetch, resolveApiUrl } from '../lib/api';
import type { ViewerAsset } from '../App';

type Project = {
  id: number;
  title: string;
  type: string;
  date: string;
  polygons: string;
  modelUrl: string;
  iosModelUrl?: string;
  source?: string;
  conversion?: string;
};

const fallbackImage =
  'https://images.unsplash.com/photo-1721244654392-9c912a6eb236?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080';
const PLACEHOLDER_MODEL_URL = "https://modelviewer.dev/shared-assets/models/Astronaut.glb";

type ProjectGalleryProps = {
  setViewerAsset: (asset: ViewerAsset) => void;
  refreshKey: number;
  searchQuery: string;
};

function getProjectAsset(project: Project): ViewerAsset {
  if (project.type === "Manual Blueprint" && project.source?.startsWith("data:image/svg+xml")) {
    return { kind: "image", url: project.source };
  }
  if (project.modelUrl && project.modelUrl !== PLACEHOLDER_MODEL_URL) {
    return {
      kind: "model",
      url: project.modelUrl,
      iosUrl: project.iosModelUrl,
      preserveMaterialColors: project.type === "Blueprint to 3D" || project.conversion === "approximate-floor-plan-extrusion",
    };
  }
  if ((project.type === "Blueprint to 3D" || project.type === "Image to 3D" || project.type === "Image Upload") && project.source) {
    const source = resolveApiUrl(project.source);
    const lower = project.source.toLowerCase();
    if (lower.endsWith(".pdf")) return { kind: "pdf", url: source };
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg")) {
      return { kind: "image", url: source };
    }
    return { kind: "file", url: source };
  }
  return { kind: "model", url: project.modelUrl, iosUrl: project.iosModelUrl };
}

function getProjectResourceUrl(project: Project): string {
  if (project.modelUrl && project.modelUrl !== PLACEHOLDER_MODEL_URL) return project.modelUrl;
  if (project.type === "Manual Blueprint" && project.source?.startsWith("data:")) return project.source;
  if ((project.type === "Blueprint to 3D" || project.type === "Image to 3D" || project.type === "Image Upload") && project.source) {
    return resolveApiUrl(project.source);
  }
  return project.modelUrl;
}

export function ProjectGallery({ setViewerAsset, refreshKey, searchQuery }: ProjectGalleryProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [convertingProjectId, setConvertingProjectId] = useState<number | null>(null);

  const loadProjects = async () => {
    try {
      const data = await apiFetch<{ projects: Project[] }>("/projects");
      setProjects(data.projects);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [refreshKey]);

  const filteredProjects = projects.filter((project) => {
    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (project.date !== today) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      project.title.toLowerCase().includes(q) ||
      project.type.toLowerCase().includes(q) ||
      project.polygons.toLowerCase().includes(q)
    );
  });

  const convertSavedFloorPlan = async (event: React.MouseEvent<HTMLButtonElement>, project: Project) => {
    event.stopPropagation();
    setConvertingProjectId(project.id);
    try {
      const data = await apiFetch<{ modelUrl: string; iosModelUrl?: string }>(
        `/projects/${project.id}/convert-floorplan`,
        { method: "POST" }
      );
      setViewerAsset({ kind: "model", url: data.modelUrl, iosUrl: data.iosModelUrl, preserveMaterialColors: true });
      await loadProjects();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to convert floor plan.");
    } finally {
      setConvertingProjectId(null);
    }
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.8 }}
      className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Today's Projects</h2>
          <p className="text-gray-400">{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <button
          onClick={loadProjects}
          title="Refresh today's projects"
          aria-label="Refresh today's projects"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-white transition-all hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredProjects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 + index * 0.1 }}
            whileHover={{ y: -5 }}
            onClick={() => setViewerAsset(getProjectAsset(project))}
            className="group relative rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
          >
            {/* Image */}
            <div className="relative aspect-square overflow-hidden bg-gray-900">
              <ImageWithFallback
                src={fallbackImage}
                alt={project.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              
              {/* Overlay on Hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setViewerAsset(getProjectAsset(project));
                  }}
                  className="p-3 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all"
                >
                  <Eye className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    window.open(getProjectResourceUrl(project), "_blank", "noopener,noreferrer");
                  }}
                  className="p-3 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all"
                >
                  <Download className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-white">{project.title}</h3>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigator.clipboard.writeText(getProjectResourceUrl(project));
                  }}
                  className="p-1 rounded hover:bg-white/10 transition-all text-gray-400"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <span className="text-cyan-400 text-xs">{project.type}</span>
                  </div>
                </div>

                {(project.type === "Image Upload" || project.type === "Blueprint to 3D") && project.source && /\.(png|jpe?g)$/i.test(project.source) && (
                  <button
                    type="button"
                    disabled={convertingProjectId === project.id}
                    onClick={(event) => convertSavedFloorPlan(event, project)}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Cuboid className="h-4 w-4" />
                    {convertingProjectId === project.id
                      ? "Building 3D model..."
                      : project.type === "Blueprint to 3D" ? "Refresh 3D model colors" : "Convert floor plan to 3D"}
                  </button>
                )}
                
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{project.date}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    <span>{project.polygons}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      {filteredProjects.length === 0 && (
        <div className="text-gray-400 text-sm mt-6">
          {searchQuery.trim() ? "No projects from today match your search." : "No projects created today."}
        </div>
      )}
    </motion.section>
  );
}
