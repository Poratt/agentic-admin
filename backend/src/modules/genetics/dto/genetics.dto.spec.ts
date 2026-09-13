import { GeneticsDto, toGeneticsDto } from './genetics.dto';
import { Genetics } from '../entities/genetics.entity';

const DTO_KEYS = [
  'id',
  'name',
  'englishName',
  'description',
  'parent1',
  'parent2',
  'origin',
  'type',
  'thcRange',
  'terpenes',
  'effects',
  'color',
  'colorDark',
  'colorLight',
].sort();

describe('toGeneticsDto — DTO mapping coverage', () => {
  const MOCK_ENTITY: Genetics = {
    id: 1,
    name: 'טסט',
    englishName: null,
    description: 'test',
    parent1: 'A',
    parent2: 'B',
    origin: 'ארה"ב',
    type: 'היברידי',
    thcRange: '15-21%',
    terpenes: 'Myrcene, Limonene',
    effects: 'מרגיעה, מרדימה',
    color: '#000000',
    colorDark: '#000000',
    colorLight: '#000000',
  };

  it('returns all DTO fields and nothing extra', () => {
    const result = toGeneticsDto(MOCK_ENTITY)!;
    const resultKeys = Object.keys(result).sort();

    expect(resultKeys).toEqual(DTO_KEYS);
  });

  it('maps every DTO field from the entity', () => {
    const result = toGeneticsDto(MOCK_ENTITY)!;

    for (const key of DTO_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  it('handles nullable fields as undefined', () => {
    const entity: Genetics = {
      ...MOCK_ENTITY,
      description: null,
      parent1: null,
      parent2: null,
      origin: null,
      type: null,
      thcRange: null,
      terpenes: null,
      effects: null,
    };
    const result = toGeneticsDto(entity)!;

    expect(result.description).toBeUndefined();
    expect(result.parent1).toBeUndefined();
    expect(result.parent2).toBeUndefined();
    expect(result.origin).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.thcRange).toBeUndefined();
    expect(result.terpenes).toBeUndefined();
    expect(result.effects).toBeUndefined();
  });

  it('returns null for null entity', () => {
    expect(toGeneticsDto(null)).toBeNull();
  });
});
