"use client";

import "@blocknote/core/fonts/inter.css";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import { Block, BlockNoteEditor as BlockNoteEditorType } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useMemo, useEffect, useState } from "react";

interface BlockNoteEditorProps {
  initialContent?: Block[];
  initialContentHTML?: string; // Fallback for legacy text
  isEditing: boolean;
  onChange?: (blocks: Block[], text: string) => void;
  onSave?: () => void;
}

export default function BlockNoteEditor({
  initialContent,
  initialContentHTML,
  isEditing,
  onChange,
  onSave,
}: BlockNoteEditorProps) {
  // Determine initial blocks: use provided blocks, or convert legacy text to a paragraph block
  const startBlocks = useMemo(() => {
    if (initialContent && initialContent.length > 0) {
      return initialContent;
    }
    if (initialContentHTML) {
      return [
        {
          type: "paragraph",
          content: [{ type: "text", text: initialContentHTML, styles: {} }],
        },
      ] as any; // Cast as PartialBlock for initialization
    }
    return undefined; // Default empty
  }, [initialContent, initialContentHTML]);

  // Create editor instance
  const editor = useCreateBlockNote({
    initialContent: startBlocks,
    uploadFile: async (file) => {
        return URL.createObjectURL(file);
    }
  });

  // Handle changes
  const handleChange = async () => {
    if (onChange && editor) {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      onChange(editor.document, markdown);
    }
  };

  // Sync isEditing state with editor
  useEffect(() => {
    if (editor) {
      editor.isEditable = isEditing;
    }
  }, [editor, isEditing]);

  return (
    <div className={`w-full h-full flex flex-col ${!isEditing ? "pointer-events-none" : ""}`}>
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={"dark"}
        className="flex-1 bg-transparent min-h-[300px]"
      />
      {/* Custom styles to override specific BlockNote defaults to match our zinc/black theme */}
      <style jsx global>{`
        .bn-container[data-color-scheme="dark"] {
          background-color: transparent !important;
        }
        .bn-editor {
          background-color: transparent !important;
          padding: 2rem !important; /* Match original p-8 */
          font-family: monospace !important; /* Match font-mono from original */
        }
        .bn-block-content {
           color: #d4d4d8 !important; /* text-zinc-300 */
        }
        /* Hide side menu when not editing to look cleaner */
        ${!isEditing ? `
          .bn-side-menu { display: none !important; } 
        ` : ''}
      `}</style>
    </div>
  );
}
