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
  @ManyToOne(() => User, {
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

  /**
   * Способ входа, которым была создана сессия (slug провайдера или 'password').
   * Нужен, чтобы при выходе знать, поддерживает ли провайдер RP-initiated logout.
   */
  @Column({ name: 'provider', type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  /**
   * Семейство токенов: все refresh-токены одной сессии (включая ротации).
   * Если такой токен снова предъявлен — значит его украли, и всё семейство
   * отзывается (reuse detection).
   */
  @Column({ name: 'family_id', type: 'uuid', nullable: true })
  familyId: string | null;

  /** Когда токен был отозван или заменён при ротации. null = активен. */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Токен, заменивший этот при ротации. */
  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById: string | null;
}
