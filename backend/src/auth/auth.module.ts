import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { getJwtSecret } from './auth.config';
import { JwtStrategy } from './jwt.strategy';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '1d') as never },
    }),
    // Only imported for GmailDraftService, reused here to send
    // forgot-password reset-link emails via the same Gmail API pattern
    // already proven by the HR agreement flow.
    ProductionModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
