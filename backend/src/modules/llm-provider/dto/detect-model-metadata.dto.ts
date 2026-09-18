import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DetectModelMetadataDto {
  @ApiProperty({ description: 'Model key to look up in the public OpenRouter catalog', example: 'deepseek/deepseek-v4-flash' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  key!: string;

  @ApiPropertyOptional({
    description: 'Provider key — used as a vendor hint to disambiguate bare-name matches (e.g. xkiro)',
    example: 'xkiro',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  providerKey?: string;
}