import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 이메일 + 비밀번호 회원가입. 비밀번호는 Bcrypt로 해시해 저장한다(평문 금지).
 * 권한(roles)은 클라이언트에서 받지 않고 서버가 기본 CONSUMER로 부여한다.
 */
export class RegisterDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: '비밀번호', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: '닉네임(미입력 시 이메일 앞부분 사용)', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;
}
