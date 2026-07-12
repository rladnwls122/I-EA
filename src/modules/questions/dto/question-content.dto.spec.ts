import { ValidationPipe } from '@nestjs/common';
import { CreateQuestionDto } from './create-question.dto';

/**
 * 회귀 테스트 — enableImplicitConversion이 Array<Record> 필드의 원소 객체를
 * new Array()로 변조해 choices가 [[],[],[],[]]로, explanation이 [[]]로
 * 저장되던 버그(선지·해설 전부 유실). JSON 직렬화까지 원형이 보존돼야 한다.
 */
describe('QuestionContentDto — Json 배열 필드 원형 보존', () => {
  // main.ts의 전역 파이프와 동일한 설정
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const body = {
    subjectId: '11111111-1111-4111-8111-111111111111',
    questionType: '객관식',
    stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '발문' }] }] },
    choices: [
      {
        id: 'c1',
        isCorrect: true,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '선지1' }] }] },
        explanation: [{ type: 'paragraph', content: [{ type: 'text', text: '선지 해설' }] }],
        explanationVisible: true,
      },
      {
        id: 'c2',
        isCorrect: false,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '선지2' }] }] },
      },
    ],
    explanation: [{ type: 'paragraph', content: [{ type: 'text', text: '전체 해설' }] }],
  };

  it('choices 원소가 객체 그대로 살아남는다(빈 배열로 변조 금지)', async () => {
    const out = (await pipe.transform(structuredClone(body), {
      type: 'body',
      metatype: CreateQuestionDto,
    })) as CreateQuestionDto;

    // JSON 직렬화(DB Json 컬럼 저장과 동일 경로) 후에도 원형이어야 한다.
    const roundTrip = JSON.parse(JSON.stringify(out.choices));
    expect(roundTrip).toEqual(body.choices);
  });

  it('explanation 블록 배열도 원형 보존', async () => {
    const out = (await pipe.transform(structuredClone(body), {
      type: 'body',
      metatype: CreateQuestionDto,
    })) as CreateQuestionDto;

    const roundTrip = JSON.parse(JSON.stringify(out.explanation));
    expect(roundTrip).toEqual(body.explanation);
  });
});
