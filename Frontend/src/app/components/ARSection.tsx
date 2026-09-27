import React from "react";
import { QrCode, Smartphone, Download, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { ViewerAsset } from "../App";

type ARSectionProps = {
  viewerAsset: ViewerAsset | null;
};

export function ARSection({ viewerAsset }: ARSectionProps) {
  const [arUrl, setArUrl] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const modelUrl = viewerAsset?.kind === "model" ? viewerAsset.url : "";
  const iosModelUrl = viewerAsset?.kind === "model" ? viewerAsset.iosUrl || "" : "";

  const createARLink = async () => {
    if (!modelUrl) {
      return null;
    }

    try {
      setIsLoading(true);
      const data = await apiFetch<{ arUrl: string; qrCodeDataUrl: string | null }>("/ar/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ modelUrl, iosModelUrl }),
      });
      setArUrl(data.arUrl);
      setQrCodeDataUrl(data.qrCodeDataUrl || "");
      return data;
    } catch (error) {
      console.error(error);
      alert("Unable to create AR link");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setArUrl("");
    setQrCodeDataUrl("");
    if (!modelUrl) return;
    createARLink();
  }, [modelUrl, iosModelUrl]);

  const shareLink = async () => {
    try {
      const data = arUrl ? { arUrl } : await createARLink();
      if (!data) return;
      await navigator.clipboard.writeText(data.arUrl);
      alert("AR link copied");
    } catch {
      alert("Unable to copy AR link");
    }
  };

  const downloadQR = async () => {
    const data = qrCodeDataUrl ? { qrCodeDataUrl } : await createARLink();
    if (!data?.qrCodeDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = data.qrCodeDataUrl;
    anchor.download = "ar-qr-code.png";
    anchor.click();
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8"
    >
      <h2 className="text-2xl font-bold text-white mb-2">AR Experience</h2>
      <p className="text-gray-400 mb-8">
        Scan the QR code on your phone to open an AR-ready page for the current 3D object
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-64 h-64 rounded-2xl bg-white p-4 relative overflow-hidden flex items-center justify-center">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="AR QR Code" className="w-full h-full object-contain rounded-xl" />
              ) : (
                <div className="flex flex-col items-center text-gray-600">
                  <QrCode className="w-16 h-16 mb-2" />
                  <p className="text-sm text-center px-4">
                    {isLoading ? "Generating QR..." : modelUrl ? "Preparing AR link..." : "Generate a 3D model to use AR"}
                  </p>
                </div>
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 blur-2xl -z-10"></div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={downloadQR}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Download QR</span>
            </button>
            <button
              onClick={shareLink}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm">Share Link</span>
            </button>
          </div>

          {arUrl && (
            <a
              href={arUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 text-cyan-400 text-sm break-all"
            >
              {arUrl}
            </a>
          )}

          {viewerAsset?.kind === "model" && !viewerAsset.iosUrl && (
            <p className="mt-3 max-w-sm text-center text-xs text-amber-300">
              Android AR should work directly. iPhone AR needs a USDZ version, which may not exist for some preset demo models.
            </p>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                1
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Scan QR Code</h3>
                <p className="text-gray-400">Use your smartphone camera to scan the QR code</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                2
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Open AR Viewer</h3>
                <p className="text-gray-400">The QR opens a mobile page with the same 3D object and AR controls</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                3
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">View in Your Space</h3>
                <p className="text-gray-400">Place and interact with the 3D model in your real environment</p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              <span className="text-white font-medium">Device Support</span>
            </div>
            <p className="text-sm text-gray-400">
              Best results come from opening the QR on the same Wi-Fi network as this computer so your phone can reach the generated AR page.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
