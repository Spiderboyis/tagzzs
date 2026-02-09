"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useContent, invalidateContentCache } from "@/hooks/useContent";
import { useTags, getTagLineage, invalidateTagsCache } from "@/hooks/useTags";
import { useAuthenticatedApi } from "@/hooks/use-authenticated-api";
import DetailView from "@/app/database/components/DetailView";
import { X, SidebarSimple, Sparkle } from "@phosphor-icons/react";
import LibrarySidebar from "@/app/database/components/LibrarySidebar";
import NeuralMapSidebar from "@/app/database/components/NeuralMapSidebar";
import FloatingSearchBar from "@/app/database/components/FloatingSearchBar";
import { buildTreeData } from "@/utils/buildTreeData";
import { ContentSkeleton } from "@/components/ui/ContentSkeleton";
import { useToast } from "@/hooks/use-toast";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ContentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("source");
  const isNeuralSource = source === "neural-graph";

  const id = params.id as string;

  // Fetch content and tags
  const { content, loading: contentLoading } = useContent();
  const { tagsMap, tagTree, loading: tagsLoading } = useTags();

  // API for deletion
  const api = useAuthenticatedApi();
  const { toast } = useToast();

  // Processing status state
  const [processingStatus, setProcessingStatus] = useState<
    "pending" | "processing" | "completed" | "failed" | null
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const processingItems = JSON.parse(
          localStorage.getItem("processingContent") || "[]",
        );
        if (processingItems.some((p: any) => p.contentId === id)) {
          return "pending";
        }
      } catch (e) {
        console.error("Error reading localStorage", e);
      }
    }
    return null;
  });

  // Poll for processing status when content is pending/processing
  useEffect(() => {
    // Check localStorage first for immediate feedback after redirect
    if (typeof window !== "undefined") {
      const processingItems = JSON.parse(
        localStorage.getItem("processingContent") || "[]",
      );
      const isLocalProcessing = processingItems.some(
        (p: any) => p.contentId === id,
      );
      if (isLocalProcessing) {
        setProcessingStatus("pending");
      }
    }

    const item = content.find((c) => c.id === id);
    if (item) {
      const status = item.processingStatus;
      if (status && status !== processingStatus) {
        setProcessingStatus(status);
      }
    }

    // Function to poll status
    const pollStatus = async () => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/user-database/content/status/${id}`,
          {
            credentials: "include",
          },
        );
        if (response.ok) {
          const data = await response.json();
          const newStatus = data.data?.processingStatus;

          if (newStatus) {
            setProcessingStatus(newStatus);
          }

          if (newStatus === "completed") {
            invalidateContentCache();
            toast({
              title: "Content Processed",
              description: `${data.data?.title || "Content"} is extracted successfully`,
            });

            // Remove from localStorage processing list
            const processingItems = JSON.parse(
              localStorage.getItem("processingContent") || "[]",
            );
            const updated = processingItems.filter(
              (p: any) => p.contentId !== id,
            );
            localStorage.setItem("processingContent", JSON.stringify(updated));
            return true; // Stop polling
          } else if (newStatus === "failed") {
            toast({
              title: "Processing Failed",
              description:
                "Content extraction failed. Basic information has been saved.",
              variant: "destructive",
            });
            return true; // Stop polling
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
      return false; // Continue polling
    };

    // Start polling if we are pending/processing or if we found it in localStorage
    // OR if we don't have the item yet but suspect it might be processing (handled by initial localStorage check)
    let pollInterval: NodeJS.Timeout;

    const startPolling = async () => {
      // Check immediately
      const stop = await pollStatus();
      if (!stop) {
        pollInterval = setInterval(async () => {
          const shouldStop = await pollStatus();
          if (shouldStop) clearInterval(pollInterval);
        }, 3000);
      }
    };

    // Only start polling if we are in a pending state or item is not loaded yet (to be safe/robust)
    // Actually, simply polling if status is not explicitly completed/failed is safer for this transition.
    if (
      processingStatus === "pending" ||
      processingStatus === "processing" ||
      !item
    ) {
      startPolling();
    }

    return () => clearInterval(pollInterval);
  }, [id, content, toast]); // Removed processingStatus dependency to avoid re-trigger loops, rely on internal checks

  // Build tree structure from real data
  const treeData = useMemo(() => {
    if (contentLoading || tagsLoading) return [];
    return buildTreeData(tagTree, content, tagsMap);
  }, [tagTree, content, tagsMap, contentLoading, tagsLoading]);

  // Find the current item
  const currentItem = useMemo(() => {
    return content.find((item) => item.id === id);
  }, [content, id]);

  // Derived state for DetailView
  const currentDetailItem = useMemo(() => {
    if (!currentItem) return null;

    const tags = currentItem.tagsId
      .map((tagId) => tagsMap.get(tagId))
      .filter((t: any) => t !== undefined);

    return {
      id: currentItem.id,
      image: currentItem.thumbnailUrl || `/default.jpg`,
      category: tags[0]?.tagName || "General",
      subCategory: tags[1]?.tagName || "",
      title: currentItem.title,
      desc: currentItem.description || "No description available.",
      content: currentItem.personalNotes || "", // Display personal notes in Notes section
      contentBlocks: currentItem.personalNotesBlocks, // Pass block data
      tags: tags.map((t: any) => {
        let name = t.tagName;
        // If name matches UUID regex, try to resolve it (legacy)
        if (UUID_REGEX.test(name)) {
          const original = tagsMap.get(name);
          if (original) name = original.tagName;
        }

        // Generate lineage breadcrumb
        const lineage = getTagLineage(t.id, tagsMap);
        if (lineage.length > 0) {
          name = lineage.join(" > ");
        }

        return { id: t.id, name };
      }),
      _original: currentItem,
    };
  }, [currentItem, tagsMap]);

  // Siblings for navigation
  const allItemsTransformed = useMemo(() => {
    return content.map((item) => {
      const tags = item.tagsId
        .map((tagId) => tagsMap.get(tagId))
        .filter((t: any) => t !== undefined);

      return {
        id: item.id,
        category: tags[0]?.tagName || "General",
        subCategory: tags[1]?.tagName || "",
      };
    });
  }, [content, tagsMap]);

  // Sidebar States
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [sidebarExpandedCats, setSidebarExpandedCats] = useState<Set<string>>(
    new Set(),
  );
  const graphRef = useRef<SVGSVGElement>(null);

  // View State
  const [isEditing, setIsEditing] = useState(false);
  const [aiSummaryVisible, setAiSummaryVisible] = useState(true);
  const [aiSummaryText, setAiSummaryText] = useState("");

  const isLoading = contentLoading || tagsLoading;

  // Handlers
  const handleNavigate = useCallback(
    (direction: number) => {
      if (!content.length) return;
      const currentIndex = content.findIndex((item) => item.id === id);
      if (currentIndex === -1) return;

      const newIndex = currentIndex + direction;
      if (newIndex >= 0 && newIndex < content.length) {
        if (isNeuralSource) {
          router.push(`/content/${content[newIndex].id}?source=neural-graph`);
        } else {
          router.push(`/content/${content[newIndex].id}`);
        }
      }
    },
    [content, id, router, isNeuralSource],
  );

  const handleToggleSummary = useCallback(() => {
    setAiSummaryVisible((prev) => !prev);
  }, []);

  const handleToggleSidebarCat = useCallback((name: string) => {
    setSidebarExpandedCats((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(name)) newSet.delete(name);
      else newSet.add(name);
      return newSet;
    });
  }, []);

  const handleUpdateView = useCallback(
    (name: string) => {
      // Navigate to database view with filter
      router.push(`/database?filter=${encodeURIComponent(name)}`);
    },
    [router],
  );

  // Delete Handler
  const handleDelete = useCallback(async () => {
    if (!currentDetailItem) return;

    try {
      await api.callApi(`${BACKEND_URL}/api/user-database/content/delete`, {
        method: "DELETE",
        body: { contentId: currentDetailItem.id },
      });

      // Invalidate caches
      invalidateContentCache();
      invalidateTagsCache();

      // Redirect to database/neural on success
      if (isNeuralSource) {
        router.push("/neural-graph");
      } else {
        router.push("/database");
      }
    } catch (error) {
      console.error("Failed to delete content:", error);
    }
  }, [currentDetailItem, api, router, isNeuralSource]);

  // Save Handler
  const handleSave = useCallback(
    async (updates: {
      personalNotes?: string;
      personalNotesBlocks?: any[];
      description?: string;
      tagsId?: string[];
    }) => {
      if (!currentDetailItem) return;

      try {
        await api.callApi(`${BACKEND_URL}/api/user-database/content/edit`, {
          method: "PUT",
          body: {
            contentId: currentDetailItem.id,
            ...updates,
          },
        });

        // Invalidate content cache so changes are reflected
        invalidateContentCache();
        if (updates.tagsId) {
          invalidateTagsCache(); // Tags may have updated content counts
        }
      } catch (error) {
        console.error("Failed to update content:", error);
      }
    },
    [currentDetailItem, api],
  );

  // Handle Tag Removal
  const handleRemoveTag = useCallback(
    async (tagIdToRemove: string) => {
      if (!currentItem || !tagsMap) return;

      let newTagsIds = currentItem.tagsId.filter((id) => id !== tagIdToRemove);

      // Map to Uncategorized if no tags left
      if (newTagsIds.length === 0) {
        // Find "Uncategorized" or "General" tag
        let fallbackTag = Array.from(tagsMap.values()).find(
          (t: any) => t.tagName.toLowerCase() === "uncategorized",
        );
        if (!fallbackTag) {
          fallbackTag = Array.from(tagsMap.values()).find(
            (t: any) => t.tagName.toLowerCase() === "general",
          );
        }

        if (fallbackTag) {
          newTagsIds = [fallbackTag.id];
        }
      }

      await handleSave({ tagsId: newTagsIds });
    },
    [currentItem, tagsMap, handleSave],
  );

  // Search Mode State for Floating Bar
  const [searchMode, setSearchMode] = useState<"DB" | "AI">("DB");

  return (
    <div className="flex h-screen w-full bg-black overflow-hidden relative">
      {/* Left Sidebar (Library) */}
      <LibrarySidebar
        isSidebarOpen={isSidebarOpen}
        treeData={treeData}
        currentFilter={currentDetailItem?.category || "All"}
        sidebarExpandedCats={sidebarExpandedCats}
        onToggleSidebarCat={handleToggleSidebarCat}
        onUpdateView={handleUpdateView}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        activeContentId={id}
      />

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-hidden relative flex flex-col min-w-0">
        {!isSidebarOpen && (
          <div className="absolute top-4 left-4 z-50">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="bg-black/50 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white p-2 rounded-lg transition-colors backdrop-blur-sm shadow-xl"
              title="Open Library"
            >
              <SidebarSimple weight="bold" />
            </button>
          </div>
        )}

        {isLoading ? (
          <ContentSkeleton />
        ) : processingStatus === "pending" ||
          processingStatus === "processing" ? (
          <ContentSkeleton />
        ) : !currentDetailItem ? (
          // If explicitly failed, or if we are not expecting it (null status), show Not Found
          // If completed but not yet in list, show loading
          processingStatus === "completed" ? (
            <ContentSkeleton />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-black text-white gap-4">
              <div className="w-16 h-16 mb-2 rounded-full bg-zinc-800 flex items-center justify-center">
                <X size={32} className="text-zinc-600" />
              </div>
              <p className="text-lg">Content not found</p>
              <button
                onClick={() =>
                  router.push(isNeuralSource ? "/neural-graph" : "/dashboard")
                }
                className="mt-4 text-zinc-400 hover:text-white border border-zinc-700 px-4 py-2 rounded-lg transition-colors"
              >
                Return to {isNeuralSource ? "Neural Graph" : "Dashboard"}
              </button>
            </div>
          )
        ) : (
          <DetailView
            currentDetailItem={currentDetailItem}
            allItems={allItemsTransformed}
            isEditing={isEditing}
            aiSummaryVisible={aiSummaryVisible}
            aiSummaryText={
              aiSummaryText || "AI summary generation not yet connected."
            }
            onBack={() =>
              router.push(isNeuralSource ? "/neural-graph" : "/database")
            }
            onNavigate={handleNavigate}
            onToggleEditing={() => setIsEditing(!isEditing)}
            onToggleSummary={handleToggleSummary}
            onDelete={handleDelete}
            onSave={handleSave}
            onRemoveTag={handleRemoveTag}
          />
        )}
      </div>

      {/* Right Sidebar (Neural Map & AI Chat) */}
      <NeuralMapSidebar
        currentFilter={currentDetailItem?.category || "All"}
        currentDetailItem={currentDetailItem}
        graphRef={graphRef}
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
      />

      {!isRightSidebarOpen && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setIsRightSidebarOpen(true)}
            className="bg-black/50 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white p-2 rounded-lg transition-colors backdrop-blur-sm shadow-xl"
            title="Open AI Assistant"
          >
            <Sparkle weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
