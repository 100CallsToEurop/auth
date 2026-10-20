import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { RefreshToken } from '../../auth/domain/refresh-token.entity.js';
import { ExternalIdentity } from './external-identity.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 50, default: 'local' })
  provider: string;

  @Column({ type: 'varchar', length: 255, name: 'provider_sub', nullable: true })
  providerSub: string | null;

  @Column({ type: 'varchar', length: 255, name: 'first_name', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 255, name: 'last_name', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
  displayName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: Relation<RefreshToken[]>;

  @OneToMany(() => ExternalIdentity, (identity) => identity.user)
  externalIdentities: Relation<ExternalIdentity[]>;
}
