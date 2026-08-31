import { useState, useCallback, useRef } from "react";
import { Citation, ToolCallLog, StepLog } from "@mark43/shared";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: Citation[];
  toolLogs?: ToolCallLog[];
  stepLogs?: StepLog[];
}

export interface SendMessageOptions {
  enableHybridSearch?: boolean;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [currentToolLogs, setCurrentToolLogs] = useState<ToolCallLog[]>([]);
  const [currentStepLogs, setCurrentStepLogs] = useState<StepLog[]>([]);
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);

  // Stable session ID — generated once per hook mount, persists across turns
  const sessionIdRef = useRef<string>(generateSessionId());
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (queryText: string, options: SendMessageOptions = {}) => {
      if (!queryText.trim() || isStreaming) return;

      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;

      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: queryText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setActiveStep("Connecting to Intelligence Agent...");
      setCurrentToolLogs([]);
      setCurrentStepLogs([]);
      setCurrentCitations([]);

      const initialAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        citations: [],
        toolLogs: [],
        stepLogs: [],
      };

      setMessages((prev) => [...prev, initialAssistantMessage]);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: queryText,
            sessionId: sessionIdRef.current,
            enableHybridSearch: options.enableHybridSearch ?? true,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("No response stream body available");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            if (!block.trim()) continue;

            let eventType = "message";
            let dataStr = "";

            const blockLines = block.split("\n");
            for (const line of blockLines) {
              if (line.startsWith("event:")) {
                eventType = line.replace("event:", "").trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.replace("data:", "").trim();
              }
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              switch (eventType) {
                case "node_start":
                  setActiveStep(`Executing: ${data.node}`);
                  break;

                case "node_end":
                  break;

                case "token":
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: msg.content + data.token }
                        : msg
                    )
                  );
                  break;

                case "tool_end":
                  if (data.toolCall) {
                    setCurrentToolLogs((prev) => [...prev, data.toolCall]);
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, toolLogs: [...(msg.toolLogs || []), data.toolCall] }
                          : msg
                      )
                    );
                  }
                  break;

                case "log":
                  setCurrentStepLogs((prev) => [...prev, data]);
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, stepLogs: [...(msg.stepLogs || []), data] }
                        : msg
                    )
                  );
                  break;

                case "citation":
                  if (data.citation) {
                    setCurrentCitations((prev) => [...prev, data.citation]);
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, citations: [...(msg.citations || []), data.citation] }
                          : msg
                      )
                    );
                  }
                  break;

                case "error":
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: msg.content + `\n\n❌ **Error**: ${data.error}` }
                        : msg
                    )
                  );
                  break;

                case "done":
                  setActiveStep(null);
                  break;
              }
            } catch {
              // Non-JSON SSE payload
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Stream reader error:", err);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  content:
                    msg.content ||
                    `❌ Stream connection error: ${err.message}. Make sure backend API is running at localhost:4000.`,
                }
                : msg
            )
          );
        }
      } finally {
        setIsStreaming(false);
        setActiveStep(null);
      }
    },
    [isStreaming]
  );

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setActiveStep(null);
    }
  }, []);

  return {
    messages,
    isStreaming,
    activeStep,
    currentToolLogs,
    currentStepLogs,
    currentCitations,
    sendMessage,
    stopStream,
  };
}
