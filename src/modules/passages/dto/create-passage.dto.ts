import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { IsProseMirrorDoc } from '@/common/prosemirror/is-prosemirror.decorator';

export class CreatePassageDto {
  @ApiProperty({ description: '지문 본문 doc 노드(Tiptap/ProseMirror JSON)', type: Object })
  @IsObject()
  // 노드/마크/attrs 화이트리스트 검증 — 문항 stem과 같은 기준(prosemirror.sanitize).
  @IsProseMirrorDoc()
  content!: Record<string, unknown>;
}
