import { Injectable, Logger } from '@nestjs/common';

/**
 * One row of the OpenRouter public catalog (`GET /api/v1/models`).
 * Only the fields the enrichment maps onto a model row are typed here — the rest
 * of the payload (per-model defaults, reasoning constraints, ...) is ignored.
 */
export interface OpenRouterModelEntry {
  id: string;
  context_length?: number | null;
  top_provider?: {
    max_completion_tokens?: number | null;
    context_length?: number | null;
  } | null;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  } | null;
  alias_target?: { slug?: string } | null;
}

/** The enrichment result for one model key, mapped onto `LlmModelEntity` columns. */
export interface ModelMetadata {
  key: string;
  contextLength: number | null;
  maxOutputTokens: number | null;
  promptPricePerM: number | null;
  completionPricePerM: number | null;
  freeTier: boolean;
  tier: 't1' | 't2' | null;
  metadataSource: string | null;
}

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** Delay before the first retry after a failed fetch; doubles per consecutive failure. */
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 30 * 60 * 1000;

/**
 * Normalizes any model key for matching. Real-world keys carry noise that must
 * be peeled before comparison (measured against the live 445-entry catalog):
 * - `~` is a PREFIX on "auto-latest" redirect entries (`~deepseek/deepseek-x-latest`) — strip it.
 * - `:free` (OpenRouter) and `-free` (NaraRouter-style) both mark the free variant —
 *   one regex closes them. Never `split('~')[0]`: on prefix-`~` ids that yields an empty string.
 */
export function normalizeKey(key: string): string {
  return String(key).trim().toLowerCase().replace(/^~/, '').replace(/[-:]free$/i, '');
}

/** True when the *local* key itself asks for the free tier (`:free` or `-free` suffix). */
function isFreeKey(key: string): boolean {
  return /[-:]free$/i.test(String(key).trim());
}

/** OpenRouter pricing is per token as a string ("0.00000015"); the app stores $/1M tokens. */
function pricePerM(value: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000 * 1_000_000) / 1_000_000;
}

/**
 * Pure matching core (unit-testable without the network).
 *
 * Two tiers, both guarded — a blind `split('/').pop()` would price llama/gemma-class
 * models under whichever vendor happens to sort first. Empirically measured on the
 * live DB keys: exact 34 + bare 22 + steered 7 = 77% hit rate, zero ambiguity.
 *
 * - Tier 1: normalized-id equality (also collapses `vendor/model` vs `vendor/model:free`,
 *   steering on the local `:free`/`-free` suffix).
 * - Tier 2: last path segment, indexed from each entry's OWN id — alias-target slugs are
 *   excluded because they duplicate a real entry and inflate ambiguity 2-3×.
 * - Disambiguation inside a tier: free-steer first, then vendor hint (key's first segment,
 *   else providerKey), else `null` — never invent a price.
 */
export function matchCatalogEntry(
  entries: OpenRouterModelEntry[],
  key: string,
  providerKey?: string,
): { entry: OpenRouterModelEntry; tier: 't1' | 't2' } | null {
  const normalized = normalizeKey(key);
  const localFree = isFreeKey(key);
  const localBare = normalized.split('/').pop() ?? normalized;

  const exact = new Map<string, OpenRouterModelEntry[]>();
  const bare = new Map<string, OpenRouterModelEntry[]>();
  for (const e of entries) {
    const n = normalizeKey(e.id);
    const b = n.split('/').pop() ?? n;
    if (!exact.has(n)) exact.set(n, []);
    exact.get(n)!.push(e);
    if (!bare.has(b)) bare.set(b, []);
    bare.get(b)!.push(e);
  }

  const steer = (cands: OpenRouterModelEntry[], hintBare: boolean): { entry: OpenRouterModelEntry; tier: 't1' | 't2' } | null => {
    if (cands.length === 0) return null;
    if (cands.length === 1) return { entry: cands[0], tier: hintBare ? 't2' : 't1' };
    const freeC = cands.filter((c) => /:free$/.test(c.id));
    const baseC = cands.filter((c) => !/:free$/.test(c.id));
    const pool = localFree ? (freeC.length ? freeC : baseC) : (baseC.length ? baseC : freeC);
    if (pool.length === 1) return { entry: pool[0], tier: hintBare ? 't2' : 't1' };
    const parts = normalized.split('/');
    const hint = parts.length > 1 ? parts[0] : providerKey;
    const hinted = hint
      ? pool.filter((c) => normalizeKey(c.id).split('/')[0] === hint)
      : [];
    if (hinted.length === 1) return { entry: hinted[0], tier: hintBare ? 't2' : 't1' };
    return null;
  };

  const exactHit = steer(exact.get(normalized) ?? [], false);
  if (exactHit) return exactHit;

  return steer(bare.get(localBare) ?? [], true);
}

/**
 * Bare names of catalog entries that ship a `:free` variant (`poolside/laguna-xs-2.1:free`
 * → `laguna-xs-2.1`). Pure + unit-testable; feeds the "free variant exists" hint for
 * locally-configured bare (paid) keys.
 */
