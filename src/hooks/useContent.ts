'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthenticatedApi } from '@/hooks/use-authenticated-api';

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

// Global cache to persist data across page navigation
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

export function useContent(options: UseContentOptions = {}): UseContentReturn {
  const {
    limit = 50,
    revalidateOnFocus = true,
    staleTime = 60000, // 1 minute stale time
  } = options;

  const { user } = useAuth();
  const api = useAuthenticatedApi();
  
  // Initialize state from global cache if valid for current user
  const [content, setContent] = useState<ContentItem[]>(() => {
    if (user && globalCache.userId === user.id) {
        return globalCache.data;
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
     if (user && globalCache.userId === user.id && globalCache.data.length > 0) {
         return false;
     }
     return true;
  });

  const [error, setError] = useState<string | null>(null);
  
  const [hasMore, setHasMore] = useState(() => {
      if (user && globalCache.userId === user.id) {
          return globalCache.hasMore;
      }
      return false;
  });
  
  const [offset, setOffset] = useState(() => {
      if (user && globalCache.userId === user.id) {
          return globalCache.offset;
      }
      return 0;
  });

  const isFetching = useRef<boolean>(false);

  const fetchContent = useCallback(async (isLoadMore = false) => {
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
    }

    // Prevent concurrent fetches
    if (isFetching.current) return;

    // Check if data is still fresh (not stale)
    const now = Date.now();
    if (!isLoadMore && globalCache.data.length > 0 && (now - globalCache.timestamp) < staleTime) {
      // Sync local state if needed (though initial state should handle it)
      if (content.length === 0) {
          setContent(globalCache.data);
          setHasMore(globalCache.hasMore);
          setOffset(globalCache.offset);
      }
      setLoading(false);
      return;
    }

    isFetching.current = true;
    
    // Only show loading spinner on initial load, not on background revalidation
    // But if we have cached data, don't show loading unless it is explicitly loadMore
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

  // Revalidate on window focus
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      // Only revalidate if data is stale
      const now = Date.now();
      if ((now - globalCache.timestamp) >= staleTime) {
        fetchContent();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, staleTime, fetchContent]);

  const refetch = useCallback(async () => {
    globalCache.timestamp = 0; // Force refetch by marking as stale
    await fetchContent();
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
