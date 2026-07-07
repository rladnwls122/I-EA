import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface WrongStat { key: string; label: string; total: number; wrong: number; wrongRatio: number; }
export interface WrongQuestion { questionId: string; unitName: string; questionType: string; sessionId: string; }

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async examSessions(userId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      include: {
        subject: { select: { name: true } },
        sessionQuestions: { include: { answer: { select: { isCorrect: true } } } },
      },
    });
    return sessions.map((s) => {
      const total = s.sessionQuestions.length;
      const correct = s.sessionQuestions.filter((q) => q.answer?.isCorrect === true).length;
      return {
        id: s.id,
        subjectName: s.subject.name,
        status: s.status,
        submittedAt: s.submittedAt,
        total,
        correct,
        scorePercent: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
        durationSec: s.durationSec,
      };
    });
  }

  async wrongNotes(userId: string) {
    const answers = await this.prisma.examSessionAnswer.findMany({
      where: { examSessionQuestion: { examSession: { userId, status: 'SUBMITTED' } } },
      include: {
        examSessionQuestion: {
          select: {
            examSessionId: true,
            questionId: true,
            question: {
              select: { primaryUnitId: true, questionType: true, unit: { select: { name: true } } },
            },
          },
        },
      },
    });

    const unitMap = new Map<string, WrongStat>();
    const typeMap = new Map<string, WrongStat>();
    const wrongQuestions: WrongQuestion[] = [];

    for (const a of answers) {
      const q = a.examSessionQuestion.question;
      const isWrong = a.isCorrect === false;
      const bump = (map: Map<string, WrongStat>, key: string, label: string) => {
        const cur = map.get(key) ?? { key, label, total: 0, wrong: 0, wrongRatio: 0 };
        cur.total += 1;
        if (isWrong) cur.wrong += 1;
        cur.wrongRatio = Math.round((cur.wrong / cur.total) * 100) / 100;
        map.set(key, cur);
      };
      bump(unitMap, q.primaryUnitId, q.unit.name);
      bump(typeMap, q.questionType, q.questionType);
      if (isWrong) {
        wrongQuestions.push({
          questionId: a.examSessionQuestion.questionId,
          unitName: q.unit.name,
          questionType: q.questionType,
          sessionId: a.examSessionQuestion.examSessionId,
        });
      }
    }

    return {
      byUnit: [...unitMap.values()],
      byType: [...typeMap.values()],
      wrongQuestions,
    };
  }
}
