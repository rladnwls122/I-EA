import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * 이메일 + 비밀번호 로그인. 서버가 저장된 Bcrypt 해시와 대조해 검증한다.
 */
export class LoginDto {
  @ApiProperty({ description: '가입 이메일', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: '비밀번호', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
