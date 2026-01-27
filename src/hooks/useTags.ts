'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthenticatedApi } from '@/hooks/use-authenticated-api';
import { 
  getCache, 
  setCache, 
  getCacheTimestamp, 
  wasCacheInvalidated,
  CACHE_KEYS,
  invalidateTagsCache 
} from '@/lib/cache';

export interface Tag {
  id: string;
  tagName: string;
  tagColor: string;
  description: string;
  contentCount: number;
  parentId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagNode extends Tag {
  children: TagNode[];
  level: number;
}

interface UseTagsOptions {
  /** Auto-refresh on window focus */
  revalidateOnFocus?: boolean;
  /** Stale time in milliseconds before background revalidation (default: 10 min for tags) */
  staleTime?: number;
}

interface UseTagsReturn {
  tags: Tag[];
  tagTree: TagNode[];
  tagsMap: Map<string, Tag>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getTagById: (id: string) => Tag | undefined;
  getTagsByIds: (ids: string[]) => Tag[];
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// In-memory cache for tags
interface TagsCache {
  data: Tag[];
  timestamp: number;
  userId: string | null;
}

let globalTagsCache: TagsCache = {
  data: [],
  timestamp: 0,
  userId: null
};

// Re-export invalidateTagsCache for external use
export { invalidateTagsCache };

export function useTags(options: UseTagsOptions = {}): UseTagsReturn {
  const {
    revalidateOnFocus = true,
    staleTime = 600000, // 10 minutes stale time for tags (increased)
  } = options;

  const { user } = useAuth();
  const api = useAuthenticatedApi();
  
  // Initialize state from global cache or localStorage
  const [tags, setTags] = useState<Tag[]>(() => {
    // Try in-memory cache first
    if (user && globalTagsCache.userId === user.id && globalTagsCache.data.length > 0) {
      return globalTagsCache.data;
    }
    // Try localStorage cache
    if (user) {
      const cached = getCache<Tag[]>(CACHE_KEYS.TAGS, user.id);
      if (cached && cached.length > 0) {
        // Hydrate global cache from localStorage
        globalTagsCache = {
          data: cached,
          timestamp: getCacheTimestamp(CACHE_KEYS.TAGS, user.id),
          userId: user.id,
        };
        return cached;
      }
    }
    return [];
  });
  
  const [loading, setLoading] = useState(() => {
    if (user && globalTagsCache.userId === user.id && globalTagsCache.data.length > 0) {
      return false;
    }
    // Check localStorage cache
    if (user) {
      const cached = getCache<Tag[]>(CACHE_KEYS.TAGS, user.id);
      if (cached && cached.length > 0) {
        return false;
      }
    }
    return true;
  });
  
  const [error, setError] = useState<string | null>(null);

  const isFetching = useRef<boolean>(false);
  // Initialize from global cache timestamp to prevent unnecessary refetches on remount
  const lastFetchTimestamp = useRef<number>(globalTagsCache.timestamp);

  const fetchTags = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setTags([]);
      setLoading(false);
      return;
    }
    
    // If cache belongs to a different user, reset it
    if (globalTagsCache.userId !== user.id) {
      globalTagsCache = {
        data: [],
        timestamp: 0,
        userId: user.id
      };
      lastFetchTimestamp.current = 0;
    }

    // Prevent concurrent fetches
    if (isFetching.current) return;

    // Check if cache was invalidated by another action
    // Use globalTagsCache.timestamp for the check since it persists across remounts
    const wasInvalidated = wasCacheInvalidated(CACHE_KEYS.TAGS, globalTagsCache.timestamp);

    // Check if data is still fresh (not stale) and not invalidated
    const now = Date.now();
    const cacheIsFresh = !forceRefresh && 
                         !wasInvalidated && 
                         globalTagsCache.data.length > 0 && 
                         (now - globalTagsCache.timestamp) < staleTime;
    
    if (cacheIsFresh) {
      if (tags.length === 0) {
        setTags(globalTagsCache.data);
      }
      setLoading(false);
      return;
    }

    isFetching.current = true;
    lastFetchTimestamp.current = now;
    
    // Only show loading spinner on initial load if we don't have cached data
    if (tags.length === 0 && globalTagsCache.data.length === 0) {
      setLoading(true);
    }
    
