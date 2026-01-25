import { ContentItem } from '@/hooks/useContent';
import { TagNode } from '@/hooks/useTags';

/**
 * TreeNode structure expected by KanbanView and LibrarySidebar.
 * - Parent tags become top-level nodes
 * - Child tags become subcategories
 * - Content items are placed under the tag they belong to
 */
/**
 * Recursive TreeNode structure.
 * Each node can have children (sub-tags) and items (content).
 */
export interface TreeNode {
  name: string;
  tagId?: string;
  tagColor?: string;
  children: TreeNode[];
  items: ContentItem[];
}

/**
 * Build recursive tree structure from hierarchical tags and content.
 */
export function buildTreeData(
  tagTree: TagNode[],
  content: ContentItem[],
  tagsMap: Map<string, { id: string; tagName: string; parentId: string | null }>
): TreeNode[] {
  
  // Create a map of tagId -> content items
  const tagContentMap = new Map<string, ContentItem[]>();
  const usedContentIds = new Set<string>();

  // Assign content to their tags
  content.forEach((item) => {
    if (item.tagsId && item.tagsId.length > 0) {
      item.tagsId.forEach((tagId) => {
        if (!tagContentMap.has(tagId)) {
          tagContentMap.set(tagId, []);
        }
        tagContentMap.get(tagId)!.push(item);
        usedContentIds.add(item.id);
      });
    }
  });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Recursive function to build nodes
  function buildNode(tag: TagNode): TreeNode {
    // Resolve name if UUID
    let uiName = tag.tagName;
    if (uuidRegex.test(uiName)) {
        const resolved = tagsMap.get(uiName);
        if (resolved) uiName = resolved.tagName;
    }

    // Get direct content
    const directItems = tagContentMap.get(tag.id) || [];

    // Recursively build children
    const childNodes: TreeNode[] = [];
    if (tag.children && tag.children.length > 0) {
        tag.children.forEach(childTag => {
            childNodes.push(buildNode(childTag));
        });
    }

    return {
        name: uiName,
        tagId: tag.id,
        tagColor: tag.tagColor,
        children: childNodes,
        items: directItems
    };
  }

  // Build roots
  const result: TreeNode[] = [];
  tagTree.forEach(rootTag => {
      const node = buildNode(rootTag);
      // Only include if node or its children have content (or always include? existing logic implied checking)
      // For now, let's include all tags to ensure hierarchy visibility (or filter empty ones if preferred)
      // The original code tried to be smart about "General" vs subcategories.
      // With full recursion, we just show the structure as is.
      result.push(node);
  });

  // Filter out empty branches if desired, or keep them to show structure.
  // Original logic: "Only add to result if there are children with content or direct content"
  // Let's implement a cleaner filter: Keep node if it has items OR if any child is kept.

  function pruneEmptyNodes(nodes: TreeNode[]): TreeNode[] {
      return nodes.filter(node => {
          node.children = pruneEmptyNodes(node.children);
          return node.items.length > 0 || node.children.length > 0;
      });
  }

  const prunedResult = pruneEmptyNodes(result);

  // Add Uncategorized
  const uncategorizedContent = content.filter(
    (item) => !item.tagsId || item.tagsId.length === 0
  );

  if (uncategorizedContent.length > 0) {
    prunedResult.push({
      name: 'Uncategorized',
      tagColor: '#808080',
      children: [],
      items: uncategorizedContent,
    });
  }

  return prunedResult;
}

/**
 * Get all content items flattened from tree structure.
 */
export function getAllItemsFromTree(treeData: TreeNode[]): ContentItem[] {
  const items: ContentItem[] = [];
  const seenIds = new Set<string>();

  treeData.forEach((node) => {
    node.children.forEach((sub) => {
      sub.items.forEach((item) => {
        if (!seenIds.has(item.id)) {
          items.push(item);
          seenIds.add(item.id);
        }
      });
    });
  });

  return items;
}
