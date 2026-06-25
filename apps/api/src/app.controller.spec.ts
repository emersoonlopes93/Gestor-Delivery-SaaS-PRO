import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a lightweight root payload on GET /', async () => {
    const response = await fetch(await app.getUrl());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: 'Gestor Delivery API',
      status: 'ok',
      version: expect.any(String),
      environment: expect.any(String),
    });
  });

  it('supports HEAD / without a response body', async () => {
    const response = await fetch(await app.getUrl(), { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});
