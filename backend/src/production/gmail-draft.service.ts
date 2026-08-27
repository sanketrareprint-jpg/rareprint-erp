import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as nodemailer from 'nodemailer';
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

  private smtpTransporter: nodemailer.Transporter | null = null;

  private getSmtpTransporter(): nodemailer.Transporter {
    if (this.smtpTransporter) return this.smtpTransporter;
    const user = this.config.get('GMAIL_FROM') ?? 'purchase.rareprint@gmail.com';
    const pass = this.config.get('GMAIL_APP_PASSWORD');
    if (!pass) {
      throw new Error(
        'GMAIL_APP_PASSWORD is not set — generate a Gmail App Password for the sending account ' +
        '(Google Account > Security > 2-Step Verification > App passwords) and set it as an env var.',
      );
    }
    this.smtpTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS on 587
      auth: { user, pass },
    });
    return this.smtpTransporter;
  }

  /**
   * Actually sends an email (not just a draft) — used for the HR agreement
   * link and the forgot-password reset link, both of which need to reach
   * the recipient's inbox without a human opening Gmail and hitting send.
   *
   * Sends over SMTP (smtp.gmail.com:587) via nodemailer, authenticated with
   * a Gmail App Password — not the Gmail API/OAuth. This used to go through
   * the Gmail API because outbound SMTP appeared blocked on Railway, but
   * that was a lower-plan restriction: Railway only enables outbound SMTP
   * (ports 465/587) on Pro and above (confirmed 2026-08 — see
   * docs.railway.com/networking/outbound-networking). Now that this project
   * is on Pro, SMTP + an App Password is the more reliable choice: App
   * Passwords don't expire/rotate the way an OAuth "Testing" app's refresh
   * token does (that was expiring every 7 days and failing with
   * "invalid_grant"). A transactional email API (Resend etc.) was
   * considered too, but those require a verified custom domain to send to
   * arbitrary recipients, and RarePrint only has @gmail.com addresses.
   *
   * Setup: the sending Gmail account (GMAIL_FROM) needs 2-Step Verification
   * turned on, then generate an App Password under Google Account > Security
   * > 2-Step Verification > App passwords, and set it as GMAIL_APP_PASSWORD.
   *
   * createDraft() above is deliberately left on the Gmail API — nodemailer
   * can only send mail, it can't create a draft sitting in someone's Gmail
   * account, which is what the PO-drafting flow actually needs.
   */
  async sendMail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
    const from = this.config.get('GMAIL_FROM') ?? 'purchase.rareprint@gmail.com';
    const transporter = this.getSmtpTransporter();

    const info = await transporter.sendMail({ from, to, subject, text: body });

    this.logger.log(`Gmail sent (SMTP): ${info.messageId} → TO: ${to} | subject: ${subject}`);
    return { messageId: info.messageId ?? '' };
  }
}
