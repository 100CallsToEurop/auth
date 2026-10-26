export class ConfirmPhoneCommand {
  constructor(
    public readonly userId: string,
    public readonly phone: string,
  ) {}
}
