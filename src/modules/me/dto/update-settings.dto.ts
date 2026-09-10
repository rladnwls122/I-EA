import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** 알림 등 사용자 설정. 부분 갱신 — 보낸 필드만 바뀐다. */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: '내 문제 댓글 / 내 댓글 답글 이메일 알림' })
  @IsOptional()
  @IsBoolean()
  notifyCommentEmail?: boolean;
}
