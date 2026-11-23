import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

function booleanSetting(name: string, fallback: string) {
  const value = process.env[name] ?? fallback;
  if (value !== 'true' && value !== 'false') throw new Error(name + ' must be true or false');
  return value === 'true';
}

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly transport?: Transporter;
  private readonly from?: string;
  readonly enabled = booleanSetting('EMAIL_ENABLED', 'false');

  constructor() {
    if (!this.enabled) return;
    if (process.env.EMAIL_PROVIDER !== 'smtp') throw new Error('EMAIL_PROVIDER must be smtp');
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT);
    const from = process.env.EMAIL_FROM?.trim();
    const secure = booleanSetting('SMTP_SECURE', 'false');
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from ||
        !/^(?:[^<>\r\n]+ <[^\s<>@]+@[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+)$/.test(from)) {
      throw new Error('Configure SMTP_HOST, SMTP_PORT and EMAIL_FROM');
    }
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (!!user !== !!pass) throw new Error('Set both SMTP_USER and SMTP_PASSWORD');
    this.from = from;
    this.transport = createTransport({ host, port, secure, auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, dnsTimeout: 5000,
      requireTLS: process.env.NODE_ENV === 'production' && !secure });
  }

  async send(to: string, id: number, message: { subject: string; text: string; html: string }) {
    if (!this.transport || !this.from) throw new Error('Email is disabled');
    await this.transport.sendMail({ from: this.from, to: { name: '', address: to },
      messageId: '<transfer-' + id + '@' + this.from.replace(/^.*@/, '').replace(/>$/, '') + '>', ...message });
  }

  async sendRegistrationNotice(to: string, message: { subject: string; text: string; html: string }) {
    if (!this.transport || !this.from) throw new Error('Email is disabled');
    await this.transport.sendMail({ from: this.from, to: { name: '', address: to }, ...message });
  }

  onModuleDestroy() { this.transport?.close(); }
}
