import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUserPayload } from './current-user.interface';

/** JWT에 담기는 클레임(발급 시 sub=users.id). */
interface JwtClaims {
  sub: string;
  email: string;
}

/** validate에서 조회하는 사용자 최소 형태(재시도 헬퍼와 공유). */
const USER_SELECT = {
  id: true,
  email: true,
  roles: { select: { role: true } },
} as const;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

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
   *
   * 주의: 이 조회가 DB 오류로 throw하면 passport-jwt가 그것을 401로 바꾼다.
   * TiDB serverless는 유휴 커넥션을 끊으므로("Server has closed the connection")
   * 죽은 커넥션 하나 때문에 로그인된 사용자가 대량 401을 맞는 일이 생긴다.
   * → 커넥션성 오류는 재연결 후 1회 재시도하고, 그래도 실패하면 401이 아니라
   *   503(재시도 가능)으로 올려 DB 장애를 인증 실패로 오인하지 않게 한다.
   *   사용자가 실제로 없을 때(null)만 진짜 401.
   */
  async validate(claims: JwtClaims): Promise<CurrentUserPayload> {
    const user = await this.findUser(claims.sub);
    if (!user) throw new UnauthorizedException('유효하지 않은 토큰입니다.');

    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role),
    };
  }

  /** 커넥션 끊김이면 재연결 후 1회 재시도. 사용자 부재는 null 반환(→401). */
  private async findUser(id: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        select: USER_SELECT,
      });
    } catch (err) {
      if (!this.isConnectionError(err)) throw err;
      this.logger.warn('DB 커넥션 끊김 감지 — 재연결 후 재시도합니다.');
      try {
        await this.prisma.$connect();
        return await this.prisma.user.findUnique({
          where: { id },
          select: USER_SELECT,
        });
      } catch {
        throw new ServiceUnavailableException(
          '일시적인 DB 오류입니다. 잠시 후 다시 시도해주세요.',
        );
      }
    }
  }

  /** 인증 실패가 아니라 인프라(커넥션) 장애로 봐야 할 오류인지 판정. */
  private isConnectionError(err: unknown): boolean {
    if (err instanceof Prisma.PrismaClientInitializationError) return true;
    if (err instanceof Prisma.PrismaClientRustPanicError) return true;
    if (err instanceof Prisma.PrismaClientUnknownRequestError) return true;
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P1001 서버 도달 불가, P1017 서버가 커넥션을 닫음.
      return err.code === 'P1001' || err.code === 'P1017';
    }
    return false;
  }
}
