import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray } from 'class-validator';
import { MEDIA_BATCH_MAX } from '../media.constants';
import { CreateMediaDto } from './create-media.dto';

/**
 * 미디어 일괄 등록 (#33 도그푸딩 잔여 3).
 *
 * 캔버스 저장이 문항·태그를 배치로 묶은 뒤, 남은 왕복의 대부분이 **이미지 등록**이 됐다.
 * 그림이 많은 문제집이면 `POST /media-assets`가 이미지 장수만큼 나가서, 문항 배치로
 * 60회를 1회로 줄여 놓고 이미지 20장에 20회를 쓰는 모양이 된다.
 *
 * 항목 본문은 단건 등록 DTO(CreateMediaDto)를 **그대로** 쓴다 — 배치용 필드 집합을
 * 따로 정의하면 검증이 갈라진다. 결과도 문항 배치와 같은 **항목별**이다:
 * 이미지 하나가 실패했다고 나머지를 되돌리면, 등록에 실패한 이미지를 다음 저장에서만
 * 다시 시도하는 규칙(캔버스의 registeredImages 기준선)이 무너진다.
 *
 * ⚠️ `@ValidateNested`를 걸지 않는 이유는 문항 배치와 같다 — 항목 형식 오류가 배치
 * 전체를 400으로 만들면 안 된다. 항목 검증은 서비스가 `validateBatchItems`로 돌린다.
 */
export class BatchCreateMediaDto {
  @ApiProperty({
    description:
      `등록할 미디어 목록(최대 ${MEDIA_BATCH_MAX}건). ` +
      '항목 형식 오류는 그 항목만 실패한다.',
    type: [CreateMediaDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MEDIA_BATCH_MAX)
  items!: unknown[];
}
