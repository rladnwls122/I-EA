import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUserPayload } from './current-user.interface';

/** JWT에 담기는 클레임(발급 시 sub=users.id). */
interface JwtClaims {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  /**
   * 토큰 서명 검증 후 호출된다. 반환값이 request.user가 된다.
   * 탈퇴/차단 사용자를 걸러내기 위해 매 요청 DB에서 사용자와 권한을 확인한다.
   */
  async validate(claims: JwtClaims): Promise<CurrentUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, roles: { select: { role: true } } },
    });
    if (!user) throw new UnauthorizedException('유효하지 않은 토큰입니다.');

    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role),
    };
  }
}
