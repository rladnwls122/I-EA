import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * 발신 메일. SMTP 한 가지 경로만 둔다 — 지금은 Gmail(앱 비밀번호), 도메인을 사면
 * Resend/SES의 SMTP 엔드포인트로 env만 바꾸면 되므로 공급자 SDK를 넣지 않는다.
 *
 * - SMTP_* 가 비어 있으면 부팅은 되고 send()가 조용히 건너뛴다(Gemini/S3와 같은 degrade 규칙).
 * - send()는 절대 던지지 않는다. 알림 메일 실패로 댓글 작성 같은 본기능을 되돌리면 손해가 더 크다.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('MAIL_FROM') || user || '';
    if (!host || !user || !pass) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST/SMTP_USER/SMTP_PASS 미설정 — 메일 발송을 건너뜁니다.');
      return;
    }
    const port = Number(config.get<string>('SMTP_PORT') ?? 465);
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465, // 465=implicit TLS, 587=STARTTLS
      auth: { user, pass },
    });
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      return true;
    } catch (err) {
      this.logger.error(`메일 발송 실패 to=${message.to} subject="${message.subject}"`, err as Error);
      return false;
    }
  }
}
