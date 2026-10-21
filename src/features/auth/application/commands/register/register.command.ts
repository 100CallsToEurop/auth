import type { SessionMeta } from '../../session.service.js';

export class RegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly meta: SessionMeta = {},
  ) {}
}
