import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { LlmProviderEntity } from './llm-provider.entity';
import { LlmModelTestResultEntity } from './llm-model-test-results.entity';

@Entity('llm_models')
@Index(['providerId', 'key'], { unique: true })
export class LlmModelEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  key!: string;

  @Column()
  label!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ default: 0 })
  sortOrder!: number;

  @Column({ type: 'enum', enum: ['text', 'image', 'video'], default: 'text' })
  capability!: 'text' | 'image' | 'video';

  @Column({ name: 'context_length', type: 'int', nullable: true })
  contextLength?: number | null;

  @Column({ name: 'max_output_tokens', type: 'int', nullable: true })
  maxOutputTokens?: number | null;

  @Column({ name: 'prompt_price_per_m', type: 'double', nullable: true })
  promptPricePerM?: number | null;

  @Column({ name: 'completion_price_per_m', type: 'double', nullable: true })
  completionPricePerM?: number | null;

  @Column({ name: 'free_tier', type: 'boolean', default: false })
  freeTier!: boolean;

  @Column({ name: 'metadata_source', type: 'varchar', length: 32, nullable: true })
  metadataSource?: string | null;

  @Column({ name: 'provider_id' })
  providerId!: number;

  @ManyToOne(() => LlmProviderEntity, (provider) => provider.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider!: LlmProviderEntity;

  @OneToMany(() => LlmModelTestResultEntity, (testResult) => testResult.model, { cascade: true })
  testResults!: LlmModelTestResultEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}