import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRoleType } from '@prisma/client';

/**
 * users 테이블에 비밀번호 컬럼이 없으므로, 이 로그인은 외부 IdP(OAuth 등)로
 * 신원이 검증됐다는 전제의 프로비저닝 로그인이다. 실제 운영에서는 이 앞단에
 * 소셜 로그인/매직링크 검증을 두고, 검증된 email만 넘겨받는다.
 */
export class LoginDto {
  @ApiProperty({ description: '검증된 이메일' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: '최초 로그인 시 사용할 닉네임(신규 가입 시)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @ApiPropertyOptional({
    enum: UserRoleType,
    isArray: true,
    description: '신규 가입 시 부여할 권한(기본 CONSUMER)',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(UserRoleType, { each: true })
  roles?: UserRoleType[];
}
