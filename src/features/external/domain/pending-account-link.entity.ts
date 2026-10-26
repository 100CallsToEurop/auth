import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../user/domain/user.entity.js';

/**
 * Заявка на привязку внешнего аккаунта к уже существующему пользователю.
 * Создаётся, когда SSO вернул email локального аккаунта: вход не выполняется,
 * пока пользователь не докажет владение (паролем) и не «сожжёт» одноразовый
 * токен. В БД лежит только SHA-256 от токена.
 */
@Entity('pending_account_links')
export class PendingAccountLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ name: 'provider_sub', type: 'varchar', length: 255 })
  providerSub: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
