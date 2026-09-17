import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { SystemService } from './system.service';

@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) { }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get system status and metrics',
    summaryHe: 'מציג את מצב המערכת ומדדי הפעילות',
    toolIcon: 'ph-gauge',
    description: 'Returns activity metrics and current runtime status parameters.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'System status metrics payload retrieved successfully.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  getStatus() {
    return this.systemService.getSystemStatus();
  }
}
