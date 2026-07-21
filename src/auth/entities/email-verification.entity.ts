import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('email_verification')
export class EmailVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  token: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
