import { LlmModel } from '../services/llm-provider.service';

/**
 * Context window as a compact badge: 8192 → 8K, 131072 → 128K, 1048576 → 1M.
 * Null/unknown falls back to an em dash so the caller can always render something.
 */
export function formatContext(tokens: number | null | undefined): string {
    if (tokens == null || !Number.isFinite(tokens)) return '—';
    if (tokens >= 1024 * 1024) {
        const millions = tokens / (1024 * 1024);
        return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
    }
    if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`;
    return String(tokens);
}

/** $/1M-token price as a short string: 0.14 → $0.14. */
export function formatPricePerM(price: number | null | undefined): string {
    if (price == null || !Number.isFinite(price)) return '—';
    return `$${price.toFixed(2)}`;
}

/** True when the model carries at least one enriched spec worth showing. */
export function hasModelSpecs(model: LlmModel): boolean {
    return (
        model.contextLength != null ||
        model.maxOutputTokens != null ||
        model.promptPricePerM != null ||
        model.completionPricePerM != null ||
        model.freeTier === true
    );
}

/**
 * Pricing cell for the models table: `Free` for free models (flag or both prices 0),
 * otherwise the prompt price per 1M tokens. Null/unknown falls back to an em dash.
 */
export function priceCell(model: LlmModel): string {
    if (model.freeTier === true || (model.promptPricePerM === 0 && model.completionPricePerM === 0)) return 'Free';
    if (model.promptPricePerM == null && model.completionPricePerM == null) return '—';
    return formatPricePerM(model.promptPricePerM);
}

/** Chat picker hint: `<128K · Free>` or `<64K · $0.14/M>` — context + cost before you send. */
export function modelPickerHint(model: LlmModel): string | null {
    if (!hasModelSpecs(model)) return null;
    const parts: string[] = [];
    if (model.contextLength != null) parts.push(formatContext(model.contextLength));
    if (model.freeTier === true || (model.promptPricePerM === 0 && model.completionPricePerM === 0)) {
        parts.push('Free');
    } else if (model.promptPricePerM != null) {
        parts.push(`${formatPricePerM(model.promptPricePerM)}/M`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}
