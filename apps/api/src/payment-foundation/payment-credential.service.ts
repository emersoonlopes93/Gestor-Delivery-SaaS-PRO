import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceCredentialService } from '../marketplace/services/marketplace-credential.service';

export type PaymentProviderCredentials = Readonly<Record<string, string>>;

@Injectable()
export class PaymentCredentialService extends MarketplaceCredentialService {
  constructor(config: ConfigService) {
    super(config);
  }

  encryptCredentials(credentials: PaymentProviderCredentials): {
    encrypted: string;
    version: string;
  } {
    const encrypted = this.encrypt(JSON.stringify(credentials));
    const version = encrypted.match(/^enc:v2:([^:]+):/)?.[1];
    if (!version) {
      throw new ServiceUnavailableException('Payment credential version is unavailable.');
    }
    return { encrypted, version };
  }

  decryptCredentials(encrypted: string): PaymentProviderCredentials {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decrypt(encrypted));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Payment credential payload is invalid.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ServiceUnavailableException('Payment credential payload is invalid.');
    }

    const entries = Object.entries(parsed);
    if (entries.some(([, value]) => typeof value !== 'string')) {
      throw new ServiceUnavailableException('Payment credential payload is invalid.');
    }
    return Object.fromEntries(entries) as PaymentProviderCredentials;
  }
}
