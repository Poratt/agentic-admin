import { Controller, Get, Delete, Param, Post, Patch, Body, UseGuards, Req } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiUnauthorizedResponse,
    ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { AdminGuard } from '../../core/guards/admin.guard';
import { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';
import { TerpeneService } from './terpene.service';
import { TerpeneListResultResponseDto } from './dto/terpene-list-result-response.dto';
import { TerpeneResultResponseDto } from './dto/terpene-result-response.dto';
import { TerpeneCreateDto } from './dto/terpene-create.dto';
import { TerpeneUpdateDto } from './dto/terpene-update.dto';
import { TerpeneDto } from './dto/terpene.dto';
import { Terpene } from './entities/terpene.entity';

/**
 * Controller for the terpene reference catalog.
 *
 * Base path: /terpenes
 *
 * Endpoints summary:
 *
 * | Method | Path             | Description                              | Guard         |
 * | ------ | ---------------- | ---------------------------------------- | ------------- |
 * | GET    | /terpenes        | Return every terpene in the catalog.     | JwtAuthGuard  |
 * | GET    | /terpenes/:name  | Look up a single terpene by Hebrew name. | JwtAuthGuard  |
 * | POST   | /terpenes        | Create a new terpene record.            | JwtAuthGuard  |
 * | PATCH  | /terpenes/:name  | Update an existing terpene by name.     | JwtAuthGuard  |
 */
@ApiTags('terpenes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('terpenes')
export class TerpeneController {
    constructor(private readonly terpeneService: TerpeneService) {}

    private mapToDto(entity: Terpene): TerpeneDto {
        return {
            id: entity.id,
            name: entity.name,
            englishName: entity.englishName ?? undefined,
            description: entity.description ?? undefined,
            scent: entity.scent ?? undefined,
            effects: entity.effects ?? undefined,
            color: entity.color,
            colorDark: entity.colorDark,
            colorLight: entity.colorLight,
        };
    }

    /**
     * Return every terpene in the catalog.
     *
     * Wrapped in `ServiceResultContainer<TerpeneDto[]>`. Used by the
     * `MatchingPreferencesDrawer` to populate hover-tooltip details.
     *
     * @returns ServiceResultContainer whose `result` is the alphabetically-ordered terpene list.
     * @throws 401 if the caller has no valid JWT.
     * @throws 500 on unexpected database or server failure.
     */
    @Get()
    @ApiOperation({
        summary: 'List all terpenes',
        summaryHe: 'מציג את קטלוג הטרפנים המלא המוגדר במערכת',
        toolIcon: 'ph-flower-lotus',
        description:
            'Returns the full terpene reference catalog ordered alphabetically by Hebrew name. The list is small (~17 rows) and intended to be cached client-side.',
    } as CustomApiOperationOptions)
    @ApiOkResponse({
        description:
            'Catalog fetched successfully. `result` is an array of TerpeneDto ordered alphabetically by name.',
        type: TerpeneListResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Not applicable for this endpoint.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async findAll(): Promise<TerpeneListResultResponseDto> {
        const items = await this.terpeneService.findAll();
        return {
            success: true,
            message: 'Terpenes fetched successfully',
            result: items.map(item => this.mapToDto(item)),
        };
    }

    /**
     * Look up a single terpene by its unique Hebrew name.
     *
     * @param name Hebrew name as stored in the `terpene.name` column. The match is exact.
     * @returns ServiceResultContainer whose `result` is the matching terpene, or null when no row exists.
     * @throws 401 if the caller has no valid JWT.
     * @throws 500 on unexpected database or server failure.
     */
    @Get(':name')
    @ApiOperation({
        summary: 'Get a terpene by name',
        summaryHe: 'מציג פרטים מלאים על טרפן ספציפי לפי שמו',
        toolIcon: 'ph-flower-lotus',
        description:
            'Returns the terpene whose `name` column exactly matches the supplied `:name` path parameter. Result is `null` when no record matches — this is not treated as a 404 so the frontend can render a graceful empty state.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew terpene name. Must exactly match the `terpene.name` column.',
        example: 'מירצן',
    })
    @ApiOkResponse({
        description:
            'Lookup succeeded. `result` is the matching terpene or null when no row matches the given name.',
        type: TerpeneResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Not applicable for this endpoint.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'Not applicable for this endpoint. Missing rows return `result: null`.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async findOne(@Param('name') name: string): Promise<TerpeneResultResponseDto> {
        const item = await this.terpeneService.findByName(name);
        if (!item) {
            return {
                success: true,
                message: 'No terpene matches the given name',
                result: null,
            };
        }
        return {
            success: true,
            message: 'Terpene fetched successfully',
            result: this.mapToDto(item),
        };
    }

    /**
     * Create a new terpene record.
     *
     * @param dto Data for the new terpene.
     * @returns ServiceResultContainer with the created terpene.
     * @throws 400 if validation fails.
     * @throws 401 if the caller has no valid JWT.
     * @throws 409 if a terpene with the same name already exists.
     * @throws 500 on unexpected database or server failure.
     */
    @Post()
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Create a new terpene',
        summaryHe: 'יוצר טרפן חדש בקטלוג המערכת',
        toolIcon: 'ph-flower-lotus',
        description:
            'Creates a new terpene entry in the catalog. The `name` field must be unique — attempting to create a duplicate will return a 409 Conflict. The `color` field must be a valid hex color (e.g., #66BB6A).',
    } as CustomApiOperationOptions)
    @ApiBody({
        description:
            'Terpene creation payload. `name` and `color` are required; `description`, `scent`, and `effects` are optional.',
        type: TerpeneCreateDto,
        examples: {
            example1: {
                summary: 'Typical terpene creation',
                value: { name: 'לימונן', description: 'טרפן הדרי עם ניחוח לימון', scent: 'הדרים, לימון', effects: ['מרומם', 'ממריץ'], color: '#FFEB3B' },
            },
        },
    })
    @ApiCreatedResponse({
        description: 'Terpene created successfully. `result` is the created terpene.',
        type: TerpeneResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Validation failed. Check that `name` is provided, `color` is a valid hex, and `effects` are strings.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiConflictResponse({ description: 'A terpene with the same name already exists.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async create(@Body() dto: TerpeneCreateDto): Promise<TerpeneResultResponseDto> {
        const item = await this.terpeneService.create(dto);
        return {
            success: true,
            message: 'Terpene created successfully',
            result: this.mapToDto(item),
        };
    }

    /**
     * Update an existing terpene by its unique Hebrew name.
     *
     * @param name Hebrew name of the terpene to update.
     * @param dto Partial data to update. Only provided fields are modified.
     * @returns ServiceResultContainer with the updated terpene.
     * @throws 400 if validation fails.
     * @throws 401 if the caller has no valid JWT.
     * @throws 404 if no terpene with the given name exists.
     * @throws 500 on unexpected database or server failure.
     */
    @Patch(':name')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Update a terpene by name',
        summaryHe: 'מעדכן את המאפיינים, הריח וההשפעות של טרפן קיים',
        toolIcon: 'ph-flower-lotus',
        description:
            'Updates an existing terpene. Only the provided fields are modified — omitted fields retain their current values. The `name` cannot be changed via this endpoint; use POST /terpenes to create a new record with a different name.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew terpene name. Must exactly match the `terpene.name` column.',
        example: 'מירצן',
    })
    @ApiBody({
        description:
            'Terpene update payload. All fields are optional; only provided fields will be updated. `color` must be a valid hex color if provided.',
        type: TerpeneUpdateDto,
        examples: {
            example1: {
                summary: 'Partial update',
                value: { description: 'Updated description', color: '#4CAF50' },
            },
            example2: {
                summary: 'Clear optional fields',
                value: { description: null, scent: null, effects: [] },
            },
        },
    })
    @ApiOkResponse({
        description: 'Terpene updated successfully. `result` is the updated terpene.',
        type: TerpeneResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Validation failed. Check that `color` is a valid hex if provided.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'No terpene matches the given name.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async update(@Param('name') name: string, @Body() dto: TerpeneUpdateDto): Promise<TerpeneResultResponseDto> {
        const item = await this.terpeneService.update(name, dto);
        return {
            success: true,
            message: 'Terpene updated successfully',
            result: this.mapToDto(item),
        };
    }

    @Post(':name/enrich')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Enrich a single terpene',
        summaryHe: 'מעשיר טרפן בודד בפרטי ארומה והשפעות מבוססי AI',
        toolIcon: 'ph-flower-lotus',
        description:
            'Searches the web for the given terpene name, sends context to LLM, and returns enriched description with web results. Does not persist — caller decides whether to save.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew terpene name to enrich.',
        example: 'מירצן',
    })
    @ApiOkResponse({
        description: 'Enrichment succeeded. `result` contains the LLM-generated description and web search results.',
    })
    @ApiBadRequestResponse({ description: 'Invalid terpene name.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'No terpene matches the given name.' })
    @ApiInternalServerErrorResponse({ description: 'LLM or web search failure.' })
    async enrichSingle(@Param('name') name: string, @Req() req: RequestWithUser) {
        const result = await this.terpeneService.enrichSingle(name, req.user?.sub);
        return {
            success: true,
            message: 'Enrichment completed successfully',
            result,
        };
    }

    @Post('enrich-missing')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Enrich all terpenes with missing properties (description, scent, effects).',
        summaryHe: 'מפעיל סריקה והעשרה אוטומטית לכל הטרפנים שחסר להם מידע מבוסס AI',
        toolIcon: 'ph-magic-wand',
    } as CustomApiOperationOptions)
    @ApiOkResponse({ description: 'Bulk enrichment completed.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiInternalServerErrorResponse({ description: 'LLM or web search failure.' })
    async enrichMissing(@Req() req: RequestWithUser) {
        const result = await this.terpeneService.enrichMissing(req.user?.sub);
        return {
            success: true,
            message: `Enrichment completed: ${result.enriched} enriched, ${result.errors} errors out of ${result.total} total.`,
            result,
        };
    }

    @Delete(':name')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Delete a terpene by name.',
        summaryHe: 'מוחק טרפן לצמיתות מקטלוג המערכת',
        toolIcon: 'ph-trash',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew terpene name to delete.',
        example: 'מירצן',
    })
    @ApiOkResponse({ description: 'Terpene deleted successfully.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiNotFoundResponse({ description: 'No terpene matches the given name.' })
    async delete(@Param('name') name: string) {
        await this.terpeneService.delete(name);
        return {
            success: true,
            message: `Terpene "${name}" deleted successfully.`,
        };
    }
}