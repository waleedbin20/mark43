import React from "react";
import { Wrench, Database, Layers, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { ToolCallLog } from "@mark43/shared";

export function ToolBadge({ toolLog }: { toolLog: ToolCallLog }) {
  const getIcon = () => {
    switch (toolLog.toolName) {
      case "fetchPoliceUkCrimes":
        return <Wrench className="w-3.5 h-3.5 text-blue-400" />;
      case "ChromaCloud.HybridSearch":
        return <Database className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  const getStatusIcon = () => {
    switch (toolLog.status) {
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "error":
        return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
    }
  };

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/60 text-xs font-mono">
      {getIcon()}
      <span className="text-slate-200 font-medium">{toolLog.toolName}</span>
      {toolLog.input?.collection && (
        <span className="text-cyan-400 text-[10px] bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/40">
          {toolLog.input.collection}
        </span>
      )}
      <span className="text-slate-500">|</span>
      {getStatusIcon()}
      <span className="text-[11px] text-slate-400">{toolLog.status}</span>
    </div>
  );
}
