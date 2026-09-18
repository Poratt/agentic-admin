import { formatContext, formatPricePerM, hasModelSpecs, modelPickerHint, priceCell } from './model-format';
import { LlmModel } from '../services/llm-provider.service';

function model(partial: Partial<LlmModel>): LlmModel {
    return {
        id: 1,
        key: 'deepseek/deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        active: true,
        sortOrder: 0,
        capability: 'text',
        providerId: 1,
        createdAt: '',
        updatedAt: '',
        ...partial,
    };
}

describe('formatContext', () => {
    it('renders kilo tokens below 1M', () => {
        expect(formatContext(8192)).toBe('8K');
        expect(formatContext(32768)).toBe('32K');
        expect(formatContext(131072)).toBe('128K');
    });

    it('renders mega tokens at and above 1M', () => {
        expect(formatContext(1048576)).toBe('1M');
        expect(formatContext(1310720)).toBe('1.3M');
    });

    it('keeps small numbers literal and unknowns as an em dash', () => {
        expect(formatContext(512)).toBe('512');
        expect(formatContext(null)).toBe('—');
        expect(formatContext(undefined)).toBe('—');
    });
});

describe('formatPricePerM', () => {
    it('formats dollars per 1M tokens with two decimals', () => {
        expect(formatPricePerM(0.14)).toBe('$0.14');
        expect(formatPricePerM(2)).toBe('$2.00');
    });

    it('renders unknowns as an em dash, not $0.00', () => {
        expect(formatPricePerM(null)).toBe('—');
        expect(formatPricePerM(undefined)).toBe('—');
    });
});

describe('hasModelSpecs', () => {
    it('is false for a model with no enriched fields', () => {
        expect(hasModelSpecs(model({}))).toBe(false);
    });

    it('is true once any spec is present', () => {
        expect(hasModelSpecs(model({ contextLength: 131072 }))).toBe(true);
        expect(hasModelSpecs(model({ freeTier: true }))).toBe(true);
    });
});

describe('priceCell', () => {
    it('shows Free for a free model (flag or both prices 0)', () => {
        expect(priceCell(model({ freeTier: true }))).toBe('Free');
        expect(priceCell(model({ promptPricePerM: 0, completionPricePerM: 0 }))).toBe('Free');
    });

    it('shows the prompt price for a paid model', () => {
        expect(priceCell(model({ promptPricePerM: 2, completionPricePerM: 6 }))).toBe('$2.00');
    });

    it('renders unknowns as an em dash', () => {
        expect(priceCell(model({}))).toBe('—');
    });
});

describe('modelPickerHint', () => {
    it('formats the chat hint for a free model', () => {
        expect(modelPickerHint(model({ contextLength: 131072, freeTier: true }))).toBe('128K · Free');
    });

    it('formats the chat hint for a paid model (prompt price per 1M)', () => {
        expect(modelPickerHint(model({ contextLength: 65536, promptPricePerM: 0.14 }))).toBe('64K · $0.14/M');
    });

    it('is null when the model has no specs', () => {
        expect(modelPickerHint(model({}))).toBeNull();
    });
});
