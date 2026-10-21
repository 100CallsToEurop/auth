import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../user/domain/user.entity.js';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @ManyToOne(() => User, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** User-Agent клиента, открывшего сессию (для списка активных сессий). */
  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /** IP клиента, открывшего сессию. */
  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  /** Когда сессия последний раз использовалась (refresh). */
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;
}
