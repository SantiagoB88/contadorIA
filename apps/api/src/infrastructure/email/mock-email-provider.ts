import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { EmailProvider, SendEmailInput } from './email-provider.interface';

/**
 * MVP stand-in for a real sender (Mailpit/SES/Resend — see EMAIL_PROVIDER
 * env var). Never delivers anything; logs what would have been sent. The
 * password-reset flow additionally returns the reset link directly in the API
 * response outside production, so the flow is fully usable in dev without a
 * real mailbox.
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(MockEmailProvider.name);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface is async for real providers
  async send(input: SendEmailInput): Promise<void> {
    this.logger.info({ to: input.to, subject: input.subject }, 'Mock email "sent" (not delivered)');
  }
}
