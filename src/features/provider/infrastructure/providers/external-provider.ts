import type { Strategy as PassportStrategy } from 'passport';

/**
 * Внешний провайдер входа (Strategy): сам строит passport-стратегию и
 * умеет отдавать список для UI. Имя регистрации стратегии = slug.
 *
 * Стратегия для каждого провайдера строится дважды — под обычный вход и под
 * явную синхронизацию профиля (`sync`). Во втором случае verify получает
 * текущего пользователя из req (положил guard) и обновляет его профиль.
 */
export interface ExternalProvider {
  readonly slug: string;
  readonly displayName: string;
  /** Провайдер включён: клиентские ключи заданы в окружении. */
  configured(): boolean;
  createStrategy(): PassportStrategy;
  /** Хук после создания стратегии (например, OIDC discovery). */
  init?(strategy: PassportStrategy): Promise<void>;
  /**
   * URL RP-initiated logout у провайдера (OIDC end_session_endpoint).
   * Возвращает null, если провайдер не поддерживает выход из SSO-сессии.
   */
  logoutUrl?(returnTo?: string): string | null;
}

export const EXTERNAL_PROVIDERS = 'EXTERNAL_PROVIDERS';
