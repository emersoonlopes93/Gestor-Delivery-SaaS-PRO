import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { lastValueFrom, of } from 'rxjs';
import { SkipResponseEnvelope } from '../decorators';
import { TransformInterceptor } from './transform.interceptor';

class ResponseEnvelopeFixture {
  normal() {
    return undefined;
  }

  @SkipResponseEnvelope()
  raw() {
    return undefined;
  }
}

function contextFor(
  handler: typeof ResponseEnvelopeFixture.prototype.normal,
): ExecutionContext {
  return new ExecutionContextHost([], ResponseEnvelopeFixture, handler);
}

function callHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('TransformInterceptor response envelope bypass', () => {
  const interceptor = new TransformInterceptor(new Reflector());

  it('keeps the standard success envelope for routes without the explicit metadata', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(ResponseEnvelopeFixture.prototype.normal),
          callHandler({ accepted: true }),
        ),
      ),
    ).resolves.toEqual({ success: true, data: { accepted: true } });
  });

  it('returns an exact provider protocol body only for routes explicitly marked to skip the envelope', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor(ResponseEnvelopeFixture.prototype.raw),
          callHandler({ errno: 0, errmsg: 'ok' }),
        ),
      ),
    ).resolves.toEqual({ errno: 0, errmsg: 'ok' });
  });
});
