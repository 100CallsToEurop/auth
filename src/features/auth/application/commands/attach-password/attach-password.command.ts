import type { SessionMeta } from '../../../../session/application/session.service.js';

export class AttachPasswordCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly meta: SessionMeta = {},
  ) {}
}
