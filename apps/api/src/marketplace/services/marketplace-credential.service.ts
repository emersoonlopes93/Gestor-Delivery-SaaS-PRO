import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

@Injectable()
export class MarketplaceCredentialService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(ENCRYPTED_PREFIX)) {
      throw new ServiceUnavailableException('Marketplace credential uses an unsupported legacy storage format. Reconnect the integration.');
    }

    const key = this.getEncryptionKey();
    const encoded = value.slice(ENCRYPTED_PREFIX.length).split(':');
    if (encoded.length !== 3) {
      throw new ServiceUnavailableException('Marketplace credential payload is invalid.');
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encoded[0], 'base64'));
      decipher.setAuthTag(Buffer.from(encoded[1], 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(encoded[2], 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Marketplace credential could not be decrypted.');
    }
  }

  getIfoodClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get<string>('MARKETPLACE_IFOOD_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MARKETPLACE_IFOOD_CLIENT_SECRET')?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('iFood application credentials are not configured.');
    }
    return { clientId, clientSecret };
  }

  private getEncryptionKey(): Buffer {
    const encoded = this.config.get<string>('MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY')?.trim();
    const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new ServiceUnavailableException('MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
    return key;
  }
}
