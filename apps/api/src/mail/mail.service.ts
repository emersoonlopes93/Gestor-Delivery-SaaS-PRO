import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Env } from '../config/env.validation';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService<Env, true>) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: this.configService.get('SMTP_PORT') === 465, // true for 465, false for other ports
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    const from = this.configService.get('SMTP_FROM');
    
    // In development or if SMTP is not fully configured, log the link and skip actual sending
    if (!this.configService.get('SMTP_HOST')) {
      this.logger.warn(`SMTP is not configured. Mocking email send.`);
      this.logger.log(`To: ${to}`);
      this.logger.log(`Subject: Recuperação de Senha`);
      this.logger.log(`Body: Acesse o link para redefinir sua senha: ${resetLink}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"PedeHub" <${from}>`,
        to,
        subject: 'Recuperação de Senha',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Recuperação de Senha</h2>
            <p>Você solicitou a redefinição de senha da sua conta.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Redefinir Minha Senha</a>
            </div>
            <p>Ou copie e cole este link no seu navegador:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
            <p>Este link é válido por 1 hora.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
      throw error;
    }
  }
}
