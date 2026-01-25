'use client';

import { useMemo } from 'react';
import { useContent, ContentItem } from './useContent';
import { useTags, TagNode } from './useTags';
import { buildTreeData } from '@/utils/buildTreeData';

// Graph node types for neural visualization
export interface GraphNode {
  id: string;
  label: string;
  type: 'root' | 'category' | 'sub' | 'content';
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  parent?: string;
  data?: ContentItem;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  deepData: DeepDataCategory[];
}

// Structure for LibraryPanel compatibility
export interface DeepDataCategory {
  name: string;
  tagId: string;
  subs: DeepDataSub[];
}

export interface DeepDataSub {
  name: string;
  tagId: string;
  items: DeepDataItem[];
}

export interface DeepDataItem {
  name: string;
  desc: string;
  image: string;
  content: string;
  contentId: string;
}

const COLORS = {
  root: '#FFFFFF',
  cat: '#A78BFA',
  sub: '#3B82F6',
  content: '#22D3EE',
};

/**
 * Hook to fetch and transform user content/tags into graph structure
 * for the neural-graph visualization.
 */
export function useGraphData() {
  const { content, loading: contentLoading, error: contentError } = useContent();
  const { tagTree, tagsMap, loading: tagsLoading, error: tagsError } = useTags();

  const loading = contentLoading || tagsLoading;
  const error = contentError || tagsError;

  // Build graph data from tags and content using buildTreeData for consistency
  const graphData = useMemo<GraphData>(() => {
    // Use buildTreeData as the single source of truth (matches database sidebar)
    const treeData = buildTreeData(tagTree, content, tagsMap);
    
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const deepData: DeepDataCategory[] = [];

    // Root node
    nodes.push({
      id: 'root',
      label: 'Root',
      type: 'root',
      x: 0,
      y: 0,
      z: 0,
      radius: 12,
      color: COLORS.root,
    });

    // Layout parameters
    const catRadius = 350;
    const subRadius = 120;
    const contentRadius = 50;

    // Create graph nodes from treeData (only shows tags with content)
    treeData.forEach((category, catIndex) => {
      const phi = Math.acos(-1 + (2 * catIndex) / Math.max(treeData.length, 1));
      const theta = Math.sqrt(Math.max(treeData.length, 1) * Math.PI) * phi;
      const cx = catRadius * Math.cos(theta) * Math.sin(phi);
      const cy = catRadius * Math.sin(theta) * Math.sin(phi);
      const cz = catRadius * Math.cos(phi);

      const graphCatId = category.tagId ? `cat-${category.tagId}` : `cat-${catIndex}`;

      // Create category (parent tag) node
      nodes.push({
        id: graphCatId,
        label: category.name,
        type: 'category',
        x: cx,
        y: cy,
        z: cz,
        radius: 8,
        color: category.tagColor || (category.name === 'Uncategorized' ? '#808080' : COLORS.cat),
        parent: 'root',
      });
      links.push({ source: 'root', target: graphCatId });

      const subItemsForDeepData: DeepDataSub[] = [];

      // Create sub (child tag) nodes with content
      category.children.forEach((sub, subIndex) => {
        const sx = cx + subRadius * Math.cos(subIndex * 1.5 + catIndex);
        const sy = cy + subRadius * Math.sin(subIndex * 1.5 + catIndex);
        const sz = cz + subRadius * Math.cos(subIndex * 1.5);

        const graphSubId = sub.tagId ? `sub-${sub.tagId}` : `sub-${graphCatId}-${subIndex}`;
        
        let parentNodeId = graphCatId;

        // Create sub node if it has a name
        if (sub.name) {
          nodes.push({
            id: graphSubId,
            label: sub.name,
            type: 'sub',
            x: sx,
            y: sy,
            z: sz,
            radius: 5,
            color: sub.tagColor || COLORS.sub,
            parent: graphCatId,
          });
          links.push({ source: graphCatId, target: graphSubId });
          parentNodeId = graphSubId;
        }

        const deepItems: DeepDataItem[] = [];

        // Create content nodes
        sub.items.forEach((item, contentIndex) => {
          let kx, ky, kz;
          if (sub.name) {
            kx = sx + contentRadius * Math.cos(contentIndex * 2 + subIndex);
            ky = sy + contentRadius * Math.sin(contentIndex * 2 + subIndex);
            kz = sz + contentRadius * Math.cos(contentIndex * 2);
          } else {
            kx = cx + contentRadius * Math.cos(contentIndex * 2);
            ky = cy + contentRadius * Math.sin(contentIndex * 2);
            kz = cz + contentRadius * Math.cos(contentIndex * 2);
          }

          const contentId = `content-${item.id}`;
          nodes.push({
            id: contentId,
            label: item.title || 'Untitled',
            type: 'content',
            x: kx,
            y: ky,
            z: kz,
            radius: 3,
            color: COLORS.content,
            parent: parentNodeId,
            data: item,
          });
          links.push({ source: parentNodeId, target: contentId });

          deepItems.push({
            name: item.title || 'Untitled',
            desc: item.description || '',
            image: item.thumbnailUrl || 'https://picsum.photos/seed/default/800/400',
            content: item.description || '',
            contentId: item.id,
          });
        });

        subItemsForDeepData.push({
          name: sub.name,
          tagId: sub.tagId || `sub-${subIndex}`,
          items: deepItems,
        });
      });

      deepData.push({
        name: category.name,
        tagId: category.tagId || `cat-${catIndex}`,
        subs: subItemsForDeepData,
      });
    });

    return { nodes, links, deepData };
  }, [content, tagTree, tagsMap]);

  // Empty state check
  const isEmpty = !loading && graphData.nodes.length <= 1;

  return {
    graphData,
    loading,
    error,
    isEmpty,
  };
}
