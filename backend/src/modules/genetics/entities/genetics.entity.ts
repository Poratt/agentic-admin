import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * TypeORM entity backing the `genetics` table.
 *
 * Each row describes a single cannabis strain in the reference catalog
 * (Hebrew name, free-text description, genetic cross split into
 * `parent1` × `parent2`, country of origin, cannabis type, and a brand
 * color used by the frontend to render per-strain UI accents such as
 * hover tooltips).
 */
@Entity('genetics')
export class Genetics {
    @ApiProperty({ description: 'Auto-incremented primary key.', example: 1 })
    @PrimaryGeneratedColumn()
    id!: number;

    @ApiProperty({
        description: 'Hebrew display name. Unique — used as the lookup key from the frontend.',
        example: 'גורילה גלו',
    })
    @Column({ type: 'varchar', length: 200, unique: true })
    name!: string;

    @ApiProperty({
        description: 'Short Hebrew description of the strain. Optional.',
        example: 'זן חזק במיוחד שזכה במקומות ראשונים ב-Cannabis Cup...',
        required: false,
    })
    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @ApiProperty({
        description: 'First genetic parent (parent1) — Hebrew or English name.',
        example: 'Chem Sis',
        required: false,
    })
    @Column({ type: 'varchar', length: 200, nullable: true })
    parent1!: string | null;

    @ApiProperty({
        description: 'Second genetic parent (parent2) — Hebrew or English name.',
        example: 'Sour Dubb',
        required: false,
    })
    @Column({ type: 'varchar', length: 200, nullable: true })
    parent2!: string | null;

    @ApiProperty({
        description: 'Country / region of origin (Hebrew text).',
        example: 'ארה"ב',
        required: false,
    })
    @Column({ type: 'varchar', length: 200, nullable: true })
    origin!: string | null;

    @ApiProperty({
        description: 'Cannabis type — היברידי / סאטיבה / אינדיקה.',
        enum: ['היברידי', 'סאטיבה', 'אינדיקה'],
        example: 'היברידי',
        required: false,
    })
    @Column({ type: 'varchar', length: 20, nullable: true })
    type!: string | null;

    @ApiProperty({
        description: 'THC percentage range (e.g. "15-21%").',
        example: '15-21%',
        required: false,
    })
    @Column({ type: 'varchar', length: 50, nullable: true })
    thcRange!: string | null;

    @ApiProperty({
        description: 'Comma-separated list of dominant terpenes.',
        example: 'Caryophyllene, Limonene, Myrcene',
        required: false,
    })
    @Column({ type: 'varchar', length: 500, nullable: true })
    terpenes!: string | null;

    @ApiProperty({
        description: 'Comma-separated list of effect labels in Hebrew.',
        example: 'מרגיעה, מרדימה, משככת כאבים',
        required: false,
    })
    @Column({ type: 'varchar', length: 500, nullable: true })
    effects!: string | null;

    @ApiProperty({
        description:
            'Hex accent color used by the frontend to render per-strain UI accents (dots, tag borders, etc.).',
        example: '#228B22',
    })
    @Column({ type: 'varchar', length: 9 })
    color!: string;

    @ApiProperty({
        description:
            'WCAG AA-safe variant of `color` for dark theme backgrounds (#080D1A).',
        example: '#228B22',
    })
    @Column({ type: 'varchar', length: 7, default: '#808080' })
    colorDark!: string;

    @ApiProperty({
        description:
            'WCAG AA-safe variant of `color` for light theme backgrounds (#F0F4F8).',
        example: '#1B5E20',
    })
    @Column({ type: 'varchar', length: 7, default: '#808080' })
    colorLight!: string;

    @ApiProperty({
        description: 'English strain name — learned from the LLM on first translation, persisted for reuse.',
        example: 'Gorilla Glue',
        required: false,
    })
    @Column({ type: 'varchar', length: 200, nullable: true })
    englishName!: string | null;
}
