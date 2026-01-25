'use client';

import Image from 'next/image';
import Link from 'next/link';
import { X, ArrowSquareOut, ArrowRight } from '@phosphor-icons/react';
import { ContentItem } from '@/types';
import { Tag } from '@/hooks/useTags';

interface ItemModalProps {
    isOpen: boolean;
    content: ContentItem | null;
    tags?: Tag[];
    onClose: () => void;
}

export default function ItemModal({ isOpen, content, tags = [], onClose }: ItemModalProps) {
    if (!isOpen || !content) return null;

    const imageUrl = content.thumbnailUrl || `public/default.jpg`;

    // Format read time
    const formatReadTime = (minutes: number): string => {
        if (!minutes) return '';
        if (minutes < 60) return `${minutes} min read`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m read` : `${hours}h read`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm modal-overlay"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-[#09090b] w-full max-w-2xl h-[85vh] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden modal-content mx-4">
                {/* Cover Image */}
                <div className="h-48 w-full shrink-0 relative">
                    <Image
                        src={imageUrl}
                        alt="Cover"
                        fill
                        className="object-cover opacity-90"
                        unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] to-transparent" />
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 h-8 w-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors backdrop-blur-md"
                    >
                        <X size={14} weight="bold" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <h2 className="text-3xl font-bold text-white mb-2">{content.title}</h2>
                    
                    {/* Meta info */}
                    <div className="flex items-center gap-3 text-zinc-500 text-xs mb-4">
                        {content.contentSource && (
                            <span className="flex items-center gap-1">
                                {content.contentSource}
                            </span>
                        )}
                        {content.readTime > 0 && (
                            <span>{formatReadTime(content.readTime)}</span>
                        )}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-col gap-2 mb-6">
                        {(() => {
                            // Helper to build chains from the flat list of tags
                            const buildChains = (tags: Tag[]) => {
                                const chains: Tag[][] = [];
                                const tagMap = new Map(tags.map(t => [t.id, t]));
                                const visited = new Set<string>();

                                // Find all leaf nodes (tags that are not parents to any other tag in this list)
                                // actually, easier to find roots of the subset.
                                // A tag is a root in this context if its parent is NOT in the current tags list.
                                
                                const subsetIds = new Set(tags.map(t => t.id));
                                const roots = tags.filter(t => !t.parentId || !subsetIds.has(t.parentId));

                                roots.forEach(root => {
                                    const chain: Tag[] = [root];
                                    let current = root;
                                    visited.add(current.id);

                                    // Try to find a direct child in the current tags list
                                    // multiple children are possible in theory, but user wants single chain.
                                    // If multiple, we just render them alongside or branching.
                                    // For now, let's just do a simple greedy search for children in the list.
                                    
                                    while (true) {
                                        const children = tags.filter(t => t.parentId === current.id);
                                        if (children.length === 0) break;
                                        
                                        // Pick the first child (assuming linear chain as per requirements)
                                        const next = children[0];
                                        chain.push(next);
                                        visited.add(next.id);
                                        current = next;
                                    }
                                    chains.push(chain);
                                });

                                // Add any remaining tags that might have been disconnected (shouldn't happen with above logic but safety first)
                                tags.forEach(t => {
                                    if (!visited.has(t.id)) {
                                        chains.push([t]);
                                    }
                                });

                                return chains;
                            };

                            const tagChains = buildChains(tags);

                            if (tagChains.length === 0 && content.contentType) {
                                return (
                                    <span className="self-start px-3 py-1 rounded text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                        {content.contentType}
                                    </span>
                                );
                            }

                            return tagChains.map((chain, idx) => (
                                <div key={idx} className="flex items-center flex-wrap gap-1">
                                    {chain.map((tag, i) => (
                                        <div key={tag.id} className="flex items-center">
                                            {i > 0 && (
                                                <span className="text-zinc-600 mx-1">
                                                    <ArrowRight size={12} weight="bold" />
                                                </span>
                                            )}
                                            <span
                                                className="px-3 py-1 rounded-full text-xs font-medium border border-white/5 shadow-sm"
                                                style={{ 
                                                    backgroundColor: `${tag.tagColor}15`,
                                                    color: tag.tagColor,
                                                    borderColor: `${tag.tagColor}30`
                                                }}
                                            >
                                                {tag.tagName}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ));
                        })()}
                    </div>

                    {/* Link to source */}
                    {content.link && (
                        <a 
                            href={content.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 mb-6 transition-colors"
                        >
                            <ArrowSquareOut size={16} />
                            View original source
                        </a>
                    )}

                    <div className="w-full h-px bg-white/10 mb-6" />

                    {/* Description */}
                    <div className="prose prose-invert prose-sm max-w-none text-zinc-400 leading-relaxed whitespace-pre-line mb-6">
                        {content.description || 'No description available.'}
                    </div>

                    {/* Personal Notes */}
                    {content.personalNotes && (
                        <>
                            <div className="w-full h-px bg-white/10 mb-6" />
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-300 mb-3">Personal Notes</h3>
                                <div className="bg-zinc-900/50 rounded-lg p-4 border border-white/5">
                                    <p className="text-sm text-zinc-400 whitespace-pre-line">
                                        {content.personalNotes}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-white/10 flex justify-end bg-[#09090b]">
                    <Link
                        href={`/content/${content.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
                    >
                        Open Page
                        <ArrowRight size={16} weight="bold" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
