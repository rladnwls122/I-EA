import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 이메일 기준 find-or-create 후 액세스 토큰을 발급한다.
   * 신규 사용자는 지정된 권한(없으면 CONSUMER)으로 user_roles를 함께 만든다.
   */
  async login(dto: LoginDto) {
    const user = await this.findOrCreate(dto);

    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: user.roles,
      },
    };
  }

  private async findOrCreate(dto: LoginDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, nickname: true, roles: { select: { role: true } } },
    });
    if (existing) {
      return { ...existing, roles: existing.roles.map((r) => r.role) };
    }

    const roles = dto.roles?.length ? dto.roles : [UserRoleType.CONSUMER];
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        nickname: dto.nickname ?? dto.email.split('@')[0],
        roles: { create: roles.map((role) => ({ role })) },
      },
      select: { id: true, email: true, nickname: true, roles: { select: { role: true } } },
    });
    return { ...created, roles: created.roles.map((r) => r.role) };
  }
}
