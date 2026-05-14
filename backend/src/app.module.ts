import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionModule } from './production/production.module';
import { ProductsModule } from './products/products.module';
import { PrismaService } from './prisma/prisma.service';
import { RateCalculatorModule } from './rate-calculator/rate-calculator.module';
import { HealthController } from './health/health.controller';
import { AdminDbController } from './admin-db.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { VendorsModule } from './vendors/vendors.module';
import { CrmModule } from './crm/crm.module';
import { SalesLearningModule } from './sales-learning/sales-learning.module';
import { CallAnalysisModule } from './call-analysis/call-analysis.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OrdersModule,
    ProductsModule,
    AccountsModule,
    ProductionModule,
    DispatchModule,
    VendorsModule,
    DashboardModule,
    RateCalculatorModule,
    CrmModule,
    SalesLearningModule,
    CallAnalysisModule,
  ],
  controllers: [AppController, AdminDbController, HealthController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
