import { Fragment, type ReactNode } from "react";

/**
 * ProseMirror/Tiptap JSON 읽기 전용 렌더러.
 *
 * **왜 필요한가:** 캔버스 카드가 지문·발문·해설을 `extractPlainText`로 렌더해서,
 * rich를 저장해도 화면에는 평문으로 보였다("편집은 rich, 표시는 평문"). 서식이
 * 보이지 않으니 사용자는 서식이 저장되지 않는다고 판단하게 된다.
 *
 * **왜 Tiptap 인스턴스가 아닌가:** 카드마다 필드가 3개라 읽기 전용 에디터를 띄우면
 * 문항 N개에 에디터가 3N개 생긴다. 캔버스는 목록 화면이라 그 비용을 낼 이유가 없다.
 *
 * **왜 generateHTML + dangerouslySetInnerHTML이 아닌가:** 그 경로는 HTML 문자열을
 * DOM에 주입한다. 이 저장소는 `dangerouslySetInnerHTML`을 한 곳도 쓰지 않고, 토큰이
 * localStorage에 있어 XSS 한 번이면 그대로 털린다. 노드를 JSX로 직접 그리면
 * 주입 경로 자체가 없다.
 *
 * 허용 노드/마크 집합은 백엔드 화이트리스트(`src/common/prosemirror/prosemirror.sanitize.ts`)와
 * 짝이다. 저장이 통과하는 것만 그린다 — **한쪽을 넓히면 다른 쪽도 같은 커밋에서 넓혀야 한다.**
 * 모르는 노드는 조용히 버리지 않고 자식 텍스트라도 문단으로 흘려보낸다(내용 실종 방지).
 */

type PMNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, any> }>;
};

/** link href는 렌더 직전에 한 번 더 스킴을 본다. 백엔드가 막지만 옛 데이터가 있을 수 있다. */
function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

/** 텍스트 노드에 마크를 감싼다. 중첩 순서는 marks 배열 순서를 따른다. */
function renderText(node: PMNode, key: string): ReactNode {
  let out: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "subscript":
        out = <sub>{out}</sub>;
        break;
      case "superscript":
        out = <sup>{out}</sup>;
        break;
      case "code":
        out = <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[0.9em]">{out}</code>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        out = href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {out}
          </a>
        ) : (
          out
        );
        break;
      }
      default:
        break; // 모르는 마크는 텍스트만 남긴다.
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function renderChildren(nodes: PMNode[] | undefined, keyPrefix: string): ReactNode[] {
  return (nodes ?? []).map((child, i) => renderNode(child, `${keyPrefix}.${i}`));
}

function renderNode(node: PMNode | undefined, key: string): ReactNode {
  if (!node) return null;
  if (node.type === "text" || typeof node.text === "string") return renderText(node, key);

  const kids = () => renderChildren(node.content, key);

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{kids()}</Fragment>;
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap leading-relaxed">
          {kids()}
        </p>
      );
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const Tag = `h${level}` as "h1";
      return (
        <Tag key={key} className="font-semibold leading-snug">
          {kids()}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {kids()}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal space-y-0.5 pl-5" start={Number(node.attrs?.start) || undefined}>
          {kids()}
        </ol>
      );
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-border pl-3 italic">
          {kids()}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-surface-raised p-2 font-mono text-[0.9em]">
          <code>{kids()}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} className="my-2 border-border" />;
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = safeHref(node.attrs?.src);
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          key={key}
          src={src}
          alt={typeof node.attrs?.alt === "string" ? node.attrs.alt : ""}
          className="my-1 max-w-full rounded"
        />
      );
    }
    default:
      // 모르는 노드 — 자식만 흘려보낸다. 통째로 버리면 내용이 조용히 사라진다.
      return <Fragment key={key}>{kids()}</Fragment>;
  }
}

/**
 * doc 노드 또는 블록 노드 배열을 렌더한다.
 * (`stem`·`passage.content`는 doc, `explanation`·`choices[].explanation`은 블록 배열)
 */
export function RichContent({
  value,
  className = "",
}: {
  value: unknown;
  className?: string;
}) {
  const nodes: PMNode[] = Array.isArray(value)
    ? (value as PMNode[])
    : ((value as PMNode)?.content ?? []);

  if (nodes.length === 0) return null;

  return <div className={`space-y-1 ${className}`}>{renderChildren(nodes, "n")}</div>;
}
