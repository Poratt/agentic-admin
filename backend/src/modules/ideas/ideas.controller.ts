import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Sse,
  HttpCode,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { IdeasService } from './ideas.service';
import { GenerateIdeasDto } from './dto/generate-ideas.dto';
import { GenerateIdeasResponseDto } from './dto/idea-result.dto';
import { GenerateIdeasResponse } from './interfaces/idea.interface';
import { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import { SetFavoriteDto } from './dto/set-favorite.dto';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { AdminGuard } from '../../core/guards/admin.guard';
import { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { IdeasTasksService } from './ideas-tasks.service';

@ApiTags('ideas')
@Controller('ideas')
export class IdeasController {
  private readonly logger = new Logger(IdeasController.name);

  constructor(
    private readonly ideasService: IdeasService,
    private readonly ideasTasksService: IdeasTasksService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  @ApiOperation({
    summary: 'Generate startup ideas',
    summaryHe: 'מגבש ומחולל רעיונות סטארטאפ חדשניים ופורצי דרך',
    toolIcon: 'ph-lightbulb',
  } as CustomApiOperationOptions)
  async generate(@Req() req: RequestWithUser, @Body() dto: GenerateIdeasDto): Promise<GenerateIdeasResponse> {
    try {
      const userId = req.user?.sub;
      const result = await this.ideasService.generateIdeas(dto.domain, dto.count ?? 5, undefined, userId, dto.provider, dto.model);
      // Best-effort persistence: never fail the request over a save error.
      if (userId != null && result.result?.length) {
        this.ideasService
          .saveGeneration(userId, dto.domain, dto.provider ?? null, dto.model ?? null, result)
          .catch((saveErr) => {
            this.logger?.error?.('Failed to persist idea generation', saveErr);
          });
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'BadRequestException') {
        throw error;
      }
      throw new ServiceUnavailableException('שירות יצירת הרעיונות אינו זמין כרגע');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('generate/stream')
  @Sse()
  @ApiOperation({
    summary: 'Generate business ideas with real-time progress (SSE)',
    summaryHe: 'מחולל רעיונות עסקיים מעולים עם חיווי התקדמות חי בסטרמינג',
    toolIcon: 'ph-lightbulb',
    description:
      'Same flow as POST /ideas/generate but streams progress events (phase 0 → 1 → 2) over Server-Sent Events. Final event carries the full GenerateIdeasResponse. Use this when the UI needs a real progress bar.',
  } as CustomApiOperationOptions)
  @ApiResponse({ status: 200, description: 'SSE stream of progress events' })
  stream(@Req() req: RequestWithUser, @Query() dto: GenerateIdeasDto): Observable<MessageEvent> {
    const userId = req.user?.sub;
    const count = dto.count ?? 5;
    return new Observable<MessageEvent>((subscriber: Subscriber<MessageEvent>) => {
      this.ideasService
        .generateIdeas(
          dto.domain,
          count,
          (event) => {
            subscriber.next({ data: JSON.stringify(event) });
            // Best-effort persistence on the final event — never breaks the stream.
            if (event.phase === 'done' && userId != null && event.result?.result?.length) {
              this.ideasService
                .saveGeneration(
                  userId,
                  dto.domain,
                  dto.provider ?? null,
                  dto.model ?? null,
                  event.result,
                )
                .catch((saveErr) => {
                  this.logger.error('Failed to persist streamed idea generation', saveErr);
                });
            }
          },
          userId,
          dto.provider,
          dto.model,
        )
        .then(() => subscriber.complete())
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Unknown error';
          subscriber.next({
            data: JSON.stringify({ phase: 'error', message }),
          });
          subscriber.complete();
        });
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiOperation({
    summary: 'List saved idea sessions for the authenticated user',
    summaryHe: 'מציג את רשימת שמירות הרעיונות שלך, מסודרת מהחדשה לישנה',
    toolIcon: 'ph-lightbulb',
    description:
      'Returns the authenticated user\'s saved idea-generation sessions ordered by creation time (newest first). ' +
      'Use ?nightly=true to limit to nightly cron runs, or ?favorites=true to limit to sessions containing a favorited idea.',
  } as CustomApiOperationOptions)
  @ApiQuery({ name: 'nightly', required: false, type: Boolean, description: 'When true, return only nightly sessions.' })
  @ApiQuery({ name: 'favorites', required: false, type: Boolean, description: 'When true, return only sessions with a favorited idea.' })
  @ApiOkResponse({ description: 'Saved idea sessions retrieved successfully.', type: [GenerateIdeasResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async listSessions(@Req() req: RequestWithUser, @Query() dto: ListSessionsQueryDto) {
    if (!req.user) throw new UnauthorizedException();
    const sessions = await this.ideasService.listSessions(req.user.sub, {
      nightly: dto.nightly,
      favorites: dto.favorites,
    });
    return {
      success: true,
      message: `נטענו ${sessions.length} שמירות`,
      result: sessions,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:id')
  @ApiOperation({
    summary: 'Get a saved idea session with its ideas',
    summaryHe: 'מציג שמירת רעיונות אחת עם כל הרעיונות שנוצרו בה',
    toolIcon: 'ph-lightbulb',
    description: 'Returns one saved session owned by the authenticated user, including all of its ideas.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric saved-idea session id.' })
  @ApiOkResponse({ description: 'Session with ideas retrieved successfully.' })
  @ApiForbiddenResponse({ description: 'The session does not exist or does not belong to the authenticated user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async getSession(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    if (!req.user) throw new UnauthorizedException();
    const session = await this.ideasService.getSession(req.user.sub, id);
    return {
      success: true,
      message: 'השמירה נטענה בהצלחה',
      result: session,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a saved idea session',
    summaryHe: 'מוחק שמירת רעיונות אחת לצמיתות',
    toolIcon: 'ph-trash',
    description: 'Permanently deletes a saved session owned by the authenticated user. All of its ideas are cascade-deleted.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric saved-idea session id to delete.' })
  @ApiResponse({ status: 204, description: 'Session deleted successfully.' })
  @ApiForbiddenResponse({ description: 'The session does not exist or does not belong to the authenticated user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async deleteSession(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    if (!req.user) throw new UnauthorizedException();
    await this.ideasService.deleteSession(req.user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('ideas/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Set the favorite flag on a saved idea',
    summaryHe: 'מסמן או מסיר רעיון שמור כמועדף',
    toolIcon: 'ph-star',
    description: 'Toggles the isFavorite flag on a single saved idea owned by the authenticated user.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric saved-idea id.' })
  @ApiResponse({ status: 204, description: 'Favorite flag updated successfully.' })
  @ApiForbiddenResponse({ description: 'The idea does not exist or does not belong to the authenticated user.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async setFavorite(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetFavoriteDto,
  ) {
    if (!req.user) throw new UnauthorizedException();
    await this.ideasService.setFavorite(req.user.sub, id, dto.isFavorite);
  }

  @UseGuards(JwtAuthGuard)
  @Get('nightly/unread-count')
  @ApiOperation({
    summary: 'Count unread nightly idea sessions',
    summaryHe: 'מחזיר כמה שמירות ליליות טרם נקראו',
    toolIcon: 'ph-moon',
    description: 'Returns the number of nightly cron sessions owned by the authenticated user that have not been read yet. Drives the "new ideas this morning" banner.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Unread nightly session count.', type: Number })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async nightlyUnreadCount(@Req() req: RequestWithUser) {
    if (!req.user) throw new UnauthorizedException();
    const count = await this.ideasService.unreadNightlyCount(req.user.sub);
    return {
      success: true,
      message: `${count} שמירות ליליות שלא נקראו`,
      result: count,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('nightly/mark-read')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Mark all nightly sessions as read',
    summaryHe: 'מסמן את כל שמירות הלילה כנקראות',
    toolIcon: 'ph-check-circle',
    description: 'Clears the unread flag on all of the authenticated user\'s nightly sessions.',
  } as CustomApiOperationOptions)
  @ApiResponse({ status: 204, description: 'Nightly sessions marked as read.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async markNightlyRead(@Req() req: RequestWithUser) {
    if (!req.user) throw new UnauthorizedException();
    await this.ideasService.markNightlyRead(req.user.sub);
  }

  @UseGuards(AdminGuard)
  @Post('nightly/trigger')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Manually trigger nightly ideas generation',
    summaryHe: 'מריץ את מחולל הרעיונות הלילי ידנית',
    toolIcon: 'ph-lightning',
    description:
      'Triggers the same flow as the nightly cron: discovers trending topics via web search + LLM, then generates and persists ideas for each. Admin only.\n\n' +
      'Agent instructions: call this tool EXACTLY ONCE per request. It returns immediately — the run continues in the background for roughly 7-8 minutes. Do NOT re-call it to check progress (each call starts a new background run) and do NOT report the ideas as ready: the results appear in the ideas history when the run completes.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({ description: 'Nightly generation triggered successfully.' })
  @ApiForbiddenResponse({ description: 'Only admin users can trigger nightly generation.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async triggerNightly(@Req() req: RequestWithUser) {
    this.logger.log(`Nightly ideas generation triggered manually by user ${req.user?.sub}`);
    // Fire-and-forget: runNightly handles its own errors internally and logs results.
    this.ideasTasksService.runNightly();
    return { success: true, message: 'יצירת רעיונות לילית הופעלה. התוצאות יופיעו בהיסטוריה לאחר סיום.' };
  }
}
