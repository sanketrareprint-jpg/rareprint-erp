import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('pending')
  getPendingOrders() {
    return this.accountsService.getPendingOrders();
  }

  @Get('pending-dispatch')
  getPendingDispatchOrders() {
    return this.accountsService.getPendingDispatchOrders();
  }

  @Patch(':id/approve')
  approveOrder(@Param('id') id: string) {
    return this.accountsService.approveOrder(id);
  }

  @Patch(':id/reject')
  rejectOrder(@Param('id') id: string, @Body('reason') reason: string) {
    return this.accountsService.rejectOrder(id, reason);
  }

  @Get('vendor-statements')
  getVendorStatements() {
    return this.accountsService.getVendorStatements();
  }

  @Patch('vendor-statements/jobwork/:id/paid')
  markJobWorkPaid(@Param('id') id: string) {
    return this.accountsService.markJobWorkPaid(id);
  }

  @Patch('vendor-statements/sheet-stage/:id/paid')
  markSheetStagePaid(@Param('id') id: string) {
    return this.accountsService.markSheetStagePaid(id);
  }

    @Patch(':id/approve-dispatch')
  approveDispatch(@Param('id') id: string) {
    return this.accountsService.approveDispatch(id);
  }

  @Patch(':id/reject-dispatch')
  rejectDispatch(@Param('id') id: string, @Body('reason') reason: string) {
    return this.accountsService.rejectDispatch(id, reason);
  }
}