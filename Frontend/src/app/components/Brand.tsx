import React from "react";

type BrandProps = {
  compact?: boolean;
};

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="brand-logo.png"
        alt="BlueVision logo"
        className={`${compact ? "h-10 w-10" : "h-12 w-12"} rounded-xl object-cover shadow-lg shadow-blue-500/20`}
      />
      <div>
        <h1 className={`${compact ? "text-xl" : "text-2xl"} font-bold text-blue-400`}>
          BlueVision
        </h1>
        <p className="text-xs text-gray-400">Create &amp; Visualize</p>
      </div>
    </div>
  );
}
