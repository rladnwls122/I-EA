import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '@/common/throttler/auth-throttler.guard';
import { LOGIN_THROTTLE, REGISTER_THROTTLE } from '@/common/throttler/throttler.config';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from './current-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
// 전역 IP 버킷에 더해 계정(이메일) 버킷을 하나 더 건다 — 분산 무차별 대입 차단.
@UseGuards(AuthThrottlerGuard)
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: REGISTER_THROTTLE })
  @ApiOperation({
    summary: '회원가입 (이메일+비밀번호 → Bcrypt 해시 저장 → JWT 발급)',
    description: '레이트리밋: IP+이메일 기준 1시간 5회(대량 계정 생성 억제).',
  })
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: LOGIN_THROTTLE })
  @ApiOperation({
    summary: '로그인 (이메일+비밀번호 검증 → JWT 발급)',
    description: '레이트리밋: IP+이메일 기준 5분 10회(온라인 무차별 대입 차단).',
  })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 로그인 사용자 정보 (xp/level 포함)' })
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getProfile(user.id);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '모든 기기에서 로그아웃 (발급된 토큰 전부 무효화)',
    description:
      '토큰이 유출됐다고 판단될 때 쓴다. users.token_version을 올려 그 전에 발급된 ' +
      'JWT를 만료 전이라도 거부한다. 호출한 클라이언트의 토큰도 함께 무효가 되므로 ' +
      '프런트는 저장된 토큰을 지우고 로그인 화면으로 보내야 한다.',
  })
  logoutAll(@CurrentUser() user: CurrentUserPayload) {
    return this.service.logoutAll(user.id);
  }
}
