import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiGenerationService } from './ai-generation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { CreateGenerationDto } from './dto/create-generation.dto';

const ROW = {
  id: 'gen-1',
  creatorId: 'owner',
  status: 'DONE',
  model: 'gemini-2.5-flash',
  createdAt: new Date('2026-01-01'),
  passages: [{ id: 'p1' }],
  questions: [{ id: 'q1', questionType: '객관식', status: 'DRAFT' }],
};

function makeService(row: unknown) {
  const prisma = {
    aiGeneration: { findUnique: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  return new AiGenerationService(prisma, {} as GeminiLlmService, {} as never);
}

describe('AiGenerationService.getGeneration — 소유자 검사(IDOR)', () => {
  it('본인 생성 작업은 조회된다', async () => {
    await expect(makeService(ROW).getGeneration('gen-1', 'owner')).resolves.toMatchObject({
      id: 'gen-1',
      passageIds: ['p1'],
    });
  });

  it('남의 생성 작업은 404로 막는다(존재 여부도 노출하지 않는다)', async () => {
    await expect(makeService(ROW).getGeneration('gen-1', 'attacker')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('없는 작업은 404', async () => {
    await expect(makeService(null).getGeneration('nope', 'owner')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// #43 템플릿 검증 + #36 gap 7 듣기 거부 — 생성 요청 진입점의 사전 검사.
describe('AiGenerationService.createGeneration', () => {
  const BASE_DTO: CreateGenerationDto = {
    subjectId: 'subj-1',
    prompt: '문항을 만들어줘',
    difficulty: 3,
    questionCount: 2,
  };

  function makeCreateService(
    subject: unknown,
    opts: { sourceQuestion?: unknown; activeSession?: boolean } = {},
  ) {
    const create = jest
      .fn()
      .mockResolvedValue({ id: 'gen-1', status: 'PENDING', createdAt: new Date('2026-01-01') });
    const prisma = {
      subject: { findUnique: jest.fn().mockResolvedValue(subject) },
      question: { findUnique: jest.fn().mockResolvedValue(opts.sourceQuestion ?? null) },
      examSessionQuestion: {
        findFirst: jest.fn().mockResolvedValue(opts.activeSession ? { id: 'esq-1' } : null),
      },
      aiGeneration: { create },
    } as unknown as PrismaService;
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const llm = { model: 'gemini-2.5-flash' } as GeminiLlmService;
    return { service: new AiGenerationService(prisma, llm, queue as never), create, queue };
  }

  const SUBJECT = { id: 'subj-1', name: '문학', examCategory: '국어', examType: '수능' };

  it('듣기 소분류(이름에 "듣기")는 400으로 거부한다 — 오디오 파이프라인이 없다', async () => {
    const { service } = makeCreateService({
      id: 'subj-1',
      name: '듣기',
      examCategory: '영어',
      examType: '수능',
    });
    await expect(service.createGeneration('u1', BASE_DTO)).rejects.toThrow(
      '듣기(오디오) 과목은 AI 생성을 지원하지 않습니다.',
    );
  });

  it('토익 LC 소분류(대분류 LC)도 거부한다', async () => {
    const { service } = makeCreateService({
      id: 'subj-1',
      name: 'Part1_사진',
      examCategory: 'LC',
      examType: '토익',
    });
    await expect(service.createGeneration('u1', BASE_DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('토익 RC는 거부하지 않는다(오디오 아님)', async () => {
    const { service } = makeCreateService({
      id: 'subj-1',
      name: 'Part5_문법',
      examCategory: 'RC',
      examType: '토익',
    });
    await expect(service.createGeneration('u1', BASE_DTO)).resolves.toMatchObject({
      id: 'gen-1',
    });
  });

  it('템플릿의 examTypes와 과목의 시험이 안 맞으면 400', async () => {
    const { service } = makeCreateService(SUBJECT); // 수능 과목
    await expect(
      service.createGeneration('u1', { ...BASE_DTO, templateId: 'toeic-part5' }),
    ).rejects.toThrow(/'수능' 시험에서 쓸 수 없습니다/);
  });

  it('OX 요청과 복수정답 템플릿은 구조적 모순이라 400', async () => {
    const { service } = makeCreateService({
      id: 'subj-1',
      name: '정치',
      examCategory: '통합사회',
      examType: '내신',
    });
    await expect(
      service.createGeneration('u1', { ...BASE_DTO, templateId: 'school-multi-answer', ox: true }),
    ).rejects.toThrow('OX 형식은 복수정답 템플릿과 함께 쓸 수 없습니다.');
  });

  it('시험이 맞는 템플릿은 templateId를 input_params에 스냅샷하고 큐에 적재한다', async () => {
    const { service, create, queue } = makeCreateService(SUBJECT);
    await service.createGeneration('u1', {
      ...BASE_DTO,
      templateId: 'csat-korean-passage-set',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputParams: expect.objectContaining({ templateId: 'csat-korean-passage-set' }),
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('템플릿 미지정이면 templateId는 null로 스냅샷된다(종전 동작)', async () => {
    const { service, create } = makeCreateService(SUBJECT);
    await service.createGeneration('u1', BASE_DTO);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputParams: expect.objectContaining({ templateId: null, includePassage: null }),
        }),
      }),
    );
  });

  // 유사(변형) 문항 생성 — 원본 접근·분류 일치·응시 중 차단 검증.
  describe('sourceQuestionId (유사 문항 생성)', () => {
    const VARIANT_DTO = { ...BASE_DTO, sourceQuestionId: 'q-src' };
    const SOURCE = { id: 'q-src', creatorId: 'u1', subjectId: 'subj-1', status: 'DRAFT' };

    it('본인 문항이면 DRAFT여도 원본으로 쓸 수 있고 inputParams에 스냅샷된다', async () => {
      const { service, create } = makeCreateService(SUBJECT, { sourceQuestion: SOURCE });
      await service.createGeneration('u1', VARIANT_DTO);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inputParams: expect.objectContaining({ sourceQuestionId: 'q-src' }),
          }),
        }),
      );
    });

    it('남의 PUBLISHED 문항은 허용된다', async () => {
      const { service } = makeCreateService(SUBJECT, {
        sourceQuestion: { ...SOURCE, creatorId: 'other', status: 'PUBLISHED' },
      });
      await expect(service.createGeneration('u1', VARIANT_DTO)).resolves.toMatchObject({
        id: 'gen-1',
      });
    });

    it('남의 DRAFT는 404 — 존재 여부도 노출하지 않는다', async () => {
      const { service } = makeCreateService(SUBJECT, {
        sourceQuestion: { ...SOURCE, creatorId: 'other', status: 'DRAFT' },
      });
      await expect(service.createGeneration('u1', VARIANT_DTO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('없는 원본은 404', async () => {
      const { service } = makeCreateService(SUBJECT);
      await expect(service.createGeneration('u1', VARIANT_DTO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('subjectId가 원본과 다르면 400 — 변형은 같은 세부과목이어야 한다', async () => {
      const { service } = makeCreateService(SUBJECT, {
        sourceQuestion: { ...SOURCE, subjectId: 'subj-2' },
      });
      await expect(service.createGeneration('u1', VARIANT_DTO)).rejects.toThrow(
        '유사 문항은 원본 문항과 같은 세부과목이어야 합니다.',
      );
    });

    it('원본을 품은 진행 중 세션이 있으면 400 — 응시 중 마스킹의 우회로가 된다', async () => {
      const { service } = makeCreateService(SUBJECT, {
        sourceQuestion: SOURCE,
        activeSession: true,
      });
      await expect(service.createGeneration('u1', VARIANT_DTO)).rejects.toThrow(
        '응시 중인 문항으로는 유사 문항을 생성할 수 없습니다.',
      );
    });

    it('sourceQuestionId 미지정이면 null로 스냅샷되고 원본 조회를 하지 않는다(종전 경로)', async () => {
      const { service, create } = makeCreateService(SUBJECT);
      await service.createGeneration('u1', BASE_DTO);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inputParams: expect.objectContaining({ sourceQuestionId: null }),
          }),
        }),
      );
    });
  });
});

// #43 템플릿 목록 — GET /ai-generations/templates?examType=
describe('AiGenerationService.listFormatTemplates', () => {
  const service = new AiGenerationService(
    {} as PrismaService,
    {} as GeminiLlmService,
    {} as never,
  );

  it('examType 미지정이면 전체 템플릿을 준다(id·label·description·structure 포함)', () => {
    const all = service.listFormatTemplates();
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        description: expect.any(String),
        structure: expect.any(Object),
      }),
    );
  });

  it('examType을 주면 그 시험의 템플릿만 준다', () => {
    const toeic = service.listFormatTemplates('토익');
    expect(toeic.length).toBeGreaterThan(0);
    expect(toeic.every((t) => t.examTypes.includes('토익'))).toBe(true);
  });

  it('모르는 시험이면 빈 배열', () => {
    expect(service.listFormatTemplates('편입')).toEqual([]);
  });
});
