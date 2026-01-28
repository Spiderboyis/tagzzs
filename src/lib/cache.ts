'use client';

/**
 * Cache utility for persisting data across sessions
 * Combines localStorage persistence with in-memory cache for performance
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string;
  version: number;
}

// Cache version - increment this when cache structure changes
const CACHE_VERSION = 1;

// Cache keys
export const CACHE_KEYS = {
  CONTENT: 'tagzzs_content_cache',
  TAGS: 'tagzzs_tags_cache',
  PROFILE: 'tagzzs_profile_cache',
  AI_CHATS: 'tagzzs_ai_chats_cache',
  CONTENT_INVALIDATED: 'tagzzs_content_invalidated',
  TAGS_INVALIDATED: 'tagzzs_tags_invalidated',
  PROFILE_INVALIDATED: 'tagzzs_profile_invalidated',
  AI_CHATS_INVALIDATED: 'tagzzs_ai_chats_invalidated',
} as const;

// In-memory cache for instant access
const memoryCache = new Map<string, CacheEntry<any>>();

/**
 * Get cached data from memory or localStorage
 */
export function getCache<T>(key: string, userId: string): T | null {
  // Check memory cache first
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.userId === userId && memEntry.version === CACHE_VERSION) {
    return memEntry.data;
  }

  // Fall back to localStorage
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const entry: CacheEntry<T> = JSON.parse(stored);
    
    // Validate cache entry
    if (entry.userId !== userId || entry.version !== CACHE_VERSION) {
      localStorage.removeItem(key);
      return null;
    }

    // Update memory cache
    memoryCache.set(key, entry);
    
    return entry.data;
  } catch (err) {
    console.warn('[Cache] Failed to read from localStorage:', err);
    return null;
  }
}

/**
 * Get cache timestamp
 */
export function getCacheTimestamp(key: string, userId: string): number {
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.userId === userId) {
    return memEntry.timestamp;
  }

  if (typeof window === 'undefined') return 0;
  
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return 0;

    const entry: CacheEntry<any> = JSON.parse(stored);
    if (entry.userId !== userId || entry.version !== CACHE_VERSION) {
      return 0;
    }
    
    return entry.timestamp;
  } catch {
    return 0;
  }
}

/**
 * Set cache data in both memory and localStorage
 */
export function setCache<T>(key: string, data: T, userId: string): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    userId,
    version: CACHE_VERSION,
  };

  // Update memory cache
  memoryCache.set(key, entry);

  // Persist to localStorage
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (err) {
    console.warn('[Cache] Failed to write to localStorage:', err);
    // If localStorage is full, try clearing old caches
    try {
      localStorage.removeItem(CACHE_KEYS.CONTENT);
      localStorage.removeItem(CACHE_KEYS.TAGS);
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Ignore if still fails
    }
  }
}

/**
 * Invalidate specific cache
 */
export function invalidateCache(key: string): void {
  memoryCache.delete(key);
  
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(key);
    // Set invalidation flag for cross-tab communication
    const invalidationKeyMap: Record<string, string> = {
      [CACHE_KEYS.CONTENT]: CACHE_KEYS.CONTENT_INVALIDATED,
      [CACHE_KEYS.TAGS]: CACHE_KEYS.TAGS_INVALIDATED,
      [CACHE_KEYS.PROFILE]: CACHE_KEYS.PROFILE_INVALIDATED,
      [CACHE_KEYS.AI_CHATS]: CACHE_KEYS.AI_CHATS_INVALIDATED,
    };
    const invalidationKey = invalidationKeyMap[key];
    if (invalidationKey) {
      localStorage.setItem(invalidationKey, Date.now().toString());
    }
  } catch (err) {
    console.warn('[Cache] Failed to invalidate cache:', err);
  }
}

/**
 * Check if cache was invalidated (by another tab or action)
 */
export function wasCacheInvalidated(key: string, sinceTimestamp: number): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const invalidationKeyMap: Record<string, string> = {
      [CACHE_KEYS.CONTENT]: CACHE_KEYS.CONTENT_INVALIDATED,
      [CACHE_KEYS.TAGS]: CACHE_KEYS.TAGS_INVALIDATED,
      [CACHE_KEYS.PROFILE]: CACHE_KEYS.PROFILE_INVALIDATED,
      [CACHE_KEYS.AI_CHATS]: CACHE_KEYS.AI_CHATS_INVALIDATED,
    };
    const invalidationKey = invalidationKeyMap[key];
    if (!invalidationKey) return false;
    
    const invalidatedAt = localStorage.getItem(invalidationKey);
    
    if (invalidatedAt) {
      const invalidationTime = parseInt(invalidatedAt, 10);
      return invalidationTime > sinceTimestamp;
    }
  } catch {
    // Ignore errors
  }
  
  return false;
}

/**
 * Clear all caches for a user
 */
export function clearAllCaches(): void {
  memoryCache.clear();
  
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(CACHE_KEYS.CONTENT);
    localStorage.removeItem(CACHE_KEYS.TAGS);
    localStorage.removeItem(CACHE_KEYS.PROFILE);
    localStorage.removeItem(CACHE_KEYS.AI_CHATS);
    localStorage.removeItem(CACHE_KEYS.CONTENT_INVALIDATED);
    localStorage.removeItem(CACHE_KEYS.TAGS_INVALIDATED);
    localStorage.removeItem(CACHE_KEYS.PROFILE_INVALIDATED);
    localStorage.removeItem(CACHE_KEYS.AI_CHATS_INVALIDATED);
  } catch (err) {
    console.warn('[Cache] Failed to clear caches:', err);
  }
}

/**
 * Check if cache is stale
 */
export function isCacheStale(key: string, userId: string, staleTime: number): boolean {
  const timestamp = getCacheTimestamp(key, userId);
  if (timestamp === 0) return true;
  
  const now = Date.now();
  return (now - timestamp) >= staleTime;
}

/**
 * Invalidate content cache - call this after adding/updating/deleting content
 */
export function invalidateContentCache(): void {
  invalidateCache(CACHE_KEYS.CONTENT);
}

/**
 * Invalidate tags cache - call this after adding/updating/deleting tags
 */
export function invalidateTagsCache(): void {
  invalidateCache(CACHE_KEYS.TAGS);
}

/**
 * Invalidate profile cache - call this after updating profile
 */
export function invalidateProfileCache(): void {
  invalidateCache(CACHE_KEYS.PROFILE);
}

/**
 * Invalidate AI chats cache - call this after adding/deleting chats
 */
export function invalidateAIChatsCache(): void {
  invalidateCache(CACHE_KEYS.AI_CHATS);
}
