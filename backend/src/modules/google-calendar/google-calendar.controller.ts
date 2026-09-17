import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Query,
    Req,
    Res,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiCreatedResponse,
    ApiBadRequestResponse,
    ApiUnauthorizedResponse,
    ApiBody,
    ApiQuery,
    ApiBearerAuth,
} from '@nestjs/swagger';

import { GoogleCalendarService } from './google-calendar.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { DeleteEventDto } from './dto/delete-event.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';

const STATE_COOKIE = 'gcal_state';
const STATE_COOKIE_TTL_MS = 10 * 60 * 1000; // must match the service's STATE_TTL_MS

/**
 * Controller for Google Calendar integration.
 *
 * Base path: /calendar
 *
 * Endpoints summary:
 *
 * | Method | Path              | Guard                  | Description                                  |
 * | ------ | ----------------- | ---------------------- | -------------------------------------------- |
 * | GET    | /calendar/auth    | JwtAuthGuard           | Get Google OAuth consent URL                 |
 * | GET    | /calendar/callback| CSRF state + cookie    | Handle Google OAuth callback                 |
 * | GET    | /calendar/events  | JwtAuthGuard           | List upcoming calendar events                |
 * | POST   | /calendar/events  | JwtAuthGuard           | Create a new calendar event                  |
 * | PATCH  | /calendar/events  | JwtAuthGuard           | Update/reschedule a calendar event           |
 * | DELETE | /calendar/events  | JwtAuthGuard           | Delete a calendar event                      |
 *
 * Security (C4):
 * - Every endpoint except `callback` requires a valid JWT; the user's Google
 *   refresh token is resolved server-side from the JWT identity and is never
 *   accepted from, or returned to, the client.
 * - `callback` is a browser redirect from Google (no JWT header can be sent),
 *   so it is protected by the OAuth `state` parameter: it must match both the
 *   httpOnly cookie set by `/auth` and a non-expired DB row bound to the user.
 * - Event ownership is enforced structurally: events are only ever accessed
 *   through the token stored for the authenticated userId.
 */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class GoogleCalendarController {
    constructor(private calendarService: GoogleCalendarService) { }

    /**
     * Get the Google OAuth2 consent URL.
     *
     * Starts the OAuth flow for the authenticated user. Sets a short-lived
     * httpOnly `gcal_state` cookie (CSRF protection for the callback).
     *
     * @returns Object containing the OAuth consent URL.
     */
    @Get('auth')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get Google OAuth URL',
        summaryHe: 'מקבל קישור לאישור חיבור ל-Google',
        toolIcon: 'ph-link',
        description:
            'Returns a URL that the authenticated user must visit to grant the application access to their Google Calendar. After granting consent, Google redirects to /calendar/callback with an authorization code and state.\n\n' +
            'Agent instructions: call this tool EXACTLY ONCE. Present the returned `url` to the user as a clickable link and then STOP — do not call this tool again, do not visit or modify the URL yourself. The user must click the link and complete the Google consent screen; the flow finishes when Google redirects back to /calendar/callback.',
    } as CustomApiOperationOptions)
    @ApiOkResponse({
        description: 'OAuth consent URL returned successfully.',
    })
    @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid.' })
    async auth(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
        if (!req.user) {
            throw new UnauthorizedException();
        }
        const { url, state } = await this.calendarService.getAuthUrl(req.user.sub);
        res.cookie(STATE_COOKIE, state, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: STATE_COOKIE_TTL_MS,
            path: '/calendar',
        });
        return { url };
    }

    /**
     * Handle the Google OAuth2 callback.
     *
     * Google redirects the browser here with `code` and `state` after the user
     * grants consent. This is a browser redirect, not a JSON API call, so it is
     * intentionally NOT protected by JwtAuthGuard — instead the `state` must
     * match the httpOnly cookie set by `/auth` and a non-expired DB row.
     *
     * The refresh token is stored server-side (encrypted). The response is a
     * plain success object and never contains access_token / refresh_token.
     *
     * @param code The authorization code from Google.
     * @param state The CSRF state echoed back by Google.
     * @returns A minimal success object.
     */
    @Get('callback')
    @ApiOperation({
        summary: 'Handle Google OAuth callback',
        summaryHe: 'מטפל בחזרה מ-Google לאחר אישור הגישה',
        toolIcon: 'ph-arrow-clockwise',
        description:
            'Handles the OAuth callback from Google. Validates the CSRF state, exchanges the authorization code for tokens, and stores the refresh token server-side, encrypted. Typically called automatically by Google after user consent.\n\n' +
            'Agent instructions: NEVER call this tool yourself. It is the external redirect target — after the user completes Google\'s consent screen, Google redirects their browser here with the code and state. The agent has no browser session and no valid code/state to pass, so calling it will always fail. Your job ends at presenting the /calendar/auth URL to the user and waiting; afterwards, verify the connection by calling GET /calendar/events.',
    } as CustomApiOperationOptions)
    @ApiQuery({
        name: 'code',
        type: String,
        description: 'Authorization code received from Google after user consent.',
        example: '4/0Aae7Xt8...',
    })
    @ApiQuery({
        name: 'state',
        type: String,
        description: 'CSRF state value issued by /calendar/auth (also sent as the gcal_state cookie).',
        example: 'a1b2c3...',
    })
    @ApiOkResponse({
        description: 'Calendar connected. Tokens are stored server-side and never returned.',
    })
    @ApiBadRequestResponse({ description: 'Missing code, invalid/expired state, or Google rejected the code.' })
    async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request) {
        const cookieState = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
        return this.calendarService.handleCallback(code, state, cookieState);
    }

    /**
     * List upcoming calendar events.
     *
     * Returns events from the start of today up to 7 days ahead, using the
     * refresh token stored server-side for the authenticated user.
     *
     * @returns Array of calendar events.
     */
    @Get('events')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'List upcoming calendar events',
        summaryHe: 'מציג את האירועים העתידיים ביומן',
        toolIcon: 'ph-calendar',
        description:
            'Returns upcoming events from the authenticated user\'s primary Google Calendar. ' +
            'If a date is provided (YYYY-MM-DD), returns events for that specific day. ' +
            'If a search query (q) is provided, searches event titles, descriptions, and locations. ' +
            'Otherwise returns events from today up to 7 days ahead. Maximum 20 events returned.',
    } as CustomApiOperationOptions)
    @ApiQuery({
        name: 'date',
        type: String,
        required: false,
        description: 'Optional date in YYYY-MM-DD format. When provided, returns events for that specific day.',
        example: '2026-08-31',
    })
    @ApiQuery({
        name: 'q',
        type: String,
        required: false,
        description: 'Optional text search query. Searches event title, description, and location. Example: "תג נכה", "רופא", "meeting".',
        example: 'תג נכה',
    })
    @ApiOkResponse({
        description: 'Events fetched successfully. Returns an array of calendar events (may be empty).',
    })
    @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid.' })
    @ApiBadRequestResponse({ description: 'Calendar not connected. Complete the OAuth flow first via /calendar/auth.' })
    async events(@Req() req: RequestWithUser, @Query('date') date?: string, @Query('q') q?: string) {
        if (!req.user) {
            throw new UnauthorizedException();
        }
        const items = await this.calendarService.listEvents(req.user.sub, date, q);
        return {
            success: true,
            message: `נטענו ${items.length} אירועים`,
            result: items,
        } satisfies ServiceResultContainer<unknown>;
    }

    /**
     * Create a new calendar event.
     *
     * @param dto Event creation data including summary, start/end times.
     * @returns The created event details.
     */
    @Post('events')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Create a new calendar event',
        summaryHe: 'יוצר אירוע ביומן',
        toolIcon: 'ph-calendar-plus',
        description:
            'Creates a new event in the authenticated user\'s primary Google Calendar. Requires summary, start time, and end time. Optional fields: description, location. Times should be in ISO 8601 format.',
    } as CustomApiOperationOptions)
    @ApiBody({
        type: CreateEventDto,
        description: 'Event creation payload. summary, startTime, and endTime are required.',
        examples: {
            basic: {
                summary: 'Basic meeting',
                value: {
                    summary: 'פגישת עבודה',
                    startTime: '2026-08-03T20:00:00+03:00',
                    endTime: '2026-08-03T21:00:00+03:00',
                    description: 'פגישת סיכום חודשית',
                    location: 'משרד ראשי',
                },
            },
        },
    })
    @ApiCreatedResponse({
        description: 'Event created successfully. Returns the created event details.',
    })
    @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid.' })
    @ApiBadRequestResponse({ description: 'Missing required fields or calendar not connected.' })
    async createEvent(@Req() req: RequestWithUser, @Body() dto: CreateEventDto) {
        if (!req.user) {
            throw new UnauthorizedException();
        }
        const created = await this.calendarService.createEvent(
            req.user.sub,
            dto.summary,
            dto.startTime,
            dto.endTime,
            dto.description,
            dto.location,
        );
        return {
            success: true,
            message: 'האירוע נוצר בהצלחה',
            result: created,
        } satisfies ServiceResultContainer<unknown>;
    }

    /**
     * Delete a calendar event.
     *
     * @param dto Event deletion data including eventId.
     * @returns Success confirmation.
     */
    @Delete('events')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Delete a calendar event',
        summaryHe: 'מוחק אירוע מהיומן',
        toolIcon: 'ph-trash',
        description:
            'Deletes an event from the authenticated user\'s primary Google Calendar by its event ID. Use GET /calendar/events first to retrieve the eventId of the event to delete.',
    } as CustomApiOperationOptions)
    @ApiBody({
        type: DeleteEventDto,
        description: 'Event deletion payload. Requires eventId.',
        examples: {
            basic: {
                summary: 'Delete an event',
                value: {
                    eventId: 'abc123def456...',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Event deleted successfully.',
    })
    @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid.' })
    @ApiBadRequestResponse({ description: 'Missing eventId or calendar not connected.' })
    async deleteEvent(@Req() req: RequestWithUser, @Body() dto: DeleteEventDto) {
        if (!req.user) {
            throw new UnauthorizedException();
        }
        return this.calendarService.deleteEvent(req.user.sub, dto.eventId);
    }

    /**
     * Update/reschedule a calendar event.
     *
     * @param dto Event update data including eventId and optional new values.
     * @returns The updated event details.
     */
    @Patch('events')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Update/reschedule a calendar event',
        summaryHe: 'מעדכן או מזיז אירוע ביומן',
        toolIcon: 'ph-pencil-simple',
        description:
            'Updates an existing event in the authenticated user\'s primary Google Calendar. All fields except eventId are optional — only provided fields are modified. Use GET /calendar/events first to retrieve the eventId.',
    } as CustomApiOperationOptions)
    @ApiBody({
        type: UpdateEventDto,
        description: 'Event update payload. Only provided fields will be updated.',
        examples: {
            reschedule: {
                summary: 'Reschedule event',
                value: {
                    eventId: 'abc123def456...',
                    startTime: '2026-08-04T15:00:00+03:00',
                    endTime: '2026-08-04T16:00:00+03:00',
                },
            },
            rename: {
                summary: 'Rename event',
                value: {
                    eventId: 'abc123def456...',
                    summary: 'פגישת עבודה - שם חדש',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Event updated successfully. Returns the updated event details.',
    })
    @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid.' })
    @ApiBadRequestResponse({ description: 'Missing eventId or calendar not connected.' })
    async updateEvent(@Req() req: RequestWithUser, @Body() dto: UpdateEventDto) {
        if (!req.user) {
            throw new UnauthorizedException();
        }
        const updated = await this.calendarService.updateEvent(
            req.user.sub,
            dto.eventId,
            dto.summary,
            dto.startTime,
            dto.endTime,
            dto.description,
            dto.location,
        );
        return {
            success: true,
            message: 'האירוע עודכן בהצלחה',
            result: updated,
        } satisfies ServiceResultContainer<unknown>;
    }
}
