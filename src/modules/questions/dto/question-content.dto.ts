import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsObject, IsOptional } from 'class-validator';
import {
  IsProseMirrorBlocks,
  IsProseMirrorDoc,
  IsQuestionChoices,
} from '@/common/prosemirror/is-prosemirror.decorator';

/**
 * stem/choices/explanation은 Tiptap/ProseMirror JSON(스키마 3.6.1)이다.
 *
 * 노드 타입·마크·attrs를 화이트리스트로 검증한다(prosemirror.sanitize).
 * 예전에는 `@IsObject()`/`@IsArray()`만 보고 임의 구조를 그대로 저장해서,
 * 렌더러가 바뀌는 순간 저장형 XSS가 되는 상태였다. 링크·이미지 URL 스킴도 여기서 막힌다.
 * 에디터에 Tiptap 확장을 추가하면 prosemirror.sanitize의 허용 집합도 같이 넓혀야 한다.
 *
 * 주의: 전역 ValidationPipe의 enableImplicitConversion이 Array<Record> 원소
 * 객체를 new Array()로 변조해 선지·해설이 전부 []로 저장되던 버그가 있었다.
 * Json 배열 필드는 @Transform 통과로 원형을 보존한다(제거 금지).
 */
export class QuestionContentDto {
  @ApiProperty({ description: '발문 doc 노드(Tiptap JSON)', type: Object })
  @IsObject()
  @IsProseMirrorDoc()
  stem!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '선지 배열(객관식 전용). 주관식은 생략', type: [Object] })
  @IsOptional()
  @IsArray()
  @Transform(({ obj }) => obj.choices)
  @IsQuestionChoices()
  choices?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: '해설 블록 노드 배열', type: [Object] })
  @IsOptional()
  @IsArray()
  @Transform(({ obj }) => obj.explanation)
  @IsProseMirrorBlocks()
  explanation?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: '자유형 메타데이터(JSON)', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
