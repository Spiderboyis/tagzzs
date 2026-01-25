import React, { memo } from "react";
import { CaretRight, SidebarSimple, FileText } from "@phosphor-icons/react";
import { TreeNode } from "@/utils/buildTreeData";

// Keep legacy types for now if needed, but we mainly use TreeNode
interface SubCategory {
  name: string;
  tagId?: string;
  items: any[];
}
interface Category {
  name: string;
  tagId?: string;
  subs: SubCategory[];
}

interface GraphNode {
  id: string | number;
  label?: string;
  type: "root" | "category" | "sub" | "content" | "dust";
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  parent?: string | number;
  data?: any;
}

interface LibraryPanelProps {
  leftPanelRef: React.RefObject<HTMLDivElement | null>;
  deepData: Category[];
  treeData: TreeNode[];
  expandedGroups: Set<string>;
  selectedNode: GraphNode | null;
  nodesRef: React.RefObject<GraphNode[]>;
  onToggleGroup: (id: string, forceOpen?: boolean) => void;
  onSelectNode: (node: GraphNode) => void;
  onToggle: () => void;
}

function LibraryPanel({
  leftPanelRef,
  deepData,
  treeData,
  expandedGroups,
  selectedNode,
  nodesRef,
  onToggleGroup,
  onSelectNode,
  onToggle,
}: LibraryPanelProps) {
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);

  // Effect to handle selection scrolling and highlighting
  React.useEffect(() => {
    if (!selectedNode) return;

    // Determine the ID of the sidebar item from the selected graph node
    // Logic must match renderNode's uniqueKey generation
    let targetId = selectedNode.id.toString();

    // If it's a content node, we usually highlight the item
    // But if it's a tag node, we highlight the group

    setHighlightedId(targetId);

    // Auto-scroll
    setTimeout(() => {
      const el = document.getElementById(`sidebar-item-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);

    // Remove highlight after animation
    const timer = setTimeout(() => {
      setHighlightedId(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedNode]);

  // Recursive Node Renderer
  const renderNode = (node: TreeNode, depth: number, parentId: string) => {
    // ID Logic MUST match useGraphData
    const nodeId = node.tagId || `${parentId}-${node.name}`;

    // Use tagId directly as key to match NeuralGraphPage logic
    const uniqueKey = node.tagId || nodeId;

    const isOpen = expandedGroups.has(uniqueKey);
    const hasChildren = node.children && node.children.length > 0;
    const hasItems = node.items && node.items.length > 0;
    const isHighlighted = highlightedId === uniqueKey;

    if (!node.name) return null; // Skip invisible roots if any

    return (
      <div
        key={uniqueKey}
        className="tree-group"
        style={{ marginLeft: depth > 0 ? 12 : 0 }}
      >
        {/* Header */}
        {(hasChildren || hasItems) && (
          <div
            id={`sidebar-item-${uniqueKey}`}
            className={`tree-header rounded px-1 py-0.5 cursor-pointer flex items-center gap-1.5 transition-all duration-300 group ${isHighlighted ? "bg-indigo-500/20 ring-1 ring-indigo-500" : "hover:bg-white/5"}`}
          >
            {hasChildren ? (
              <div
                className="tree-arrow flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 text-zinc-500 transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleGroup(uniqueKey);
                }}
              >
                <CaretRight weight="fill" size={10} />
              </div>
            ) : (
              <div className="w-4 h-4" /> // Spacer
            )}

            <span
              className={`tree-label text-xs font-medium truncate select-none transition-colors ${depth === 0 ? "text-zinc-300 font-semibold" : ""} ${isHighlighted ? "text-white" : "text-zinc-400 group-hover:text-white"}`}
              onClick={(e) => {
                e.stopPropagation();
                // Select corresponding node in graph
                // Graph nodes usually use "CategoryName" or "SubName" as label.
                // We try to find it.
                const targetNode = nodesRef.current?.find(
                  (n) => n.label === node.name,
                );
                if (targetNode) onSelectNode(targetNode);

                // Also toggle expand if clicked label? user preference.
                onToggleGroup(uniqueKey);
              }}
            >
              {node.name}
            </span>
          </div>
        )}

        {/* Body */}
        {(hasChildren || hasItems) && (
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="flex flex-col gap-0.5 pt-0.5">
              {/* Items */}
              {hasItems &&
                node.items.map((item, k) => {
                  const itemId = `content-${item.id}`;
                  const isSelected = selectedNode?.id === itemId; // Assuming graph content nodes use content-ID format
                  const isItemHighlighted = highlightedId === itemId;
                  return (
                    <div
                      key={item.id}
                      id={`sidebar-item-${itemId}`}
                      className={`flex items-center gap-2 px-2 py-1 ml-6 rounded cursor-pointer text-xs transition-colors ${isSelected || isItemHighlighted ? "bg-white/10 text-white ring-1 ring-zinc-700" : "text-zinc-500 hover:text-white hover:bg-white/5"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetNode = nodesRef.current?.find(
                          (n) => n.label === item.title && n.type === "content",
                        );
                        if (targetNode) onSelectNode(targetNode);
                      }}
                    >
                      <FileText size={12} className="shrink-0 opacity-70" />
                      <span className="truncate">{item.title}</span>
                    </div>
                  );
                })}

              {/* Children */}
              {hasChildren &&
                node.children.map((child) =>
                  renderNode(child, depth + 1, uniqueKey),
                )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      ref={leftPanelRef}
      id="left-panel"
      className="absolute top-0 bottom-0 left-0 w-72 sidebar-panel left-panel flex flex-col border-r border-zinc-800 bg-black pt-14 z-20 shadow-2xl transition-transform duration-300 ease-in-out"
    >
      <div className="flex-1 flex flex-col min-h-0 p-4 pt-2">
        <div className="flex items-center justify-between mb-4 pl-1 pr-1 shrink-0">
          <h2 className="text-lg font-bold text-white tracking-tight">
            Library
          </h2>
          <button
            onClick={onToggle}
            className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded hover:bg-white/10"
            title="Close Sidebar"
          >
            <SidebarSimple weight="bold" />
          </button>
        </div>

        <div
          id="file-tree"
          className="flex flex-col gap-1 select-none overflow-y-auto flex-1 pb-20 scrollbar-thin scrollbar-thumb-zinc-800 hover:scrollbar-thumb-zinc-700"
        >
          {treeData && treeData.length > 0 ? (
            treeData.map((node, i) => renderNode(node, 0, "root"))
          ) : (
            <div className="text-zinc-600 text-sm italic p-2">
              No items found.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default memo(LibraryPanel);
