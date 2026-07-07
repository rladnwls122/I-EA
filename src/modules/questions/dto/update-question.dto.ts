import { PartialType } from '@nestjs/swagger';
import { CreateQuestionDto } from './create-question.dto';

/**
 * 부분 수정. 모든 필드가 선택적이 된다.
 * (status 전환은 update가 아니라 전용 publish 엔드포인트로만 허용한다.)
 */
export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {}
