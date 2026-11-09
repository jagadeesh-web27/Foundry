import { useState, useEffect, useCallback, useRef } from 'react';
import { IndexedFile, IndexedFolder } from '@/types/file';
import { agentRunner } from '@/services/agent/agentRunner';
import { computerService } from '@/services/native/computerService';
import { PendingAction } from '@/services/agent/dynamicAgent';
import { db, StoredConversation, StoredMessage } from '@/services/db/database';
import { AIService } from '@/services/ai/aiService';
import { AIProviderStatus } from '@/types/ai';
import { trace } from '@/services/debug/trace';

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: IndexedFile[];
  folders?: IndexedFolder[];
  toolsExecuted?: string[];
  plan?: any;
  pendingAction?: PendingAction;
  timestamp: string;
}

export function generateConversationTitle(query: string): string {
  const clean = query.replace(/[?!.,;:'"()[\]{}]/g, '').trim();
  const words = clean
    .split(/\s+/)
    .filter(
      (w) =>
        !['give', 'me', 'my', 'the', 'a', 'an', 'please', 'show', 'tell', 'what', 'is', 'how', 'many', 'present', 'in', 'system', 'find'].includes(
          w.toLowerCase()
        )
    );
  if (words.length === 0) return clean.slice(0, 30) || 'New Chat';
  return words.slice(0, 4).join(' ');
}

interface UseAssistantChatOptions {
  indexedFiles: IndexedFile[];
  indexedFolders: IndexedFolder[];
  openFile: (path: string) => Promise<any>;
  revealFile: (path: string) => Promise<any>;
  aiService: AIService | null;
  aiStatus: AIProviderStatus;
}

export function useAssistantChat({
  indexedFiles,
  indexedFolders,
  openFile,
  revealFile,
  aiService,
  aiStatus,
}: UseAssistantChatOptions) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string>(() => `conv_${Date.now()}`);
  const [activeConvTitle, setActiveConvTitle] = useState('New Chat');
  const [conversationsList, setConversationsList] = useState<StoredConversation[]>([]);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isProcessing]);

  // Load saved conversations on mount
  useEffect(() => {
    let isMounted = true;
    const loadSaved = async () => {
      try {
        const saved = await db.getConversations();
        if (!isMounted) return;
        setConversationsList(saved);
        if (saved.length > 0) {
          const latest = saved[0];
          setActiveConvId(latest.id);
          setActiveConvTitle(latest.title);
          setTurns(
            latest.messages.map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.timestamp,
              files: m.files,
              folders: m.folders,
              pendingAction: m.pendingConfirmation,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading conversations from IndexedDB:', err);
      }
    };
    loadSaved();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save current conversation
  const persistConversation = useCallback(
    async (convId: string, title: string, currentTurns: ConversationTurn[]) => {
      if (currentTurns.length === 0) return;
      const storedMessages: StoredMessage[] = currentTurns.map((t) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        timestamp: t.timestamp,
        files: t.files,
        folders: t.folders,
        pendingConfirmation: t.pendingAction,
      }));

      const record: StoredConversation = {
        id: convId,
        title,
        createdAt: currentTurns[0]?.timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: storedMessages,
      };

      try {
        await db.saveConversation(record);
        setConversationsList((prev) => {
          const existing = prev.findIndex((c) => c.id === convId);
          if (existing >= 0) {
            const copy = [...prev];
            copy[existing] = record;
            return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          }
          return [record, ...prev];
        });
      } catch (e) {
        console.error('Failed to save conversation:', e);
      }
    },
    []
  );

  const handleNewChat = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingTurnId(null);
    }
    const newId = `conv_${Date.now()}`;
    setActiveConvId(newId);
    setActiveConvTitle('New Chat');
    setTurns([]);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConvId) return;
      const found = conversationsList.find((c) => c.id === id);
      if (found) {
        setActiveConvId(found.id);
        setActiveConvTitle(found.title);
        setTurns(
          found.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
            files: m.files,
            folders: m.folders,
            pendingAction: m.pendingConfirmation,
          }))
        );
      }
    },
    [activeConvId, conversationsList]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await db.deleteConversation(id);
        setConversationsList((prev) => prev.filter((c) => c.id !== id));
        if (activeConvId === id) {
          handleNewChat();
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [activeConvId, handleNewChat]
  );

  const handleRenameConversation = useCallback(
    async (id: string, newTitle: string) => {
      try {
        const conv = await db.getConversation(id);
        if (conv) {
          conv.title = newTitle;
          conv.updatedAt = new Date().toISOString();
          await db.saveConversation(conv);
          setConversationsList((prev) =>
            prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
          );
          if (activeConvId === id) {
            setActiveConvTitle(newTitle);
          }
        }
      } catch (err) {
        console.error('Failed to rename conversation:', err);
      }
    },
    [activeConvId]
  );

  const handleClearCurrentChat = useCallback(async () => {
    if (window.confirm('Clear messages in this conversation?')) {
      setTurns([]);
      try {
        const conv = await db.getConversation(activeConvId);
        if (conv) {
          conv.messages = [];
          conv.updatedAt = new Date().toISOString();
          await db.saveConversation(conv);
        }
      } catch (err) {
        console.error('Failed to clear conversation:', err);
      }
    }
  }, [activeConvId]);

  const handleQuery = useCallback(
    async (queryText: string) => {
      const q = queryText.trim();
      if (!q || isProcessing) return;

      let titleToUse = activeConvTitle;
      if (turns.length === 0 || activeConvTitle === 'New Chat') {
        titleToUse = generateConversationTitle(q);
        setActiveConvTitle(titleToUse);
      }

      const timestamp = new Date().toISOString();
      const userTurn: ConversationTurn = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: q,
        timestamp,
      };

      const newTurnsWithUser = [...turns, userTurn];
      setTurns(newTurnsWithUser);
      setIsProcessing(true);

      trace('[PIPELINE_TRACE] USER QUERY (UI):', q);

      try {
        const lastAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant' && t.files && t.files.length > 0);
        const conversationContext = lastAssistantTurn
          ? {
              lastFiles: lastAssistantTurn.files!,
              lastPlan: lastAssistantTurn.plan,
              lastSearchArgs: (lastAssistantTurn.plan as any)?.searchArgs,
            }
          : undefined;

        const agentResponse = await agentRunner.run(
          q,
          {
            indexedFiles,
            indexedFolders,
            openFile,
            revealFile,
          },
          aiService || undefined,
          aiStatus.isAvailable,
          conversationContext
        );

        trace('[PIPELINE_TRACE] CHAT UI (Received Final Assistant Response):', agentResponse.message);

        const assistantTurn: ConversationTurn = {
          id: `asst_${Date.now()}`,
          role: 'assistant',
          content: agentResponse.message,
          files: agentResponse.files,
          folders: agentResponse.folders,
          toolsExecuted: agentResponse.toolsExecuted,
          plan: agentResponse.plan,
          pendingAction: agentResponse.pendingAction,
          timestamp: new Date().toISOString(),
        };

        const finalTurns = [...newTurnsWithUser, assistantTurn];
        setTurns(finalTurns);
        persistConversation(activeConvId, titleToUse, finalTurns);
      } catch (err) {
        console.error('Error executing assistant query:', err);
        const errorTurn: ConversationTurn = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error while searching your computer. Please check that you are running in the desktop app and try again.',
          timestamp: new Date().toISOString(),
        };
        const finalTurns = [...newTurnsWithUser, errorTurn];
        setTurns(finalTurns);
        persistConversation(activeConvId, titleToUse, finalTurns);
      } finally {
        setIsProcessing(false);
      }
    },
    [
      activeConvId,
      activeConvTitle,
      aiService,
      aiStatus.isAvailable,
      indexedFiles,
      indexedFolders,
      isProcessing,
      openFile,
      persistConversation,
      revealFile,
      turns,
    ]
  );

  const handleExecutePendingAction = useCallback(
    async (turnId: string, action: PendingAction) => {
      setIsProcessing(true);
      try {
        let launchSuccess = false;
        let launchError = '';

        if (action.type === 'open_application') {
          try {
            await computerService.launchApplication(action.targetPath);
            launchSuccess = true;
          } catch (e: any) {
            launchSuccess = false;
            launchError = e?.message || String(e);
          }
        }

        const newTurns = turns.map((t) => {
          if (t.id === turnId) {
            return {
              ...t,
              pendingAction: undefined,
              content: launchSuccess
                ? `${t.content}\n\n✅ **Action executed**: **${action.appName}** has been launched.`
                : `${t.content}\n\n❌ **Failed to launch ${action.appName}**: ${launchError}`,
            };
          }
          return t;
        });

        setTurns(newTurns);
        persistConversation(activeConvId, activeConvTitle, newTurns);
      } catch (err) {
        console.error('Failed to execute pending action:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [activeConvId, activeConvTitle, persistConversation, turns]
  );

  const handleDismissPendingAction = useCallback(
    (turnId: string) => {
      const newTurns = turns.map((t) => {
        if (t.id === turnId) {
          return {
            ...t,
            pendingAction: undefined,
            content: `${t.content}\n\n*Action cancelled by user.*`,
          };
        }
        return t;
      });
      setTurns(newTurns);
      persistConversation(activeConvId, activeConvTitle, newTurns);
    },
    [activeConvId, activeConvTitle, persistConversation, turns]
  );

  return {
    turns,
    setTurns,
    isProcessing,
    activeConvId,
    activeConvTitle,
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
  };
}
