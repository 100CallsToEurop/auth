import type { ProfileChanges } from '../../users.service.js';

export class UpdateProfileCommand {
  constructor(
    public readonly userId: string,
    public readonly changes: ProfileChanges,
  ) {}
}
