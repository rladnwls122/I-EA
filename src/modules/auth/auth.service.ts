import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 이메일 + 비밀번호 회원가입. 비밀번호는 Bcrypt로 해시해 저장한다(평문 금지).
   * 이미 가입된 이메일이면 409. 신규 사용자는 기본 CONSUMER 권한을 부여한다.
   */
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) throw new ConflictException('이미 가입된 이메일입니다.');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        nickname: dto.nickname ?? dto.email.split('@')[0],
        roles: { create: [{ role: UserRoleType.CONSUMER }] },
      },
      select: { id: true, email: true, nickname: true, roles: { select: { role: true } } },
    });
    return this.issueToken(user);
  }

  /**
   * 이메일 + 비밀번호 로그인. 저장된 Bcrypt 해시와 대조해 검증한다.
   * 이메일 존재 여부를 노출하지 않도록 실패 메시지는 동일하게 준다.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        nickname: true,
        passwordHash: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    return this.issueToken(user);
  }

  private async issueToken(user: {
    id: string;
    email: string;
    nickname: string;
    roles: { role: UserRoleType }[];
  }) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        roles: user.roles.map((r) => r.role),
      },
    };
  }
}
