import {
  BadRequestException,
  HttpStatus,
  INestApplication,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MarketplaceProvider } from '@prisma/client';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { MarketplaceWebhookController } from './marketplace-webhook.controller';
import { MarketplaceProviderRegistryService } from '../services/marketplace-provider-registry.service';
import { MarketplaceEventInboxService } from '../services/marketplace-event-inbox.service';

describe('MarketplaceWebhookController response envelope (HTTP)', () => {
  let app: INestApplication;
  const providerRegistry = {
    parseProvider: jest.fn((provider: string) =>
      provider === 'ifood'
        ? MarketplaceProvider.IFOOD
        : MarketplaceProvider.FOOD_99,
    ),
  };
  const inboxService = {
    receiveWebhook: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceWebhookController],
      providers: [
        {
          provide: MarketplaceProviderRegistryService,
          useValue: providerRegistry,
        },
        {
          provide: MarketplaceEventInboxService,
          useValue: inboxService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    inboxService.receiveWebhook.mockResolvedValue({
      accepted: true,
      duplicate: false,
      inboxId: 'inbox-1',
    });
  });

  async function post(path: string, body: unknown) {
    return fetch(`${await app.getUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('keeps normal provider callbacks in the standard success envelope', async () => {
    const response = await post('/webhooks/marketplaces/ifood', { type: 'orderNew' });

    expect(response.status).toBe(HttpStatus.ACCEPTED);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        accepted: true,
        duplicate: false,
        inboxId: 'inbox-1',
      },
    });
  });

  it('returns the exact unwrapped 99Food acknowledgement through the real interceptor pipeline', async () => {
    const response = await post('/webhooks/marketplaces/99food', { type: 'deliveryStatus' });

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).toBe('{"errno":0,"errmsg":"ok"}');
  });

  it.each([
    ['invalid signature', new UnauthorizedException('Invalid marketplace webhook signature.')],
    ['invalid payload', new BadRequestException('Invalid marketplace webhook payload.')],
    ['internal inbox failure', new Error('Inbox persistence unavailable.')],
  ])('does not send the 99Food acknowledgement after %s', async (_name, failure) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    inboxService.receiveWebhook.mockRejectedValueOnce(failure);

    const response = await post('/webhooks/marketplaces/99food', { type: 'deliveryStatus' });
    const body = await response.json() as { errno?: number; errmsg?: string; success?: boolean };

    expect(body.errno).toBeUndefined();
    expect(body.errmsg).toBeUndefined();
    expect(body.success).toBe(false);
    expect(log).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'food99_webhook_ack_sent',
    }));
    log.mockRestore();
  });
});
