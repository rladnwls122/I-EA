"use client";
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// react-vega는 SSR에서 문제가 될 수 있으므로 dynamic import로 로드
const VegaEmbed = dynamic(() => import('react-vega').then(mod => mod.VegaEmbed), {
  ssr: false,
  loading: () => <div className="h-[180px] w-full animate-pulse bg-surface-raised rounded-lg" />
});

export function VegaStatWidget() {
  const [mounted, setMounted] = useState(false);
  // 모바일 폭에서는 우측 범례가 도넛과 나란히 놓이며 크로우딩/줄바꿈 없는 가로 초과가 생기므로
  // 범례를 하단으로 내려 가로 폭 안에서 자연스럽게 줄바꿈되게 한다.
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 180,
    background: 'transparent',
    padding: 0,
    data: {
      values: [
        { reason: '개념 부족', count: 42 },
        { reason: '조건 누락', count: 28 },
        { reason: '계산 실수', count: 15 },
        { reason: '시간 부족', count: 10 },
        { reason: '기타', count: 5 }
      ]
    },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative' },
      color: {
        field: 'reason',
        type: 'nominal',
        legend: {
          orient: isNarrow ? 'bottom' : 'right',
          direction: isNarrow ? 'horizontal' : 'vertical',
          columns: isNarrow ? 3 : undefined,
          title: null,
          labelColor: 'var(--foreground)',
        },
        scale: {
          range: [
            'var(--chart-1)',
            'var(--chart-2)',
            'var(--chart-3)',
            'var(--chart-4)',
            'var(--chart-5)',
          ],
        }
      }
    },
    config: {
      view: { stroke: 'transparent' },
      arc: { cornerRadius: 4, padAngle: 0.05 }
    }
  };

  if (!mounted) {
    return <div className="h-[180px] w-full animate-pulse bg-surface-raised rounded-lg" />;
  }

  // 브라우저 환경에서만 렌더링되도록 한 번 더 보장. overflow-x-auto는 폭이 매우 좁을 때
  // 범례/차트가 컨테이너를 넘겨도 페이지 전체가 가로로 밀리지 않도록 하는 안전장치.
  return (
    <div className="w-full overflow-x-auto">
      {typeof window !== 'undefined' && <VegaEmbed spec={spec} options={{ actions: false }} />}
    </div>
  );
}
