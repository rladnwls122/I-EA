import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { titleForLevel, xpToNextTier, isBoostActive } from '@/common/constants/xp';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 12;

/**
 * 존재하지 않는 계정으로 로그인을 시도했을 때 태울 더미 해시.
 * 실제 해시와 같은 라운드로 만들어 두어야 비교 비용이 비슷해진다.
 * 모듈 로드 시 1회만 계산한다(매 요청 hash를 다시 만들면 그게 또 다른 타이밍 차이가 된다).
 */
const DUMMY_HASH = bcrypt.hashSync('q-idea-dummy-password-for-timing-parity', SALT_ROUNDS);

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
      select: {
        id: true,
        email: true,
        nickname: true,
        tokenVersion: true,
        roles: { select: { role: true } },
      },
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
        tokenVersion: true,
        roles: { select: { role: true } },
      },
    });
    // 계정 열거 방지는 메시지만으로는 부족하다 — 없는 이메일에서 bcrypt를 건너뛰면
    // 응답이 눈에 띄게 빨라져 타이밍만으로 가입 여부를 알 수 있다.
    // 사용자가 없을 때도 더미 해시로 같은 비용을 치른 뒤 동일한 예외를 던진다.
    const ok = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : await this.burnCompare(dto.password);
    if (!user || !ok) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.issueToken(user);
  }

  /**
   * GET /auth/me — 토큰의 사용자 id로 DB를 읽어 xp/level 등 최신 프로필을 돌려준다.
   * (JWT 페이로드에는 xp/level이 없으므로 여기서 조회한다.)
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        xp: true,
        level: true,
        currentStreak: true,
        longestStreak: true,
        xpBoostUntil: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      xp: user.xp,
      level: user.level,
      title: titleForLevel(user.level),
      xpToNextTier: xpToNextTier(user.xp),
      streak: {
        current: user.currentStreak,
        longest: user.longestStreak,
        boostActive: isBoostActive(user.xpBoostUntil, new Date()),
        boostUntil: user.xpBoostUntil,
      },
      roles: user.roles.map((r) => r.role),
    };
  }

  /** 사용자가 없을 때도 bcrypt 비용을 동일하게 치러 타이밍 차이를 없앤다. 항상 false. */
  private async burnCompare(password: string): Promise<boolean> {
    return bcrypt.compare(password, DUMMY_HASH);
  }

  /**
   * 이 사용자의 모든 기기에서 로그아웃한다(발급된 토큰 일괄 무효화).
   * token_version을 올리면 그 전에 발급된 JWT는 만료 전이라도 JwtStrategy가 거부한다.
   * 비밀번호 변경 흐름이 생기면 거기서도 이걸 불러야 한다.
   */
  async logoutAll(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return { revoked: true, tokenVersion: user.tokenVersion };
  }

  private async issueToken(user: {
    id: string;
    email: string;
    nickname: string;
    tokenVersion: number;
    roles: { role: UserRoleType }[];
  }) {
    // tv = 발급 시점의 token_version. 검증 때 DB 값과 대조해 무효화를 판정한다.
    const payload = { sub: user.id, email: user.email, tv: user.tokenVersion };
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
