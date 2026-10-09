import { HttpStatus, Logger } from '@nestjs/common';
import { MarketplaceProvider } from '@prisma/client';
import { MarketplaceWebhookController } from './marketplace-webhook.controller';
import { FOOD99_WEBHOOK_SUCCESS_ACK } from '../food99-webhook-ack';

describe('MarketplaceWebhookController 99Food acknowledgement contract', () => {
  const providerRegistry = { parseProvider: jest.fn() };
  const inboxService = { receiveWebhook: jest.fn() };
  const response = { status: jest.fn() };
  const request = { rawBody: Buffer.from('{"type":"orderNew"}') };

  beforeEach(() => {
    jest.clearAllMocks();
    response.status.mockReturnValue(response);
    providerRegistry.parseProvider.mockReturnValue(MarketplaceProvider.FOOD_99);
    inboxService.receiveWebhook.mockResolvedValue({ accepted: true, duplicate: false, inboxId: 'inbox-1' });
  });

  function controller() {
    return new MarketplaceWebhookController(providerRegistry as never, inboxService as never);
  }

  it('returns the official body and HTTP 200 after a valid callback is accepted', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await expect(controller().receiveWebhook('99food', { type: 'orderNew' }, {}, request as never, response as never))
      .resolves.toEqual({ errno: 0, errmsg: 'ok' });

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(inboxService.receiveWebhook).toHaveBeenCalledWith(expect.objectContaining({
      provider: MarketplaceProvider.FOOD_99,
      rawBody: request.rawBody,
    }));
    expect(log).toHaveBeenCalledWith({
      message: 'food99_webhook_ack_sent',
      status: HttpStatus.OK,
      errno: 0,
      errmsg: 'ok',
    });
    log.mockRestore();
  });

  it('returns the same official acknowledgement for a valid duplicate', async () => {
    inboxService.receiveWebhook.mockResolvedValueOnce({ accepted: true, duplicate: true, inboxId: 'inbox-1' });

    await expect(controller().receiveWebhook('99food', { type: 'orderNew' }, {}, request as never, response as never))
      .resolves.toBe(FOOD99_WEBHOOK_SUCCESS_ACK);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('does not acknowledge invalid signature or payload failures as success', async () => {
    inboxService.receiveWebhook.mockRejectedValueOnce(new Error('Invalid marketplace webhook signature.'));

    await expect(controller().receiveWebhook('99food', {}, {}, request as never, response as never))
      .rejects.toThrow('Invalid marketplace webhook signature.');
    expect(response.status).not.toHaveBeenCalled();
  });

  it('does not acknowledge an internal persistence failure as success', async () => {
    inboxService.receiveWebhook.mockRejectedValueOnce(new Error('Inbox persistence unavailable.'));

    await expect(controller().receiveWebhook('99food', { type: 'orderNew' }, {}, request as never, response as never))
      .rejects.toThrow('Inbox persistence unavailable.');
    expect(response.status).not.toHaveBeenCalled();
  });

  it('keeps the contract from regressing to empty or generic success envelopes', () => {
    expect(FOOD99_WEBHOOK_SUCCESS_ACK).toEqual({ errno: 0, errmsg: 'ok' });
    expect(FOOD99_WEBHOOK_SUCCESS_ACK).not.toEqual({});
    expect(FOOD99_WEBHOOK_SUCCESS_ACK).not.toEqual({ success: true });
  });
});
