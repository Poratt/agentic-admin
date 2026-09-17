import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { ConvertQueryDto } from './dto/convert-query.dto';
import { CurrencyConversionResultResponseDto } from './dto/currency-conversion-result-response.dto';
import { CurrencyRatesResultResponseDto } from './dto/currency-rates-result-response.dto';
import { RateQueryDto } from './dto/rate-query.dto';
import { CurrencyService } from './currency.service';

@ApiTags('currency')
@ApiBearerAuth()
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) { }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get exchange rates for a base currency',
    summaryHe: 'מציג שערי חליפין מעודכנים על בסיס מטבע נבחר',
    toolIcon: 'ph-currency-circle-dollar',
    description: 'Retrieves current exchange rates from the external exchange-rate provider.',
  } as CustomApiOperationOptions)
  @ApiQuery({
    name: 'base',
    required: false,
    type: String,
    description: 'Three-letter ISO currency code to use as the exchange-rate base. Defaults to ILS.',
  })
  @ApiOkResponse({
    description: 'Currency rates retrieved successfully.',
    type: CurrencyRatesResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'DTO validation failed.' })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  getRates(@Query() query: RateQueryDto) {
    return this.currencyService.getRates(query.base);
  }

  @Get('convert')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Convert currency amount',
    summaryHe: 'ממיר סכומי כסף בין שני מטבעות לפי השער היציג העדכני',
    toolIcon: 'ph-currency-circle-dollar',
    description: 'Converts a positive amount between two supported currencies using current exchange rates.',
  } as CustomApiOperationOptions)
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    description: 'Three-letter ISO source currency code.',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    description: 'Three-letter ISO target currency code.',
  })
  @ApiQuery({
    name: 'amount',
    required: true,
    type: Number,
    description: 'Positive numeric amount to convert.',
  })
  @ApiOkResponse({
    description: 'Currency amount converted successfully.',
    type: CurrencyConversionResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'DTO validation failed.' })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  convert(@Query() query: ConvertQueryDto) {
    return this.currencyService.convert(query.from, query.to, query.amount);
  }
}
