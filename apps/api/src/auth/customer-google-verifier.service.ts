import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleCustomerIdentity = {
  subject: string;
  email: string;
};

@Injectable()
export class CustomerGoogleVerifierService {
  constructor(
    private readonly config: ConfigService,
    private readonly client: Pick<OAuth2Client, 'verifyIdToken'> = new OAuth2Client(),
  ) {}

  async verifyCredential(credential: string): Promise<VerifiedGoogleCustomerIdentity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new BadRequestException('Google customer sign-in is not configured');
    }
    if (!credential?.trim()) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: clientId });
      const payload = ticket.getPayload();
      const issuer = payload?.iss;
      if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
        throw new UnauthorizedException('Invalid Google credential');
      }
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new UnauthorizedException('Invalid Google credential');
      }
      return { subject: payload.sub, email: payload.email };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Google credential');
    }
  }
}
