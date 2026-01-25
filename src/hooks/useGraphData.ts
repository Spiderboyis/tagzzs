'use client';

import { useMemo } from 'react';
import { useContent, ContentItem } from './useContent';
import { useTags, TagNode } from './useTags';
import { buildTreeData, TreeNode } from '@/utils/buildTreeData';

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
  treeData: TreeNode[];
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
      const baseRadius = 350; // Initial radius for categories
  
      // Recursive function to build graph
      function buildGraphBranch(
          node: any, // TreeNode
          parentId: string, 
          depth: number,
          position: { x: number, y: number, z: number }, // Current node position
          direction: { x: number, y: number, z: number } // Normalized direction vector from origin (or parent)
      ): any {
          // Use deterministic ID matching LibraryPanel logic
          const nodeId = node.tagId || `${parentId}-${node.name}`;
          const type = depth === 0 ? 'category' : (depth === 1 ? 'sub' : 'sub');
          
          // Add Node
          // If depth 0, position is passed in from spherical loop.
          // If depth > 0, position is calculated before calling.
          if (parentId !== 'root' || depth === 0) {
              const distFromCenter = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
              // Scale radius based on depth (smaller as we go deeper? or consistent?)
              const radius = Math.max(8 - depth, 3);
              
              nodes.push({
                  id: nodeId,
                  label: node.name,
                  type: type,
                  x: position.x,
                  y: position.y,
                  z: position.z,
                  radius: radius,
                  color: node.tagColor || (depth === 0 ? COLORS.cat : COLORS.sub),
                  parent: parentId
              });
              links.push({ source: parentId, target: nodeId });
          }
          
          const deepItems: DeepDataItem[] = [];
  
          // Process Content Items
          if (node.items) {
               node.items.forEach((item: any, i: number) => {
                   const contentId = `content-${item.id}`;
                   
                   // Place content around the current node
                   // Spread them locally in a small sphere around the node
                   // Or project further out? "Neural" look suggests further out along the branch or surrounding.
                   
                   // Let's scatter them in a local sphere
                   const rScatter = 40 + Math.random() * 20;
                   const theta = Math.random() * Math.PI * 2;
                   const phi = Math.acos(2 * Math.random() - 1);
                   
                   const lx = rScatter * Math.sin(phi) * Math.cos(theta);
                   const ly = rScatter * Math.sin(phi) * Math.sin(theta);
                   const lz = rScatter * Math.cos(phi);
                   
                   nodes.push({
                      id: contentId,
                      label: item.title || 'Untitled',
                      type: 'content',
                      x: position.x + lx,
                      y: position.y + ly,
                      z: position.z + lz,
                      radius: 3,
                      color: COLORS.content,
                      parent: nodeId,
                      data: item,
                   });
                   links.push({ source: nodeId, target: contentId });
                   
                   deepItems.push({
                      name: item.title || 'Untitled',
                      desc: item.description || '',
                      image: item.thumbnailUrl || 'https://picsum.photos/seed/default/800/400',
                      content: item.description || '',
                      contentId: item.id,
                   });
               });
          }
  
          // Process Children
          const childrenDeepData: any[] = [];
          if (node.children && node.children.length > 0) {
              // Distribute children further out along the general direction, but with spread
              const childDist = 150 - (depth * 20); // Distance from parent
              
              node.children.forEach((child: any, i: number) => {
                  // Create a cone of dispersion around the 'direction' vector
                  // Simple approach: Perturb the direction vector slightly
                  
                  // Generate random localized offset (perpendicular-ish)
                  // Vector P (position) is roughly direction * distFromCenter
                  
                  // We want child to be at P + (Direction + Offset) * childDist
                  const spread = 0.5; // How wide the tree spreads
                  const dx = direction.x + (Math.random() - 0.5) * spread;
                  const dy = direction.y + (Math.random() - 0.5) * spread;
                  const dz = direction.z + (Math.random() - 0.5) * spread;
                  
                  // Re-normalize new direction
                  const dl = Math.sqrt(dx*dx + dy*dy + dz*dz);
                  const ndx = dx / dl;
                  const ndy = dy / dl;
                  const ndz = dz / dl;
                  
                  const childPos = {
                      x: position.x + ndx * childDist,
                      y: position.y + ndy * childDist,
                      z: position.z + ndz * childDist
                  };
  
                  const childDeep = buildGraphBranch(
                      child, 
                      nodeId, 
                      depth + 1, 
                      childPos,
                      { x: ndx, y: ndy, z: ndz }
                  );
                  childrenDeepData.push(childDeep);
              });
          }
          
          return {
              name: node.name,
              tagId: nodeId,
              items: deepItems, 
              subs: childrenDeepData,
          };
      }
      
      // Build everything starting from Root (Spherical distribution for Categories)
      treeData.forEach((cat, catIndex) => {
          // Fibonacci Sphere distribution for even spreading
          const phi = Math.acos(-1 + (2 * catIndex) / Math.max(treeData.length, 1));
          const theta = Math.sqrt(Math.max(treeData.length, 1) * Math.PI) * phi;
          
          const dirX = Math.cos(theta) * Math.sin(phi);
          const dirY = Math.sin(theta) * Math.sin(phi);
          const dirZ = Math.cos(phi);
          
          const cx = baseRadius * dirX;
          const cy = baseRadius * dirY;
          const cz = baseRadius * dirZ;
          
          const catDeep = buildGraphBranch(
              cat, 
              'root', 
              0, 
              { x: cx, y: cy, z: cz },
              { x: dirX, y: dirY, z: dirZ }
          );
          
          deepData.push({
              name: catDeep.name,
              tagId: catDeep.tagId,
              subs: flattenDeepToSubs(catDeep) 
          });
      });
      
      function flattenDeepToSubs(node: any): DeepDataSub[] {
          let subs: DeepDataSub[] = [];
          
          if (node.items && node.items.length > 0) {
               subs.push({
                   name: node.name, 
                   tagId: node.tagId,
                   items: node.items
               });
          }
          
          if (node.subs) {
              node.subs.forEach((child: any) => {
                   subs = [...subs, ...flattenDeepToSubs(child)];
              });
          }
          
          return subs;
      }
  
      return { nodes, links, deepData, treeData };
    }, [tagTree, content, tagsMap]);

  // Empty state check
  const isEmpty = !loading && graphData.nodes.length <= 1;

  return {
    graphData,
    loading,
    error,
    isEmpty,
  };
}
