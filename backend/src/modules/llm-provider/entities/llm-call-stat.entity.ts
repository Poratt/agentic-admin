import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One real (non-health-check) LLM call, recorded so the statistics view can rank models by
 * actual work rather than by a one-line connectivity ping.
 *
 * Deliberately stores the provider/model **keys** and not a foreign key to `llm_models`:
 *
 * - resolving the model row on every call would add a database round-trip to the hot path
 * - a model that is renamed or deleted would take its history with it, which is the opposite of
 *   what a statistics table is for
 *
 * The statistics query groups by `(providerKey, modelKey)` and maps labels in code against the
 * provider list it already has loaded.
 */
@Entity('llm_call_stats')
@Index(['providerKey', 'modelKey', 'createdAt'])
export class LlmCallStatEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'provider_key' })
  providerKey!: string;

  @Column({ name: 'model_key' })
  modelKey!: string;

  @Column({ type: 'int', comment: 'Latency in milliseconds' })
  latencyMs!: number;

  @Column({ type: 'enum', enum: ['success', 'error', 'timeout'] })
  status!: 'success' | 'error' | 'timeout';

  /**
   * Which surface made the call. `'health'` marks the manual connectivity pings, which are
   * excluded from the real-usage statistics so they cannot be counted twice — they are already
   * recorded in `llm_model_test_results`.
   */
  @Column({ default: 'app' })
  caller!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
