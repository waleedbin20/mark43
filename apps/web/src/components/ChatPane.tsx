import React, { useState, useRef, useEffect } from "react";
import { Send, Square, Bot, User, Sparkles, Database, SlidersHorizontal } from "lucide-react";
import { ChatMessage, SendMessageOptions } from "../hooks/useAgentStream";
import { ToolBadge } from "./ToolBadge";
import { ChromaCollectionName } from "@mark43/shared";

interface ChatPaneProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (query: string, options?: SendMessageOptions) => void;
  onStopStream: () => void;
}

export function ChatPane({
  messages,
  isStreaming,
  onSendMessage,
  onStopStream,
}: ChatPaneProps) {
  const [input, setInput] = useState("");
  const [selectedCollection, setSelectedCollection] =
    useState<ChromaCollectionName>("mark43_rms_policies");
  const [enableHybrid, setEnableHybrid] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input, {
      enableHybridSearch: enableHybrid,
    });
    setInput("");
  };

  const samplePrompts = [
    {
      label: "Mark43 RMS SOPs",
      collection: "mark43_rms_policies" as ChromaCollectionName,
      query: "What are the mandatory fields and chain of custody rules for Mark43 RMS reports?",
    },
    {
      label: "Priority 1 Dispatch",
      collection: "mark43_rms_policies" as ChromaCollectionName,
      query: "What is the dispatch timeline and supervisor protocol for Priority 1 emergency responses?",
    },
    {
      label: "Legal Penal Code § 459",
      collection: "legal_penal_codes" as ChromaCollectionName,
      query: "Explain the statutory definition and degrees of burglary under Penal Code Section 459.",
    },
    {
      label: "Sector 4 Incident Brief",
      collection: "incident_intelligence" as ChromaCollectionName,
      query: "Retrieve incident briefing #2026-088 regarding commercial forced entry in Sector 4.",
    },
  ];

  return (
    <div className="h-full flex flex-col glass-panel rounded-2xl overflow-hidden border border-slate-800">
      {/* Control Bar: Collection Shard & Hybrid Search */}
      <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400 font-medium">Chroma Collection:</span>
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value as ChromaCollectionName)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 font-mono"
            disabled={isStreaming}
          >
            <option value="mark43_rms_policies">mark43_rms_policies (SOPs & Dispatch)</option>
            <option value="legal_penal_codes">legal_penal_codes (Statutes & Laws)</option>
            <option value="incident_intelligence">incident_intelligence (Field Reports)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 text-[11px]">
            <input
              type="checkbox"
              checked={enableHybrid}
              onChange={(e) => setEnableHybrid(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
              disabled={isStreaming}
            />
            <span className="flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
              Hybrid RRF (Dense Qwen + Sparse Splade)
            </span>
          </label>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Mark43 LangGraph Tactical Assistant + Chroma Cloud
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Equipped with Chroma Cloud multi-collection sharding, Dense Qwen + Sparse Splade hybrid search, GroupBy deduplication, and line chunking.
              </p>
            </div>

            <div className="w-full space-y-2 pt-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left">
                Suggested Operations:
              </p>
              {samplePrompts.map((sample, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedCollection(sample.collection);
                    onSendMessage(sample.query, {
                      enableHybridSearch: enableHybrid,
                    });
                  }}
                  className="w-full text-left text-xs p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/40 text-slate-300 transition-all duration-150 flex items-center justify-between"
                >
                  <span className="truncate">"{sample.query}"</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40 ml-2 shrink-0">
                    {sample.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 space-y-3 ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-600/10"
                    : "glass-card text-slate-200"
                }`}
              >
                {/* Tool Badges */}
                {msg.toolLogs && msg.toolLogs.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-700/50">
                    {msg.toolLogs.map((tool) => (
                      <ToolBadge key={tool.id} toolLog={tool} />
                    ))}
                  </div>
                )}

                {/* Message Content */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.content || (
                    <span className="inline-flex items-center gap-2 text-cyan-400 italic text-xs">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      Executing Chroma Cloud RAG & reasoning graph...
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-slate-400/80 text-right">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-md">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Query Input Bar */}
      <div className="p-4 bg-slate-950/80 border-t border-slate-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type tactical query (e.g. 'What are Mark43 CAD report rules?' or 'Check penal code § 459')..."
            className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-sans"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStream}
              className="px-5 py-3 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 flex items-center gap-2 text-sm font-medium transition-all"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium text-sm flex items-center gap-2 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 transition-all"
            >
              <Send className="w-4 h-4" />
              Dispatch
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
