import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as nodemailer from 'nodemailer';
import { promises as dns } from 'dns';
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

  // SMTP transport for actually-sent mail (as opposed to createDraft's Gmail
  // API drafts above). Deliberately kept separate from the OAuth client:
  // OAuth refresh tokens for a "Testing" Google Cloud app expire every 7
  // days unless the app goes through full verification, which is overkill
  // for sending from one mailbox. An App Password (requires 2-Step
  // Verification on the sending account, generated once at
  // myaccount.google.com/apppasswords) sidesteps all of that. Requires the
  // Railway service to be on a Pro/Enterprise plan — outbound SMTP
  // (ports 465/587) is blocked on Hobby.
  private async smtpTransport() {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_APP_PASSWORD');
    if (!user || !pass) {
      throw new Error('SMTP_USER / SMTP_APP_PASSWORD are not configured (see gmail-draft.service.ts sendMail())');
    }

    // Resolve smtp.gmail.com to a literal IPv4 address ourselves and connect
    // to that directly. Passing `family: 4` to nodemailer was NOT enough on
    // Railway — it still attempted Google's IPv6 address and failed with
    // ENETUNREACH (the container has no IPv6 route at all). Connecting by
    // IP removes DNS/family resolution from the picture entirely.
    // `tls.servername` keeps SNI/certificate validation targeting the real
    // hostname, since the cert Google presents is for smtp.gmail.com, not
    // the bare IP.
    let host = 'smtp.gmail.com';
    try {
      const { address } = await dns.lookup('smtp.gmail.com', { family: 4 });
      host = address;
    } catch (err) {
      this.logger.warn(`IPv4 lookup for smtp.gmail.com failed, falling back to hostname: ${err}`);
    }

    // Cast to `any`: @types/nodemailer's createTransport<T> overload
    // resolution is version-sensitive about inferring plain SMTP option
    // objects (Railway's fresh `npm install` resolved a stricter version
    // than the one tested locally, and rejected this literal outright).
    // The object shape itself is correct per nodemailer's own docs.
    return nodemailer.createTransport({
      host,
      // Port 587 (STARTTLS) instead of 465 (implicit TLS) — a direct-IPv4
      // connection to 465 still timed out on Railway, which rules out the
      // earlier IPv6 theory and points at 465 itself being blocked
      // outbound. 587 is sometimes treated differently by network policy.
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { servername: 'smtp.gmail.com' },
      auth: { user, pass },
      family: 4,
      // Short, explicit timeouts so a blocked/unreachable port fails fast
      // and visibly (an error in the logs) instead of hanging the request
      // indefinitely — that's what made the original SMTP attempt look like
      // a dead button rather than a diagnosable failure.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    } as any);
  }

  /**
   * Actually sends an email (not just a draft) — used for the HR agreement
   * link, which needs to reach the employee's inbox without a human having
   * to open Gmail and hit send. Uses SMTP + an App Password, not the Gmail
   * API OAuth client above (see smtpTransport()).
   */
  async sendMail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
    const transport = await this.smtpTransport();
    const from = this.config.get<string>('SMTP_USER')!;

    const info = await transport.sendMail({ from, to, subject, text: body });

    this.logger.log(`SMTP mail sent: ${info.messageId} → TO: ${to} | subject: ${subject}`);
    return { messageId: info.messageId ?? '' };
  }
}
