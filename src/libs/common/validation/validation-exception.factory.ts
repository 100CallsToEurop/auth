import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Русские подписи полей для сообщений, которые class-validator формирует сам
 * (например, запрет неизвестных полей). У остальных ограничений текст задан
 * в DTO через option message.
 */
const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Пароль',
  token: 'Токен',
};

function collectMessages(
  errors: ValidationError[],
  messages: string[] = [],
): string[] {
  for (const error of errors) {
    const label = FIELD_LABELS[error.property] ?? error.property;
    for (const [constraint, message] of Object.entries(
      error.constraints ?? {},
    )) {
      messages.push(
        constraint === 'whitelistValidation'
          ? `Поле «${label}» не поддерживается`
          : message,
      );
    }
    if (error.children?.length) {
      collectMessages(error.children, messages);
    }
  }
  return messages;
}

/** Единый русский ответ на ошибки валидации входных DTO. */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const messages = collectMessages(errors);
  return new BadRequestException(
    messages.length ? messages : ['Некорректные данные запроса'],
  );
}
