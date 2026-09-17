import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { WebSearchQueryDto } from './dto/web-search-query.dto';
import { WebSearchService } from './web-search.service';

@ApiTags('web-search')
@ApiBearerAuth()
@Controller('web-search')
export class WebSearchController {
  constructor(private readonly webSearchService: WebSearchService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Search the web for current information',
    summaryHe: 'מחפש מידע עדכני באינטרנט לאימות ומחקר',
    toolIcon: 'ph-magnifying-glass',
    description:
      'Calls the SearXNG instance to perform a real-time web search. Returns structured results with titles, URLs, content snippets, and an optional answer.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Search results retrieved successfully.' })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  search(@Query() query: WebSearchQueryDto) {
    return this.webSearchService.search(query.query);
  }
}
