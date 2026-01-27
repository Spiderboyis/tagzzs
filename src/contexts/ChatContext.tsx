"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import { refreshCreditBalance } from "@/hooks/useCreditBalance";
import { getCache, setCache, getCacheTimestamp, CACHE_KEYS, invalidateCache } from "@/lib/cache";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Stale time for AI chats cache (10 minutes)
const AI_CHATS_STALE_TIME = 600000;

// Helper to invalidate AI chats cache
export const invalidateAIChatsCache = () => invalidateCache(CACHE_KEYS.AI_CHATS);

// Message types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatListItem {
  chatId: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  preview: string;
}

interface ChatContextType {
  // State
  messages: ChatMessage[];
  currentChatId: string | null;
  chatList: ChatListItem[];
  isLoading: boolean;
  isSending: boolean;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  newChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  refreshChatList: () => Promise<void>;
  
  // UI State
  isChatOpen: boolean;
  setChatOpen: (isOpen: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Generate UUID for messages
function generateId(): string {
  return (
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const api = useAuthenticatedApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isChatOpen, setChatOpen] = useState(false);
  const lastFetchTimestamp = useRef<number>(0);
  const isFetching = useRef<boolean>(false);

  // Refresh chat list from backend with caching
  const refreshChatList = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    // Prevent concurrent fetches
    if (isFetching.current) return;

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCache<ChatListItem[]>(CACHE_KEYS.AI_CHATS, user.id);
      const cacheTimestamp = getCacheTimestamp(CACHE_KEYS.AI_CHATS, user.id);
      const now = Date.now();
      // Use cache if it exists and is not stale
      if (cached !== null && cacheTimestamp > 0 && (now - cacheTimestamp) < AI_CHATS_STALE_TIME) {
        setChatList(cached);
        lastFetchTimestamp.current = cacheTimestamp;
        return;
      }
    }

    isFetching.current = true;

    try {
      const data = await api.get(
        `${BACKEND_URL}/api/user-database/ai-chats/list`
      );

      if (data.success && data.chats) {
        setChatList(data.chats);
        // Cache the result
        setCache(CACHE_KEYS.AI_CHATS, data.chats, user.id);
        lastFetchTimestamp.current = Date.now();
      }
    } catch (error) {
      console.error("Failed to fetch chat list:", error);
    } finally {
      isFetching.current = false;
    }
  }, [user?.id, api]);

  // Load chat list on mount (when user is authenticated)
  useEffect(() => {
    if (user?.id) {
      // Try to load from cache immediately
      const cached = getCache<ChatListItem[]>(CACHE_KEYS.AI_CHATS, user.id);
      if (cached !== null) {
        setChatList(cached);
        lastFetchTimestamp.current = getCacheTimestamp(CACHE_KEYS.AI_CHATS, user.id);
      }
      // Then refresh in background if needed (will check stale time)
      refreshChatList();
    }
  }, [user?.id, refreshChatList]);

  // Load a specific chat
  const loadChat = useCallback(
    async (chatId: string) => {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const data = await api.get(
          `${BACKEND_URL}/api/user-database/ai-chats/get?chatId=${encodeURIComponent(
            chatId
          )}`
        );

        if (data.success && data.data) {
          setCurrentChatId(chatId);
          setMessages(data.data.messages || []);
        }
      } catch (error) {
        console.error("Failed to load chat:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, api]
  );

  // Start a new chat
  const newChat = useCallback(() => {
    setCurrentChatId(null);
    setMessages([]);
  }, []);

  // Delete a chat
  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!user?.id) return;

      try {
        await api.delete(
          `${BACKEND_URL}/api/user-database/ai-chats/delete?chatId=${encodeURIComponent(
            chatId
          )}`
        );

        // If we deleted the current chat, clear it
        if (currentChatId === chatId) {
          newChat();
        }
        // Invalidate cache and force refresh
        invalidateCache(CACHE_KEYS.AI_CHATS);
        lastFetchTimestamp.current = 0;
        await refreshChatList(true);
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    },
    [user?.id, currentChatId, newChat, refreshChatList, api]
  );

  // Save current chat to backend
  const saveChat = useCallback(
    async (msgs: ChatMessage[], chatId: string) => {
      if (!user?.id || msgs.length === 0) return;

      try {
        // Generate title from first user message
        const firstUserMsg = msgs.find((m) => m.role === "user");
        const title = firstUserMsg?.content.slice(0, 50) || "New Chat";

        await api.post(`${BACKEND_URL}/api/user-database/ai-chats/save`, {
          chatId,
          title,
          messages: msgs,
        });

        // Invalidate cache and force refresh after saving
        invalidateCache(CACHE_KEYS.AI_CHATS);
        lastFetchTimestamp.current = 0;
        await refreshChatList(true);
      } catch (error) {
        console.error("Failed to save chat:", error);
      }
    },
    [user?.id, refreshChatList, api]
  );

  // Send a message and get AI response
  const sendMessage = useCallback(
    async (text: string) => {
      if (!user?.id || !text.trim() || isSending) return;

      const chatId = currentChatId || generateId();
      if (!currentChatId) {
        setCurrentChatId(chatId);
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsSending(true);

      try {
        // Call ReAct Agent API (uses agent.py + react_agent.py)
        const data = await api.post(`${BACKEND_URL}/ai-agent/query`, {
          query: text.trim(),
          user_id: user.id,
          conversation_history: messages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
        });

        let aiContent = "Sorry, I encountered an error. Please try again.";

        if (data.success && data.answer) {
          aiContent = data.answer;
        } else if (data.error) {
          aiContent = `Error: ${data.error}`;
        }

        // Add AI response
        const aiMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: aiContent,
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, aiMessage];
        setMessages(finalMessages);
        setIsSending(false);

        // Save to backend
        await saveChat(finalMessages, chatId);

        // Refresh credit balance after successful AI response
        refreshCreditBalance();
      } catch (error) {
        console.error("[ChatContext] 🔴 Chat error:", error);
        setIsSending(false);

        // Add error message with more details
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: `Sorry, I encountered an error: ${
            error instanceof Error ? error.message : "Unknown error"
          }. Please try again.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
    [user?.id, currentChatId, messages, isSending, saveChat, api]
  );

  const value: ChatContextType = {
    messages,
    currentChatId,
    chatList,
    isLoading,
    isSending,
    isChatOpen,
    setChatOpen,
    sendMessage,
    loadChat,
    newChat,
    deleteChat,
    refreshChatList,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

export default ChatProvider;
