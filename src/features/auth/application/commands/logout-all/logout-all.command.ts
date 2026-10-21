export class LogoutAllCommand {
  constructor(
    public readonly userId: string,
    /** jti текущей сессии — её тоже отзываем (выход со всех устройств). */
    public readonly currentSessionId?: string,
  ) {}
}
