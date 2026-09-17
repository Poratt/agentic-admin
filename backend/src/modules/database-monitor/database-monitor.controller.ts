import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { DatabaseMonitorService } from './database-monitor.service';

@ApiTags('database-monitor')
@ApiBearerAuth()
@Controller('database-monitor')
export class DatabaseMonitorController {
  constructor(private readonly databaseMonitorService: DatabaseMonitorService) {}

  @Get('storage')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get database storage usage by table',
    summaryHe: 'מציג את השימוש באחסון ומספר השורות בטבלאות',
    toolIcon: 'ph-database',
    description: 'Returns row counts and storage sizes for all tables in the database.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'Database storage summary retrieved successfully.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  getStorage() {
    return this.databaseMonitorService.getStorageSummary();
  }
}
