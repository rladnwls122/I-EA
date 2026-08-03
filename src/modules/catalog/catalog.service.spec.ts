import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRoleType } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';

const user = (roles: UserRoleType[]): CurrentUserPayload => ({ id: 'u1', email: 'u1@test.com', roles });

describe('CatalogService.createTag', () => {
  /**
   * tags는 (category, name) 유니크라 생성 경로가 upsert 하나다.
   * existingTag를 주면 "이미 있는 행을 그대로 돌려주는" upsert를 흉내낸다.
   */
  async function setup(existingTag: unknown = null) {
    const prisma = {
      tag: {
        upsert: jest
          .fn()
          .mockImplementation(({ create }) => existingTag ?? { id: 'new-tag', ...create }),
      },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [CatalogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return { service: module.get(CatalogService), prisma };
  }

  it('"키워드" 카테고리는 일반 유저(role 없음)도 생성할 수 있다', async () => {
    const { service, prisma } = await setup();
    const result = await service.createTag({ name: '이차방정식', category: '키워드' }, user([]));
    expect(result).toMatchObject({ name: '이차방정식', category: '키워드' });
    expect(prisma.tag.upsert).toHaveBeenCalled();
  });

  it('같은 (카테고리, 이름)은 복합 유니크 키로 upsert해 중복 행을 만들지 않는다', async () => {
    const { service, prisma } = await setup();
    await service.createTag({ name: '이차방정식', category: '키워드' }, user([]));
    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category_name: { category: '키워드', name: '이차방정식' } },
        update: {},
      }),
    );
  });

  it('"키워드" 카테고리는 같은 이름이 이미 있으면 재생성하지 않고 재사용한다', async () => {
    const existing = { id: 'existing-tag', name: '이차방정식', category: '키워드' };
    const { service } = await setup(existing);
    const result = await service.createTag({ name: '이차방정식', category: '키워드' }, user([]));
    expect(result).toBe(existing);
  });

  it('큐레이션 카테고리는 role 없는 유저를 막는다', async () => {
    const { service, prisma } = await setup();
    expect(() => service.createTag({ name: '수능', category: '출처' }, user([]))).toThrow(
      ForbiddenException,
    );
    expect(prisma.tag.upsert).not.toHaveBeenCalled();
  });

  it('큐레이션 카테고리는 CREATOR가 생성할 수 있다', async () => {
    const { service, prisma } = await setup();
    const result = await service.createTag(
      { name: '수능', category: '출처' },
      user([UserRoleType.CREATOR]),
    );
    expect(result).toMatchObject({ name: '수능', category: '출처' });
    expect(prisma.tag.upsert).toHaveBeenCalled();
  });
});
