'use client';

import { useState, useEffect } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import ShinyText from '../ShinyText';
import { useUserDisplayName } from '@/hooks/use-user-display-name';
import { Tag } from '@/types';

interface HeaderProps {
    onResetFilter: () => void;
    topTags?: Tag[];
}

export default function Header({ onResetFilter, topTags = [] }: HeaderProps) {
    const displayName = useUserDisplayName();
    const [greeting, setGreeting] = useState('Good morning');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            setGreeting('Good morning');
        } else if (hour >= 12 && hour < 17) {
            setGreeting('Good afternoon');
        } else {
            setGreeting('Good evening');
        }
    }, []);

    return (
        <div className="px-4 md:px-8 lg:px-10 pt-6 md:pt-10 pb-2 mt-4 shrink-0 bg-black">
            <div className="flex items-center gap-2 lg:hidden mb-4">
                <SidebarTrigger className="text-white" />
                <span className="text-zinc-500 text-sm font-medium">Menu</span>
            </div>

            <h2 className="text-[32px] md:text-[48px] lg:text-[60px] font-medium text-white tracking-tight leading-none">
                {greeting}, <ShinyText text={`${displayName}.`} disabled={false} speed={20} delay={0.8} color="#bfbfbf" spread={160} className="font-medium" />
            </h2>
            <p className="text-zinc-500 text-[18px] md:text-[24px] lg:text-[30px] font-normal mt-2 mb-6">
                Let&apos;s get productive.
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={onResetFilter}
                    className="px-3 py-1 rounded-full bg-[#4b2976] text-white text-xs md:text-sm border-[#9f63fe] font-bold shadow-[0_0_15px_rgba(159,85,255,0.3)] hover:opacity-90 transition-opacity"
                >
                    All
                </button>
                {topTags && topTags.length > 0 && topTags.slice(0,4).map((tag) => (
                    <button
                        key={tag.id}
                        style={{
                            backgroundColor: `${tag.tagColor}10`,
                            borderColor: `${tag.tagColor}33`,
                            color: tag.tagColor
                        }}
                        className="px-3 py-1 border rounded-full text-xs md:text-sm font-medium transition-opacity hover:opacity-80"
                    >
                        #{tag.tagName}
                    </button>
                ))}
            </div>
        </div>
    );
}
