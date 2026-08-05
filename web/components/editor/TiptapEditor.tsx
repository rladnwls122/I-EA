"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sigma, Table as TableIcon } from "lucide-react";
import { uploadImage } from "@/lib/api";
// KaTeX 스타일시트가 없으면 수식이 폰트·정렬 없이 깨져 보인다(노드는 멀쩡한데 화면만 망가진다).
import "katex/dist/katex.min.css";
// `\ce{H2O}`(과탐 화학식) 지원. 백엔드 파스 검증도 같은 모듈을 require한다 —
// 한쪽만 빠지면 저장은 되는데 화면에서 깨지거나(그 반대) 판정이 갈린다.
import "katex/contrib/mhchem";

interface TiptapEditorProps {
  value: any; // ProseMirror JSON
  onChange: (json: any) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  /**
   * 이미지 삽입 버튼 노출 여부. 기본 false — 선지처럼 좁은 입력칸에는 툴바가 과하다.
   * 켜면 파일 선택 → presign → S3 업로드 → image 노드 삽입까지 이 컴포넌트가 처리한다.
   */
  allowImages?: boolean;
  /**
   * 수식 삽입 버튼 노출 여부(#35). 기본 false.
   * **스키마 등록과는 무관하다** — 확장은 항상 등록되므로, 이 값이 false여도 이미 저장된
   * 수식은 그대로 보이고 편집(클릭 → LaTeX 수정)도 된다. 버튼만 감춘다.
   */
  allowMath?: boolean;
  /**
   * 표 삽입 버튼 노출 여부(#35 2단계). 기본 false.
   * 표는 **작가 수동 입력 전용**이다 — LLM은 평문 한 필드로 표 구조를 실어 나를 수 없다.
   */
  allowTables?: boolean;
}

/** 수식 입력줄의 상태. pos가 없으면 "커서 위치에 새로 삽입". */
type MathDraft = { latex: string; block: boolean; pos?: number };

/** 툴바 버튼 공통 클래스. 버튼이 셋으로 늘어 문자열을 한 곳에 모은다. */
const TOOL_BTN =
  "flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-60";

export function TiptapEditor({
  value,
  onChange,
  placeholder,
  minHeight = "80px",
  className = "",
  allowImages = false,
  allowMath = false,
  allowTables = false,
}: TiptapEditorProps) {
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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mathDraft, setMathDraft] = useState<MathDraft | null>(null);

  const editor = useEditor({
    // Image는 항상 스키마에 넣는다 — 버튼을 안 띄우는 편집기(선지 등)에서도 이미 저장돼
    // 있던 이미지를 열었을 때 스키마에 없으면 ProseMirror가 그 노드를 **버린다**.
    // 즉 이미지를 못 넣는 칸에서 문서를 한 번 열기만 해도 이미지가 사라진다.
    // 수식·표(#35)도 정확히 같은 이유로 allowMath/allowTables와 무관하게 항상 등록한다.
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Mathematics.configure({
        // 읽는 쪽에서는 깨진 수식이라도 빨간 원문으로 보여준다(내용 실종보다 낫다).
        // trust는 기본값 false를 유지한다 — \href·\htmlClass 같은 주입 통로를 열지 않는다.
        katexOptions: { throwOnError: false },
        inlineOptions: { onClick: (node, pos) => setMathDraft({ latex: node.attrs.latex ?? "", block: false, pos }) },
        blockOptions: { onClick: (node, pos) => setMathDraft({ latex: node.attrs.latex ?? "", block: true, pos }) },
      }),
      TableKit,
    ],
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

  /** 파일 선택 → 업로드 → 커서 위치에 image 노드 삽입. */
  const handlePickImage = async (file: File | undefined) => {
    if (!file || !editor) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { publicUrl } = await uploadImage(file);
      // alt는 파일명으로 초기화 — 비워두면 스크린리더에 아무것도 안 읽힌다.
      editor.chain().focus().setImage({ src: publicUrl, alt: file.name }).run();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "이미지 업로드에 실패했어요.");
    } finally {
      setUploading(false);
      // 같은 파일을 다시 고를 수 있게 초기화(값이 같으면 change가 안 뜬다).
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** 수식 입력줄 확정. 비우고 저장하면 삭제로 친다(빈 수식 노드는 클릭 과녁조차 없다). */
  const commitMath = () => {
    if (!editor || !mathDraft) return;
    const { latex, block, pos } = mathDraft;
    const chain = editor.chain().focus();
    const trimmed = latex.trim();

    if (pos === undefined) {
      if (trimmed) {
        if (block) chain.insertBlockMath({ latex: trimmed }).run();
        else chain.insertInlineMath({ latex: trimmed }).run();
      }
    } else if (!trimmed) {
      if (block) chain.deleteBlockMath({ pos }).run();
      else chain.deleteInlineMath({ pos }).run();
    } else {
      if (block) chain.updateBlockMath({ latex: trimmed, pos }).run();
      else chain.updateInlineMath({ latex: trimmed, pos }).run();
    }
    setMathDraft(null);
  };

  if (!editor) {
    return <div className="w-full animate-pulse rounded-lg border border-border bg-surface-raised" style={{ minHeight }} />;
  }

  return (
    <div className="w-full">
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

      {(allowImages || allowMath || allowTables) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {allowImages && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handlePickImage(e.target.files?.[0])}
              />
              <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className={TOOL_BTN}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                {uploading ? "올리는 중…" : "이미지"}
              </button>
            </>
          )}
          {allowMath && (
            <button
              type="button"
              onClick={() => setMathDraft({ latex: "", block: false })}
              className={TOOL_BTN}
            >
              <Sigma size={13} />
              수식
            </button>
          )}
          {allowTables && (
            <button
              type="button"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              className={TOOL_BTN}
            >
              <TableIcon size={13} />표
            </button>
          )}
          {uploadError && <span className="text-xs text-wrong">{uploadError}</span>}
        </div>
      )}

      {/* 수식 입력줄. 툴바 버튼(새 수식)과 수식 클릭(기존 수식 수정) 양쪽이 여기로 모인다. */}
      {mathDraft && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5">
          <input
            autoFocus
            value={mathDraft.latex}
            onChange={(e) => setMathDraft({ ...mathDraft, latex: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitMath();
              }
              if (e.key === "Escape") setMathDraft(null);
            }}
            placeholder="LaTeX (예: \frac{1}{2}, \ce{H2O})"
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={mathDraft.block}
              // 이미 놓인 수식은 인라인↔별행을 바꾸려면 노드 타입 자체가 달라진다 —
              // 여기서는 새로 넣을 때만 고르게 하고, 수정 중에는 잠근다.
              disabled={mathDraft.pos !== undefined}
              onChange={(e) => setMathDraft({ ...mathDraft, block: e.target.checked })}
            />
            별행
          </label>
          <button type="button" onClick={commitMath} className={TOOL_BTN}>
            확인
          </button>
          <button type="button" onClick={() => setMathDraft(null)} className={TOOL_BTN}>
            취소
          </button>
        </div>
      )}
    </div>
  );
}
