import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { QuestionKind } from '@/common/constants/question';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { grade, isSelfGradable, maskSnapshot, QuestionSnapshot } from './grading.util';

// Json 컬럼 쓰기용 국소 캐스팅(생성 클라이언트가 InputJsonValue를 표면화하지 않음).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

@Injectable()
export class ExamSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 필터 조건으로 PUBLISHED 문제를 뽑아 세션을 조립한다.
   * 세션 시작 시점의 문항을 exam_session_questions.snapshot에 통째로 보존해,
   * 원본 문제가 이후 수정/보관돼도 채점 근거가 흔들리지 않게 한다.
   */
  async create(userId: string, dto: CreateSessionDto) {
    // 필터 모드에서만 소분류가 필요하다(DTO의 @ValidateIf가 강제).
    // 플레이리스트 모드는 문제집(Pick & Mix)이 여러 소분류를 섞으므로 subjectId를 받지 않는다.
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
        select: { id: true },
      });
      if (!subject) throw new NotFoundException('소분류를 찾을 수 없습니다.');
    }

    // 두 모드: (1) 플레이리스트 — 지정 문항, (2) 필터 — 조건 랜덤 추출.
    let picked: string[];
    if (dto.questionIds?.length) {
      // 지정 문항 중 PUBLISHED만, 지정 순서를 보존해 세트를 구성한다.
      // 과목은 강제하지 않는다 — 문제집은 교차 과목을 허용한다.
      const found = await this.prisma.question.findMany({
        where: { id: { in: dto.questionIds }, status: 'PUBLISHED' },
        select: { id: true },
      });
      const ok = new Set(found.map((q) => q.id));
      // 일부만 유효하면 조용히 버리지 않고 거부한다.
      // (과거에는 걸러진 문항 없이 짧은 시험이 만들어져 사용자가 알아챌 수 없었다.)
      const missing = [...new Set(dto.questionIds)].filter((id) => !ok.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `플레이리스트에 발행되지 않았거나 존재하지 않는 문항이 있습니다: ${missing.join(', ')}`,
        );
      }
      picked = dto.questionIds.filter((id) => ok.has(id));
    } else {
      if (!dto.questionCount) {
        throw new BadRequestException('questionCount 또는 questionIds 중 하나가 필요합니다.');
      }
      // 후보 ID만 가볍게 조회한 뒤 앱에서 셔플·표본추출(간단·MySQL 무관).
      const candidates = await this.prisma.question.findMany({
        where: this.buildQuestionWhere(dto),
        select: { id: true },
        take: 1000,
      });
      if (candidates.length === 0) {
        throw new BadRequestException('조건에 맞는 문제가 없습니다. 필터를 완화하세요.');
      }
      picked = this.sample(candidates.map((c) => c.id), dto.questionCount);
    }

    const full = await this.prisma.question.findMany({
      where: { id: { in: picked } },
      select: {
        id: true,
        questionType: true,
        stem: true,
        choices: true,
        explanation: true,
        correctAnswerText: true,
        points: true,
        difficulty: true,
      },
    });
    // picked 순서를 유지해 displayOrder를 안정적으로 부여한다.
    const byId = new Map(full.map((q) => [q.id, q]));

    const session = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.examSession.create({
        data: {
          userId,
          subjectId: dto.subjectId ?? null,
          workbookId: dto.workbookId ?? null,
          filterCriteria: (dto.questionIds?.length
            ? { mode: 'playlist', questionIds: picked, workbookId: dto.workbookId ?? null }
            : { mode: 'filter', questionCount: dto.questionCount, ...(dto.filter ?? {}) }) as JsonWritable,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.examSessionQuestion.createMany({
        data: picked
          .map((qid, idx) => {
            const q = byId.get(qid);
            if (!q) return null;
            const snapshot: QuestionSnapshot = {
              questionType: q.questionType as QuestionKind,
              stem: q.stem as JsonWritable,
              choices: (q.choices ?? undefined) as JsonWritable,
              explanation: (q.explanation ?? undefined) as JsonWritable,
              correctAnswerText: q.correctAnswerText,
              points: Number(q.points),
              difficulty: q.difficulty,
            };
            return {
              examSessionId: created.id,
              questionId: qid,
              displayOrder: idx + 1,
              snapshot: snapshot as JsonWritable,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      });

      return created;
    });

    return { id: session.id, questionCount: picked.length, status: 'IN_PROGRESS' };
  }

  /**
   * 세션 응시 화면 데이터. 진행 중이면 정답/해설을 마스킹해서 내려준다.
   * 제출 완료 세션은 정답·해설·채점 결과를 그대로 노출한다.
   */
  async getById(id: string, userId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        sessionQuestions: {
          orderBy: { displayOrder: 'asc' },
          include: { answer: true },
        },
      },
    });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('본인 세션만 조회할 수 있습니다.');

    const inProgress = session.status === 'IN_PROGRESS';

    return {
      id: session.id,
      subject: session.subject,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      durationSec: session.durationSec,
      questions: session.sessionQuestions.map((sq) => {
        const snapshot = sq.snapshot as unknown as QuestionSnapshot;
        return {
          sessionQuestionId: sq.id,
          questionId: sq.questionId,
          displayOrder: sq.displayOrder,
          isHintUsed: sq.isHintUsed,
          hintUsedAt: sq.hintUsedAt,
          // 진행 중에는 정답 은닉, 채점 완료 후에는 원본 스냅샷 공개.
          snapshot: inProgress ? maskSnapshot(snapshot) : snapshot,
          answer: sq.answer
            ? {
                selectedChoiceIds: sq.answer.selectedChoiceIds,
                answerText: sq.answer.answerText,
                annotations: sq.answer.annotations,
                isCorrect: inProgress ? undefined : sq.answer.isCorrect,
                timeSpentSec: sq.answer.timeSpentSec,
              }
            : null,
        };
      }),
    };
  }

  /**
   * 개별 문항 답안 제출/수정(OMR). 제출 즉시 스냅샷 기준으로 채점해 저장한다.
   * exam_session_answers는 문항당 1건(UNIQUE) → upsert.
   */
  async submitAnswer(sessionQuestionId: string, userId: string, dto: SubmitAnswerDto) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: { id: true, snapshot: true, examSession: { select: { userId: true, status: true } } },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 응시할 수 있습니다.');
    if (sq.examSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('이미 제출된 세션입니다.');
    }

    const snapshot = sq.snapshot as unknown as QuestionSnapshot;
    const isCorrect = grade(snapshot, {
      selectedChoiceIds: dto.selectedChoiceIds,
      answerText: dto.answerText,
    });

    await this.prisma.examSessionAnswer.upsert({
      where: { examSessionQuestionId: sessionQuestionId },
      create: {
        examSessionQuestionId: sessionQuestionId,
        selectedChoiceIds: (dto.selectedChoiceIds ?? undefined) as JsonWritable,
        answerText: dto.answerText ?? null,
        annotations: (dto.annotations ?? undefined) as JsonWritable,
        isCorrect,
        timeSpentSec: dto.timeSpentSec ?? null,
        answeredAt: new Date(),
      },
      update: {
        selectedChoiceIds: (dto.selectedChoiceIds ?? undefined) as JsonWritable,
        answerText: dto.answerText ?? null,
        annotations: (dto.annotations ?? undefined) as JsonWritable,
        isCorrect,
        timeSpentSec: dto.timeSpentSec ?? null,
        answeredAt: new Date(),
      },
    });

    // 진행 중에는 정오 결과를 숨기고, 저장 여부만 반환한다.
    return { sessionQuestionId, saved: true };
  }

  /**
   * 문항 힌트 열람. 최초 열람 시각을 exam_session_questions에 기록하고(is_hint_used),
   * 라이브 문제의 hint_content를 반환한다. 채점 근거가 아니므로 스냅샷이 아닌 원본에서 가져온다.
   */
  async revealHint(sessionQuestionId: string, userId: string) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: {
        id: true,
        isHintUsed: true,
        hintUsedAt: true,
        question: { select: { hintContent: true } },
        examSession: { select: { userId: true, status: true } },
      },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 응시할 수 있습니다.');
    if (sq.examSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('이미 제출된 세션입니다.');
    }
    if (!sq.question.hintContent) throw new NotFoundException('이 문항에는 힌트가 없습니다.');

    // 최초 열람 시각만 남긴다(이미 열람했으면 기존 값 유지).
    const hintUsedAt = sq.hintUsedAt ?? new Date();
    if (!sq.isHintUsed) {
      await this.prisma.examSessionQuestion.update({
        where: { id: sessionQuestionId },
        data: { isHintUsed: true, hintUsedAt },
      });
    }

    return { sessionQuestionId, hint: sq.question.hintContent, isHintUsed: true, hintUsedAt };
  }

  /**
   * 세션 최종 제출. 상태를 SUBMITTED로 바꾸고 채점 결과를 집계한 뒤,
   * 문항별 풀이 카운터 캐시(total/correct_solved_count)를 갱신한다.
   */
  async submit(id: string, userId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
      include: {
        sessionQuestions: {
          include: {
            answer: {
              select: { isCorrect: true, selectedChoiceIds: true, timeSpentSec: true },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.userId !== userId) throw new ForbiddenException('본인 세션만 제출할 수 있습니다.');
    if (session.status !== 'IN_PROGRESS') throw new BadRequestException('이미 제출된 세션입니다.');

    const total = session.sessionQuestions.length;
    let correct = 0;
    let answered = 0;
    const gradedQuestionIds: { id: string; correct: boolean }[] = [];
    // 평균 풀이시간 캐시: 채점 여부와 무관하게 시간이 기록된 답안만 집계한다.
    const timed: { id: string; sec: number }[] = [];
    // 선지별 오답 분포: 선택된 선지 id마다 +1.
    const choicePicks: { questionId: string; choiceId: string }[] = [];

    for (const sq of session.sessionQuestions) {
      const isCorrect = sq.answer?.isCorrect;
      if (sq.answer) answered += 1;
      if (isCorrect === true) correct += 1;
      // 자동 채점된(정오가 확정된) 문항만 통계 캐시에 반영.
      if (isCorrect === true || isCorrect === false) {
        gradedQuestionIds.push({ id: sq.questionId, correct: isCorrect });
      }

      const sec = sq.answer?.timeSpentSec;
      if (typeof sec === 'number' && sec >= 0) timed.push({ id: sq.questionId, sec });

      for (const choiceId of this.readChoiceIds(sq.answer?.selectedChoiceIds)) {
        choicePicks.push({ questionId: sq.questionId, choiceId });
      }
    }

    const now = new Date();
    const durationSec = session.startedAt
      ? Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 1000))
      : null;
    const scorePercent = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.examSession.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: now, durationSec },
      });

      // 문제집 응시면 평균 점수 캐시를 누적한다(avg = scoreSumPercent / attemptCount).
      // 목록 카드마다 세션을 집계하면 N+1이 되므로 여기서 미리 더한다.
      if (session.workbookId) {
        await tx.workbook.update({
          where: { id: session.workbookId },
          data: {
            attemptCount: { increment: 1 },
            scoreSumPercent: { increment: scorePercent },
          },
        });
      }

      // 문항별 정답률 캐시 갱신(같은 문항이 여러 번 나오는 경우는 없다고 가정).
      for (const g of gradedQuestionIds) {
        await tx.question.update({
          where: { id: g.id },
          data: {
            totalSolvedCount: { increment: 1 },
            ...(g.correct ? { correctSolvedCount: { increment: 1 } } : {}),
          },
        });
      }

      // 평균 풀이시간 캐시(avg = totalTimeSpentSec / timedSolvedCount).
      for (const t of timed) {
        await tx.question.update({
          where: { id: t.id },
          data: {
            totalTimeSpentSec: { increment: t.sec },
            timedSolvedCount: { increment: 1 },
          },
        });
      }

      // 선지별 선택 분포. 해당 (문항,선지) 행이 없으면 만들고 있으면 +1.
      for (const p of choicePicks) {
        await tx.questionChoiceStat.upsert({
          where: { questionId_choiceId: { questionId: p.questionId, choiceId: p.choiceId } },
          create: { questionId: p.questionId, choiceId: p.choiceId, count: 1 },
          update: { count: { increment: 1 } },
        });
      }
    });

    return {
      id,
      status: 'SUBMITTED',
      total,
      answered,
      correct,
      scorePercent,
      durationSec,
    };
  }

  /**
   * 서술형(자기채점 대상) 문항의 정오를 응시자가 직접 확정한다.
   * 세션 제출(SUBMITTED) 이후 결과 화면에서 호출. 최초 확정 시 문항 정답률 캐시도 갱신한다.
   */
  async selfGrade(sessionQuestionId: string, userId: string, isCorrect: boolean) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: {
        id: true,
        questionId: true,
        snapshot: true,
        answer: { select: { id: true, isCorrect: true } },
        examSession: { select: { userId: true, status: true } },
      },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 채점할 수 있습니다.');
    if (sq.examSession.status !== 'SUBMITTED') {
      throw new BadRequestException('제출된 세션에서만 자기채점할 수 있습니다.');
    }
    if (!sq.answer) throw new BadRequestException('제출된 답안이 없습니다.');

    const snapshot = sq.snapshot as unknown as QuestionSnapshot;
    if (!isSelfGradable(snapshot)) {
      throw new BadRequestException('자기채점 대상(서술형) 문항이 아닙니다.');
    }

    const answerId = sq.answer.id;
    const prev = sq.answer.isCorrect; // null(미채점) | boolean(재채점)

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.examSessionAnswer.update({ where: { id: answerId }, data: { isCorrect } });

      // 정답률 캐시 델타: 최초 확정이면 total+1(+정답 시 correct+1), 재채점이면 correct만 보정.
      if (prev === null || prev === undefined) {
        await tx.question.update({
          where: { id: sq.questionId },
          data: {
            totalSolvedCount: { increment: 1 },
            ...(isCorrect ? { correctSolvedCount: { increment: 1 } } : {}),
          },
        });
      } else if (prev !== isCorrect) {
        await tx.question.update({
          where: { id: sq.questionId },
          data: { correctSolvedCount: { increment: isCorrect ? 1 : -1 } },
        });
      }
    });

    return { sessionQuestionId, isCorrect };
  }

  // --- 헬퍼 -----------------------------------------------------------

  /**
   * exam_session_answers.selected_choice_ids는 Json 컬럼이라 런타임 형태를 보장할 수 없다.
   * 문자열 배열만 통과시키고 나머지(null/객체/숫자)는 빈 배열로 흘린다.
   * 중복 선택은 한 번만 센다(같은 선지를 두 번 담아 분포를 부풀리지 못하도록).
   */
  private readChoiceIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0))];
  }

  private buildQuestionWhere(dto: CreateSessionDto): Prisma.QuestionWhereInput {
    const f = dto.filter ?? {};
    const difficulty =
      f.minDifficulty || f.maxDifficulty
        ? { gte: f.minDifficulty ?? 1, lte: f.maxDifficulty ?? 5 }
        : undefined;

    return {
      status: 'PUBLISHED',
      // 소분류 소속. 필터 모드에서만 호출되며 DTO의 @ValidateIf가 존재를 보장한다.
      subjectId: dto.subjectId!,
      ...(f.questionTypes?.length ? { questionType: { in: f.questionTypes } } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(f.tagIds?.length ? { questionTags: { some: { tagId: { in: f.tagIds } } } } : {}),
    };
  }

  /** Fisher–Yates 부분 셔플로 n개 표본을 뽑는다. */
  private sample(ids: string[], n: number): string[] {
    const arr = [...ids];
    const count = Math.min(n, arr.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  }
}
