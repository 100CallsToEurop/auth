import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/features/app.module.js';
import { isDatabaseAvailable } from './db-available.js';

const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const extractRefreshCookie = (setCookie: string[] | string): string => {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));
    if (!refresh) throw new Error('refresh cookie not set');
    return refresh.split(';')[0];
  };

  it('registers a user and returns a session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined();
    expect(extractRefreshCookie(res.headers['set-cookie'])).toContain(
      'refresh_token=',
    );
  });

  it('rejects duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(409);
  });

  it('rejects login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in and exposes the current user via /auth/me', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rotates the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = extractRefreshCookie(login.headers['set-cookie']);

    const first = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(first.body.accessToken).toBeTruthy();
    const rotated = extractRefreshCookie(first.headers['set-cookie']);
    expect(rotated).not.toBe(cookie);

    const second = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotated)
      .expect(200);
    expect(second.body.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = extractRefreshCookie(login.headers['set-cookie']);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
});
