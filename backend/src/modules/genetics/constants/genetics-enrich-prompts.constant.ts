/**
 * LLM prompt constants for batch-enriching the genetics (strain) reference catalog.
 *
 * Used by GeneticsService.enrichBatch() when new strain names are detected
 * in scraped Jane products but are absent from the DB.
 *
 * The LLM is asked to return ONLY valid JSON — no preamble, no markdown fences.
 * GeneticsService.parseGeneticsResponse() strips any accidental fences before parsing.
 */
export const GENETICS_ENRICH_SYSTEM_PROMPT = `You are a cannabis strain encyclopedia assistant.
Your task is to enrich a reference catalog of cannabis genetics (strains).
Return ONLY valid JSON — no explanation, no preamble, no markdown code fences.

CRITICAL RULES:
1. Web search results are provided for each strain. Use them as primary source.
2. If web search results are insufficient, use your general knowledge about cannabis strains.
3. Only use "לא ידוע" (unknown) if BOTH web search AND your knowledge have no information.
4. Never fabricate specific data you are unsure about.
5. Descriptions should be DETAILED: 3-5 sentences in Hebrew covering origin story, effects, flavor profile, and medical uses.
6. Include as much detail as possible about each strain.

For each strain name provided, return:
- name: The strain name exactly as provided
- description: DETAILED Hebrew description, 3-5 sentences covering: origin/creator, genetic cross, effects on body and mind, flavor/aroma profile, common medical uses
- parent1: First genetic parent name in Hebrew or English. For landrace strains (original wild genetics with no known parents, e.g. Afghani, Thai, Colombian, Durban Poison), use "Landrace" for both parent1 and parent2.
- parent2: Second genetic parent name in Hebrew or English. For landrace strains, use "Landrace".
- origin: Country or region of origin in Hebrew
- type: One of "היברידי", "סאטיבה", or "אינדיקה"
- thcRange: THC percentage range as "LOW-HIGH%" format (e.g. "15-25%", "18-22%"). NEVER return a single value like "20%" — always return a range.
- terpenes: Comma-separated list of dominant terpene names in English
- effects: Comma-separated list of 2-5 Hebrew effect labels
- color: A hex color that fits the strain's character

Return format:
{
  "genetics": [
    { "name": "...", "description": "...", "parent1": "...", "parent2": "...", "origin": "...", "type": "...", "thcRange": "...", "terpenes": "...", "effects": "...", "color": "..." },
    ...
  ]
}`;

/**
 * Builds the user prompt for a genetics batch enrichment request.
 *
 * @param names The list of strain names to enrich. Assumed to be already
 *   deduplicated and filtered (empty / "לא ידוע" (unknown) values removed upstream).
 * @param searchResults Optional map of strain name → web search results text.
 */
export function buildGeneticsEnrichUserPrompt(
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

    return `Enrich the following cannabis strain names using the web search results as primary source:\n${lines.join('\n')}`;
}
