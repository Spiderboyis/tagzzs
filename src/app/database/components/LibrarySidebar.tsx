"use client";

import React, { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, SidebarSimple, FileText } from "@phosphor-icons/react";
import { TreeNode } from "@/utils/buildTreeData";

interface LibrarySidebarProps {
  isSidebarOpen: boolean;
  treeData: TreeNode[];
  currentFilter: string;
  sidebarExpandedCats: Set<string>;
  onToggleSidebarCat: (name: string) => void;
  onUpdateView: (name: string) => void;
  onToggleSidebar?: () => void;
  activeContentId?: string;
}

// Recursive Sidebar Item Component
const SidebarNodeRenderer = ({
  node,
  depth,
  currentFilter,
  expandedState,
  toggleExpand,
  onUpdateView,
  onHandleContentClick,
  activeContentId,
}: {
  node: TreeNode;
  depth: number;
  currentFilter: string;
  expandedState: Set<string>;
  toggleExpand: (e: React.MouseEvent, id: string) => void;
  onUpdateView: (name: string) => void;
  onHandleContentClick: (e: React.MouseEvent, id: string) => void;
  activeContentId?: string;
}) => {
  const nodeId = node.tagId || node.name;
  const isExpanded = expandedState.has(nodeId);
  const hasChildren = node.children && node.children.length > 0;
  const hasItems = node.items && node.items.length > 0;
  const isEmpty = !hasChildren && !hasItems;

  // Indentation logic
  const paddingLeft = depth * 12 + 16; // 16px base + 12px per level

  return (
    <div className="flex flex-col select-none">
      {/* Node Header (if name exists) */}
      {node.name && (
        <div
          className={`flex items-center gap-1 py-1 pr-2 hover:bg-white/5 transition-colors cursor-pointer group ${
            node.name === currentFilter
              ? "text-white bg-zinc-900/50"
              : "text-zinc-500"
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={(e) => {
            // If clicked, we might want to update view or toggle expand
            // For Level 0 (Sidebar Categories), existing behavior updates view
            if (depth === 0) onUpdateView(node.name);
            else toggleExpand(e, nodeId);
          }}
        >
          <div
            className={`p-0.5 rounded hover:bg-zinc-800 ${
              hasChildren || hasItems ? "opacity-100" : "opacity-0"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(e, nodeId);
            }}
          >
            <CaretRight
              weight="bold"
              className={`text-[10px] transition-transform duration-200 ${
                isExpanded ? "rotate-90 text-zinc-300" : "text-zinc-600"
              } ${depth === 0 && node.name === currentFilter ? "text-white" : ""}`}
            />
          </div>
          <span
            className={`text-xs font-medium truncate flex-1 group-hover:text-zinc-300 ${
              depth === 0 ? "text-sm font-semibold" : ""
            }`}
          >
            {node.name}
          </span>
        </div>
      )}

      {/* Children & Items Dropdown */}
      <div
        className={`dropdown-wrapper ${isExpanded || !node.name ? "open" : ""}`}
      >
        <div className="dropdown-content flex flex-col border-l border-zinc-800/30 ml-4">
          {/* Render Items */}
          {hasItems &&
            node.items.map((item) => (
              <button
                key={item.id}
                id={`sidebar-item-${item.id}`}
                onClick={(e) => onHandleContentClick(e, item.id)}
                className={`text-left py-1 pr-2 text-xs font-medium rounded-r transition-colors truncate flex items-center gap-2 cursor-pointer ${
                  activeContentId === item.id
                    ? "text-white bg-white/10 ring-1 ring-zinc-700"
                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                }`}
                style={{ paddingLeft: `${Math.max(16, paddingLeft + 12)}px` }}
              >
                <FileText
                  className={`${activeContentId === item.id ? "text-zinc-300" : "text-zinc-600"} shrink-0`}
                  size={12}
                />
                <span className="truncate">{item.title || "Untitled"}</span>
              </button>
            ))}

          {/* Render Children Recursively */}
          {hasChildren &&
            node.children.map((child, idx) => (
              <SidebarNodeRenderer
                key={child.tagId || idx}
                node={child}
                depth={node.name ? depth + 1 : depth} // Don't increase depth if current node was "invisible" (empty name)
                currentFilter={currentFilter}
                expandedState={expandedState}
                toggleExpand={toggleExpand}
                onUpdateView={onUpdateView}
                onHandleContentClick={onHandleContentClick}
                activeContentId={activeContentId}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

function LibrarySidebar({
  isSidebarOpen,
  treeData,
  currentFilter,
  sidebarExpandedCats,
  onToggleSidebarCat,
  onUpdateView,
  onToggleSidebar,
  activeContentId,
}: LibrarySidebarProps) {
  const router = useRouter();

  // Unified expansion state for all levels (except the top level passed in props, but we can merge logic if we want)
  // Props control Level 0 expansion (sidebarExpandedCats). Local state controls deeper levels.
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand to active content
  useState(() => {
    // Helper to find path
    const findPath = (
      nodes: TreeNode[],
      targetId: string,
      path: string[] = [],
    ): string[] | null => {
      for (const node of nodes) {
        const nodeId = node.tagId || node.name;
        // Check items
        if (node.items?.some((item) => item.id === targetId)) {
          return [...path, nodeId];
        }
        // Check children
        if (node.children) {
          const res = findPath(node.children, targetId, [...path, nodeId]);
          if (res) return res;
        }
      }
      return null;
    };

    if (activeContentId && treeData.length > 0) {
      const path = findPath(treeData, activeContentId);
      if (path && path.length > 0) {
        setExpandedNodes((prev) => {
          const next = new Set(prev);
          path.forEach((p) => next.add(p));
          // If the root level is managed by props, we might need to toggle it via props?
          // sidebarExpandedCats is passed in.
          // But our renderer uses 'mergedExpansion'.
          // So setting local state 'expandedNodes' essentially forces them open in our local view.
          return next;
        });

        // Also scroll into view after a delay
        setTimeout(() => {
          const el = document.getElementById(`sidebar-item-${activeContentId}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }
  }); // Run only once on mount? Or when activeContentId changes?
  // We can't use useEffect in ssr/client mix easily without care, but this is 'use client'.
  // Using useState initializer only runs once. We want useEffect.

  // Re-implement as useEffect
  const hasAutoExpandedRef = React.useRef(false); // only auto-expand once per id?

  React.useEffect(() => {
    if (!activeContentId || !treeData.length) return;
    // if (hasAutoExpandedRef.current) return; // Maybe we DO want to re-expand if tree changes?

    const findPath = (
      nodes: TreeNode[],
      targetId: string,
      path: string[] = [],
    ): string[] | null => {
      for (const node of nodes) {
        const nodeId = node.tagId || node.name;
        if (node.items?.some((item) => item.id === targetId)) {
          return [...path, nodeId];
        }
        if (node.children) {
          const res = findPath(node.children, targetId, [...path, nodeId]);
          if (res) return res;
        }
      }
      return null;
    };

    const path = findPath(treeData, activeContentId);
    if (path && path.length > 0) {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        path.forEach((p) => next.add(p));
        return next;
      });

      // Also check if root needs expansion via prop callback?
      // The parent component manages Level 0.
      // path[0] is likely the Level 0 name.
      if (path.length > 0) {
        // We can try to force it open if closed
        if (!sidebarExpandedCats.has(path[0])) {
          // onToggleSidebarCat(path[0]); // This might toggle logic (open->close).
          // If the parent logic is simple toggle, we can't force open easily without checking state.
          // But 'mergedExpansion' combines local + props.
          // So if we add path[0] to local 'expandedNodes', it will be open in renderer REGARDLESS of props.
          // So this is fine!
        }
      }

      setTimeout(() => {
        const el = document.getElementById(`sidebar-item-${activeContentId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [activeContentId, treeData]); // sidebarExpandedCats omitted to avoid loops

  const handleToggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Check if it's a top-level category (sync with parent state)
    // Note: This relies on name matching, which is how sidebarExpandedCats works
    // For deeper levels, use local state

    // We try to check if 'id' exists in sidebarExpandedCats logic (which uses name)
    // But deeper nodes use ID.
    // Let's check complexity: Level 0 uses onToggleSidebarCat(name).
    // Deeper uses local state.
    // We can just use local state for everything? But props are passed down for persistence maybe?
    // Let's mix: if depth 0, call onToggleSidebarCat. Else setExpandedNodes.

    // Actually, let's just use local state for infinite depth simplicity,
    // BUT we must respect the props for Level 0 to keep sidebar sync working if needed.
    // Simplify: Just use local set for everything NOT Level 0?
    // The Renderer doesn't know if it's Level 0 strictly by ID.
    // We pass `toggleExpand` logic wrapped.

    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContentClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    router.push(`/content/${itemId}`);
  };

  // Sync Level 0 expansion with props
  // We can merge the sets for rendering
  const mergedExpansion = new Set([...expandedNodes, ...sidebarExpandedCats]);

  const onToggleWrapper = (e: React.MouseEvent, id: string) => {
    // If it exists in sidebarExpandedCats (Level 0 names), toggle that
    // Otherwise toggle local
    // This is a bit heuristic since names could collide with IDs but unlikely for UUIDs
    // Better: if it's a root node name.
    // Let's just try local toggle for now, but also call the prop if it matches a root name?
    // Or simplify: The SidebarNodeRenderer calls this.

    const isRoot = treeData.some(
      (root) => root.tagId === id || root.name === id,
    );
    if (isRoot) {
      onToggleSidebarCat(id); // expects name usually in existing code
    } else {
      handleToggleExpand(e, id);
    }
  };

  return (
    <aside
      id="left-sidebar"
      className={`bg-black/95 md:bg-black border-r border-zinc-900 flex flex-col flex-shrink-0 z-40 overflow-hidden absolute inset-y-0 left-0 md:relative h-full transition-all duration-300 ${
        isSidebarOpen ? "w-64 border-r" : "w-0 border-r-0"
      }`}
    >
      <div className="p-8 pb-4 shrink-0 flex items-center justify-between">
        <h1
          className="text-white font-black tracking-widest text-lg uppercase flex items-center gap-2 cursor-pointer"
          onClick={() => onUpdateView("All")}
        >
          <div className="w-2 h-2 rounded-full bg-white"></div> LIBRARY
        </h1>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="text-zinc-500 hover:text-white transition-colors p-1"
            title="Close Sidebar"
          >
            <SidebarSimple weight="bold" />
          </button>
        )}
      </div>
      <nav className="px-6 pb-2 space-y-1 shrink-0">
        <button
          onClick={() => onUpdateView("All")}
          className="w-full flex items-center gap-3 py-2 rounded transition text-sm text-zinc-400 hover:text-white font-bold text-left pl-0 group"
        >
          <span className="group-hover:text-white">Root</span>
        </button>
      </nav>
      <div className="flex-1 overflow-y-auto min-h-0 px-0 font-sans text-sm relative db-scroll">
        {treeData.map((node) => (
          <SidebarNodeRenderer
            key={node.tagId || node.name}
            node={node}
            depth={0}
            currentFilter={currentFilter}
            expandedState={mergedExpansion}
            toggleExpand={onToggleWrapper}
            onUpdateView={onUpdateView}
            onHandleContentClick={handleContentClick}
            activeContentId={activeContentId}
          />
        ))}
      </div>
    </aside>
  );
}

export default memo(LibrarySidebar);
