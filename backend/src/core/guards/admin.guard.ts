import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AppErrorCode } from '../errors/app-error-code';
import { UserRole } from '../enums/user-role.enum';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

@Injectable()
export class AdminGuard extends JwtAuthGuard {
  // Note: this method becomes async and returns Promise<boolean>
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    
    // 1. Wait for JWT authentication (Passport will populate request.user)
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) return false;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // 2. Role check (now that user is guaranteed to be on the request)
    if (user?.role !== UserRole.Admin) {
      throw new ForbiddenException({ 
        code: AppErrorCode.ACCESS_DENIED,
        message: 'אין לך הרשאת מנהל לביצוע פעולה זו' 
      });
    }

    return true;
  }
}