import { PartialType } from '@nestjs/swagger';
import { CreateAnnotationDto } from './create-annotation.dto';

/** 주석 수정 — 모든 필드 선택적. */
export class UpdateAnnotationDto extends PartialType(CreateAnnotationDto) {}
