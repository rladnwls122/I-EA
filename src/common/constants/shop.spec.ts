import { rollBoxTier, rollCoins } from '@/common/constants/shop';

describe('rollBoxTier', () => {
  it('드롭확률 100%라 rng가 높아도 항상 드롭(non-null)', () => {
    // BOX_DROP_CHANCE=1.0 → rng 0.9여도 0.9 < 1.0 이라 드롭
    expect(rollBoxTier(100, () => 0.9)).not.toBeNull();
  });

  it('드롭 성공 시 가중치 첫 구간이면 COMMON', () => {
    // rng[0]=0.1(드롭), rng[1]=0.0 → 누적 가중 첫 구간
    const seq = [0.1, 0.0];
    let i = 0;
    expect(rollBoxTier(30, () => seq[i++])).toBe('COMMON');
  });

  it('정답률 높으면 LEGENDARY 도달 가능(rng 끝값)', () => {
    const seq = [0.0, 0.999];
    let i = 0;
    expect(rollBoxTier(90, () => seq[i++])).toBe('LEGENDARY');
  });
});

describe('rollCoins', () => {
  it('COMMON 범위 [10,30] 경계', () => {
    expect(rollCoins('COMMON', () => 0)).toBe(10);
    expect(rollCoins('COMMON', () => 0.999)).toBe(30);
  });
  it('LEGENDARY 범위 [120,250]', () => {
    expect(rollCoins('LEGENDARY', () => 0)).toBe(120);
    expect(rollCoins('LEGENDARY', () => 0.999)).toBe(250);
  });
});
