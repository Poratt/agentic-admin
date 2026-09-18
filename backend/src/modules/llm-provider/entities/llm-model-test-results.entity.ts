import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { LlmModelEntity } from './llm-model.entity';

@Entity('llm_model_test_results')
export class LlmModelTestResultEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: 'model_id' })
    modelId!: number;

    @ManyToOne(() => LlmModelEntity, (model) => model.testResults, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'model_id' })
    model!: LlmModelEntity;

    @Column({ type: 'int', comment: 'Response time in milliseconds' })
    responseTimeMs!: number;

    @Column({ type: 'enum', enum: ['success', 'error', 'timeout', 'skipped'] })
    status!: 'success' | 'error' | 'timeout' | 'skipped';

    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null;

    @Column({ type: 'varchar', length: 50, nullable: true, comment: 'Capability under test at the time of the ping (text/image/video); null for pre-2026-09-18 rows' })
    capability!: string | null;

    @CreateDateColumn()
    createdAt!: Date;
}