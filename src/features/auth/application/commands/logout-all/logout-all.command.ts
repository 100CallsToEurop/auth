export class LogoutAllCommand {
  constructor(
    public readonly userId: string,
    /** jti текущей сессии (из refresh-cookie). */
    public readonly currentSessionId?: string,
    /**
     * true — завершить все сессии, КРОМЕ текущей (кнопка «Завершить другие
     * сессии»); false/undefined — выйти со всех устройств, включая текущую.
     */
    public readonly exceptCurrent = false,
  ) {}
}
