import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const LEGACY_ENCRYPTED_PREFIX = 'enc:v1:';
const VERSIONED_ENCRYPTED_PREFIX = 'enc:v2:';

@Injectable()
export class MarketplaceCredentialService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const { key, version } = this.getCurrentEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSIONED_ENCRYPTED_PREFIX}${version}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(value: string): string {
    let key: Buffer;
    let encoded: string[];
    if (value.startsWith(LEGACY_ENCRYPTED_PREFIX)) {
      key = this.getCurrentEncryptionKey().key;
      encoded = value.slice(LEGACY_ENCRYPTED_PREFIX.length).split(':');
    } else if (value.startsWith(VERSIONED_ENCRYPTED_PREFIX)) {
      const parts = value.slice(VERSIONED_ENCRYPTED_PREFIX.length).split(':');
      if (parts.length !== 4) {
        throw new ServiceUnavailableException('Marketplace credential payload is invalid.');
      }
      key = this.getEncryptionKeyByVersion(parts[0]);
      encoded = parts.slice(1);
    } else {
      throw new ServiceUnavailableException('Marketplace credential uses an unsupported legacy storage format. Reconnect the integration.');
    }
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

  needsRotation(value: string): boolean {
    const currentVersion = this.getCurrentEncryptionKey().version;
    return !value.startsWith(`${VERSIONED_ENCRYPTED_PREFIX}${currentVersion}:`);
  }

  rotate(value: string): string {
    return this.needsRotation(value) ? this.encrypt(this.decrypt(value)) : value;
  }

  getIfoodClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get<string>('MARKETPLACE_IFOOD_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MARKETPLACE_IFOOD_CLIENT_SECRET')?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('iFood application credentials are not configured.');
    }
    return { clientId, clientSecret };
  }

  private getCurrentEncryptionKey(): { key: Buffer; version: string } {
    const version = this.config.get<string>('MARKETPLACE_CREDENTIALS_KEY_VERSION')?.trim() || 'current';
    const encoded = this.config.get<string>('MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY')?.trim();
    return { key: this.decodeKey(encoded, 'MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY'), version };
  }

  private getEncryptionKeyByVersion(version: string): Buffer {
    const current = this.getCurrentEncryptionKey();
    if (version === current.version) return current.key;
    const previousVersion = this.config.get<string>('MARKETPLACE_CREDENTIALS_PREVIOUS_KEY_VERSION')?.trim();
    const previousEncoded = this.config.get<string>('MARKETPLACE_CREDENTIALS_PREVIOUS_ENCRYPTION_KEY')?.trim();
    if (previousVersion && version === previousVersion) {
      return this.decodeKey(previousEncoded, 'MARKETPLACE_CREDENTIALS_PREVIOUS_ENCRYPTION_KEY');
    }
    throw new ServiceUnavailableException('Marketplace credential key version is unavailable.');
  }

  private decodeKey(encoded: string | undefined, variable: string): Buffer {
    const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new ServiceUnavailableException(`${variable} must be a base64-encoded 32-byte key.`);
    }
    return key;
  }
}
