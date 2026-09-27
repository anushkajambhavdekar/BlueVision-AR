import React from "react";
import { Grid3x3, Ruler, Plus, Minus, Layers, DoorOpen, BedDouble } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type { ViewerAsset } from "../App";

type ManualBuilderProps = {
  setViewerAsset: (asset: ViewerAsset) => void;
  onProjectCreated: () => void;
};

type BlueprintResponse = {
  blueprintSvgDataUrl: string;
};

export function ManualBuilder({ setViewerAsset, onProjectCreated }: ManualBuilderProps) {
  const [buildingLength, setBuildingLength] = useState(12);
  const [buildingWidth, setBuildingWidth] = useState(8);
  const [floors, setFloors] = useState(1);
  const [rooms, setRooms] = useState(4);
  const [doors, setDoors] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  const roomGrid = useMemo(() => {
    const columns = Math.ceil(Math.sqrt(rooms));
    const rows = Math.ceil(rooms / columns);
    return { columns, rows };
  }, [rooms]);

  const handleGenerateBlueprint = async () => {
    try {
      setIsGenerating(true);
      const data = await apiFetch<BlueprintResponse>("/manual-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildingLength, buildingWidth, floors, rooms, doors }),
      });
      setViewerAsset({ kind: "image", url: data.blueprintSvgDataUrl });
      onProjectCreated();
      alert("Blueprint generated successfully.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to generate blueprint.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setBuildingLength(12);
    setBuildingWidth(8);
    setFloors(1);
    setRooms(4);
    setDoors(1);
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.7 }}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
    >
      <div className="border-b border-white/10 p-6">
        <h2 className="mb-1 text-2xl font-bold text-white">Manual Blueprint Builder</h2>
        <p className="text-gray-400">Enter architectural dimensions and generate a 2D floor-plan blueprint.</p>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Blueprint Preview</h3>
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/20 p-2 text-cyan-400">
              <Grid3x3 className="h-4 w-4" />
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[#07111f] p-6">
            <svg viewBox="0 0 420 420" className="h-full w-full">
              <defs>
                <pattern id="blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.14)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="420" height="420" fill="url(#blueprint-grid)" />
              <rect x="60" y="70" width="300" height="250" fill="none" stroke="#e0f2fe" strokeWidth="6" />
              {Array.from({ length: roomGrid.columns - 1 }).map((_, index) => {
                const x = 60 + ((index + 1) * 300) / roomGrid.columns;
                return <line key={`v-${x}`} x1={x} y1="70" x2={x} y2="320" stroke="#7dd3fc" strokeWidth="4" />;
              })}
              {Array.from({ length: roomGrid.rows - 1 }).map((_, index) => {
                const y = 70 + ((index + 1) * 250) / roomGrid.rows;
                return <line key={`h-${y}`} x1="60" y1={y} x2="360" y2={y} stroke="#7dd3fc" strokeWidth="4" />;
              })}
              {Array.from({ length: rooms }).map((_, index) => {
                const col = index % roomGrid.columns;
                const row = Math.floor(index / roomGrid.columns);
                const x = 60 + (col * 300) / roomGrid.columns + 14;
                const y = 70 + (row * 250) / roomGrid.rows + 26;
                return (
                  <text key={`room-${index}`} x={x} y={y} fill="#bae6fd" fontSize="14">
                    Room {index + 1}
                  </text>
                );
              })}
              {Array.from({ length: doors }).map((_, index) => {
                const x = 95 + index * 72;
                return (
                  <g key={`door-${index}`}>
                    <line x1={x} y1="320" x2={x + 34} y2="320" stroke="#07111f" strokeWidth="8" />
                    <path d={`M ${x} 320 A 34 34 0 0 1 ${x + 34} 286`} fill="none" stroke="#fbbf24" strokeWidth="3" />
                  </g>
                );
              })}
              <line x1="60" y1="48" x2="360" y2="48" stroke="#f8fafc" strokeWidth="2" />
              <text x="210" y="36" fill="#f8fafc" fontSize="16" textAnchor="middle">
                {buildingLength} m
              </text>
              <line x1="382" y1="70" x2="382" y2="320" stroke="#f8fafc" strokeWidth="2" />
              <text x="398" y="198" fill="#f8fafc" fontSize="16" transform="rotate(90 398 198)" textAnchor="middle">
                {buildingWidth} m
              </text>
              <text x="60" y="356" fill="#bae6fd" fontSize="14">
                {floors} floor(s) | {rooms} room(s) | {doors} entrance(s)
              </text>
            </svg>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Ruler className="h-5 w-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Dimensions</h3>
            </div>
            <div className="space-y-4">
              {[
                { label: "Building Length (m)", value: buildingLength, setValue: setBuildingLength, min: 4, max: 40 },
                { label: "Building Width (m)", value: buildingWidth, setValue: setBuildingWidth, min: 4, max: 30 },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <label className="mb-2 block text-sm text-gray-400">{item.label}</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => item.setValue(Math.max(item.min, item.value - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={item.value}
                      onChange={(event) => item.setValue(Number(event.target.value))}
                      className="flex-1"
                    />
                    <button
                      onClick={() => item.setValue(Math.min(item.max, item.value + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <span className="w-14 text-right font-bold text-white">{item.value}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-cyan-300">
                <Layers className="h-4 w-4" />
                <span className="text-sm">Floors</span>
              </div>
              <input type="number" min="1" max="5" step="1" required value={floors} onChange={(e) => setFloors(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} className="w-full rounded-lg bg-black/20 p-2 text-white" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-cyan-300">
                <BedDouble className="h-4 w-4" />
                <span className="text-sm">Rooms</span>
              </div>
              <input type="number" min="1" max="12" step="1" required value={rooms} onChange={(e) => setRooms(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} className="w-full rounded-lg bg-black/20 p-2 text-white" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-cyan-300">
                <DoorOpen className="h-4 w-4" />
                <span className="text-sm">Doors</span>
              </div>
              <input type="number" min="1" max="4" step="1" required value={doors} onChange={(e) => setDoors(Math.min(4, Math.max(1, Number(e.target.value) || 1)))} className="w-full rounded-lg bg-black/20 p-2 text-white" />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerateBlueprint}
              disabled={isGenerating}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-cyan-500/30 transition hover:shadow-cyan-500/50"
            >
              {isGenerating ? "Generating..." : "Generate Blueprint"}
            </button>
            <button onClick={handleReset} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white hover:bg-white/10">
              Reset
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
