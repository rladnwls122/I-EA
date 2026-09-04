import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TRANSFORM_OPTIONS, VALIDATOR_OPTIONS } from '@/common/validation-options';
import { SEARCH_QUERY_MAX } from '@/common/dto/pagination.dto';
import { QueryQuestionDto } from '@/modules/questions/dto/query-question.dto';
import {
  CreateWorkbookDto,
  QueryWorkbookDto,
  SUBJECT_LABEL_MAX,
  UpdateWorkbookDto,
  WORKBOOK_DESCRIPTION_MAX,
} from '@/modules/workbooks/dto/workbook.dto';
import {
  ANSWER_TEXT_MAX,
  SubmitAnswerDto,
} from '@/modules/exam-sessions/dto/submit-answer.dto';

/**
 * 저장되는 문자열에 상한이 없으면 컬럼 초과가 Prisma P2000 → 500으로 나간다.
 * 사용자는 "길이를 줄이라"는 신호를 못 받고, 같은 값을 다시 보내면 똑같이 실패한다.
 * 검색어(q)처럼 저장되지 않는 값도 LIKE 패턴이 되므로 상한을 둔다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate(cls: any, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload, TRANSFORM_OPTIONS);
  return validateSync(dto as object, VALIDATOR_OPTIONS);
}

const chars = (n: number) => '가'.repeat(n);

describe('저장되는 문자열의 길이 상한 (P2000 → 500 차단)', () => {
  it('주관식 답안은 상한까지 받고 넘으면 거부한다', () => {
    expect(validate(SubmitAnswerDto, { answerText: chars(ANSWER_TEXT_MAX) })).toHaveLength(0);
    expect(
      validate(SubmitAnswerDto, { answerText: chars(ANSWER_TEXT_MAX + 1) }).length,
    ).toBeGreaterThan(0);
  });

  it('답안 상한은 UTF-8 최악(글자당 4바이트)에도 TEXT 컬럼(65,535바이트) 안에 든다', () => {
    expect(ANSWER_TEXT_MAX * 4).toBeLessThanOrEqual(65_535);
  });

  it('문제집 설명은 생성·수정 양쪽에서 같은 상한을 쓴다', () => {
    const ok = { title: '제목', description: chars(WORKBOOK_DESCRIPTION_MAX) };
    const over = { title: '제목', description: chars(WORKBOOK_DESCRIPTION_MAX + 1) };
    expect(validate(CreateWorkbookDto, ok)).toHaveLength(0);
    expect(validate(CreateWorkbookDto, over).length).toBeGreaterThan(0);
    expect(validate(UpdateWorkbookDto, { description: ok.description })).toHaveLength(0);
    expect(validate(UpdateWorkbookDto, { description: over.description }).length).toBeGreaterThan(0);
  });

  it('문제집 설명 상한도 TEXT 컬럼 안에 든다', () => {
    expect(WORKBOOK_DESCRIPTION_MAX * 4).toBeLessThanOrEqual(65_535);
  });
});

describe('검색·필터 문자열의 길이 상한', () => {
  it('문제 검색어 q는 상한을 넘으면 거부한다', () => {
    expect(validate(QueryQuestionDto, { q: chars(SEARCH_QUERY_MAX) })).toHaveLength(0);
    expect(validate(QueryQuestionDto, { q: chars(SEARCH_QUERY_MAX + 1) }).length).toBeGreaterThan(0);
  });

  it('문제집 검색어 q도 같은 상한을 쓴다', () => {
    expect(validate(QueryWorkbookDto, { q: chars(SEARCH_QUERY_MAX) })).toHaveLength(0);
    expect(validate(QueryWorkbookDto, { q: chars(SEARCH_QUERY_MAX + 1) }).length).toBeGreaterThan(0);
  });

  it('examType/examCategory는 대조하는 컬럼(VarChar(50))보다 길 수 없다', () => {
    expect(SUBJECT_LABEL_MAX).toBe(50);
    expect(validate(QueryWorkbookDto, { examType: chars(SUBJECT_LABEL_MAX) })).toHaveLength(0);
    expect(
      validate(QueryWorkbookDto, { examCategory: chars(SUBJECT_LABEL_MAX + 1) }).length,
    ).toBeGreaterThan(0);
  });

  it('정상 길이의 검색·필터 값은 그대로 통과한다', () => {
    expect(validate(QueryWorkbookDto, { q: '문학', examType: '수능', examCategory: '국어' })).toHaveLength(0);
  });
});
