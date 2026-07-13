import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';

describe('maybeDropBox', () => {
  it('드롭 성공 시 lootBox.create 호출하고 {id,tier} 반환', async () => {
    const created = { id: 'box-1', tier: 'RARE' };
    const tx = { lootBox: { create: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new ExamSessionsService({} as any, {} as any);
    const box = await (svc as any).maybeDropBox(tx, 'u1', 60, 's1', () => 0.0);
    expect(tx.lootBox.create).toHaveBeenCalled();
    expect(box).toEqual({ id: 'box-1', tier: expect.any(String) });
  });

  it('드롭확률 100%라 rng가 높아도 항상 드롭(create 호출)', async () => {
    const created = { id: 'box-2', tier: 'COMMON' };
    const tx = { lootBox: { create: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new ExamSessionsService({} as any, {} as any);
    const box = await (svc as any).maybeDropBox(tx, 'u1', 60, 's1', () => 0.9);
    expect(tx.lootBox.create).toHaveBeenCalled();
    expect(box).toEqual({ id: 'box-2', tier: expect.any(String) });
  });
});
