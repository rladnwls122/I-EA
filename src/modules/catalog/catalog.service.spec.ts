import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRoleType } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';

const user = (roles: UserRoleType[]): CurrentUserPayload => ({ id: 'u1', email: 'u1@test.com', roles });

describe('CatalogService.createTag', () => {
  async function setup(existingTag: unknown = null) {
    const prisma = {
      tag: {
        findFirst: jest.fn().mockResolvedValue(existingTag),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'new-tag', ...data })),
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
    expect(prisma.tag.create).toHaveBeenCalled();
  });

  it('"키워드" 카테고리는 같은 이름이 이미 있으면 재생성하지 않고 재사용한다', async () => {
    const existing = { id: 'existing-tag', name: '이차방정식', category: '키워드' };
    const { service, prisma } = await setup(existing);
    const result = await service.createTag({ name: '이차방정식', category: '키워드' }, user([]));
    expect(result).toBe(existing);
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it('큐레이션 카테고리는 role 없는 유저를 막는다', async () => {
    const { service } = await setup();
    expect(() => service.createTag({ name: '수능', category: '출처' }, user([]))).toThrow(
      ForbiddenException,
    );
  });

  it('큐레이션 카테고리는 CREATOR가 생성할 수 있다', async () => {
    const { service, prisma } = await setup();
    const result = await service.createTag(
      { name: '수능', category: '출처' },
      user([UserRoleType.CREATOR]),
    );
    expect(result).toMatchObject({ name: '수능', category: '출처' });
    expect(prisma.tag.create).toHaveBeenCalled();
  });
});
