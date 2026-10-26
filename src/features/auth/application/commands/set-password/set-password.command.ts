export class SetPasswordCommand {
  constructor(
    public readonly userId: string,
    public readonly password: string,
    /** Текущий пароль — обязателен, если пароль уже установлен. */
    public readonly currentPassword?: string,
  ) {}
}
