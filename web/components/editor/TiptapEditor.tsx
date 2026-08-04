"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

interface TiptapEditorProps {
  value: any; // ProseMirror JSON
  onChange: (json: any) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export function TiptapEditor({ value, onChange, placeholder, minHeight = "80px", className = "" }: TiptapEditorProps) {
  /**
   * 마지막으로 우리가 밖으로 내보낸 JSON.
   *
   * 부모는 보통 `onChange`로 받은 JSON을 그대로 state에 넣고 다시 `value`로 내려준다.
   * 그러면 아래 동기화 effect가 "외부 변경"으로 착각하고 `setContent`를 불러
   * 타이핑 중인 문서를 통째로 갈아끼운다 — 커서가 끝으로 튀고, 빠르게 치면 글자가 씹힌다.
   * 예전 코드의 `setTimeout(..., 0)`은 그 증상을 뒤로 미룬 것일 뿐 원인을 없애지 못했고,
   * 비동기라 언마운트 직후에도 한 번 더 돌 수 있었다.
   * 내가 낸 값인지 대조해서 **되돌아온 메아리면 아무것도 하지 않는다.**
   */
  const lastEmitted = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    // SSR에서 즉시 렌더하지 않는다(Next 하이드레이션 불일치 경고 방지).
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none w-full ${className}`,
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      lastEmitted.current = JSON.stringify(json);
      onChange(json);
    },
  });

  // 외부에서 value가 진짜로 바뀌었을 때만(초기화·다른 카드 열기 등) 에디터에 반영한다.
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === undefined) return;

    const incoming = JSON.stringify(value);
    if (incoming === lastEmitted.current) return; // 내가 방금 내보낸 값이 돌아온 것
    if (incoming === JSON.stringify(editor.getJSON())) return; // 이미 같은 내용

    // emitUpdate: false — 이 주입이 다시 onChange를 쏘면 부모 state가 한 번 더 돌아
    // 무한 왕복이 된다.
    editor.commands.setContent(value, { emitUpdate: false });
    lastEmitted.current = incoming;
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
