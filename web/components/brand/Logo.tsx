/**
 * IΔEA 로고 마크 — 선(stroke) 라인아트. stroke를 currentColor로 두어
 * 어디에 놓든 텍스트 색을 따라간다(사이드바 primary 배경 위 흰색 등).
 * 원본(Downloads/idea.svg)의 숨은 래스터 레이어는 걷어내고 벡터만 남겼다.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeMiterlimit={10}
      className={className}
      aria-hidden="true"
    >
      <polygon points="13.02,6.75 4.42,26.67 13.02,26.67" />
      <line x1="17.68" y1="15.38" x2="20.94" y2="15.38" />
      <line x1="17.47" y1="20.57" x2="19.1" y2="20.57" />
      <line x1="15.16" y1="3.06" x2="15.16" y2="26.67" />
      <polyline points="22.27,26.67 26.29,26.67 17.2,6.75 17.2,26.67 19.1,26.67" />
    </svg>
  );
}
