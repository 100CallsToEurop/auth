export class RevokeSessionCommand {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
  ) {}
}
