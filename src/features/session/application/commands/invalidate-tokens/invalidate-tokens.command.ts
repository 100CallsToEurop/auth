/**
 * Инвалидирует все ранее выданные access-токены пользователя: увеличивается
 * версия токенов аккаунта, и старые токены перестают приниматься.
 */
export class InvalidateTokensCommand {
  constructor(public readonly userId: string) {}
}