    setError(null);

    try {
      const data = await api.post(`${BACKEND_URL}/api/user-database/tags/get`, {});

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch tags');
      }

      // Map backend response ensuring parentId is included
      const items: Tag[] = (data.data || []).map((t: any) => ({
        id: t.id,
        tagName: t.tagName,
        tagColor: t.tagColor || '#808080',
        description: t.description || '',
        contentCount: t.contentCount || 0,
        parentId: t.parentId || null,
        userId: user?.id || '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
      
      // Update Global Cache
      globalTagsCache.data = items;
      globalTagsCache.timestamp = Date.now();
      globalTagsCache.userId = user.id;

      setTags(items);

      // Persist to localStorage
      setCache<Tag[]>(CACHE_KEYS.TAGS, items, user.id);

    } catch (err) {
      console.error('[useTags] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      if (err instanceof Error && err.message === 'Authentication expired') {
        setTags([]);
        globalTagsCache.data = [];
      }
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [user, staleTime, tags.length, api]);

  // Create a Map for O(1) lookups
  const tagsMap = useMemo(() => {
    const map = new Map<string, Tag>();
    tags.forEach(tag => map.set(tag.id, tag));
    return map;
  }, [tags]);

  // Build hierarchical tree from flat tags using parent_id
  const tagTree = useMemo(() => {
    const nodeMap: Record<string, TagNode> = {};
    const roots: TagNode[] = [];

    // Create TagNode for each tag
    tags.forEach((tag) => {
      nodeMap[tag.id] = { ...tag, children: [], level: 0 };
    });

    // Build tree by linking children to parents
    tags.forEach((tag) => {
      const node = nodeMap[tag.id];
      if (tag.parentId && nodeMap[tag.parentId]) {
        const parent = nodeMap[tag.parentId];
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort alphabetically
    const sortNodes = (nodes: TagNode[]) => {
      nodes.sort((a, b) => a.tagName.localeCompare(b.tagName));
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }, [tags]);

  // Helper to get a single tag by ID
  const getTagById = useCallback((id: string): Tag | undefined => {
    return tagsMap.get(id);
  }, [tagsMap]);

  // Helper to get multiple tags by IDs
  const getTagsByIds = useCallback((ids: string[]): Tag[] => {
    return ids.map(id => tagsMap.get(id)).filter((tag): tag is Tag => tag !== undefined);
  }, [tagsMap]);

  // Initial fetch
  useEffect(() => {
    fetchTags();
  }, [user]); // Only refetch when user changes

  // Revalidate on window focus (only if stale or invalidated)
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      // Check if cache was invalidated or is stale
      const now = Date.now();
      const wasInvalidated = wasCacheInvalidated(CACHE_KEYS.TAGS, globalTagsCache.timestamp);
      const isStale = (now - globalTagsCache.timestamp) >= staleTime;
      
      if (wasInvalidated || isStale) {
        fetchTags(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidateOnFocus, staleTime, fetchTags]);

  // Listen for storage events (cross-tab cache invalidation)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CACHE_KEYS.TAGS_INVALIDATED) {
        // Cache was invalidated in another tab, refetch
        fetchTags(true);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchTags]);

  const refetch = useCallback(async () => {
    // Invalidate cache and force refetch
    invalidateTagsCache();
    globalTagsCache.timestamp = 0;
    await fetchTags(true);
  }, [fetchTags]);

  return {
    tags,
    tagTree,
    tagsMap,
    loading,
    error,
    refetch,
    getTagById,
    getTagsByIds,
  };
}

export default useTags;
/**
 * Helper to rebuild the lineage of a tag (Breadcrumbs)
 * Returns array of tag names: [Root, Child, Grandchild...]
 */
export function getTagLineage(tagId: string, tagsMap: Map<string, Tag>): string[] {
    const lineage: string[] = [];
    let currentId: string | null = tagId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const tag = tagsMap.get(currentId);
        if (tag) {
            lineage.unshift(tag.tagName);
            currentId = tag.parentId;
        } else {
            // Tag not found in map, stop
            // Possibly try to resolve by name if ID was actually a name (legacy issues)
            // But strict ID lookup is safer.
            currentId = null;
        }
    }
    
    return lineage;
}
