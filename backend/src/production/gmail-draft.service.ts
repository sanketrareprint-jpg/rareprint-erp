import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class GmailDraftService {
  private readonly logger = new Logger(GmailDraftService.name);

  constructor(private config: ConfigService) {}

  private getOAuth2Client() {
    const client = new google.auth.OAuth2(
      this.config.get('GMAIL_CLIENT_ID'),
      this.config.get('GMAIL_CLIENT_SECRET'),
      'http://localhost:3001/auth/google/callback',
    );
    client.setCredentials({
      refresh_token: this.config.get('GMAIL_REFRESH_TOKEN'),
    });
    return client;
  }

  /**
   * Creates a Gmail draft in the purchase.rareprint@gmail.com inbox.
   * Returns the draft ID.
   */
  async createDraft(to: string, subject: string, body: string): Promise<{ draftId: string }> {
    const auth = this.getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const from = this.config.get('GMAIL_FROM') ?? 'purchase.rareprint@gmail.com';

    // RFC 2822 message
    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n');

    // Base64URL encode
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: encoded } },
    });

    this.logger.log(`Gmail draft created: ${res.data.id} → TO: ${to}`);
    return { draftId: res.data.id ?? '' };
  }
}
