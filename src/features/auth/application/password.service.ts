import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  /**
   * Хэш-заглушка: используется, когда пользователь не найден, чтобы ответ
   * на неверный логин/пароль занимал столько же времени, сколько настоящая
   * проверка. Иначе по времени ответа можно перечислить существующие email.
   */
  static readonly DUMMY_HASH =
    '$2b$10$0kgEMc5fjXsz20cWgQdxx.147EjT0UaSat.kjunEU9MrPaU.dVaAS';

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  compare(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
