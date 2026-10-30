import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  FileText,
  Folder as FolderIcon,
  Check,
  Clock,
  Mic,
  MicOff,
  Send,
  AlertTriangle,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Cpu,
} from 'lucide-react';
import { useApp } from '@/stores/AppContext';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { FirstLaunchScreen } from '@/components/chat/FirstLaunchScreen';
import { FileResultCard } from '@/components/chat/FileResultCard';
import { FolderResultCard } from '@/components/chat/FolderResultCard';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { AssistantHeader, AssistantTabType } from '@/components/chat/AssistantHeader';
import { AssistantTabs } from '@/components/chat/AssistantTabs';
import { AssistantModals } from '@/components/chat/AssistantModals';

export const MainAssistantPage: React.FC = () => {
  const {
    isConnected,
    settings,
    aiStatus,
    isIndexing,
    indexingCategory,
    openFile,
    revealFile,
    indexedFiles,
    indexedFolders,
    aiService,
  } = useApp();

  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<AssistantTabType>('today');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
  });

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocalAISetupOpen, setIsLocalAISetupOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Assistant Chat Hook
  const {
    turns,
    isProcessing,
    activeConvId,
    conversationsList,
    speakingTurnId,
    setSpeakingTurnId,
    messagesEndRef,
    handleQuery,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleClearCurrentChat,
    handleExecutePendingAction,
    handleDismissPendingAction,
  } = useAssistantChat({
    indexedFiles,
    indexedFolders,
    openFile,
    revealFile,
    aiService,
    aiStatus,
  });

  // Voice Input Hook
  const {
    isListening,
    isTranscribing,
    audioLevel,
    isSupported: isVoiceSupported,
    startListening,
    stopListening,
    errorMessage: voiceErrorMessage,
  } = useVoiceInput(
    (finalText) => {
      if (finalText && finalText.trim()) {
        handleQuery(finalText.trim());
      }
    },
    (interimText) => {
      if (interimText) {
        setInput(interimText);
      }
    }
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const q = input.trim();
    setInput('');
    handleQuery(q);
  };

  const handleSpeakText = (turnId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingTurnId === turnId) {
      window.speechSynthesis.cancel();
      setSpeakingTurnId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`{1,3}.*?`{1,3}/gs, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[#*_~]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingTurnId(null);
    utterance.onerror = () => setSpeakingTurnId(null);
    setSpeakingTurnId(turnId);
    window.speechSynthesis.speak(utterance);
  };

  const suggestions = [
    'Give me my resume PDFs',
    'What files did I work on today?',
    'What is the network status?',
    'What is my IP address?',
    'Which one is the largest file?',
    'Find screen recordings from September 15',
    'Find my marriage photos',
    'What applications are currently open?',
    'Why is my computer slow?',
    'What am I forgetting?',
  ];

  if (!isConnected) {
    return <FirstLaunchScreen />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-main)] font-sans antialiased">
      {/* ChatGPT-Style Left History Sidebar */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
        conversations={conversationsList}
        activeConversationId={activeConvId}
        onSelectConversation={(id) => {
          setActiveTab('chat');
          handleSelectConversation(id);
        }}
        onNewChat={() => {
          setActiveTab('chat');
          handleNewChat();
        }}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onClearCurrentChat={handleClearCurrentChat}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {/* Top App Header with Tab Switcher */}
        <AssistantHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          aiStatus={aiStatus}
          onOpenLocalAISetup={() => setIsLocalAISetupOpen(true)}
          onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Android Local AI Setup Warning Banner if needed */}
        {(settings.ai.provider === 'android_local' || settings.ai.provider === 'desktop_local') && !aiStatus?.isAvailable && (
          <div
            onClick={() => setIsLocalAISetupOpen(true)}
            className="bg-amber-500/10 hover:bg-amber-500/15 border-b border-amber-500/20 px-3 py-2 flex items-center justify-between cursor-pointer transition-colors flex-shrink-0"
          >
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>
                  {aiStatus?.state === 'MODEL_LOADING' ? 'On-Device AI is starting:' : 'On-Device AI setup required:'}
                </strong>{' '}
                {aiStatus?.state === 'MODEL_LOADING'
                  ? 'loading the local model into memory. This takes a moment.'
                  : 'Install the local AI model so Foundry can answer questions with no internet and no extra software.'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
              Install Local AI →
            </span>
          </div>
        )}

        {/* Secondary Workspace Tabs (Today, Pending, Goals, Clean-Up, Analytics, Tasks, Automations, Integrations, Memory) */}
        {activeTab !== 'chat' && (
          <AssistantTabs
            activeTab={activeTab}
            onExecuteQuickAction={(prompt) => {
              setActiveTab('chat');
              handleQuery(prompt);
            }}
          />
        )}

        {/* Primary Conversational Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden max-w-4xl mx-auto w-full select-text">
            {/* Background Indexing Banner */}
            {isIndexing && (
              <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between text-xs text-blue-400 flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    I'm indexing your computer... Scanning <strong>{indexingCategory || 'directories'}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-blue-300/80">You can start chatting now</span>
              </div>
            )}

            {/* Conversation Stream */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              {turns.length === 0 ? (
                /* Empty / Hero Screen */
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 py-12">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shadow-xs">
                    <Bot className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5">
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)] m-0">
                      What can I help you with?
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Ask anything. Foundry reasons naturally, inspects system information, searches files accurately, and runs local tools safely.
                    </p>
                  </div>

                  {/* Quick Suggestion Pills */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuery(s)}
                        className="px-3 py-1.5 text-xs rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-blue-500/40 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all cursor-pointer text-left"
                      >
                        "{s}"
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center space-x-1.5 text-[11px] text-emerald-500/90 pt-4">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Protected Local Environment · Confirmation required for actions</span>
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex space-x-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {turn.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed space-y-2.5 ${
                        turn.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-none shadow-xs'
                          : 'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] rounded-tl-none shadow-xs'
                      }`}
                    >
                      {/* Tool Execution Badges */}
                      {turn.toolsExecuted && turn.toolsExecuted.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pb-1 border-b border-[var(--border-subtle)]/40 mb-2">
                          {turn.toolsExecuted.map((tool, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            >
                              <Check className="w-2.5 h-2.5" />
                              <span>{tool}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="whitespace-pre-wrap font-normal break-words leading-relaxed select-text">
                        {turn.content}
                      </div>

                      {/* File Result Cards */}
                      {turn.files && turn.files.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1">
                            <FileText className="w-3 h-3" />
                            <span>Files Found ({turn.files.length})</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {turn.files.map((file, fIdx) => (
                              <FileResultCard
                                key={fIdx}
                                file={file}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Folder Result Cards */}
                      {turn.folders && turn.folders.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center space-x-1">
                            <FolderIcon className="w-3 h-3" />
                            <span>Folders Found ({turn.folders.length})</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {turn.folders.map((folder, foIdx) => (
                              <FolderResultCard
                                key={foIdx}
                                folder={folder}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pending Action Confirmation Banner */}
                      {turn.pendingAction && (
                        <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
                          <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-400">
                            <AlertTriangle className="w-4 h-4" />
                            <span>Confirmation Required to Launch Application</span>
                          </div>
                          <p className="text-[11px] text-amber-300/90 leading-normal">
                            Foundry identified the application <strong>{turn.pendingAction.appName}</strong>. Confirm to launch?
                          </p>
                          <div className="flex items-center space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleExecutePendingAction(turn.id, turn.pendingAction!)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Confirm & Launch</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissPendingAction(turn.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-medium transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Audio Read-Aloud & Follow-Up Toolbar */}
                      {turn.role === 'assistant' && (
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]/30 text-[10px] text-[var(--text-faint)]">
                          <span>{new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleSpeakText(turn.id, turn.content)}
                              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                              title={speakingTurnId === turn.id ? 'Stop Speaking' : 'Read Out Loud'}
                              aria-label={speakingTurnId === turn.id ? 'Stop Speaking' : 'Read Out Loud'}
                            >
                              {speakingTurnId === turn.id ? (
                                <VolumeX className="w-3.5 h-3.5 text-blue-400" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuery(turns[turns.indexOf(turn) - 1]?.content || '')}
                              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                              title="Run Again"
                              aria-label="Rerun previous query"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {turn.role === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {isProcessing && (
                <div className="flex items-center space-x-2 text-xs text-[var(--text-faint)] pl-11" role="status" aria-live="polite">
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-blue-500" aria-hidden="true" />
                  <span>Thinking & searching your system...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Prominent Chat Input with Voice Button */}
            <div className="p-4 border-t border-[var(--border-subtle)] flex-shrink-0 bg-[var(--bg-primary)]">
              <form onSubmit={handleSubmit} className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Ask anything about your system or files... (e.g. Give accessibility tester resume)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isProcessing}
                  className="w-full pl-4 pr-24 py-3.5 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-faint)] focus:outline-none focus:border-blue-500 shadow-xs"
                  aria-label="Ask anything about your system or files"
                  autoFocus
                />

                <div className="absolute right-2.5 flex items-center space-x-1.5">
                  {/* Voice Microphone Input Button */}
                  {isVoiceSupported && (
                    <button
                      type="button"
                      onClick={isListening ? stopListening : startListening}
                      disabled={isProcessing}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : isTranscribing
                          ? 'bg-amber-500 text-white animate-spin'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                      title={
                        isListening
                          ? 'Listening... Click to stop'
                          : isTranscribing
                          ? 'Transcribing audio...'
                          : 'Voice Input'
                      }
                      aria-label="Voice input toggle"
                    >
                      {isListening ? (
                        <MicOff className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isProcessing}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors cursor-pointer shadow-xs"
                    aria-label="Send query"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* Live Voice Audio Waveform Indicator */}
              {isListening && (
                <div className="flex items-center justify-between text-[11px] text-red-400 mt-2 px-1">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>Listening... speak clearly</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {[40, 70, 100, 60, 30, 80, 50].map((h, i) => (
                      <span
                        key={i}
                        className="w-1 bg-red-500 rounded-full transition-all duration-75"
                        style={{
                          height: `${Math.max(4, Math.min(20, (audioLevel * h) / 30))}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Voice Error Display */}
              {voiceErrorMessage && (
                <div className="text-[11px] text-red-400 mt-1.5 px-1">
                  ⚠️ {voiceErrorMessage}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AssistantModals
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => setIsSettingsOpen(false)}
        isLocalAISetupOpen={isLocalAISetupOpen}
        onCloseLocalAISetup={() => setIsLocalAISetupOpen(false)}
        isUpdateModalOpen={isUpdateModalOpen}
        onCloseUpdateModal={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};

export default MainAssistantPage;
