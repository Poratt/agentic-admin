import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateLlmModelDto {
  @ApiProperty({ description: 'Unique identifier key for the model', example: 'gpt-4o' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'Display name of the model', example: 'GPT-4o' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ description: 'Status indicating if the model is active', default: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Sort hierarchy order', default: 0 })
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Model capability used to route requests (text chat, image, or video generation)',
    default: 'text',
    enum: ['text', 'image', 'video'],
  })
  @IsIn(['text', 'image', 'video'])
  @IsOptional()
  capability?: 'text' | 'image' | 'video';

  @ApiPropertyOptional({ description: 'Context window length in tokens (enriched via OpenRouter or manual)', example: 131072 })
  @IsNumber()
  @IsOptional()
  contextLength?: number;

  @ApiPropertyOptional({ description: 'Maximum output tokens', example: 131072 })
  @IsNumber()
  @IsOptional()
  maxOutputTokens?: number;

  @ApiPropertyOptional({ description: 'Prompt price per 1M tokens (USD)', example: 0.14 })
  @IsNumber()
  @IsOptional()
  promptPricePerM?: number;

  @ApiPropertyOptional({ description: 'Completion price per 1M tokens (USD)', example: 0.28 })
  @IsNumber()
  @IsOptional()
  completionPricePerM?: number;

  @ApiPropertyOptional({ description: 'Free tier flag — when true, prices are treated as zero', default: false })
  @IsBoolean()
  @IsOptional()
  freeTier?: boolean;

  @ApiPropertyOptional({ description: 'Metadata provenance, e.g. openrouter:t1 (T1 Exact) / openrouter:t2 (T2 Bare)', example: 'openrouter:t1' })
  @IsString()
  @IsOptional()
  metadataSource?: string;
}