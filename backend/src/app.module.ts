import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { RewardsModule } from './rewards/rewards.module';
import { PaperInventoryModule } from './paper-inventory/paper-inventory.module';
import { MarketingModule } from './marketing/marketing.module';
import { SheetLayoutModule } from './sheet-layout/sheet-layout.module';
import { DesignStudioModule } from './design-studio/design-studio.module';
import { CustomerDirectoryModule } from './customer-directory/customer-directory.module';
import { StorefrontModule } from './storefront/storefront.module';
import { CostTableModule } from './cost-table/cost-table.module';
import { BankStatementModule } from './bank-statement/bank-statement.module';
import { CarrierConfigModule } from './carrier-config/carrier-config.module';
import { VirtualCeoModule } from './virtual-ceo/virtual-ceo.module';
import { ErpConfigModule } from './erp-config/erp-config.module';
import { ActivityModule } from './activity/activity.module';
import { BusinessRulesModule } from './business-rules/business-rules.module';
import { RemittanceModule } from './remittance/remittance.module';
import { HrModule } from './hr/hr.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { CallComplianceModule } from './call-compliance/call-compliance.module';
import { MarketingRoiModule } from './marketing-roi/marketing-roi.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScheduleModule.forRoot(),
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
    NotificationsModule,
    TasksModule,
    RewardsModule,
    PaperInventoryModule,
    MarketingModule,
    SheetLayoutModule,
    DesignStudioModule,
    CustomerDirectoryModule,
    StorefrontModule,
    CostTableModule,
    BankStatementModule,
    CarrierConfigModule,
    ErpConfigModule,
    VirtualCeoModule,
    ActivityModule,
    BusinessRulesModule,
    RemittanceModule,
    HrModule,
    AttendanceModule,
    LoyaltyModule,
    ComplaintsModule,
    CallComplianceModule,
    MarketingRoiModule,
  ],
  controllers: [AppController, AdminDbController, HealthController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
