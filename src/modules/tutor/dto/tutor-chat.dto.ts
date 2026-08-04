import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

/**
 * 오답 복습 튜터 채팅 요청 body (#40).
 *
 * 풀이 중 튜터와 달리 세션 id를 받지 않는다 — 학습자가 오답노트에서 문항 단위로
 * 들어오기 때문이고, 어느 세션에서 풀었는지는 서버가 찾는다(가장 최근 제출 세션).
 * 클라이언트가 세션을 고르게 두면 "남의 세션 id를 넣어보기"라는 표면이 생긴다.
 */
export class ReviewTutorChatDto {
  @ApiProperty({ description: '복습할 문항 ID (본인이 제출한 세션에 포함된 문항)' })
  @IsUUID('4', { message: 'questionId는 UUID 형식이어야 합니다.' })
  questionId!: string;

  @ApiProperty({ description: '학생이 코치에게 보내는 질문', minLength: 1, maxLength: 500 })
  @IsString({ message: '메시지는 문자열이어야 합니다.' })
  @Length(1, 500, { message: '메시지는 1자 이상 500자 이하여야 합니다.' })
  message!: string;
}

/** 오답 복습 튜터 히스토리 조회 쿼리. */
export class ReviewTutorHistoryQueryDto {
  @ApiProperty({ description: '복습할 문항 ID' })
  @IsUUID('4', { message: 'questionId는 UUID 형식이어야 합니다.' })
  questionId!: string;
}
