import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(
        this.config.getOrThrow<string>('SMTP_PORT'),
      ),
      secure: true,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  async verifyConnection(): Promise<boolean> {
  return this.transporter.verify();
    }

 async sendVerificationCode(
  email: string,
  code: string,
): Promise<void> {
  const startedAt = Date.now();

  console.log('[MAIL] Starting verification email delivery');

  try {
    const info = await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('SMTP_FROM'),
      to: email,
      subject: 'ClubHub - Verify Your University Email',
      text: `
Welcome to ClubHub!

Your email verification code is:

${code}

This code expires in 2 minutes.

If you did not request this code, ignore this email.

ClubHub Team
      `.trim(),
    });

    console.log(
      '[MAIL] SMTP accepted:',
      Array.isArray(info.accepted) ? info.accepted.length : 'Not reported',
    );

    console.log(
      '[MAIL] SMTP rejected:',
      Array.isArray(info.rejected) ? info.rejected.length : 'Not reported',
    );

    console.log(
      '[MAIL] Delivery request duration:',
      Date.now() - startedAt,
      'ms',
    );
  } catch (error) {
    console.error('[MAIL] SMTP sending failed:', error);
    throw error;
  }
}
async sendPasswordResetLink(
  email: string,
  resetLink: string,
): Promise<void> {
  await this.transporter.sendMail({
    from: this.config.getOrThrow<string>('SMTP_FROM'),
    to: email,
    subject: 'ClubHub - Reset Your Password',
    text: `
You requested a password reset for your ClubHub account.

Open the following link to create a new password:

${resetLink}

This link expires in 15 minutes.

If you did not request this change, you can ignore this email.

ClubHub Team
    `.trim(),
  });
}
}