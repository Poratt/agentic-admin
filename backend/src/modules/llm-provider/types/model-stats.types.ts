/** Latency and reliability figures for one model, from one source of measurements. */
export type ModelUsageStats = {
  runs: number;
  /** Percentage of runs that succeeded, 0-100. */
  successRate: number;
  /** Mean latency of the successful runs, in milliseconds. */
  avgMs: number;
  /** Fastest successful run, in milliseconds. */
  minMs: number;
  /**
   * Mean tool-call reliability over the calls that requested tools, 0-100 — the syntactic
   * soundness of the tool output (JSON-parseable arguments for a truly requested function).
   * `null` when the source has no tool-call sample: pings never request tools, and a model
   * whose real calls never used them has nothing to measure.
   */
  toolCallReliability: number | null;
};

/**
 * One row of the statistics view: a model's connectivity pings beside the work it actually did.
 *
 * The two columns exist because they answer different questions and disagree often — a model can
 * answer a one-line ping in 300ms and still take 40s to produce fifteen ideas.
 */
export type ModelStatsRow = {
  /** Stable composite id, `${providerKey}::${modelKey}` — the leaderboard points at rows with it. */
  id: string;
  providerKey: string;
  modelKey: string;
  /** Display name from the provider configuration; `null` once the model is removed. */
  label: string | null;
  active: boolean;
  /** From the manual connectivity tests in `llm_model_test_results`. */
  ping: ModelUsageStats | null;
  /** From real calls in `llm_call_stats`, health-check pings excluded. */
  real: ModelUsageStats | null;
  /** Timestamp of the most recent real call, or `null` if the model was never used. */
  lastCallAt: Date | null;
  /**
   * Which column the leaderboard ranked this row on, or `null` when neither source has enough
   * runs. Real calls take precedence; pings stand in until a model is actually used, so the
   * badges work from day one. The UI reads this to say which measurement the badge reflects.
   */
  rankingBasis: 'real' | 'ping' | null;
};

/** Payload of the model statistics endpoint. */
export type ModelStats = {
  /** Runs a model needs before it can be ranked — one run is noise, not a measurement. */
  minimumSample: number;
  rows: ModelStatsRow[];
  /** Id of the fastest model by mean real-call latency, or `null` when nothing qualifies. */
  fastestId: string | null;
  /** Id of the most reliable model by real-call success rate, or `null` when nothing qualifies. */
  mostStableId: string | null;
};
