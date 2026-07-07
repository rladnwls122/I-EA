import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * user_question_memos — UNIQUE(user_id, question_id)이므로 사용자당 문제 1건(upsert).
 * content(평문/Tiptap 직렬화)와 canvas(펜 필기 스트로크) 중 하나 이상을 담는다.
 */
export class UpsertMemoDto {
  @ApiPropertyOptional({ description: '텍스트 메모(평문 또는 Tiptap 직렬화)' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: '캔버스 필기 스트로크 JSON { version, strokes: [...] }',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  canvas?: Record<string, unknown>;
}
