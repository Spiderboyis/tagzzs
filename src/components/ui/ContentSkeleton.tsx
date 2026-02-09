"use client";

import { motion } from "motion/react";

export function ContentSkeleton() {
  return (
    <div className="relative h-full bg-[#0A0A0C]">
      {/* Main content area */}
      <div className="h-full p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Processing indicator */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-purple-400/30 border-t-purple-400 rounded-full"
            />
            <span className="text-sm text-purple-300/80">
              Analyzing content with AI...
            </span>
          </motion.div>

          {/* Title skeleton */}
          <div className="space-y-4">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="h-10 w-3/4 rounded-xl bg-white/5"
            />
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }}
              className="h-4 w-1/3 rounded-lg bg-white/5"
            />
          </div>

          {/* Thumbnail skeleton */}
          <motion.div
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
            className="aspect-video w-full rounded-2xl bg-white/5"
          />

          {/* Tags skeleton */}
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                className="h-8 w-20 rounded-full bg-white/5"
              />
            ))}
          </div>

          {/* Description skeleton */}
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.08,
                }}
                className="h-4 rounded-lg bg-white/5"
                style={{ width: `${100 - i * 10}%` }}
              />
            ))}
          </div>

          {/* AI Summary skeleton */}
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="h-6 w-32 rounded-lg bg-white/5"
            />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                  className="h-4 rounded-lg bg-white/5"
                  style={{ width: `${95 - i * 5}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
