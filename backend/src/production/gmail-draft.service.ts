import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', tiff: 'image/tiff', tif: 'image/tiff',
    svg: 'image/svg+xml',
    ai: 'application/postscript', eps: 'application/postscript',
    psd: 'image/vnd.adobe.photoshop',
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] ?? 'application/octet-stream';
}

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'designs');

export interface DraftAttachment {
  filename: string;     // stored filename on disk
  originalName: string; // display name in email
}

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
   * Creates a Gmail draft with optional file attachments.
   */
  async createDraft(
    to: string,
    subject: string,
    body: string,
    attachments: DraftAttachment[] = [],
  ): Promise<{ draftId: string }> {
    const auth = this.getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const from = this.config.get('GMAIL_FROM') ?? 'purchase.rareprint@gmail.com';
    const boundary = `----=_RareprintBoundary_${Date.now()}`;

    // Build MIME parts
    const parts: string[] = [];

    // Body part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `Content-Transfer-Encoding: quoted-printable\r\n\r\n` +
      `${body}\r\n`,
    );

    // Attachment parts
    for (const att of attachments) {
      const filePath = join(UPLOADS_DIR, att.filename);
      if (!existsSync(filePath)) {
        this.logger.warn(`Attachment not found, skipping: ${filePath}`);
        continue;
      }
      const fileBuffer = readFileSync(filePath);
      const b64 = fileBuffer.toString('base64');
      const mimeType = getMimeType(att.originalName);
      parts.push(
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}; name="${att.originalName}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${att.originalName}"\r\n\r\n` +
        `${b64}\r\n`,
      );
    }

    parts.push(`--${boundary}--`);

    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      ...parts,
    ].join('\r\n');

    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: encoded } },
    });

    this.logger.log(`Gmail draft created: ${res.data.id} → TO: ${to} | attachments: ${attachments.length}`);
    return { draftId: res.data.id ?? '' };
  }

  /**
   * Actually sends an email (not just a draft) — used for the HR agreement
   * link, which needs to reach the employee's inbox without a human having
   * to open Gmail and hit send.
   *
   * Uses the Gmail API (HTTPS), not SMTP. Both SMTP ports (465 and 587), and
   * a direct-IPv4 connection bypassing DNS entirely, all timed out on
   * Railway — outbound SMTP is not reachable from this service regardless
   * of plan tier. The Gmail API talks over regular HTTPS so it isn't
   * affected. A transactional email API (Resend etc.) was also ruled out:
   * those require a verified custom domain to send to arbitrary recipients,
   * and RarePrint only has @gmail.com addresses.
   *
   * GMAIL_REFRESH_TOKEN must belong to whichever account GMAIL_FROM is set
   * to, and must have been authorized with a scope that permits sending
   * (gmail.send or broader). If this fails with "invalid_grant", the token
   * has expired/was revoked — regenerate via Google's OAuth Playground
   * (add https://developers.google.com/oauthplayground as an authorized
   * redirect URI on the GMAIL_CLIENT_ID OAuth Client first) signed in as
   * the correct sending account. Tokens for apps still in "Testing"
   * publishing status expire every 7 days regardless of use.
   */
  async sendMail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
    const auth = this.getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });
    const from = this.config.get('GMAIL_FROM') ?? 'purchase.rareprint@gmail.com';

    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n');

    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    this.logger.log(`Gmail sent: ${res.data.id} → TO: ${to} | subject: ${subject}`);
    return { messageId: res.data.id ?? '' };
  }
}
