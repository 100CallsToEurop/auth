import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { validationExceptionFactory } from '../validation-exception.factory.js';

function error(
  property: string,
  constraints: Record<string, string>,
  children?: ValidationError[],
): ValidationError {
  return { property, constraints, children } as ValidationError;
}

describe('validationExceptionFactory', () => {
  it('возвращает сообщения DTO как есть', () => {
    const exception = validationExceptionFactory([
      error('email', { isEmail: 'Укажите корректный email' }),
    ]);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getResponse()).toMatchObject({
      statusCode: 400,
      message: ['Укажите корректный email'],
    });
  });

  it('переводит ошибку неизвестного поля', () => {
    const exception = validationExceptionFactory([
      error('role', {
        whitelistValidation: 'property role should not exist',
      }),
    ]);

    expect(exception.getResponse()).toMatchObject({
      message: ['Поле «role» не поддерживается'],
    });
  });

  it('собирает ошибки вложенных полей', () => {
    const exception = validationExceptionFactory([
      error('profile', {}, [
        error('password', {
          minLength: 'Пароль должен быть не менее 8 символов',
        }),
      ]),
    ]);

    expect(exception.getResponse()).toMatchObject({
      message: ['Пароль должен быть не менее 8 символов'],
    });
  });

  it('не отдаёт пустой список сообщений', () => {
    const exception = validationExceptionFactory([]);

    expect(exception.getResponse()).toMatchObject({
      message: ['Некорректные данные запроса'],
    });
  });
});
