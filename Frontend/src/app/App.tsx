import React from "react";
import { BrowserRouter } from "react-router-dom";
import { useEffect, useState } from "react";

import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { FeatureCard } from './components/FeatureCard';
import { UploadSection } from './components/UploadSection';
import { ViewerSection } from './components/ViewerSection';
import { ARSection } from './components/ARSection';
import { ManualBuilder } from './components/ManualBuilder';
import { ProjectGallery } from './components/ProjectGallery';
import { TEXT_TO_3D_PRESETS, getPresetAssetFromPrompt, type TextTo3dCatalogObject } from './lib/textTo3d';
import { apiFetch } from './lib/api';

import { FileImage, Type, QrCode, Hammer } from 'lucide-react';

export type ViewerAsset =
  | { kind: "model"; url: string; iosUrl?: string; preserveMaterialColors?: boolean }
  | { kind: "image"; url: string }
  | { kind: "pdf"; url: string }
  | { kind: "file"; url: string };

export default function App() {
  const [viewerAsset, setViewerAsset] = useState<ViewerAsset | null>(null);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [cardPrompt, setCardPrompt] = useState("");
  const [catalog, setCatalog] = useState<TextTo3dCatalogObject[]>(TEXT_TO_3D_PRESETS);

  const bumpProjectRefresh = () => setProjectRefreshKey((prev) => prev + 1);

  const navigateTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!viewerAsset?.url) return;
    navigateTo("viewer");
  }, [viewerAsset]);

  useEffect(() => {
    apiFetch<{ objects: TextTo3dCatalogObject[] }>("/catalog/objects")
      .then((data) => setCatalog(data.objects))
      .catch((error) => console.error(error));
  }, []);

  const handleFeatureCardPreview = () => {
    const presetAsset = getPresetAssetFromPrompt(cardPrompt, catalog);
    if (!presetAsset) {
      alert("Describe an object from the catalog, like a music speaker, green fruit, camping light, wooden seat, robot, or helmet.");
      return;
    }

    setViewerAsset(presetAsset);
  };

  const dashboard = (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
        
        {/* Sidebar */}
        <Sidebar onNavigate={navigateTo} userName=" Anushka J" userEmail="anushka@bluevision.ai" />

        {/* Main Content Area */}
        <div className="ml-64">
          
          {/* Navbar */}
          <Navbar onSearchChange={setSearchQuery} />

          {/* Main Content */}
          <main className="pt-20 p-8 space-y-8">

            {/* Hero Section */}
            <section id="hero">
              <HeroSection setViewerAsset={setViewerAsset} onProjectCreated={bumpProjectRefresh} />
            </section>

            {/* Feature Cards Grid */}
            <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <FeatureCard
                icon={FileImage}
                title="Blueprint to 3D"
                description="Upload a floor plan and generate an approximate 3D building shell"
                gradientFrom="from-cyan-500"
                gradientTo="to-blue-600"
                delay={0.3}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-400">Multi-floor support</span>
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Type}
                title="Text to 3D"
                description="Generate 3D models from simple text descriptions using AI"
                gradientFrom="from-purple-500"
                gradientTo="to-pink-600"
                delay={0.35}
              >
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <input
                      type="text"
                      value={cardPrompt}
                      onChange={(e) => setCardPrompt(e.target.value)}
                      placeholder='Describe an object'
                      className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catalog.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setViewerAsset({ kind: "model", url: preset.modelUrl })}
                        className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 hover:text-white"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="button"
                    value="Open 3D Preview"
                    onClick={handleFeatureCardPreview}
                    className="w-full cursor-pointer rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  />
                </div>
              </FeatureCard>

              <FeatureCard
                icon={QrCode}
                title="AR Viewer"
                description="Convert 3D models into AR experiences with instant QR access"
                gradientFrom="from-emerald-500"
                gradientTo="to-teal-600"
                delay={0.4}
              >
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center">
                    <QrCode className="w-6 h-6 text-emerald-400" />
                  </div>
                  <span className="text-sm text-gray-400">Scan & View</span>
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Hammer}
                title="Manual Builder"
                description="Design custom architecture with precise wall dimensions and layouts"
                gradientFrom="from-orange-500"
                gradientTo="to-red-600"
                delay={0.45}
              >
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="aspect-square rounded bg-gradient-to-br from-orange-500/20 to-red-600/20 border border-orange-500/30"
                    ></div>
                  ))}
                </div>
              </FeatureCard>
            </section>

            {/* 🔥 Upload Section (PASS FUNCTION) */}
            <section id="upload">
              <UploadSection setViewerAsset={setViewerAsset} onProjectCreated={bumpProjectRefresh} />
            </section>

            {/* 🔥 Viewer Section (RECEIVE DATA) */}
            <section id="viewer">
              <ViewerSection viewerAsset={viewerAsset} />
            </section>

            {/* AR Section */}
            <section id="ar">
              <ARSection viewerAsset={viewerAsset} />
            </section>

            {/* Manual Builder */}
            <section id="manual-builder">
              <ManualBuilder setViewerAsset={setViewerAsset} onProjectCreated={bumpProjectRefresh} />
            </section>

            {/* Project Gallery */}
            <section id="projects">
              <ProjectGallery
                setViewerAsset={setViewerAsset}
                refreshKey={projectRefreshKey}
                searchQuery={searchQuery}
              />
            </section>

            <div className="h-8"></div>
          </main>
        </div>

        {/* Background Effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
        </div>

      </div>
  );

  return (
    <BrowserRouter>{dashboard}</BrowserRouter>
  );
}
