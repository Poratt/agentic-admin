import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface CannlyticsStrainData {
    id: string;
    total_thc?: number;
    total_cbd?: number;
    total_cannabinoids?: number;
    total_terpenes?: number;
    beta_myrcene?: number;
    d_limonene?: number;
    beta_caryophyllene?: number;
    alpha_pinene?: number;
    linalool?: number;
    terpinolene?: number;
    humulene?: number;
    ocimene?: number;
    carene?: number;
    alpha_bisabolol?: number;
    potential_aromas?: string[];
}

interface CannlyticsListResponse {
    success: boolean;
    data: CannlyticsStrainData[];
}

const HEBREW_STRAIN_NAMES: Record<string, string> = {
    'אורנג\' סקאנק': 'Orange Skunk',
    'אורנג\' סקיטלז': 'Orange Skittlez',
    'גורילה גלו': 'Gorilla Glue',
    'בננה דדי': 'Banana Daddy',
    'מנגו מינט': 'Mango Mint',
    'מנדו ברת\'': 'Mendo Breath',
    'פיור קוש': 'Pure Kush',
    'פינק קוש': 'Pink Kush',
    'צ\'רי קוש': 'Cherry Kush',
    'קוש מינטס': 'Kush Mints',
    'קוש קוקיז': 'Kush Cookies',
    'סקיטלז': 'Zkittlez',
    'ג\'לאטו': 'Gelato',
    'ג\'לאטו 41': 'Gelato 41',
    'לוגברי': 'Blueberry',
    'בלו דרים': 'Blue Dream',
    'סאוור דיזל': 'Sour Diesel',
    'אינסייד ג\'וק': 'Inside Joke',
    'אל.איי קוש קייק': 'LA Kush Cake',
    'אליאן קוקיז': 'Alien Cookies',
    'אמנזיה באבל': 'Amnesia Bubble',
    'אנימל מינטס': 'Animal Mints',
    'אנימל פייס': 'Animal Face',
    'אנימל צונאמי': 'Animal Tsunami',
    'אנימל קוקיז': 'Animal Cookies',
    'אפגן סקאנك': 'Afghan Skunk',
    'אפגן קוש': 'Afghan Kush',
    'אפגני': 'Afghani',
    'פלאפ ג\'קס': 'Flip Jacks',
    'פנקייקס': 'Pancakes',
    'פרפל אלפנט': 'Purple Elephant',
    'פרפל פאנץ\'': 'Purple Punch',
    'פרפל תאי': 'Purple Thai',
    'צ\'רי ג\'אם': 'Cherry Jam',
    'צ\'רי קוקיז': 'Cherry Cookies',
    'קאדילק ריינבו': 'Cadillac Rainbow',
    'קאפ ג\'אנקי': 'Cup Junkie',
    'קוקיז אנד קרים': 'Cookies and Cream',
    'קושר קוש': 'Kosher Kush',
    'קליפורניה אורנג\'': 'California Orange',
    'קנדי קוש': 'Candy Kush',
    'קנדי ריין': 'Candy Rain',
    'קריביאן קוקיז': 'Caribbean Cookies',
    'קריטיקל ג\'ק': 'Critical Jack',
    'קרים': 'Cream',
    'קרים קייק': 'Cream Cake',
    'קרמל צונאמי': 'Caramel Tsunami',
    'אנאלאי': 'Amnesia Haze',
    'סאנסט שרבט': 'Sunset Sherbet',
    'סופר בוף': 'Super Boof',
    'סורבה': 'Sorbet',
    'סטארדוג גויאבה': 'Stardog Guava',
    'סטיקי באנז': 'Sticky Buns',
    'סטרוברי בננה': 'Strawberry Banana',
    'סליפרי סוזן': 'Slippery Susan',
    'סן פרננדו ואלי אוג\'י': 'San Fernando Valley OG',
    'סנואו לוטוס': 'Snow Lotus',
    'ספאייר אוג\'י': 'Sapphire OG',
    'ספייס קייק': 'Space Cake',
    'סקאנק #1': 'Skunk #1',
    'פאסד': 'Phazed',
    'פיור מישיגן': 'Pure Michigan',
    'פייס אוף אוג\'י': 'Face Off OG',
    'פייר אוג\'י': 'Fire OG',
    'פייר קוקיז': 'Fire Cookies',
    'פיץ\' אוז': 'Peach Oz',
    'פיץ\' קרשנדו': 'Peach Crescendo',
    'פלורידה אוג\'י': 'Florida OG',
    'קוארפ': 'Cough',
    'ריינבו שרבט': 'Rainbow Sherbet',
    'רמו כמו': 'Runtz Mints',
    'שוקולד דיזל': 'Chocolate Diesel',
    'שוקולד מינט אוג\'י': 'Chocolate Mint OG',
    'שרבאנגר': 'Sherbanger',
    'שרבזוקה': 'Sherebuzka',
    'ת\'ין מינט קוקיז': 'Thin Mint Cookies',
    'טנג\'י': 'Tangie',
    'טריאנגל קווין': 'Triangle Kush',
    'טריאנגל קוש': 'Triangle Kush',
    'טריפל אוג\'י': 'Triple OG',
    'כמדוג': 'Chemdawg',
    'ליט אוג\'י': 'Lit OG',
    'מוטור ברת\'': 'Motor Breath',
    'מימוזה': 'Mimosa',
    'מקפלרי': 'Mac Flurry',
    'מרינג': 'Meringue',
    'סאב זירו': 'Sub Zero',
    'סאוור דאב': 'Sour Dubb',
    'סאוור קוש': 'Sour Kush',
    'סוויט וואלי קוש': 'Sweet Valley Kush',
    'ג\'וקרז': 'Jokers',
    'ג\'ורג\'יה פאי': 'Georgia Pie',
    'ג\'י אם או': 'GMO',
    'ג\'לאטי': 'Gelati',
    'ג\'לי ראנצ\'ר': 'Jelly Rancher',
    'גויאבה': 'Guava',
    'גויאבה ג\'לאטו': 'Guava Gelato',
    'גורילה ברת\'': 'Gorilla Breath',
    'גוש מינטס': 'Gush Mints',
    'גושרס': 'Gushers',
    'גז פרוט': 'Gas Froot',
    'גירל סקאוט קוקיז': 'Girl Scout Cookies',
    'גלוברי': 'Gluberry',
    'גלוברי או ג\'י': 'Gluberry OG',
    'גלייזד גרליק': 'Glazed Garlic',
    'גריז מאנקי': 'Grease Monkey',
    'גרליק ברת\'': 'Garlic Breath',
    'גרליק ברת\' 2.0': 'Garlic Breath 2.0',
    'גרליק סקיטלז': 'Garlic Zkittlez',
    'גרנדדי פרפל': 'Granddaddy Purple',
    'דה ווייט': 'The White',
    'דו סי דוס': 'Do-Si-Dos',
    'דו סי דוס קוקיז': 'Do-Si-Dos Cookies',
    'דוויל דרייבר': 'Devil Driver',
    'דולצ\'ה דה אווה': 'Dolce de Eva',
    'דונקי באטר': 'Donkey Butter',
    'דיזיינר ראנטז': 'Designer Runtz',
    'הארדקור אוג\'י': 'Hardcore OG',
    'הארדקור גושרס': 'Hardcore Gushers',
    'הינדו קוש': 'Hindu Kush',
    'וודינג קייק': 'Wedding Cake',
    'וודינג קראשר': 'Wedding Crasher',
    'וטרמלון': 'Watermelon',
    'וטרמלון סקיטלז': 'Watermelon Zkittlez',
    'ווייט ראנטז': 'White Runtz',
    'ווייט ריינו': 'White Rhino',
    'זואפ': 'Zoap',
    'זואפינייטור': 'Zoapinator',
    'טינה': 'Tina',
    'אפגן סקאנק': 'Afghan Skunk',
    '33 ספליטר': '33 Splitter',
    'אובמה ראנטז': 'Obama Runtz',
    'אוז קוש': 'Oz Kush',
    'אוראוז': 'Oreoz',
    'אורנג\' ולווט': 'Orange Velvet',
    'אזול ראנטז': 'Azul Runtz',
    'אטום ספליטר': 'Atom Splitter',
    'בלוברי': 'Blueberry',
};

