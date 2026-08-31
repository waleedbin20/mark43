import React from "react";
import { Header } from "./components/Header";
import { ChatPane } from "./components/ChatPane";
import { LogViewer } from "./components/LogViewer";
import { useAgentStream } from "./hooks/useAgentStream";

export function App() {
  const {
    messages,
    isStreaming,
    activeStep,
    currentToolLogs,
    currentStepLogs,
    currentCitations,
    sendMessage,
    stopStream,
  } = useAgentStream();

  return (
    <div className="flex flex-col h-screen bg-[#080d1a] overflow-hidden">
      <Header isStreaming={isStreaming} />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 overflow-hidden">
        {/* Main Chat Interface */}
        <div className="lg:col-span-8 h-full overflow-hidden">
          <ChatPane
            messages={messages}
            isStreaming={isStreaming}
            onSendMessage={sendMessage}
            onStopStream={stopStream}
          />
        </div>

        {/* Real-time LangGraph Execution & Logs Sidebar */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <LogViewer
            toolLogs={currentToolLogs}
            stepLogs={currentStepLogs}
            citations={currentCitations}
            activeStep={activeStep}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
