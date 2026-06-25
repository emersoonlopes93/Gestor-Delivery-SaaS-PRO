import { ArgumentsHost, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const buildHost = (request: Partial<{ method: string; url: string; requestId: string; user: { type: string; tenantId: string; sub: string } }>) => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const host: ArgumentsHost = {
      getArgs<T extends Array<unknown> = Array<unknown>>() {
        return [request, response] as T;
      },
      getArgByIndex<T = unknown>(index: number) {
        return [request, response][index] as T;
      },
      switchToHttp() {
        return {
          getResponse<T = unknown>() {
            return response as T;
          },
          getRequest<T = unknown>() {
            return request as T;
          },
          getNext<T = unknown>() {
            return undefined as T;
          },
        };
      },
      switchToRpc() {
        return {
          getData<T = unknown>() {
            return undefined as T;
          },
          getContext<T = unknown>() {
            return undefined as T;
          },
        };
      },
      switchToWs() {
        return {
          getClient<T = unknown>() {
            return undefined as T;
          },
          getData<T = unknown>() {
            return undefined as T;
          },
          getPattern<T = string>() {
            return undefined as T;
          },
        };
      },
      getType<TContext extends string = 'http'>() {
        return 'http' as TContext;
      },
    };

    return { host, response };
  };

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs 404 responses as info-level noise instead of warning', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = buildHost({
      method: 'GET',
      url: '/',
      requestId: 'req-1',
    });

    filter.catch(new NotFoundException('Cannot GET /'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        path: '/',
        requestId: 'req-1',
      }),
    );
    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps 5xx responses as errors', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = buildHost({
      method: 'GET',
      url: '/boom',
    });

    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/boom',
      }),
    );
    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
