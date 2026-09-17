import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Body,
  Req,
  UseGuards,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResultResponseDto } from './dto/user-result-response.dto';
import { UsersListResultResponseDto } from './dto/users-list-result-response.dto';
import { DeleteUserResultResponseDto } from './dto/delete-user-result-response.dto';
import { AdminGuard } from '../../core/guards/admin.guard';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { JwtPayload } from '../../core/interfaces/jwt-payload.interface';
import { RequiresConfirmation } from '../../core/decorators/requires-confirmation.decorator';
import { JwtPayloadResultResponseDto } from '../../core/dto/jwt-payload-result-response.dto';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'List all users',
    summaryHe: 'מציג את המשתמשים הפעילים',
    toolIcon: 'ph-users',
    description:
      'Returns every user in the system with public fields only: id, email, fullName, numeric role, createdAt, updatedAt, lastLoginAt. ' +
      'Passwords and refresh token hashes are never returned.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'ServiceResultContainer<UserResponseDto[]>.',
    type: UsersListResultResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  list() {
    return this.usersService.findAllSafe();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get current authenticated user payload',
    summaryHe: 'מציג את פרטי המשתמש הנוכחי',
    toolIcon: 'ph-user-circle',
    description:
      'Returns the JWT payload decoded by JwtAuthGuard. No database query is made. Role is numeric: 1 = Admin, 2 = User.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'ServiceResultContainer<JwtPayload> with sub, email, numeric role, iat, and exp.',
    type: JwtPayloadResultResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  me(@Req() req: Request) {
    const result: ServiceResultContainer<JwtPayload> = {
      success: true,
      message: 'Current user retrieved successfully',
      result: req.user as JwtPayload,
    };
    return result;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user by id',
    summaryHe: 'מציג פרטי משתמש לפי מזהה',
    toolIcon: 'ph-user',
    description:
      'Fetches one user by numeric id with public fields only. Admin can view any user. Regular users can only view their own profile (self-access).',
  } as CustomApiOperationOptions)
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Unique numeric user id. ParseIntPipe rejects non-numeric values.',
  })
  @ApiOkResponse({
    description: 'ServiceResultContainer<UserResponseDto>.',
    type: UserResultResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Regular user trying to view another user\'s profile.' })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiNotFoundResponse({ description: 'No user found with the given id.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async getById(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const isAdmin = payload.role === 1;
    const isSelf = payload.sub === id;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('אין הרשאה להציג פרופיל של משתמש אחר');
    }

    return this.usersService.findOneSafe(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Update user profile fields',
    summaryHe: 'מעדכן את פרטי המשתמש',
    toolIcon: 'ph-pencil-simple',
    description:
      'Updates fullName and/or email for the user identified by :id. ' +
      'This endpoint intentionally does not accept role changes; use PATCH /users/:id/role for role updates.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric id of the user to update.' })
  @ApiBody({
    type: UpdateUserDto,
    description: 'Partial profile update. Example: { "fullName": "New Name" } or { "email": "new@example.com" }.',
  })
  @ApiOkResponse({
    description: 'ServiceResultContainer<UserResponseDto> with the updated user.',
    type: UserResultResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user is not an admin.' })
  @ApiNotFoundResponse({ description: 'No user found with the given id.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @RequiresConfirmation()
  @ApiOperation({
    summary: 'Delete user permanently',
    summaryHe: 'מוחק משתמש לצמיתות מהמערכת',
    toolIcon: 'ph-trash',
    description: 'Hard-deletes the user record. This is irreversible and requires admin privileges.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric id of the user to delete.' })
  @ApiOkResponse({
    description: 'Deletion confirmed.',
    type: DeleteUserResultResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user is not an admin.' })
  @ApiNotFoundResponse({ description: 'No user found with the given id.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.delete(id);
  }

  @Patch(':id/role')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @RequiresConfirmation()
  @ApiOperation({
    summary: 'Change user role',
    summaryHe: 'מעדכן את תפקיד והרשאות המשתמש',
    toolIcon: 'ph-shield',
    description:
      'Sets only the role field of the user identified by :id. IMPORTANT: role must be a NUMBER: 1 = Admin, 2 = User. Never send a string. Accepted numeric values : 1 = Admin, 2 = User. ' +
      'Other user fields must be updated through PATCH /users/:id.',
  } as CustomApiOperationOptions)
  @ApiParam({ name: 'id', type: Number, description: 'Numeric id of the user whose role will change.' })
  @ApiBody({
    type: UpdateUserRoleDto,
    description: 'Role payload. Example: { "role": 1 } for Admin or { "role": 2 } for User.',
  })
  @ApiOkResponse({
    description: 'ServiceResultContainer<UserResponseDto> with the updated user.',
    type: UserResultResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired JWT token.' })
  @ApiForbiddenResponse({ description: 'Authenticated user is not an admin.' })
  @ApiNotFoundResponse({ description: 'No user found with the given id.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role);
  }
}
