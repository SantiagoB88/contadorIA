export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}
