import { ConflictException } from '@nestjs/common';

/**
 * Почта уже занята существующим аккаунтом. Если у этого аккаунта нет пароля,
 * но есть хотя бы один внешний способ входа, клиент может предложить владельцу
 * привязать пароль (явное действие, без подтверждения почты).
 */
export class EmailAlreadyRegisteredException extends ConflictException {
  constructor(readonly canAttachPassword: boolean) {
    super({
      statusCode: 409,
      error: 'Conflict',
      message: canAttachPassword
        ? 'Аккаунт с этой почтой уже существует. Если это ваш аккаунт, можно привязать к нему пароль.'
        : 'Аккаунт с этой почтой уже существует. Войдите способом, который уже привязан к аккаунту.',
      canAttachPassword,
    });
  }
}
