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
      // Was '1d' -- every login token expired after 24h, so the app (and
      // the frontend's 401 -> clearAuth()+redirect-to-/login handling)
      // logged everyone out daily even on their own phone. Bumped to 90
      // days so signing in once keeps you signed in for ~3 months; still
      // overridable via JWT_EXPIRES_IN without a code change.
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '90d') as never },
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
