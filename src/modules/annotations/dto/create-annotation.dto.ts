import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ANNOTATION_TARGETS,
  AnnotationTarget,
  MARK_STYLES,
  MarkStyle,
  REASON_CODES,
  ReasonCode,
} from '@/common/constants/question';

/** 오답노트 2.0 주석 생성. 앵커(selectedText+selectionRange) 없으면 문항 전체 일반 메모. */
export class CreateAnnotationDto {
  @ApiPropertyOptional({ description: '드래그 대상 구역', enum: ANNOTATION_TARGETS, default: 'STEM' })
  @IsOptional()
  @IsIn(ANNOTATION_TARGETS)
  target?: AnnotationTarget;

  @ApiPropertyOptional({ description: '지문/선지 등 앵커 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  targetId?: string;

  @ApiPropertyOptional({ description: '시각 표기', enum: MARK_STYLES, default: 'HIGHLIGHT' })
  @IsOptional()
  @IsIn(MARK_STYLES)
  markStyle?: MarkStyle;

  @ApiPropertyOptional({ description: '형광펜 색', default: 'yellow' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ description: '하이라이트 원본 문구(일반 메모는 생략)' })
  @IsOptional()
  @IsString()
  selectedText?: string;

  @ApiPropertyOptional({ description: '정밀 오프셋 { startOffset, endOffset }', type: Object })
  @IsOptional()
  @IsObject()
  selectionRange?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '오답 원인 태그', enum: REASON_CODES })
  @IsOptional()
  @IsIn(REASON_CODES)
  reasonCode?: ReasonCode;

  @ApiPropertyOptional({ description: '플로팅 메모 내용', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memoText?: string;
}
