import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/** Почему refresh-токен попал в список «плохих». */
export type BadRefreshTokenReason =
  'invalid' | 'expired' | 'revoked' | 'reuse' | 'logout' | 'unknown';

/**
 * Отклонённый refresh-токен. Храним хеш, а не сам токен, и только до срока
 * его естественного истечения — чтобы повторно предъявленный токен нельзя
 * было принять за новый.
 */
@Entity('bad_refresh_tokens')
export class BadRefreshToken {
  @PrimaryColumn({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 32, default: 'invalid' })
  reason: BadRefreshTokenReason;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
