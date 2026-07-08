import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional } from 'class-validator';

/**
 * stem/choices/explanation은 Tiptap/ProseMirror JSON(스키마 3.6.1)이다.
 * 서버는 구조를 신뢰하고 저장하되, 최소한 타입(object/array)만 검증한다.
 * 상세 노드 검증은 prosemirror.util 기반 별도 파이프에서 확장할 수 있다.
 */
export class QuestionContentDto {
  @ApiProperty({ description: '발문 doc 노드(Tiptap JSON)', type: Object })
  @IsObject()
  stem!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '선지 배열(객관식 전용). 주관식은 생략', type: [Object] })
  @IsOptional()
  @IsArray()
  choices?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: '해설 블록 노드 배열', type: [Object] })
  @IsOptional()
  @IsArray()
  explanation?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: '자유형 메타데이터(JSON)', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
