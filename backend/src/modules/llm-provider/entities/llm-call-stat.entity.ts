import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One LLM call, recorded so the statistics view can rank models by measured work. Real usage and
 * connectivity pings share this single table — `isTest` separates the two halves of the
 * Statistics tab (the "Ping" half reads `is_test = true`, the "Real" half `is_test = false`).
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
   * Tool-call reliability of this call, 0-100: the share of the emitted tool calls that are
   * syntactically sound (JSON-parseable arguments for a truly requested tool). `null` when the
   * call requested no tools or the model emitted none — there is nothing to measure.
   */
  @Column({ type: 'int', nullable: true, comment: 'Tool-call reliability 0-100; null when no tools were requested/replied' })
  toolCallReliability!: number | null;

  /**
   * Which surface made the call — pure provenance. `'health'` marks the connectivity pings; the
   * statistics split is driven by `is_test`, not by this value, so the two stay independent.
   */
  @Column({ default: 'app' })
  caller!: string;

  /** True when the call is a connectivity ping (manual Test / Test All / nightly cron), excluded from the real-usage statistics. */
  @Column({ name: 'is_test', type: 'boolean', default: false, comment: 'True for connectivity pings; the Real half of the statistics reads is_test = false' })
  isTest!: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