export function freeVariantBareNames(entries: OpenRouterModelEntry[]): string[] {
  const names = new Set<string>();
  for (const e of entries) {
    if (!/:free$/.test(e.id)) continue;
    const n = normalizeKey(e.id);
    names.add(n.split('/').pop() ?? n);
  }
  return [...names];
}

/** Maps a matched catalog entry onto the model-row fields. */
export function metadataFromEntry(key: string, entry: OpenRouterModelEntry, tier: 't1' | 't2'): ModelMetadata {
  const prompt = pricePerM(entry.pricing?.prompt);
  const completion = pricePerM(entry.pricing?.completion);
  return {
    key,
    contextLength: typeof entry.context_length === 'number' ? entry.context_length : null,
    maxOutputTokens: typeof entry.top_provider?.max_completion_tokens === 'number' ? entry.top_provider.max_completion_tokens : null,
    promptPricePerM: prompt,
    completionPricePerM: completion,
    freeTier: isFreeKey(key) || /:free$/.test(entry.id) || (prompt === 0 && completion === 0),
    tier,
    metadataSource: `openrouter:${tier}`,
  };
}

/**
 * Best-effort catalog lookup for model metadata enrichment. Never throws: a failed or
 * slow OpenRouter fetch yields no matches (callers keep their existing values).
 *
 * Cache policy — the last good catalog and the retry schedule are tracked separately, so a
 * failure can never be mistaken for data:
 * - Success caches the entries for 24h and clears the backoff.
 * - Failure keeps the previous entries (stale beats blank — a day-old catalog still prices
 *   models) and opens a backoff window that doubles per consecutive failure, 60s → 30m. A
 *   transient blip recovers within a minute; a real outage stops being retried on every
 *   single `detect()` call, which the old design did whenever a cache already existed.
 * - Concurrent callers share one in-flight fetch instead of firing one request each.
 */
@Injectable()
export class ModelMetadataCatalogService {
  private readonly logger = new Logger(ModelMetadataCatalogService.name);
  private cache: { entries: OpenRouterModelEntry[]; fetchedAt: number } | null = null;
  /** Non-null while a refresh is in flight — the single-flight latch for concurrent callers. */
  private inflight: Promise<OpenRouterModelEntry[]> | null = null;
  /** Epoch ms before which no refresh is attempted. 0 = no backoff. */
  private retryAt = 0;
  private failures = 0;

  private async getEntries(): Promise<OpenRouterModelEntry[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.entries;
    }
    // Backing off: serve whatever the last good fetch produced, without touching the network.
    // ponytail: stale is served indefinitely — add a max-stale bound only if the catalog itself goes away for good.
    if (Date.now() < this.retryAt) {
      return this.cache?.entries ?? [];
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** One catalog fetch. Never rejects — the failure path returns the last good entries. */
  private async refresh(): Promise<OpenRouterModelEntry[]> {
    try {
      const res = await fetch(CATALOG_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`OpenRouter catalog HTTP ${res.status}`);
      const body = (await res.json()) as { data?: OpenRouterModelEntry[] };
      const entries = (body.data ?? []).filter((e) => e && typeof e.id === 'string' && e.id.length > 0);
      // A 2xx with no usable rows is a broken response, not a catalog — treat it as a failure so it
      // opens a backoff window instead of locking enrichment out for the full 24h TTL.
      if (entries.length === 0) throw new Error('OpenRouter catalog returned no entries');

      this.cache = { entries, fetchedAt: Date.now() };
      this.failures = 0;
      this.retryAt = 0;
      this.logger.log(`Loaded ${entries.length} OpenRouter catalog entries`);
      return entries;
    } catch (error) {
      this.failures += 1;
      const backoffMs = Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_MAX_MS);
      this.retryAt = Date.now() + backoffMs;
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `OpenRouter catalog unavailable (${reason}) — serving ${this.cache?.entries.length ?? 0} cached entries, retrying in ${Math.round(backoffMs / 1000)}s`,
      );
      return this.cache?.entries ?? [];
    }
  }

  /** Detects metadata for one key (Edit Model dialog "✨ Auto-Detect"). Returns null when unmatched. */
  async detect(key: string, providerKey?: string): Promise<ModelMetadata | null> {
    const hit = matchCatalogEntry(await this.getEntries(), key, providerKey);
    return hit ? metadataFromEntry(key, hit.entry, hit.tier) : null;
  }

  /** Bare names with a `:free` variant upstream ("free variant exists" hint). Empty when the catalog is down. */
  async getFreeVariantBareNames(): Promise<string[]> {
    return freeVariantBareNames(await this.getEntries());
  }

  /** Batch form for sync/seeds — one catalog fetch serves every key. */
  async detectMany(keys: string[], providerKey?: string): Promise<Map<string, ModelMetadata | null>> {
    const entries = await this.getEntries();
    const result = new Map<string, ModelMetadata | null>();
    for (const key of keys) {
      const hit = matchCatalogEntry(entries, key, providerKey);
      result.set(key, hit ? metadataFromEntry(key, hit.entry, hit.tier) : null);
    }
    return result;
  }
}