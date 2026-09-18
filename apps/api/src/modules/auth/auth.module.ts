import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from './refresh-token.repository';

@Module({
  imports: [JwtModule.register({}), UsersModule, MembershipsModule, OrganizationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RefreshTokenRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
