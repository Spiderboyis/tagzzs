import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Sparkles,
  Upload,
  Plus,
  ChevronDown,
  Lightbulb,
  CheckSquare,
  Brain,
  Database,
  Link2,
  FileText,
  Clock,
  Loader2,
  Calendar,
  ArrowRight,
  GripVertical,
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { useExtraction } from "@/hooks/useExtraction";
import { useTags, Tag, invalidateTagsCache } from "@/hooks/useTags";
import { useToast } from "@/hooks/use-toast";
import { CreditBalanceDisplay } from "@/components/CreditBalanceDisplay";
import { invalidateContentCache } from "@/hooks/useContent";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "url" | "database" | "document" | "ideation";
type ViewState = "capture" | "analyzing" | "preview";
type IdeaType = "idea" | "todo" | null;

export function QuickCaptureModal({ isOpen, onClose }: QuickCaptureModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("url");
  const [viewState, setViewState] = useState<ViewState>("capture");
  const [selectedIdeaType, setSelectedIdeaType] = useState<IdeaType>(null);
  const [ideaContent, setIdeaContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isYouTubeLink, setIsYouTubeLink] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [todoItems, setTodoItems] = useState<
    Array<{ text: string; completed: boolean }>
  >([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTag, setNewTag] = useState("");
  const [ideaTags, setIdeaTags] = useState<string[]>([]);
  const [newIdeaTag, setNewIdeaTag] = useState("");
  const [todoTags, setTodoTags] = useState<string[]>([]);
  const [newTodoTag, setNewTodoTag] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [addingContext, setAddingContext] = useState<
    "none" | "preview" | "metadata"
  >("none");
  const [newChildTagName, setNewChildTagName] = useState("");
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tag Autocomplete State
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const { tags: existingTags } = useTags();

  // Hooks
  const router = useRouter();
  const {
    extractFromUrl,
    uploadAndExtractFile,
    refineText,
    loading: extractionLoading,
    error: extractionError,
  } = useExtraction();
  const { toast } = useToast();

  // Mock preview data
  const [previewData, setPreviewData] = useState({
    title: "",
    description: "",
    tags: [] as (any | any)[], // Support strings or full tag objects // Allow objects with name/parent
    summary: "",
    personalNotes: "",
    source: "",
    thumbnail: "",
    contentType: "article", // default
  });

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Small delay to allow exit animation to start
      const timer = setTimeout(() => {
        setViewState("capture");
        setActiveTab("url");
        setSelectedIdeaType(null);
        setIdeaContent("");
        setUrlInput("");
        setIsYouTubeLink(false);
        setMetadataExpanded(false);
        setTodoItems([]);
        setNewTodoText("");
        setNewTag("");
        setIdeaTags([]);
        setNewIdeaTag("");
        setTodoTags([]);
        setNewTodoTag("");
        setSelectedFile(null);
        setRawContent("");
        setAddingContext("none");
        setNewChildTagName("");
        setEditingTagIndex(null);
        setEditingTagName("");
        setFilteredTags([]);
        setShowTagSuggestions(false);
        setPreviewData({
          title: "",
          description: "",
          tags: [],
          summary: "",
          personalNotes: "",
          source: "",
          thumbnail: "",
          contentType: "article",
        });
      }, 200); // Wait for modal exit animation
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Motion tokens
  const transitions = {
    fast: { duration: 0.15, ease: [0.2, 0, 0, 1] as any },
    standard: { duration: 0.2, ease: [0.2, 0, 0, 1] as any },
    moderate: { duration: 0.25, ease: [0.2, 0, 0, 1] as any },
    modal: { type: "spring" as const, damping: 28, stiffness: 380 },
  };

  // Accent color tokens
  const accentColors = {
    // Primary Accent - Soft Purple (#A78BFA)
    primary: {
      100: "#A78BFA",
      70: "rgba(167, 139, 250, 0.7)",
      60: "rgba(167, 139, 250, 0.6)",
      55: "rgba(167, 139, 250, 0.55)",
      40: "rgba(167, 139, 250, 0.4)",
      25: "rgba(167, 139, 250, 0.25)",
    },
    // Success Accent - Muted Emerald (#4ADE80)
    success: {
      70: "rgba(74, 222, 128, 0.7)",
      40: "rgba(74, 222, 128, 0.4)",
      30: "rgba(74, 222, 128, 0.3)",
    },
    // Attention Accent - Warm Amber (#FACC15)
    warning: {
      45: "rgba(250, 204, 21, 0.45)",
      30: "rgba(250, 204, 21, 0.3)",
    },
  };

  // Helper to detect YouTube URL
  const isYouTubeUrl = (url: string): boolean => {
    const youtubeDomains = [
      "youtube.com",
      "youtu.be",
      "m.youtube.com",
      "www.youtube.com",
    ];
    try {
      const parsed = new URL(url);
      return youtubeDomains.some((domain) => parsed.hostname.includes(domain));
    } catch {
      return false;
    }
  };

  const handleAnalyze = async () => {
    setViewState("analyzing");

    try {
      if (activeTab === "url") {
        const trimmedUrl = urlInput.trim();
        if (!trimmedUrl) {
          toast({
            title: "Error",
            description: "Please enter a URL",
            variant: "destructive",
          });
          setViewState("capture");
          return;
        }

        // Check if YouTube URL
        // (Handled by input change, but double check here)
        if (isYouTubeUrl(trimmedUrl) || isYouTubeLink) {
          toast({
            title: "Coming Soon",
            description: "YouTube analysis coming soon",
          });
          setViewState("capture");
          return;
        }

        // Web URL extraction
        const result = await extractFromUrl(trimmedUrl);
        if (result) {
          const content = result.content || {};
          const metadata = result.metadata || {};

          setPreviewData({
            title: content.title || metadata.title || "Untitled",
            description: content.summary || content.description || "", // Prefer AI summary for description
            tags: content.tags || [], // Keep full tag objects for hierarchy
            summary: "", // Legacy field removed from UI
            personalNotes: "",
            source: new URL(trimmedUrl).hostname,
            thumbnail: metadata.thumbnailUrl || "",
            contentType: metadata.contentType || "article",
          });
          setRawContent(content.extracted_text || content.rawContent || "");
          setViewState("preview");
        } else {
          toast({
            title: "Error",
            description: extractionError || "Extraction failed",
            variant: "destructive",
          });
          setViewState("capture");
        }
      } else if (activeTab === "document") {
        if (!selectedFile) {
          toast({
            title: "Error",
            description: "Please select a file",
            variant: "destructive",
          });
          setViewState("capture");
          return;
        }

        const result = await uploadAndExtractFile(selectedFile);
        if (result) {
          const content = result.content || {};
          const metadata = result.metadata || {};
          setPreviewData({
            title: content.title || selectedFile.name || "Untitled",
            description: content.summary || content.description || "", // Prefer AI summary
            tags: content.tags || [], // Keep full tag objects
            summary: "",
            personalNotes: "",
            source: "Document",
            thumbnail: metadata.thumbnailUrl || "",
            contentType: metadata.contentType || "document",
          });
          setRawContent(content.extracted_text || content.rawContent || "");
          if (metadata.sourceUrl || (metadata as any).originalUrl) {
            setUrlInput(metadata.sourceUrl || (metadata as any).originalUrl);
          }
          setViewState("preview");
        } else {
          toast({
            title: "Error",
            description: extractionError || "Document extraction failed",
            variant: "destructive",
          });
          setViewState("capture");
        }
      } else if (activeTab === "ideation" && selectedIdeaType === "idea") {
        if (!ideaContent.trim()) {
          toast({
            title: "Error",
            description: "Please enter your idea",
            variant: "destructive",
          });
          setViewState("capture");
          return;
        }

        const result = await refineText(ideaContent);
        if (result) {
          const content = result.content || {};
          setPreviewData({
            title: "My Idea",
            description: ideaContent,
            tags: [...(content.tags || []), ...ideaTags], // Keep full objects + strings
            summary: content.summary || "",
            personalNotes: "",
            source: "Ideation",
            thumbnail: "",
            contentType: "ideation",
          });
          setRawContent(ideaContent);
          setViewState("preview");
        } else {
          toast({
            title: "Error",
            description: extractionError || "Refinement failed",
            variant: "destructive",
          });
          setViewState("capture");
        }
      } else {
        // Fallback for other cases (todo, database tab)
        setViewState("preview");
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setViewState("capture");
    }
  };

  // Handle URL input change
  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    const isYT = isYouTubeUrl(value);
    if (isYT && !isYouTubeLink) {
      toast({
        title: "Youtube",
        description: "youtube analysis coming soon",
      });
    }
    setIsYouTubeLink(isYT);
  };

  const handleSave = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const BACKEND_URL =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

      const sortedTags = getSortedTags();

      // Sanitize Parents: Enforce strict linear chain (R -> H -> D) based on visual order/levels
      // This fixes issues where 'parent' might be stale or incorrect
      const sanitizedTagsData = sortedTags.map((tag, index) => {
        const name = typeof tag === "string" ? tag : tag.name;
        // IMPORTANT strict parent enforcement: Parent is always the tag at index-1
        const parent =
          index > 0
            ? typeof sortedTags[index - 1] === "string"
              ? sortedTags[index - 1]
              : sortedTags[index - 1].name
            : null;

        return {
          name,
          level: index,
          parent,
        };
      });

      // Get the leaf tag (last one in sorted list)
      const leafTag =
        sanitizedTagsData.length > 0
          ? sanitizedTagsData[sanitizedTagsData.length - 1]
          : null;

      // tagsId should only contain the leaf tag
      const tagsId = leafTag ? [leafTag.name] : [];

      // tagsData sends the full hierarchical chain
      const tagsData = sanitizedTagsData;

      const payload = {
        link: urlInput || "ideation://local",
        title: previewData.title,
        description: previewData.description,
        contentType:
          previewData.contentType ||
          (activeTab === "document"
            ? "document"
            : activeTab === "ideation"
              ? "ideation"
              : "article"),
        personalNotes: previewData.personalNotes,
        readTime: "",
        tagsId: tagsId,
        tagsData: tagsData,
        thumbnailUrl: previewData.thumbnail || null,
        rawContent: rawContent,
        summary: "", // No longer sending separate summary
      };

      console.log("--- DEBUG: Save Payload ---", payload);
      console.log("--- DEBUG: Tags ID ---", tagsId);
      console.log("--- DEBUG: Tags Data ---", tagsData);

      const response = await fetch(
        `${BACKEND_URL}/api/user-database/content/add`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Failed to save content");
      }

      // Invalidate caches so data is refreshed on next load
      invalidateContentCache();
      invalidateTagsCache(); // Tags may have new content counts

      toast({
        title: "Success",
        description: "Content saved successfully!",
      });
      onClose();

      // Reset state
      setViewState("capture");
      setSelectedIdeaType(null);
      setIdeaContent("");
      setUrlInput("");
      setMetadataExpanded(false);
      setSelectedFile(null);
      setRawContent("");
      setPreviewData({
        title: "",
        description: "",
        tags: [],
        summary: "",
        personalNotes: "",
        source: "",
        thumbnail: "",
        contentType: "article",
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save content",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addTodoItem = () => {
    if (newTodoText.trim()) {
      setTodoItems([
        ...todoItems,
        { text: newTodoText.trim(), completed: false },
      ]);
      setNewTodoText("");
    }
  };

  const toggleTodoItem = (index: number) => {
    setTodoItems(
      todoItems.map((item, i) =>
        i === index ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  const addTag = (tagToAdd?: string) => {
    const tag = tagToAdd || newTag.trim();
    if (!tag) return;

    // Check if tag already exists (check name property if object)
    const exists = previewData.tags.some((t) => {
      const tName = typeof t === "string" ? t : t.name;
      return tName.toLowerCase() === tag.toLowerCase();
    });

    if (!exists) {
      setPreviewData({
        ...previewData,
        tags: [...previewData.tags, tag],
      });
      setNewTag("");
      setShowTagSuggestions(false);
    }
  };

  const handleTagInputChange = (value: string) => {
    setNewTag(value);
    if (!value.trim()) {
      setFilteredTags([]);
      setShowTagSuggestions(false);
      return;
    }

    const filtered = existingTags
      .filter(
        (tag) =>
          tag.tagName.toLowerCase().includes(value.toLowerCase()) &&
          !previewData.tags.some((t) => {
            const tName = typeof t === "string" ? t : t.name;
            return tName === tag.tagName;
          }),
      )
      .slice(0, 5); // Limit to 5 suggestions

    setFilteredTags(filtered);
    setShowTagSuggestions(filtered.length > 0);
  };

  const removeTag = (tagToRemove: string | any) => {
    const nameToRemove =
      typeof tagToRemove === "string" ? tagToRemove : tagToRemove.name;
    setPreviewData({
      ...previewData,
      tags: previewData.tags.filter((tag) => {
        const tName = typeof tag === "string" ? tag : tag.name;
        return tName !== nameToRemove;
      }),
    });
  };

  const addIdeaTag = () => {
    if (newIdeaTag.trim() && !ideaTags.includes(newIdeaTag.trim())) {
      setIdeaTags([...ideaTags, newIdeaTag.trim()]);
      setNewIdeaTag("");
    }
  };

  const removeIdeaTag = (tagToRemove: string) => {
    setIdeaTags(ideaTags.filter((tag) => tag !== tagToRemove));
  };

  const addTodoTag = () => {
    if (newTodoTag.trim() && !todoTags.includes(newTodoTag.trim())) {
      setTodoTags([...todoTags, newTodoTag.trim()]);
      setNewTodoTag("");
    }
  };

  const removeTodoTag = (tagToRemove: string) => {
    setTodoTags(todoTags.filter((tag) => tag !== tagToRemove));
  };

  // Helper: Sort tags by hierarchy level (0 -> 1 -> 2)
  const getSortedTags = () => {
    const tags = previewData.tags;
    if (!tags.length) return [];

    // Sort by level ascending
    return [...tags].sort((a, b) => {
      const levelA = typeof a === "object" ? (a.level ?? 0) : 0;
      const levelB = typeof b === "object" ? (b.level ?? 0) : 0;
      return levelA - levelB;
    });
  };

  // Helper: Get tag display name
  const getTagName = (tag: any) => (typeof tag === "string" ? tag : tag.name);

  // Helper: Get parent tag name (first tag or explicit parent type)
  const getParentTagName = () => {
    const sorted = getSortedTags();
    if (!sorted.length) return null;
    const first = sorted[0];
    return getTagName(first);
  };

  // Add child tag
  const addChildTag = () => {
    const name = newChildTagName.trim();
    if (!name) return;

    const parentName = getParentTagName();
    const exists = previewData.tags.some(
      (t) => getTagName(t).toLowerCase() === name.toLowerCase(),
    );

    if (!exists) {
      const sorted = getSortedTags();
      const lastTag = sorted[sorted.length - 1];
      const lastLevel = typeof lastTag === "object" ? (lastTag.level ?? 0) : 0;
      const parentName = typeof lastTag === "object" ? lastTag.name : lastTag;

      const newTag = {
        name,
        level: lastLevel + 1,
        parent: sorted.length > 0 ? parentName : null,
      };
      setPreviewData({
        ...previewData,
        tags: [...previewData.tags, newTag],
      });
    }

    setNewChildTagName("");
    setAddingContext("none");
  };

  // Handle tag edit
  const startEditingTag = (index: number, name: string) => {
    setEditingTagIndex(index);
    setEditingTagName(name);
  };

  const finishEditingTag = () => {
    if (editingTagIndex === null) return;

    const name = editingTagName.trim();
    if (!name) {
      setEditingTagIndex(null);
      return;
    }

    const sortedTags = getSortedTags();
    const oldTag = sortedTags[editingTagIndex];
    const oldName = getTagName(oldTag);

    if (oldName === name) {
      setEditingTagIndex(null);
      return;
    }

    // Update the tag and its children's parent references
    const updatedTags = previewData.tags.map((tag) => {
      const tagName = getTagName(tag);
      const isTarget = tagName === oldName;

      if (isTarget) {
        if (typeof tag === "string") return name;
        return { ...tag, name: name };
      }

      // Update parent reference if it matches
      if (typeof tag === "object" && tag.parent === oldName) {
        return { ...tag, parent: name };
      }

      return tag;
    });

    setPreviewData({
      ...previewData,
      tags: updatedTags,
    });
    setEditingTagIndex(null);
    setEditingTagName("");
  };

  // Handle tag reorder
  const handleTagReorder = (newOrder: any[]) => {
    if (!newOrder.length) return;

    // Re-assign levels based on new order
    const updatedTags = newOrder.map((tag, index) => {
      const name = typeof tag === "string" ? tag : tag.name;
      // Previous tag is parent (if index > 0)
      const parentName =
        index > 0
          ? typeof newOrder[index - 1] === "string"
            ? newOrder[index - 1]
            : newOrder[index - 1].name
          : null;

      return {
        name,
        level: index,
        parent: parentName,
      };
    });

    setPreviewData({
      ...previewData,
      tags: updatedTags,
    });
  };

  const tabs = [
    { id: "url" as TabType, label: "URL", icon: Link2 },
    { id: "database" as TabType, label: "Database", icon: Database },
    { id: "document" as TabType, label: "Document", icon: FileText },
    { id: "ideation" as TabType, label: "Ideation", icon: Lightbulb },
  ];

  const ideaTypes = [
    {
      id: "idea" as IdeaType,
      icon: Lightbulb,
      title: "Ideas worth remembering",
      description: "Capture thoughts, insights, and creative sparks",
    },
    {
      id: "todo" as IdeaType,
      icon: CheckSquare,
      title: "To-Do List",
      description: "Track tasks and stay organized",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            onClick={onClose}
            style={{
              backgroundColor: "rgba(0,0,0,0.85)",
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={transitions.modal}
            className="relative w-full max-w-175 max-h-[85vh] overflow-hidden rounded-4xl bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: "0 24px 48px rgba(0,0,0,0.75)",
            }}
          >
            {/* Header */}
            <div className="px-8 pt-7 pb-5 border-b border-white/6">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Quick Capture
                  </h2>
                  <p className="text-sm mt-0.5 text-white/90">
                    Let's start organizing
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <CreditBalanceDisplay compact />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className="p-2 rounded-xl transition-all hover:bg-white/6 text-white/45 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-8 border-b border-white/6">
              <div className="flex gap-8 -mb-px">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setViewState("capture");
                        setSelectedIdeaType(null);
                      }}
                      className={`relative py-3.5 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                        activeTab === tab.id
                          ? "text-white"
                          : "text-white/45 hover:text-white/75"
                      }`}
                      style={{
                        transition: "color 0.2s cubic-bezier(0.2, 0, 0, 1)",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{tab.label}</span>
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                          transition={transitions.modal}
                          style={{
                            background: accentColors.primary[70],
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-6">
                {/* Capture State */}
                {viewState === "capture" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5"
                  >
                    {/* URL Tab */}
                    {activeTab === "url" && (
                      <div className="space-y-6">
                        {/* URL Input */}
                        <div className="relative">
                          <Link2 className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/45" />
                          <input
                            type="text"
                            value={urlInput}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            placeholder="Paste a URL here..."
                            className="w-full pl-14 pr-5 py-4 rounded-2xl border border-white/6 bg-zinc-900/50 text-white placeholder:text-white/45 transition-all outline-none"
                            style={{
                              boxShadow: "none",
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor =
                                accentColors.primary[100];
                              e.target.style.boxShadow = `0 0 0 1px ${accentColors.primary[100]}`;
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor =
                                "rgba(255,255,255,0.06)";
                              e.target.style.boxShadow = "none";
                            }}
                          />
                        </div>

                        {/* Formats Supported */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold tracking-wider text-white/60">
                            FORMATS SUPPORTED
                          </h4>
                          <div className="space-y-2.5">
                            {/* <div className="flex items-center gap-2.5 text-sm text-white/90">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Youtube</span>
                            </div> */}
                            <div className="flex items-center gap-2.5 text-sm text-white/90">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Images</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-sm text-white/90">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Website/Substack</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-sm text-white/90">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Google Slides/Docs etc.</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-sm text-white/90">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Online Documents</span>
                            </div>
                          </div>
                        </div>

                        {/* Tip */}
                        <p className="text-xs text-white/60">
                          Tip: Use the share option and click TAGZZS to directly
                          save
                        </p>

                        {/* Analyze Button */}
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={handleAnalyze}
                          className={`w-full py-3.5 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-[#EDEDED]`}
                        >
                          <Sparkles className="w-4 h-4" />
                          Analyze with KAI AI
                        </motion.button>
                      </div>
                    )}

                    {/* Database Tab */}
                    {activeTab === "database" && (
                      <div className="space-y-5">
                        <div className="py-20 text-center">
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Clock className="w-20 h-20 mx-auto mb-6 text-white/25" />
                            <h3 className="text-4xl font-semibold mb-3 text-white">
                              Coming Soon.....
                            </h3>
                            <p className="text-white/70">
                              Stay tuned with TAGZZS
                            </p>
                          </motion.div>
                        </div>
                      </div>
                    )}

                    {/* Document Tab */}
                    {activeTab === "document" && (
                      <div className="space-y-6">
                        {/* Hidden file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setSelectedFile(file);
                          }}
                        />

                        <div
                          className="rounded-2xl border-2 border-dashed border-white/6 p-16 text-center bg-zinc-900/30 hover:border-white/10 transition-all cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files?.[0];
                            if (file) setSelectedFile(file);
                          }}
                        >
                          {selectedFile ? (
                            <>
                              <FileText className="w-14 h-14 mx-auto mb-4 text-green-400" />
                              <p className="mb-2 text-white font-medium">
                                {selectedFile.name}
                              </p>
                              <p className="text-sm text-white/45">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                              </p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-14 h-14 mx-auto mb-4 text-white/45" />
                              <p className="mb-2 text-white">
                                Drag & Drop a document here
                              </p>
                              <p className="text-sm mb-6 text-white/45">OR</p>
                              <button className="px-6 py-2.5 rounded-xl font-medium transition-all bg-white text-black hover:bg-[#EDEDED]">
                                Upload a document
                              </button>
                            </>
                          )}
                        </div>

                        {/* Supported formats */}
                        <div className="flex items-center gap-2 text-xs text-white/45">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
                          <span>pdf, docx, pptx, images supported</span>
                        </div>

                        {/* Analyze Button */}
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={handleAnalyze}
                          disabled={!selectedFile || extractionLoading}
                          className={`w-full py-3.5 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 ${
                            selectedFile && !extractionLoading
                              ? "bg-white text-black hover:bg-[#EDEDED]"
                              : "bg-white/25 text-white/50 cursor-not-allowed"
                          }`}
                        >
                          {extractionLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          Analyze with KAI AI
                        </motion.button>
                      </div>
                    )}

                    {/* Ideation Tab */}
                    {activeTab === "ideation" && (
                      <div className="space-y-5">
                        {/* Card-Style Type Selection */}
                        <div className="space-y-5">
                          <div className="py-20 text-center">
                            <motion.div
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <Clock className="w-20 h-20 mx-auto mb-6 text-white/25" />
                              <h3 className="text-4xl font-semibold mb-3 text-white">
                                Coming Soon.....
                              </h3>
                              <p className="text-white/70">
                                Stay tuned with TAGZZS
                              </p>
                            </motion.div>
                          </div>
                        </div>

                        {/* Dynamic Editor */}
                        <AnimatePresence mode="wait">
                          {selectedIdeaType && (
                            <motion.div
                              key={selectedIdeaType}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-4 overflow-hidden"
                            >
                              {selectedIdeaType === "todo" ? (
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={newTodoText}
                                      onChange={(e) =>
                                        setNewTodoText(e.target.value)
                                      }
                                      onKeyPress={(e) =>
                                        e.key === "Enter" && addTodoItem()
                                      }
                                      placeholder="Add a task..."
                                      className="flex-1 px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white placeholder:text-white/45 focus:border-white/12 transition-all outline-none"
                                    />
                                    <button
                                      onClick={addTodoItem}
                                      className="px-4 py-2.5 rounded-xl transition-all bg-white/6 text-white hover:bg-white/10"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>

                                  {todoItems.length > 0 && (
                                    <div className="rounded-xl border border-white/6 bg-[#0B0B0D]/50 p-3 space-y-2">
                                      {todoItems.map((item, index) => (
                                        <div
                                          key={index}
                                          className="flex items-center gap-2"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={item.completed}
                                            onChange={() =>
                                              toggleTodoItem(index)
                                            }
                                            className="w-4 h-4 rounded"
                                          />
                                          <span
                                            className={`text-sm ${
                                              item.completed
                                                ? "text-white/25 line-through"
                                                : "text-white/90"
                                            }`}
                                          >
                                            {item.text}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Tags Section for To-Do */}
                                  <div>
                                    <label className="block text-sm font-medium mb-2 text-white/70">
                                      Tags
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={newTodoTag}
                                        onChange={(e) =>
                                          setNewTodoTag(e.target.value)
                                        }
                                        onKeyPress={(e) =>
                                          e.key === "Enter" && addTodoTag()
                                        }
                                        placeholder="Add a tag..."
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white placeholder:text-white/45 focus:border-white/12 transition-all outline-none"
                                      />
                                      <button
                                        onClick={addTodoTag}
                                        className="p-2.5 rounded-xl transition-all bg-white/6 text-white hover:bg-white/10 cursor-pointer"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {/* Display To-Do Tags */}
                                    {todoTags.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {todoTags.map((tag) => (
                                          <span
                                            key={tag}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-white/6 text-white/90 border border-white/6"
                                          >
                                            {tag}
                                            <button
                                              onClick={() => removeTodoTag(tag)}
                                              className="p-0.5 rounded-full transition-all hover:bg-white/10"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className="w-full py-3.5 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-[#EDEDED]"
                                  >
                                    <Calendar className="w-4 h-4" />
                                    Schedule with KAI AI
                                  </motion.button>
                                </div>
                              ) : (
                                <>
                                  <textarea
                                    value={ideaContent}
                                    onChange={(e) =>
                                      setIdeaContent(e.target.value)
                                    }
                                    placeholder="What's on your mind?"
                                    rows={5}
                                    className="w-full px-5 py-4 rounded-2xl border border-white/6 bg-[#0B0B0D] text-white placeholder:text-white/45 focus:border-white/12 transition-all outline-none resize-none"
                                  />

                                  {/* Tags Section for Ideas */}
                                  <div>
                                    <label className="block text-sm font-medium mb-2 text-white/70">
                                      Tags
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={newIdeaTag}
                                        onChange={(e) =>
                                          setNewIdeaTag(e.target.value)
                                        }
                                        onKeyPress={(e) =>
                                          e.key === "Enter" && addIdeaTag()
                                        }
                                        placeholder="Add a tag..."
                                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white placeholder:text-white/45 focus:border-white/12 transition-all outline-none"
                                      />
                                      <button
                                        onClick={addIdeaTag}
                                        className="p-2.5 rounded-xl transition-all bg-white/6 text-white hover:bg-white/10 cursor-pointer"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {/* Display Idea Tags */}
                                    {ideaTags.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {ideaTags.map((tag) => (
                                          <span
                                            key={tag}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-white/6 text-white/90 border border-white/6"
                                          >
                                            {tag}
                                            <button
                                              onClick={() => removeIdeaTag(tag)}
                                              className="p-0.5 rounded-full transition-all hover:bg-white/10"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className="w-full py-3.5 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-[#EDEDED]"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    Refine with KAI AI
                                  </motion.button>
                                </>
                              )}

                              <div className="flex items-center gap-2 text-xs text-white/45">
                                <Brain className="w-3.5 h-3.5" />
                                <span>
                                  KAI will auto-organize this after you save
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Analyzing State */}
                {viewState === "analyzing" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-16 text-center space-y-6"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{
                        repeat: Infinity,
                        duration: 2,
                        ease: "easeInOut",
                      }}
                      className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/6 relative overflow-hidden"
                    >
                      {/* AI Shimmer Effect */}
                      <motion.div
                        className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${accentColors.primary[60]}, transparent)`,
                        }}
                        animate={{
                          x: ["-100%", "200%"],
                        }}
                        transition={{
                          repeat: Infinity,
                          duration: 2,
                          ease: "linear",
                        }}
                      />
                      <Brain
                        className="w-5 h-5 relative z-10"
                        style={{ color: accentColors.primary[70] }}
                      />
                      <span className="font-medium text-white relative z-10">
                        KAI is analyzing...
                      </span>
                    </motion.div>
                  </motion.div>
                )}

                {/* Preview State */}
                {viewState === "preview" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-5"
                  >
                    {/* Large Video Preview Card */}
                    <div
                      className="rounded-2xl border border-white/6 overflow-hidden bg-[#0B0B0D]/50"
                      style={{
                        boxShadow: "0 12px 24px rgba(0,0,0,0.6)",
                      }}
                    >
                      {/* Thumbnail */}
                      <div className="relative w-full h-64 bg-[#000000]">
                        {previewData.thumbnail ? (
                          <img
                            src={previewData.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <Sparkles className="w-12 h-12 opacity-50" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-5 space-y-4">
                        <h3 className="text-lg text-white">
                          {previewData.title}
                        </h3>

                        {/* Source with icon */}
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 bg-white rounded flex items-center justify-center">
                            <div className="w-3 h-3 bg-black rounded-sm" />
                          </div>
                          <span className="text-sm text-white/70">
                            {previewData.source}
                          </span>
                        </div>

                        {/* Tags - Hierarchical Display with Drag-and-Drop */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Reorder.Group
                              axis="x"
                              values={getSortedTags()}
                              onReorder={handleTagReorder}
                              className="flex items-center gap-1 flex-wrap"
                            >
                              {getSortedTags().map((tag, index) => (
                                <Reorder.Item
                                  key={getTagName(tag)}
                                  value={tag}
                                  className="flex items-center group relative cursor-grab active:cursor-grabbing"
                                  whileDrag={{
                                    scale: 1.05,
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                                    zIndex: 50,
                                  }}
                                >
                                  {/* Arrow before child tags (except first) */}
                                  {index > 0 && (
                                    <ArrowRight className="w-3.5 h-3.5 text-white/30 mr-0.5 shrink-0" />
                                  )}
                                  {/* Badge */}
                                  <div
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                      editingTagIndex === index
                                        ? "bg-white/10 border-[#A78BFA] ring-1 ring-[#A78BFA]/50"
                                        : "bg-white/6 text-white/75 border-white/6 hover:bg-white/10"
                                    }`}
                                  >
                                    <GripVertical className="w-3 h-3 text-white/30 shrink-0" />
                                    {editingTagIndex === index ? (
                                      <input
                                        type="text"
                                        value={editingTagName}
                                        onChange={(e) =>
                                          setEditingTagName(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            finishEditingTag();
                                          if (e.key === "Escape")
                                            setEditingTagIndex(null);
                                        }}
                                        onBlur={finishEditingTag}
                                        autoFocus
                                        className="bg-transparent border-none outline-none text-white w-24 text-sm"
                                      />
                                    ) : (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startEditingTag(
                                            index,
                                            getTagName(tag),
                                          );
                                        }}
                                        className="cursor-text hover:text-white truncate max-w-37.5"
                                      >
                                        {getTagName(tag)}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeTag(tag);
                                      }}
                                      className="p-0.5 ml-1 rounded-full hover:bg-white/15 transition-colors shrink-0"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </Reorder.Item>
                              ))}
                            </Reorder.Group>

                            {/* Add Button - OUTSIDE Reorder.Group */}
                            {getSortedTags().length > 0 && (
                              <ArrowRight className="w-4 h-4 text-white/30 mx-1 shrink-0" />
                            )}
                            {addingContext === "preview" ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={newChildTagName}
                                  onChange={(e) =>
                                    setNewChildTagName(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") addChildTag();
                                    if (e.key === "Escape")
                                      setAddingContext("none");
                                  }}
                                  onBlur={() => {
                                    if (!newChildTagName.trim()) {
                                      setAddingContext("none");
                                    }
                                  }}
                                  placeholder="New tag..."
                                  autoFocus
                                  className="px-3 py-1.5 rounded-full text-sm bg-white/6 text-white placeholder:text-white/45 border border-white/12 outline-none focus:border-[#A78BFA] w-28"
                                />
                                <button
                                  onClick={addChildTag}
                                  className="p-1.5 rounded-full bg-white/6 hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5 text-white/75" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddingContext("preview");
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-white/6 text-white/60 border border-dashed border-white/12 hover:border-white/25 hover:text-white/80 transition-all cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Label */}
                    <div className="flex items-center gap-2 text-xs text-white/45">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>After analyzing with KAI AI</span>
                    </div>

                    {/* Metadata Section */}
                    <div>
                      <button
                        onClick={() => setMetadataExpanded(!metadataExpanded)}
                        className="flex items-center justify-between w-full py-3 px-4 rounded-xl transition-all hover:bg-white/6 text-white/70 hover:text-white cursor-pointer"
                      >
                        <span className="text-sm font-medium">
                          Edit details (optional)
                        </span>
                        <motion.div
                          animate={{ rotate: metadataExpanded ? 180 : 0 }}
                          transition={transitions.standard}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </motion.div>
                      </button>

                      <AnimatePresence>
                        {metadataExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-4 space-y-4">
                              <div>
                                <label className="block text-sm font-medium mb-2 text-white/70">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={previewData.title}
                                  onChange={(e) =>
                                    setPreviewData({
                                      ...previewData,
                                      title: e.target.value,
                                    })
                                  }
                                  className="w-full px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white focus:border-white/12 transition-all outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium mb-2 text-white/70">
                                  Description
                                </label>
                                <textarea
                                  value={previewData.description}
                                  onChange={(e) =>
                                    setPreviewData({
                                      ...previewData,
                                      description: e.target.value,
                                    })
                                  }
                                  rows={3}
                                  className="w-full px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white focus:border-white/12 transition-all outline-none resize-none"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium mb-2 text-white/70">
                                  Tags
                                </label>
                                {/* Hierarchical Tags with Drag-and-Drop */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Reorder.Group
                                    axis="x"
                                    values={getSortedTags()}
                                    onReorder={handleTagReorder}
                                    className="flex items-center gap-1 flex-wrap"
                                  >
                                    {getSortedTags().map((tag, index) => (
                                      <Reorder.Item
                                        key={getTagName(tag)}
                                        value={tag}
                                        className="flex items-center group relative cursor-grab active:cursor-grabbing"
                                        whileDrag={{
                                          scale: 1.05,
                                          zIndex: 50,
                                        }}
                                      >
                                        {/* Arrow before child tags (except first) */}
                                        {index > 0 && (
                                          <ArrowRight className="w-4 h-4 text-white/30 mx-1 shrink-0" />
                                        )}

                                        {/* Badge */}
                                        <div
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors shadow-sm ${
                                            editingTagIndex === index
                                              ? "bg-white/10 border-[#A78BFA] ring-1 ring-[#A78BFA]/50"
                                              : "bg-white/6 text-white/75 border-white/6 hover:bg-white/10"
                                          }`}
                                        >
                                          <GripVertical className="w-3 h-3 text-white/30 shrink-0" />
                                          {editingTagIndex === index ? (
                                            <input
                                              type="text"
                                              value={editingTagName}
                                              onChange={(e) =>
                                                setEditingTagName(
                                                  e.target.value,
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter")
                                                  finishEditingTag();
                                                if (e.key === "Escape")
                                                  setEditingTagIndex(null);
                                              }}
                                              onBlur={finishEditingTag}
                                              autoFocus
                                              className="bg-transparent border-none outline-none text-white w-24 text-sm"
                                            />
                                          ) : (
                                            <span
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                startEditingTag(
                                                  index,
                                                  getTagName(tag),
                                                );
                                              }}
                                              className="cursor-text hover:text-white truncate max-w-37.5"
                                            >
                                              {getTagName(tag)}
                                            </span>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeTag(tag);
                                            }}
                                            className="p-0.5 ml-1 rounded-full hover:bg-white/15 transition-colors shrink-0"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </Reorder.Item>
                                    ))}
                                  </Reorder.Group>

                                  {/* Add Button - OUTSIDE Reorder.Group */}
                                  {getSortedTags().length > 0 && (
                                    <ArrowRight className="w-4 h-4 text-white/30 mx-1 shrink-0" />
                                  )}
                                  {addingContext === "metadata" ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={newChildTagName}
                                        onChange={(e) =>
                                          setNewChildTagName(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") addChildTag();
                                          if (e.key === "Escape")
                                            setAddingContext("none");
                                        }}
                                        onBlur={() => {
                                          if (!newChildTagName.trim()) {
                                            setAddingContext("none");
                                          }
                                        }}
                                        placeholder="New tag..."
                                        autoFocus
                                        className="px-3 py-1.5 rounded-full text-sm bg-white/6 text-white placeholder:text-white/45 border border-white/12 outline-none focus:border-[#A78BFA] w-28"
                                      />
                                      <button
                                        onClick={addChildTag}
                                        className="p-1.5 rounded-full bg-white/6 hover:bg-white/10 transition-colors cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5 text-white/75" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAddingContext("metadata");
                                      }}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-white/6 text-white/60 border border-dashed border-white/12 hover:border-white/25 hover:text-white/80 transition-all cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Add</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium mb-2 text-white/70">
                                  Personal Notes
                                </label>
                                <textarea
                                  value={previewData.personalNotes}
                                  onChange={(e) =>
                                    setPreviewData({
                                      ...previewData,
                                      personalNotes: e.target.value,
                                    })
                                  }
                                  placeholder="Optional..."
                                  rows={3}
                                  className="w-full px-4 py-2.5 rounded-xl border border-white/6 bg-[#0B0B0D] text-white placeholder:text-white/45 focus:border-white/12 transition-all outline-none resize-none"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-white/6 bg-[#141416]/80 backdrop-blur-xl">
              <div className="flex items-center justify-end gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl font-medium transition-all text-white/70 hover:text-white hover:bg-white/6 cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={
                    isLoading ||
                    viewState === "analyzing" ||
                    (activeTab === "ideation" && !selectedIdeaType)
                  }
                  className={`px-8 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                    isLoading ||
                    viewState === "analyzing" ||
                    (activeTab === "ideation" && !selectedIdeaType)
                      ? "bg-white/25 text-white/25 cursor-not-allowed"
                      : "bg-white text-black hover:bg-[#EDEDED] cursor-pointer"
                  }`}
                  style={{
                    boxShadow: "0 12px 24px rgba(0,0,0,0.6)",
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
