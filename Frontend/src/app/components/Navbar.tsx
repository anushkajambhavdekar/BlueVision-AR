import React from "react";
import { Search, Bell, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';

type NavbarProps = {
  onSearchChange: (query: string) => void;
  userName?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

export function Navbar({ onSearchChange, userName = "Anushka J" }: NavbarProps) {
  const pingBackend = async () => {
    try {
      await apiFetch("/health");
      alert("Backend connected ✅");
    } catch {
      alert("Backend not reachable ❌");
    }
  };

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-64 right-0 h-20 bg-black/40 backdrop-blur-xl border-b border-white/10 z-10"
    >
      <div className="h-full px-8 flex items-center justify-between">
        {/* Search Bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects, models, or features..."
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button
            onClick={pingBackend}
            className="relative p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-black"></span>
          </button>

          {/* User Profile */}
          <button className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-white text-sm font-semibold">{getInitials(userName)}</span>
            </div>
            <span className="text-white font-medium">{userName}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}
