export class ListSessionsQuery {
  constructor(
    public readonly userId: string,
    /** jti текущей сессии (из refresh-cookie), чтобы пометить её как текущую. */
    public readonly currentSessionId?: string,
  ) {}
}
