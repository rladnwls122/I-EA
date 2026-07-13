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

  it('미드롭이면 create 미호출·null 반환', async () => {
    const tx = { lootBox: { create: jest.fn() } } as any;
    const svc = new ExamSessionsService({} as any, {} as any);
    const box = await (svc as any).maybeDropBox(tx, 'u1', 60, 's1', () => 0.9);
    expect(tx.lootBox.create).not.toHaveBeenCalled();
    expect(box).toBeNull();
  });
});
