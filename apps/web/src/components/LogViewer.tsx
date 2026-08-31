import React from "react";
import { Terminal, CheckCircle, Activity, Database, BookOpen, Layers } from "lucide-react";
import { ToolCallLog, StepLog, Citation } from "@mark43/shared";

interface LogViewerProps {
  toolLogs: ToolCallLog[];
  stepLogs: StepLog[];
  citations: Citation[];
  activeStep: string | null;
}

export function LogViewer({ toolLogs, stepLogs, citations, activeStep }: LogViewerProps) {
  return (
    <div className="h-full flex flex-col glass-panel rounded-2xl overflow-hidden border border-slate-800">
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Chroma Cloud & Graph Trace
          </span>
        </div>
        {activeStep && (
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded flex items-center gap-1.5 animate-pulse">
            <Activity className="w-3 h-3" />
            {activeStep}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {/* Node Step Pipeline */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Graph Transitions ({stepLogs.length})
          </h4>
          {stepLogs.length === 0 ? (
            <p className="text-slate-600 text-xs italic">Awaiting tactical dispatch...</p>
          ) : (
            <div className="space-y-1.5">
              {stepLogs.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start gap-2 p-2 rounded bg-slate-900/60 border border-slate-800/60 text-slate-300"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">node::{step.nodeName}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(step.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {step.details && <p className="text-slate-400 text-[11px] mt-0.5">{step.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool & Chroma Cloud Invocations */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400" />
            Tool & Vector Calls ({toolLogs.length})
          </h4>
          {toolLogs.length === 0 ? (
            <p className="text-slate-600 text-xs italic">No tools or vector searches executed</p>
          ) : (
            <div className="space-y-2">
              {toolLogs.map((tool) => (
                <div
                  key={tool.id}
                  className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-slate-300"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-blue-400">{tool.toolName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {tool.status}
                    </span>
                  </div>

                  {tool.input && (
                    <div className="text-[10px] text-slate-400 mb-1.5 flex flex-wrap gap-1">
                      {tool.input.collection && (
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300">
                          collection: {tool.input.collection}
                        </span>
                      )}
                      {tool.input.hybridRRF && (
                        <span className="bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40">
                          RRF Hybrid (Qwen + Splade)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/40">
                    <p className="font-medium text-slate-300 mb-1">Output:</p>
                    <p className="line-clamp-3 text-slate-300">{tool.output}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retrieved Citations from Chroma Cloud */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Chroma Citations ({citations.length})
          </h4>
          {citations.length === 0 ? (
            <p className="text-slate-600 text-xs italic">No citations retrieved</p>
          ) : (
            <div className="space-y-2">
              {citations.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded bg-slate-900/50 border border-slate-800/60 text-slate-300"
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3" />
                      {c.title}
                    </span>
                    {c.collection && (
                      <span className="text-[10px] text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30 flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5" />
                        {c.collection}
                      </span>
                    )}
                  </div>
                  {c.documentId && (
                    <p className="text-[10px] text-slate-500 mb-1">Doc ID: {c.documentId}</p>
                  )}
                  <p className="text-[10px] text-slate-400 leading-relaxed">{c.snippet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
