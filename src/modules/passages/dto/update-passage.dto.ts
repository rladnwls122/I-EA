import { PartialType } from '@nestjs/swagger';
import { CreatePassageDto } from './create-passage.dto';

/** 부분 수정. status 전환은 전용 publish/archive 엔드포인트로만 처리한다. */
export class UpdatePassageDto extends PartialType(CreatePassageDto) {}
