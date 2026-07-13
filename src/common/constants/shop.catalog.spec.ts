import { SHOP_ITEMS, getShopItem } from '@/common/constants/shop';

describe('SHOP_ITEMS', () => {
  it('주먹밥 쿠폰은 7777코인 PHYSICAL', () => {
    expect(SHOP_ITEMS.RICEBALL_COUPON.price).toBe(7777);
    expect(SHOP_ITEMS.RICEBALL_COUPON.kind).toBe('PHYSICAL');
  });
  it('XP 부스터는 100코인 BOOST', () => {
    expect(SHOP_ITEMS.XP_BOOST.price).toBe(100);
    expect(SHOP_ITEMS.XP_BOOST.kind).toBe('BOOST');
  });
  it('getShopItem 알 수 없는 키는 undefined', () => {
    expect(getShopItem('NOPE' as any)).toBeUndefined();
  });
});
