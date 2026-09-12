import { IsString, IsNotEmpty, MaxLength, IsHexColor, IsArray, IsOptional, MinLength, IsIn, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new genetics record.
 *
 * The `name` must be unique and will be used as the lookup key from the frontend.
 * `color` must be a valid hex color string (e.g., `#228B22`).
 * `type` must be one of the Hebrew values for: hybrid | sativa | indica
 * `parent1`, `parent2`, `origin`, `description` are optional.
 */
export class GeneticsCreateDto {
    @ApiProperty({
        description: 'Hebrew display name. Must be unique. Used as the lookup key from the frontend.',
        example: 'גורילה גלו',
    })
    @IsString()
    @IsNotEmpty({ message: 'Name is required' })
    @MaxLength(100, { message: 'Name must not exceed 100 characters' })
    @MinLength(1, { message: 'Name must not be empty' })
    name!: string;

    @ApiPropertyOptional({
        description: 'Short Hebrew description of the strain.',
        example: 'זן חזק במיוחד שזכה במקומות ראשונים ב-Cannabis Cup...',
    })
    @IsOptional()
    @IsString()
    @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
    description?: string;

    @ApiPropertyOptional({
        description: 'First genetic parent (parent1) — Hebrew or English name.',
        example: 'Chem Sis',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255, { message: 'Parent1 must not exceed 255 characters' })
    parent1?: string;

    @ApiPropertyOptional({
        description: 'Second genetic parent (parent2) — Hebrew or English name.',
        example: 'Sour Dubb',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255, { message: 'Parent2 must not exceed 255 characters' })
    parent2?: string;

    @ApiPropertyOptional({
        description: 'Country / region of origin (Hebrew text).',
        example: 'ארה"ב',
    })
    @IsOptional()
    @IsString()
    @MaxLength(100, { message: 'Origin must not exceed 100 characters' })
    origin?: string;

    @ApiPropertyOptional({
        description: 'Cannabis type. Must be one of: היברידי, סאטיבה, אינדיקה.',
        enum: ['היברידי', 'סאטיבה', 'אינדיקה'],
        example: 'היברידי',
    })
    @IsOptional()
    @IsString()
    @IsIn(['היברידי', 'סאטיבה', 'אינדיקה'], { message: 'Type must be one of: היברידי, סאטיבה, אינדיקה' })
    type?: string;

    @ApiProperty({
        description:
            'Hex accent color used by the frontend to render per-strain UI accents (dots, tag borders, etc.). Must be a valid hex color starting with #.',
        example: '#228B22',
    })
    @IsString()
    @IsNotEmpty({ message: 'Color is required' })
    @IsHexColor({ message: 'Color must be a valid hex color (e.g., #228B22)' })
    color!: string;
}