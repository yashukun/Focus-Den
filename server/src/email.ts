/**
 * Outbound email behind a tiny interface. Production uses AWS SES (SES_FROM +
 * standard AWS credentials/region envs); anything else falls back to a console
 * mailer that prints the message — so signup/reset flows work in dev with zero
 * AWS setup, and tests can inject a capturing mock.
 */

import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send(to: string, subject: string, text: string): Promise<void> {
    console.log(`[focus-den mail → ${to}] ${subject}\n${text}\n`);
  }
}

export class SesMailer implements Mailer {
  private client: SESv2Client;

  constructor(
    private from: string,
    region?: string,
  ) {
    this.client = new SESv2Client(region ? { region } : {});
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
      }),
    );
  }
}

/** SES when configured (SES_FROM set), console otherwise. */
export function makeMailer(env: { sesFrom: string | null; sesRegion: string | null }): Mailer {
  if (env.sesFrom) return new SesMailer(env.sesFrom, env.sesRegion ?? undefined);
  return new ConsoleMailer();
}
