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
import { VendorsModule } from './vendors/vendors.module';
import { PrismaService } from './prisma/prisma.service';

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
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
