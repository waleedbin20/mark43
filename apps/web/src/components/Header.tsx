import React from "react";
import { Shield, Radio, Activity, Database, Sparkles } from "lucide-react";

export function Header({ isStreaming }: { isStreaming: boolean }) {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {isStreaming && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              MARK43 <span className="text-cyan-400 font-mono text-sm font-normal">MISSION CONTROL</span>
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
              Chroma Cloud RAG
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Tactical LangGraph Agent • OpenAI Dense + Splade Sparse Hybrid RRF Search
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Chroma DB: <span className="text-emerald-400 font-semibold">mark43-rag</span>
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono">
          <Radio
            className={`w-3.5 h-3.5 ${isStreaming ? "text-amber-400 animate-pulse" : "text-emerald-400"
              }`}
          />
          <span className="text-slate-300">
            {isStreaming ? (
              <span className="text-amber-400 flex items-center gap-1">
                STREAMING <Activity className="w-3 h-3 animate-spin inline" />
              </span>
            ) : (
              <span className="text-slate-400">STANDBY</span>
            )}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1 text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-800/30 px-2.5 py-1 rounded-md">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>OpenAI + Splade RRF</span>
        </div>
      </div>
    </header>
  );
}
