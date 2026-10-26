import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { PG_UNIQUE_VIOLATION } from '../../consts/database.constants.js';

/**
 * Ошибки БД, которые нельзя отдавать клиенту как 500:
 * нарушение уникальности (например, гонка при регистрации одного email)
 * — это 409 Conflict, а не серверная ошибка.
 */
@Catch(QueryFailedError)
export class QueryFailedFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const driverError = exception.driverError as
      { code?: string; constraint?: string } | undefined;

    if (driverError?.code === PG_UNIQUE_VIOLATION) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: 'Запись с такими данными уже существует',
        error: 'Conflict',
      });
      return;
    }

    this.logger.error(
      `Ошибка запроса к БД: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера',
      error: 'Internal Server Error',
    });
  }
}
