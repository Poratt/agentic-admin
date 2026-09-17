import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  UseGuards,
  Get,
  HttpCode,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshGuard } from '../../core/guards/jwt-refresh.guard';
import { ServiceResultContainer } from '../../core/models/service-result-container.model';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { JwtPayload } from '../../core/interfaces/jwt-payload.interface';
import type { RequestWithUser } from '../../core/interfaces/request-with-user.interface';
import { UserResultResponseDto } from '../users/dto/user-result-response.dto';
import { LogoutResultResponseDto } from './dto/logout-result-response.dto';
import { JwtPayloadResultResponseDto } from '../../core/dto/jwt-payload-result-response.dto';
import { CustomApiOperationOptions } from '../../core/types/custom-api-operation-options.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a new user account',
    summaryHe: 'יוצר חשבון חדש ומצטרף למשפחת המערכת',
    toolIcon: 'ph-user-plus',
    description:
      'Creates a new user account. Required RegisterDto fields: fullName, email, password. ' +
      'Password must be at least 8 characters. This endpoint is public and does not require a token.',
  } as CustomApiOperationOptions)
  @ApiBody({
    type: RegisterDto,
    description:
      'Registration payload. Example: { "fullName": "John Doe", "email": "user@example.com", "password": "secret1234" }.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully. Returns ServiceResultContainer<UserResponseDto>.',
    type: UserResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'DTO validation failed.' })
  @ApiUnauthorizedResponse({ description: 'Not applicable for this public endpoint.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this public endpoint.' })
  @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  register(@Req() req: Request, @Body() dto: RegisterDto) {
    this.assertAllowedOrigin(req);
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Login with email and password',
    summaryHe: 'נכנס לחשבון האישי בבטחה',
    toolIcon: 'ph-sign-in',
    description:
      'Validates user credentials. On success, the service writes access and refresh tokens to HTTP-only cookies ' +
      'and returns ServiceResultContainer<UserResponseDto>. Role is numeric: 1 = Admin, 2 = User.',
  } as CustomApiOperationOptions)
  @ApiBody({
    type: LoginDto,
    description: 'Login credentials. Example: { "email": "user@example.com", "password": "secret1234" }.',
  })
  @ApiOkResponse({
    description: 'Login successful. Tokens are set as cookies by the service.',
    type: UserResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'DTO validation failed.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this public endpoint.' })
  @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  login(@Req() req: Request, @Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    this.assertAllowedOrigin(req);
    return this.authService.login(dto, res);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({
    summary: 'Refresh access token using refresh token',
    summaryHe: 'מחדש את טוקן הגישה ברקע כדי להישאר מחובר',
    toolIcon: 'ph-arrows-clockwise',
    description:
      'JwtRefreshGuard reads the refresh token from the cookie or Authorization header. ' +
      'If valid, AuthService issues new tokens and returns ServiceResultContainer<UserResponseDto>.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'New access token issued. Updated tokens are set as cookies by the service.',
    type: UserResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed request.' })
  @ApiUnauthorizedResponse({ description: 'Refresh token is missing, expired, revoked, or does not match the stored hash.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  refresh(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (!user.refreshToken) throw new UnauthorizedException();
    return this.authService.refresh(user.sub, user.refreshToken, res);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Logout and invalidate session',
    summaryHe: 'מתנתק מהמערכת ומסיים את סשן העבודה בבטחה',
    toolIcon: 'ph-sign-out',
    description:
      'Always succeeds, even when the access token is already expired: revokes the stored refresh token (best-effort, from the refresh cookie) and removes auth cookies from the response.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'Logout successful.',
    type: LogoutResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed request.' })
  @ApiUnauthorizedResponse({ description: 'Not applicable — logout never rejects.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  @Get('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current authenticated user payload',
    summaryHe: 'מציג את פרטי הפרופיל המהירים של המשתמש הנוכחי',
    toolIcon: 'ph-user-circle',
    description:
      'Reads req.user as populated by JwtAuthGuard. No database query is made. ' +
      'Role is numeric: 1 = Admin, 2 = User.',
  } as CustomApiOperationOptions)
  @ApiOkResponse({
    description: 'ServiceResultContainer<JwtPayload> with sub, email, numeric role, iat, and exp.',
    type: JwtPayloadResultResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Malformed request.' })
  @ApiUnauthorizedResponse({ description: 'Access token is missing, expired, or invalid.' })
  @ApiForbiddenResponse({ description: 'Not applicable for this endpoint.' })
  @ApiNotFoundResponse({ description: 'Not applicable for this endpoint.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  me(@Req() req: RequestWithUser) {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const result: ServiceResultContainer<JwtPayload> = {
      success: true,
      message: 'Current user retrieved successfully',
      result: user,
    };
    return result;
  }

  private assertAllowedOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (!origin) return; // non-browser clients (curl, server-to-server) carry no Origin
    const allowed = [
      process.env.CORS_ORIGIN ?? 'http://localhost:4200',
      'http://localhost:3000',
    ];
    if (!allowed.includes(origin)) {
      throw new ForbiddenException('Cross-site request origin blocked');
    }
  }
}
