"use client";
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// react-vega는 SSR에서 문제가 될 수 있으므로 dynamic import로 로드
const VegaLite = dynamic(() => import('react-vega').then(mod => mod.VegaLite), { ssr: false });

export function VegaStatWidget() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
          orient: 'right',
          title: null,
          labelColor: 'var(--foreground)',
        },
        scale: { scheme: 'purples' }
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

  return (
    <div className="w-full">
      <VegaLite spec={spec} actions={false} />
    </div>
  );
}
