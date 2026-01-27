'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthenticatedApi } from '@/hooks/use-authenticated-api';
import { 
  getCache, 
  setCache, 
  getCacheTimestamp, 
  isCacheStale, 
  wasCacheInvalidated,
  CACHE_KEYS,
  invalidateContentCache 
} from '@/lib/cache';

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  link: string;
  contentType: string;
  contentSource: string;
  thumbnailUrl: string | null;
  readTime: number;
  personalNotes: string;
  personalNotesBlocks?: any[];
  tagsId: string[];
  createdAt: string;
  updatedAt: string;
}

interface UseContentOptions {
  /** Initial limit for pagination */
  limit?: number;
  /** Auto-refresh on window focus */
  revalidateOnFocus?: boolean;
  /** Stale time in milliseconds before background revalidation */
  staleTime?: number;
}

interface UseContentReturn {
  content: ContentItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Cache data structure for localStorage
interface CachedContentData {
  items: ContentItem[];
  offset: number;
  hasMore: boolean;
}

// In-memory cache for instant access during session
interface ContentCache {
  data: ContentItem[];
  timestamp: number;
  offset: number;
  hasMore: boolean;
  userId: string | null;
}

let globalCache: ContentCache = {
  data: [],
  timestamp: 0,
  offset: 0,
  hasMore: false,
  userId: null
};

// Re-export invalidateContentCache for external use
export { invalidateContentCache };

export function useContent(options: UseContentOptions = {}): UseContentReturn {
  const {
    limit = 50,
    revalidateOnFocus = true,
    staleTime = 300000, // 5 minutes stale time (increased for better caching)
  } = options;

  const { user } = useAuth();
  const api = useAuthenticatedApi();
  
  // Initialize state from global cache or localStorage
  const [content, setContent] = useState<ContentItem[]>(() => {
    // Try in-memory cache first
    if (user && globalCache.userId === user.id && globalCache.data.length > 0) {
      return globalCache.data;
    }
    // Try localStorage cache
    if (user) {
      const cached = getCache<CachedContentData>(CACHE_KEYS.CONTENT, user.id);
      if (cached && cached.items.length > 0) {
        // Hydrate global cache from localStorage
        globalCache = {
          data: cached.items,
          timestamp: getCacheTimestamp(CACHE_KEYS.CONTENT, user.id),
          offset: cached.offset,
          hasMore: cached.hasMore,
          userId: user.id,
        };
        return cached.items;
      }
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
    if (user && globalCache.userId === user.id && globalCache.data.length > 0) {
      return false;
    }
    // Check localStorage cache
    if (user) {
      const cached = getCache<CachedContentData>(CACHE_KEYS.CONTENT, user.id);
      if (cached && cached.items.length > 0) {
        return false;
      }
    }
    return true;
  });

  const [error, setError] = useState<string | null>(null);
  
  const [hasMore, setHasMore] = useState(() => {
    if (user && globalCache.userId === user.id) {
      return globalCache.hasMore;
    }
    if (user) {
      const cached = getCache<CachedContentData>(CACHE_KEYS.CONTENT, user.id);
      if (cached) return cached.hasMore;
    }
    return false;
  });
  
  const [offset, setOffset] = useState(() => {
    if (user && globalCache.userId === user.id) {
      return globalCache.offset;
    }
    if (user) {
      const cached = getCache<CachedContentData>(CACHE_KEYS.CONTENT, user.id);
      if (cached) return cached.offset;
    }
    return 0;
  });

  const isFetching = useRef<boolean>(false);
  // Initialize from global cache timestamp to prevent unnecessary refetches on remount
  const lastFetchTimestamp = useRef<number>(globalCache.timestamp);

  const fetchContent = useCallback(async (isLoadMore = false, forceRefresh = false) => {
    if (!user) {
      setContent([]);
      setLoading(false);
      return;
    }

    // If cache belongs to a different user, reset it
    if (globalCache.userId !== user.id) {
      globalCache = {
        data: [],
        timestamp: 0,
        offset: 0,
        hasMore: false,
        userId: user.id
      };
      lastFetchTimestamp.current = 0;
    }

    // Prevent concurrent fetches
    if (isFetching.current) return;

    // Check if cache was invalidated by another action (e.g., adding content)
    // Use globalCache.timestamp for the check since it persists across remounts
    const wasInvalidated = wasCacheInvalidated(CACHE_KEYS.CONTENT, globalCache.timestamp);

    // Check if data is still fresh (not stale) and not invalidated
    const now = Date.now();
    const cacheIsFresh = !forceRefresh && 
                         !wasInvalidated && 
                         !isLoadMore && 
                         globalCache.data.length > 0 && 
                         (now - globalCache.timestamp) < staleTime;
    
    if (cacheIsFresh) {
      // Sync local state if needed
      if (content.length === 0) {
        setContent(globalCache.data);
        setHasMore(globalCache.hasMore);
        setOffset(globalCache.offset);
      }
      setLoading(false);
      return;
    }

    isFetching.current = true;
    lastFetchTimestamp.current = now;
    
    // Only show loading spinner on initial load, not on background revalidation
    if ((globalCache.data.length === 0 || isLoadMore) && content.length === 0) {
      setLoading(true);
    }
    
    setError(null);

    try {
      const currentOffset = isLoadMore ? offset : 0;
      
      const data = await api.post(`${BACKEND_URL}/api/user-database/content/get`, {
        limit,
        offset: currentOffset,
        sortBy: 'newest',
      });

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch content');
      }

      const items: ContentItem[] = data.data || [];
      
      if (isLoadMore) {
        // Update Global Cache
        globalCache.data = [...globalCache.data, ...items];
        globalCache.offset = currentOffset + items.length;
        
        // Update Local State
        setContent(globalCache.data);
        setOffset(globalCache.offset);
      } else {
        // Update Global Cache
        globalCache.data = items;
        globalCache.offset = items.length;
        
        // Update Local State
        setContent(items);
        setOffset(items.length);
      }

      const newHasMore = data.pagination?.hasMore || false;
      globalCache.hasMore = newHasMore;
      globalCache.timestamp = Date.now();
      globalCache.userId = user.id;

      setHasMore(newHasMore);

      // Persist to localStorage
      setCache<CachedContentData>(
        CACHE_KEYS.CONTENT,
        {
          items: globalCache.data,
          offset: globalCache.offset,
          hasMore: globalCache.hasMore,
        },
        user.id
      );

    } catch (err) {
      console.error('[useContent] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      if (err instanceof Error && err.message === 'Authentication expired') {
        setContent([]);
        globalCache.data = [];
      }
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [user, offset, limit, staleTime, content.length, api]);

  // Initial fetch
  useEffect(() => {
    fetchContent();
  }, [user]); // Only refetch when user changes

  // Revalidate on window focus (only if stale or invalidated)
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      // Check if cache was invalidated or is stale
      const now = Date.now();
      const wasInvalidated = wasCacheInvalidated(CACHE_KEYS.CONTENT, globalCache.timestamp);
      const isStale = (now - globalCache.timestamp) >= staleTime;
      
      if (wasInvalidated || isStale) {
        fetchContent(false, true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, staleTime, fetchContent]);

  // Listen for storage events (cross-tab cache invalidation)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CACHE_KEYS.CONTENT_INVALIDATED) {
        // Cache was invalidated in another tab, refetch
        fetchContent(false, true);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchContent]);

  const refetch = useCallback(async () => {
    // Invalidate cache and force refetch
    invalidateContentCache();
    globalCache.timestamp = 0;
    await fetchContent(false, true);
  }, [fetchContent]);

  const loadMore = useCallback(async () => {
    if (hasMore && !loading) {
      await fetchContent(true);
    }
  }, [hasMore, loading, fetchContent]);

  return {
    content,
    loading,
    error,
    refetch,
    hasMore,
    loadMore,
  };
}

export default useContent;
