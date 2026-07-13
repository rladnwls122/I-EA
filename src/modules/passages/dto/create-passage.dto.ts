import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class CreatePassageDto {
  @ApiProperty({ description: '지문 본문 doc 노드(Tiptap/ProseMirror JSON)', type: Object })
  @IsObject()
  content!: Record<string, unknown>;
}
