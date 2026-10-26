import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../user/domain/user.entity.js';

/**
 * Версия токенов аккаунта. Хранится отдельно от пользователя: это состояние
 * токенов, а не профиль. При «выйти со всех устройств» версия увеличивается,
 * и все ранее выданные access-токены перестают приниматься.
 */
@Entity('user_token_versions')
export class UserTokenVersion {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'int', default: 0 })
  version: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
