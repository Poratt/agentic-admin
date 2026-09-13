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
import { GeneticsService } from './genetics.service';
import { GeneticsListResultResponseDto } from './dto/genetics-list-result-response.dto';
import { GeneticsResultResponseDto } from './dto/genetics-result-response.dto';
import { GeneticsDto, toGeneticsDto } from './dto/genetics.dto';
import { GeneticsCreateDto } from './dto/genetics-create.dto';
import { GeneticsUpdateDto } from './dto/genetics-update.dto';

/**
 * Controller for the genetics reference catalog.
 *
 * Base path: /genetics
 *
 * Endpoints summary:
 *
 * | Method | Path              | Description                                  | Guard         |
 * | ------ | ----------------- | -------------------------------------------- | ------------- |
 * | GET    | /genetics         | Return every strain in the catalog.          | JwtAuthGuard  |
 * | GET    | /genetics/:name   | Look up a single strain by Hebrew name.      | JwtAuthGuard  |
 * | POST   | /genetics         | Create a new genetics record.               | JwtAuthGuard  |
 * | PATCH  | /genetics/:name   | Update an existing genetics by name.        | JwtAuthGuard  |
 */
@ApiTags('genetics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('genetics')
export class GeneticsController {
    constructor(private readonly geneticsService: GeneticsService) { }

    /**
     * Return every genetics row in the catalog.
     *
     * Wrapped in `ServiceResultContainer<GeneticsDto[]>`. Used by the
     * `MatchingPreferencesDrawer` to populate hover-tooltip details.
     *
     * @returns ServiceResultContainer whose `result` is the alphabetically-ordered genetics list.
     * @throws 401 if the caller has no valid JWT.
     * @throws 500 on unexpected database or server failure.
     */
    @Get()
    @ApiOperation({
        summary: 'List all genetics rows',
        summaryHe: 'מציגים את קטלוג הגנטיקה והזנים המלא במערכת',
        toolIcon: 'ph-tree-evergreen',
        description:
            'Returns the full genetics reference catalog ordered alphabetically by Hebrew name. The list is intended to be cached client-side.',
    } as CustomApiOperationOptions)
    @ApiOkResponse({
        description:
            'Catalog fetched successfully. `result` is an array of GeneticsDto ordered alphabetically by name.',
        type: GeneticsListResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Not applicable for this endpoint.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async findAll(): Promise<GeneticsListResultResponseDto> {
        const items = await this.geneticsService.findAll();
        return {
            success: true,
            message: 'Genetics fetched successfully',
            result: items.map((item): GeneticsDto => toGeneticsDto(item)!),
        };
    }

    /**
     * Look up a single genetics row by its unique Hebrew name.
     *
     * @param name Hebrew name as stored in the `genetics.name` column. The match is exact. Must be URL-encoded when it contains spaces or non-ASCII characters.
     * @returns ServiceResultContainer whose `result` is the matching genetics row, or null when no row exists.
     * @throws 401 if the caller has no valid JWT.
     * @throws 500 on unexpected database or server failure.
     */
    @Get(':name')
    @ApiOperation({
        summary: 'Get a strain by name',
        summaryHe: 'מציגים פרטים מלאים על זן גנטיקה ספציפי לפי שמו',
        toolIcon: 'ph-tree-evergreen',
        description:
            'Returns the genetics row whose `name` column exactly matches the supplied `:name` path parameter. Result is `null` when no record matches — this is not treated as a 404 so the frontend can render a graceful empty state.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description:
            'Hebrew strain name. Must exactly match the `genetics.name` column. URL-encode spaces and non-ASCII characters (e.g. `גורילה%20גלו`).',
        example: 'גורילה גלו',
    })
    @ApiOkResponse({
        description:
            'Lookup succeeded. `result` is the matching strain or null when no row matches the given name.',
        type: GeneticsResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Not applicable for this endpoint.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'Not applicable for this endpoint. Missing rows return `result: null`.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async findOne(@Param('name') name: string): Promise<GeneticsResultResponseDto> {
        const item = await this.geneticsService.findByName(name);
        return {
            success: true,
            message: item ? 'Genetics fetched successfully' : 'No genetics row matches the given name',
            result: toGeneticsDto(item),
        };
    }

    /**
     * Create a new genetics record.
     *
     * @param dto Data for the new genetics record. Name must be unique.
     * @returns ServiceResultContainer with the created GeneticsDto.
     * @throws 400 if validation fails (e.g., invalid color format, empty name).
     * @throws 401 if the caller has no valid JWT.
     * @throws 409 if a genetics with the same name already exists.
     * @throws 500 on unexpected database or server failure.
     */
    @Post()
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Create a new genetics record',
        summaryHe: 'יוצרים גנטיקה חדשה בקטלוג המערכת',
        toolIcon: 'ph-tree-evergreen',
        description:
            'Creates a new genetics entry in the reference catalog. The `name` field must be unique. Returns the created record wrapped in ServiceResultContainer.',
    } as CustomApiOperationOptions)
    @ApiBody({
        description:
            'Genetics creation payload. `name` and `color` are required. `color` must be a valid hex color (e.g., #228B22). `type` must be one of: היברידי, סאטיבה, אינדיקה.',
        type: GeneticsCreateDto,
        examples: {
            basic: {
                summary: 'Basic creation',
                value: {
                    name: 'גורילה גלו',
                    description: 'זן חזק במיוחד...',
                    parent1: 'Chem Sis',
                    parent2: 'Sour Dubb',
                    origin: 'ארה"ב',
                    type: 'היברידי',
                    color: '#228B22',
                },
            },
        },
    })
    @ApiCreatedResponse({
        description: 'Genetics created successfully. `result` contains the created record.',
        type: GeneticsResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Validation failed (e.g., invalid hex color, missing required fields).' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiConflictResponse({ description: 'A genetics with this name already exists.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async create(@Body() dto: GeneticsCreateDto): Promise<GeneticsResultResponseDto> {
        const item = await this.geneticsService.create(dto);
        return {
            success: true,
            message: 'Genetics created successfully',
            result: toGeneticsDto(item),
        };
    }

    /**
     * Update an existing genetics record by its unique Hebrew name.
     *
     * @param name Hebrew name of the genetics to update (path parameter).
     * @param dto Partial data to update. Only provided fields are modified.
     * @returns ServiceResultContainer with the updated GeneticsDto.
     * @throws 400 if validation fails (e.g., invalid hex color).
     * @throws 401 if the caller has no valid JWT.
     * @throws 404 if no genetics with the given name exists.
     * @throws 500 on unexpected database or server failure.
     */
    @Patch(':name')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Update a genetics record by name',
        summaryHe: 'מעדכנים את מאפייני הגנטיקה של זן קיים לפי שמו',
        toolIcon: 'ph-tree-evergreen',
        description:
            'Updates an existing genetics entry in the reference catalog. All fields are optional — only provided fields are modified. The `name` path parameter identifies the record to update and cannot be changed.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew strain name. Must exactly match the `genetics.name` column. URL-encode spaces and non-ASCII characters.',
        example: 'גורילה גלו',
    })
    @ApiBody({
        description:
            'Genetics update payload. All fields are optional. `color` must be a valid hex color if provided. `type` must be one of: היברידי, סאטיבה, אינדיקה. Pass `null` or empty string to clear optional string fields; pass empty array `[]` to clear effects/tags.',
        type: GeneticsUpdateDto,
        examples: {
            partial: {
                summary: 'Partial update',
                value: {
                    description: 'Updated description',
                    color: '#1A5C1A',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Genetics updated successfully. `result` contains the updated record.',
        type: GeneticsResultResponseDto,
    })
    @ApiBadRequestResponse({ description: 'Validation failed (e.g., invalid hex color).' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'No genetics matches the given name.' })
    @ApiInternalServerErrorResponse({ description: 'Unexpected database or server error.' })
    async update(@Param('name') name: string, @Body() dto: GeneticsUpdateDto): Promise<GeneticsResultResponseDto> {
        const item = await this.geneticsService.update(name, dto);
        return {
            success: true,
            message: 'Genetics updated successfully',
            result: toGeneticsDto(item),
        };
    }

    @Post(':name/enrich')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Enrich a single genetics record',
        summaryHe: 'מעשירים זן גנטיקה בודד בפרטים ונתוני מעבדה מבוססי AI',
        toolIcon: 'ph-tree-evergreen',
        description:
            'Searches the web for the given strain name, sends context to LLM, and returns enriched description with web results. Does not persist — caller decides whether to save.',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew strain name to enrich.',
        example: 'גורילה גלו',
    })
    @ApiOkResponse({
        description: 'Enrichment succeeded. `result` contains the LLM-generated description and web search results.',
    })
    @ApiBadRequestResponse({ description: 'Invalid strain name.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
    @ApiNotFoundResponse({ description: 'No genetics matches the given name.' })
    @ApiInternalServerErrorResponse({ description: 'LLM or web search failure.' })
    async enrichSingle(@Param('name') name: string, @Req() req: RequestWithUser) {
        const result = await this.geneticsService.enrichSingle(name, req.user?.sub);
        return {
            success: true,
            message: 'Enrichment completed successfully',
            result,
        };
    }

    @Post('enrich-missing')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Enrich all genetics with missing properties (thcRange, terpenes, effects).',
        summaryHe: 'מפעילים סריקה והעשרה אוטומטית לכל הזנים שחסר להם מידע מבוסס AI',
        toolIcon: 'ph-magic-wand',
    } as CustomApiOperationOptions)
    @ApiOkResponse({ description: 'Bulk enrichment completed.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiInternalServerErrorResponse({ description: 'LLM or web search failure.' })
    async enrichMissing(@Req() req: RequestWithUser) {
        const result = await this.geneticsService.enrichMissing(req.user?.sub);
        return {
            success: true,
            message: `Enrichment completed: ${result.enriched} enriched, ${result.errors} errors out of ${result.total} total.`,
            result,
        };
    }

    @Delete(':name')
    @UseGuards(AdminGuard)
    @ApiOperation({
        summary: 'Delete a genetics strain by name.',
        summaryHe: 'מחוקים זן גנטיקה לצמיות מקטלוג',
        toolIcon: 'ph-trash',
    } as CustomApiOperationOptions)
    @ApiParam({
        name: 'name',
        type: String,
        description: 'Hebrew strain name to delete.',
        example: 'גורילה גלו',
    })
    @ApiOkResponse({ description: 'Strain deleted successfully.' })
    @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
    @ApiNotFoundResponse({ description: 'No genetics matches the given name.' })
    async delete(@Param('name') name: string) {
        await this.geneticsService.delete(name);
        return {
            success: true,
            message: `Strain "${name}" deleted successfully.`,
        };
    }
}
