"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

interface TiptapEditorProps {
  value: any; // ProseMirror JSON
  onChange: (json: any) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export function TiptapEditor({ value, onChange, placeholder, minHeight = "80px", className = "" }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none w-full ${className}`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  // 외부에서 value가 변경되었을 때 (초기화 등) 에디터 내용 동기화
 useEffect(() => {
  if (editor && value !== undefined) {
    // setTimeout을 주어 커서 튐 방지
    setTimeout(() => {
      // ✅ 빈 객체를 두 번째 인자로 전달
      editor.commands.setContent(value, {});
    }, 0);
  }
}, [value, editor]);

  if (!editor) {
    return <div className="w-full animate-pulse rounded-lg border border-border bg-surface-raised" style={{ minHeight }} />;
  }

  return (
    <div
      className={`relative rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground transition-colors duration-150 ease-swift focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${className}`}
      style={{ minHeight }}
      onClick={() => editor.commands.focus()}
    >
      <EditorContent editor={editor} />
      {editor.isEmpty && placeholder && (
        <div className="text-muted-foreground pointer-events-none absolute top-2.5 left-3">
          {placeholder}
        </div>
      )}
    </div>
  );
}
