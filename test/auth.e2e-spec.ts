import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { ExternalAccountLinker } from '../src/features/external/application/external-account-linker.js';
import { PendingAccountLinksService } from '../src/features/external/application/pending-account-links.service.js';
import { SessionService } from '../src/features/session/application/session.service.js';
import { UsersService } from '../src/features/user/application/users.service.js';
import {
  PendingAccountLinkException,
  type PendingAccountLinkSignal,
} from '../src/libs/common/exceptions/pending-account-link.exception.js';
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
    app.use(cookieParser());
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

  it('edits the profile only after the phone is confirmed', async () => {
    const profileEmail = `e2e-profile-${randomUUID().slice(0, 8)}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: profileEmail, password })
      .expect(201);
    const authorization = `Bearer ${registration.body.accessToken}`;

    // Без подтверждения телефона сервер отклоняет изменение профиля.
    const forbidden = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', authorization)
      .send({ firstName: 'Иван' })
      .expect(403);

    expect(forbidden.body.message).toContain('Подтвердите номер телефона');

    const confirmed = await request(app.getHttpServer())
      .post('/auth/profile/phone/confirm')
      .set('Authorization', authorization)
      .send({ phone: '+7 (999) 123-45-67' })
      .expect(200);

    expect(confirmed.body.phone).toBe('+7 (999) 123-45-67');
    expect(confirmed.body.phoneVerified).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch('/auth/profile')
      .set('Authorization', authorization)
      .send({
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: 'Иванович',
        organization: 'ООО «Ромашка»',
        position: 'Инженер',
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      organization: 'ООО «Ромашка»',
      position: 'Инженер',
      phoneVerified: true,
    });

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', authorization)
      .expect(200);

    expect(me.body.organization).toBe('ООО «Ромашка»');
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
      .expect(200)
      .expect((response) => {
        // Выход не должен уводить на сторону SSO-провайдера.
        expect(response.body.logoutUrl).toBeUndefined();
      });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  describe('привязка SSO к существующему аккаунту', () => {
    const linkEmail = `e2e-link-${randomUUID().slice(0, 8)}@example.com`;
    const linkPassword = 'password123';
    const provider = 'authentik';
    const providerSub = `sub-${randomUUID()}`;
    let userId: string;
    let pendingLink: PendingAccountLinkSignal;

    const linker = () => app.get(ExternalAccountLinker);
    const pendingLinks = () => app.get(PendingAccountLinksService);
    const usersService = () => app.get(UsersService);

    const ssoProfile = (sub: string, profileEmail: string) => ({
      sub,
      email: profileEmail,
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
      emailVerified: true,
    });

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: linkEmail, password: linkPassword })
        .expect(201);
      userId = res.body.user.id;
    });

    it('на совпадении email выдаёт заявку, а не сессию', async () => {
      const error = await linker()
        .link(provider, ssoProfile(providerSub, linkEmail.toUpperCase()))
        .then(
          () => {
            throw new Error('вход не должен был выполниться');
          },
          (err: unknown) => err,
        );

      expect(error).toBeInstanceOf(PendingAccountLinkException);
      pendingLink = (error as PendingAccountLinkException).pendingLink;
      expect(pendingLink).toMatchObject({
        provider,
        email: linkEmail,
      });
      expect(pendingLink.linkToken).toBeTruthy();
    });

    it('отдаёт данные промежуточного экрана', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/account-link/info')
        .send({ token: pendingLink.linkToken })
        .expect(200);

      expect(res.body).toMatchObject({
        provider,
        providerName: 'Authentik',
        email: linkEmail,
        hasPassword: true,
      });
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('не расходует токен при неверном пароле', async () => {
      await request(app.getHttpServer())
        .post('/auth/account-link/confirm')
        .send({ token: pendingLink.linkToken, password: 'wrong-password' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/account-link/info')
        .send({ token: pendingLink.linkToken })
        .expect(200);
    });

    it('подтверждает владение, привязывает провайдера и выдаёт сессию', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/account-link/confirm')
        .send({ token: pendingLink.linkToken, password: linkPassword })
        .expect(200);

      expect(res.body.user).toMatchObject({ id: userId, email: linkEmail });
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeUndefined();
      const cookie = extractRefreshCookie(res.headers['set-cookie']);
      expect(cookie).toContain('refresh_token=');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body.providers).toEqual(
        expect.arrayContaining(['password', provider]),
      );
    });

    it('не принимает тот же токен повторно', async () => {
      await request(app.getHttpServer())
        .post('/auth/account-link/confirm')
        .send({ token: pendingLink.linkToken, password: linkPassword })
        .expect(404);

      await request(app.getHttpServer())
        .post('/auth/account-link/info')
        .send({ token: pendingLink.linkToken })
        .expect(404);
    });

    it('пускает через привязанный SSO и оставляет вход по паролю', async () => {
      const viaSso = await linker().link(
        provider,
        ssoProfile(providerSub, linkEmail),
      );
      expect(viaSso.id).toBe(userId);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: linkEmail, password: linkPassword })
        .expect(200);
    });

    it('не даёт привязать другой SSO к аккаунту без пароля', async () => {
      const ssoEmail = `e2e-sso-${randomUUID().slice(0, 8)}@example.com`;
      const ssoUser = await usersService().create({
        email: ssoEmail,
        passwordHash: null,
      });

      // Второй провайдер с тем же email: аккаунт создан через SSO, поэтому
      // подтвердить владение паролем нельзя — заявка есть, входа нет.
      const pending = await pendingLinks().create({
        provider: 'github',
        providerSub: `sub-${randomUUID()}`,
        userId: ssoUser.id,
        email: ssoEmail,
      });

      const info = await request(app.getHttpServer())
        .post('/auth/account-link/info')
        .send({ token: pending.token })
        .expect(200);
      expect(info.body.hasPassword).toBe(false);

      await request(app.getHttpServer())
        .post('/auth/account-link/confirm')
        .send({ token: pending.token, password: 'anything' })
        .expect(400);
    });

    it('отклоняет неизвестный токен', async () => {
      await request(app.getHttpServer())
        .post('/auth/account-link/info')
        .send({ token: 'unknown-token-value-1234567890' })
        .expect(404);
    });
  });

  describe('пароль для аккаунта, созданного через SSO', () => {
    const linker = () => app.get(ExternalAccountLinker);
    const sessions = () => app.get(SessionService);

    const ssoProfile = (sub: string, profileEmail: string) => ({
      sub,
      email: profileEmail,
      firstName: 'Иван',
      lastName: 'Иванов',
      displayName: 'Иванов Иван',
      emailVerified: true,
    });

    const createSsoAccount = () => {
      const ssoEmail = `e2e-password-${randomUUID().slice(0, 8)}@example.com`;
      return linker()
        .link('github', ssoProfile(`sub-${randomUUID()}`, ssoEmail))
        .then((user) => ({ user, email: ssoEmail }));
    };

    it('создаёт пароль в профиле и открывает вход по нему', async () => {
      const { user, email: ssoEmail } = await createSsoAccount();
      const session = await sessions().start(user);

      const updated = await request(app.getHttpServer())
        .put('/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ password: 'profile-password-123' })
        .expect(200);

      expect(updated.body.providers).toContain('password');

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ssoEmail, password: 'profile-password-123' })
        .expect(200);

      // Смена пароля требует текущий пароль.
      await request(app.getHttpServer())
        .put('/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ password: 'another-password-123' })
        .expect(400);

      await request(app.getHttpServer())
        .put('/auth/password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          currentPassword: 'profile-password-123',
          password: 'another-password-123',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ssoEmail, password: 'another-password-123' })
        .expect(200);
    });

    it('не даёт создать пароль без входа в аккаунт', async () => {
      const res = await request(app.getHttpServer())
        .put('/auth/password')
        .send({ password: 'profile-password-123' })
        .expect(401);

      expect(res.body.message).toBe('Требуется вход в аккаунт');
    });

    it('предлагает привязать пароль при конфликте регистрации', async () => {
      const { user, email: ssoEmail } = await createSsoAccount();

      const conflict = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: ssoEmail, password: 'attached-password-123' })
        .expect(409);

      expect(conflict.body.canAttachPassword).toBe(true);
      expect(conflict.body.message).toContain('можно привязать');

      const attached = await request(app.getHttpServer())
        .post('/auth/register/attach-password')
        .send({ email: ssoEmail, password: 'attached-password-123' })
        .expect(200);

      expect(attached.body.user.id).toBe(user.id);
      expect(attached.body.accessToken).toBeTruthy();
      expect(extractRefreshCookie(attached.headers['set-cookie'])).toContain(
        'refresh_token=',
      );

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ssoEmail, password: 'attached-password-123' })
        .expect(200);
    });

    it('не предлагает привязку пароля, если у аккаунта он уже есть', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);

      expect(res.body.canAttachPassword).toBe(false);
      expect(res.body.message).toContain('Войдите способом');
    });

    it('не привязывает пароль к аккаунту, у которого он уже есть', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/attach-password')
        .send({ email, password: 'another-password-123' })
        .expect(409);
    });

    it('не привязывает пароль к несуществующему аккаунту', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/attach-password')
        .send({
          email: `e2e-missing-${randomUUID().slice(0, 8)}@example.com`,
          password: 'attached-password-123',
        })
        .expect(409);
    });
  });
});
