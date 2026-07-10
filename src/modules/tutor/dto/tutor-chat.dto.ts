import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

/**
 * AI 튜터 채팅 요청 body.
 * 전역 ValidationPipe가 whitelist + forbidNonWhitelisted이므로 모든 필드에 데코레이터가 필요하다.
 */
export class TutorChatDto {
  @ApiProperty({ description: '진행 중(IN_PROGRESS) 모의고사 세션 ID' })
  @IsUUID('4', { message: 'examSessionId는 UUID 형식이어야 합니다.' })
  examSessionId!: string;

  @ApiProperty({ description: '질문 대상 문항 ID (세션에 포함된 문항)' })
  @IsUUID('4', { message: 'questionId는 UUID 형식이어야 합니다.' })
  questionId!: string;

  @ApiProperty({ description: '학생이 튜터에게 보내는 질문', minLength: 1, maxLength: 500 })
  @IsString({ message: '메시지는 문자열이어야 합니다.' })
  @Length(1, 500, { message: '메시지는 1자 이상 500자 이하여야 합니다.' })
  message!: string;
}

/**
 * AI 튜터 히스토리 조회 쿼리.
 * GET 쿼리도 whitelist 대상이라 DTO로 받아야 알 수 없는 파라미터가 거부된다.
 */
export class TutorHistoryQueryDto {
  @ApiProperty({ description: '진행 중(IN_PROGRESS) 모의고사 세션 ID' })
  @IsUUID('4', { message: 'examSessionId는 UUID 형식이어야 합니다.' })
  examSessionId!: string;

  @ApiProperty({ description: '질문 대상 문항 ID (세션에 포함된 문항)' })
  @IsUUID('4', { message: 'questionId는 UUID 형식이어야 합니다.' })
  questionId!: string;
}