@Injectable()
export class CannlyticsService implements OnModuleInit {
    private readonly logger = new Logger(CannlyticsService.name);
    private readonly baseUrl = 'https://cannlytics.com/api/data/strains';
    private strainCache: Map<string, CannlyticsStrainData> = new Map();
    private cacheLoaded = false;

    constructor(private readonly httpService: HttpService) {}

    async onModuleInit(): Promise<void> {
        await this.loadCache();
    }

    async getStrain(name: string): Promise<CannlyticsStrainData | null> {
        try {
            // Ensure cache is loaded
            if (!this.cacheLoaded) {
                await this.loadCache();
            }

            // Try to find in cache by exact match
            const exactMatch = this.findInCache(name);
            if (exactMatch) return exactMatch;

            // Try direct API call
            const directResult = await this.fetchByName(name);
            if (directResult) return directResult;

            // Try name variations
            const variations = this.getNameVariations(name);
            for (const variant of variations) {
                const variantResult = await this.fetchByName(variant);
                if (variantResult) return variantResult;
                
                // Also check cache
                const cacheMatch = this.findInCache(variant);
                if (cacheMatch) return cacheMatch;
            }

            return null;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`[Cannlytics] Error fetching strain "${name}": ${msg}`);
            return null;
        }
    }

    private async loadCache(): Promise<void> {
        try {
            // Load first 1000 strains
            const response = await firstValueFrom(
                this.httpService.get<CannlyticsListResponse>(`${this.baseUrl}?limit=1000`, {
                    headers: { 'User-Agent': 'CannlyticsClient/1.0' },
                    timeout: 15_000,
                })
            );

            if (response.data?.success && Array.isArray(response.data.data)) {
                for (const strain of response.data.data) {
                    if (strain.id) {
                        this.strainCache.set(strain.id.toLowerCase(), strain);
                    }
                }
                this.logger.log(`[Cannlytics] Loaded ${this.strainCache.size} strains into cache`);
            }
            this.cacheLoaded = true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`[Cannlytics] Failed to load cache: ${msg}`);
            this.cacheLoaded = true; // Don't retry
        }
    }

        private findInCache(name: string): CannlyticsStrainData | null {
        const normalizedName = name.toLowerCase().trim();
        if (!normalizedName) {
            return null;
        }

        // Exact match first
        const exact = this.strainCache.get(normalizedName);
        if (exact) return exact;

        // Partial token-based match — all-or-nothing:
        // Every query token must find a match in the key, and a token shorter than 3 chars
        // (e.g. "33") can only match as a whole word, not as a substring.
        // This way "33 splitter" no longer matches a strain simply named "33" — which would
        // return the same lab data for different strains.
        const queryTokens = normalizedName.split(/[^a-z0-9]+/).filter(Boolean);
        if (queryTokens.length === 0) {
            return null;
        }
        // Single-token query: whole word only, and only for a significant token (>= 3 chars)
        if (queryTokens.length === 1 && queryTokens[0].length < 3) {
            return null;
        }

        let best: { score: number; data: CannlyticsStrainData } | null = null;

        for (const [key, value] of this.strainCache) {
            const keyTokens = key.split(/[^a-z0-9]+/).filter(Boolean);
            if (keyTokens.length === 0) continue;

            let score = 0;
            let allMatched = true;

            for (const token of queryTokens) {
                let tokenMatched = false;
                for (const keyToken of keyTokens) {
                    if (keyToken === token) {
                        score += 2; // exact whole-word match
                        tokenMatched = true;
                        break;
                    }
                    if (
                        (token.length >= 3 && keyToken.includes(token)) ||
                        (keyToken.length >= 3 && token.includes(keyToken))
                    ) {
                        score += 1; // partial substring match (only when one side is significant)
                        tokenMatched = true;
                        break;
                    }
                }
                if (!tokenMatched) {
                    allMatched = false;
                    break;
                }
            }

            if (!allMatched) continue;
            // A key with fewer extra tokens = a tighter match
            score -= keyTokens.length - queryTokens.length;
            if (!best || score > best.score) {
                best = { score, data: value };
            }
        }

        return best?.data ?? null;
    }
    private async fetchByName(name: string): Promise<CannlyticsStrainData | null> {
        try {
            const encodedName = encodeURIComponent(name);
            const url = `${this.baseUrl}/${encodedName}`;

            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: { 'User-Agent': 'CannlyticsClient/1.0' },
                    timeout: 10_000,
                })
            );

            const data = response.data;
            if (data?.success && data?.data && Object.keys(data.data).length > 0) {
                return data.data as CannlyticsStrainData;
            }
        } catch {
            // Silently fail
        }
        return null;
    }

    private getNameVariations(name: string): string[] {
        const variations: string[] = [];

        // Hebrew to English mappings (comprehensive)
        const hebrewMap = HEBREW_STRAIN_NAMES;

        if (hebrewMap[name]) {
            variations.push(hebrewMap[name]);
        }

        // Try English name directly (if it looks like English)
        if (/^[a-zA-Z\s'0-9]+$/.test(name)) {
            variations.push(name);
        }

        // Try with common suffixes
        const suffixes = ['Kush', 'OG', 'Cookies', 'Cake', 'Haze', 'Diesel', 'Runtz'];
        for (const suffix of suffixes) {
            if (!name.includes(suffix)) {
                variations.push(`${name} ${suffix}`);
            }
        }

        return variations;
    }

    formatForEnrichment(data: CannlyticsStrainData): string {
        const parts: string[] = [];

        if (data.total_thc) {
            parts.push(`THC: ${data.total_thc}%`);
        }
        if (data.total_cbd) {
            parts.push(`CBD: ${data.total_cbd}%`);
        }

        const terpenes: string[] = [];
        if (data.beta_myrcene) terpenes.push(`Myrcene (${(data.beta_myrcene).toFixed(2)}%)`);
        if (data.d_limonene) terpenes.push(`Limonene (${(data.d_limonene).toFixed(2)}%)`);
        if (data.beta_caryophyllene) terpenes.push(`Caryophyllene (${(data.beta_caryophyllene).toFixed(2)}%)`);
        if (data.alpha_pinene) terpenes.push(`Pinene (${(data.alpha_pinene).toFixed(2)}%)`);
        if (data.linalool) terpenes.push(`Linalool (${(data.linalool).toFixed(2)}%)`);
        if (data.terpinolene) terpenes.push(`Terpinolene (${(data.terpinolene).toFixed(2)}%)`);
        if (data.humulene) terpenes.push(`Humulene (${(data.humulene).toFixed(2)}%)`);
        if (data.ocimene) terpenes.push(`Ocimene (${(data.ocimene).toFixed(2)}%)`);

        if (terpenes.length > 0) {
            parts.push(`Terpenes: ${terpenes.join(', ')}`);
        }

        if (data.potential_aromas?.length) {
            parts.push(`Aromas: ${data.potential_aromas.join(', ')}`);
        }

        return parts.join('\n');
    }

    getTopTerpenes(data: CannlyticsStrainData, count = 3): string {
        const terpeneMap: Array<{ name: string; value: number }> = [];

        if (data.beta_myrcene) terpeneMap.push({ name: 'Myrcene', value: data.beta_myrcene });
        if (data.d_limonene) terpeneMap.push({ name: 'Limonene', value: data.d_limonene });
        if (data.beta_caryophyllene) terpeneMap.push({ name: 'Caryophyllene', value: data.beta_caryophyllene });
        if (data.alpha_pinene) terpeneMap.push({ name: 'Pinene', value: data.alpha_pinene });
        if (data.linalool) terpeneMap.push({ name: 'Linalool', value: data.linalool });
        if (data.terpinolene) terpeneMap.push({ name: 'Terpinolene', value: data.terpinolene });
        if (data.humulene) terpeneMap.push({ name: 'Humulene', value: data.humulene });

        return terpeneMap
            .sort((a, b) => b.value - a.value)
            .slice(0, count)
            .map(t => t.name)
            .join(', ');
    }

    getEnglishName(hebrewName: string): string | null {
        const hebrewMap = HEBREW_STRAIN_NAMES;
        return hebrewMap[hebrewName] || null;
    }
}
