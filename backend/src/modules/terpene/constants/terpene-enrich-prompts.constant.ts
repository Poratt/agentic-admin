/**
 * LLM prompt constants for batch-enriching the terpene reference catalog.
 *
 * Used by TerpeneService.enrichBatch() when new terpene names are detected
 * in scraped Jane products but are absent from the DB.
 *
 * The LLM is asked to return ONLY valid JSON — no preamble, no markdown fences.
 * TerpeneService.parseTerpeneResponse() strips any accidental fences before parsing.
 */
export const TERPENE_ENRICH_SYSTEM_PROMPT = `You are a cannabis terpene encyclopedia assistant.
Your task is to enrich a reference catalog of cannabis terpenes.
Return ONLY valid JSON — no explanation, no preamble, no markdown code fences.

CRITICAL RULES:
1. Web search results are provided for each terpene. Use them as primary source.
2. If web search results are insufficient, use your general knowledge about cannabis terpenes.
3. Only use "לא ידוע" (unknown) if BOTH web search AND your knowledge have no information.
4. Never fabricate specific data you are unsure about.
5. Hebrew descriptions should be 1-3 sentences.

For each terpene name provided, return:
- name: The terpene name exactly as provided
- description: Hebrew description based on search results or your knowledge
- scent: Aroma profile in Hebrew
- effects: Comma-separated list of 1-4 Hebrew effect labels
- color: A hex color that fits the terpene's character

Return format:
{
  "terpenes": [
    { "name": "...", "description": "...", "scent": "...", "effects": "...", "color": "..." },
    ...
  ]
}`;

/**
 * Builds the user prompt for a terpene batch enrichment request.
 *
 * @param names The list of terpene names to enrich. Assumed to be already
 *   deduplicated and filtered (empty / "לא ידוע" (unknown) values removed upstream).
 * @param searchResults Optional map of terpene name → web search results text.
 */
export function buildTerpeneEnrichUserPrompt(
    names: string[],
    searchResults?: Map<string, string>,
): string {
    const lines = names.map((n) => {
        const search = searchResults?.get(n);
        if (search) {
            return `- ${n}\n  Web search results:\n  ${search}`;
        }
        return `- ${n}\n  Web search results: (none)`;
    });

    return `Enrich the following cannabis terpene names using the web search results as primary source:\n${lines.join('\n')}`;
}
