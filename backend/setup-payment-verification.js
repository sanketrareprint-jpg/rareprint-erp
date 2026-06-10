const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\ZEB\\Desktop\\print-erp-git\\backend';

// 1. Update schema - add verificationStatus to Payment model
const schemaPath = path.join(BASE, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Add verificationStatus field after notes in Payment model
schema = schema.replace(
  '  notes            String?\n  createdAt        DateTime       @default(now())\n  updatedAt        DateTime       @updatedAt\n  order            Order          @relation(fields: [orderId]',
  '  notes            String?\n  verificationStatus PaymentVerificationStatus @default(PENDING_VERIFICATION)\n  verifiedById     String?\n  verifiedAt       DateTime?\n  rejectionReason  String?\n  createdAt        DateTime       @default(now())\n  updatedAt        DateTime       @updatedAt\n  verifiedBy       User?          @relation("PaymentVerifiedBy", fields: [verifiedById], references: [id])\n  order            Order          @relation(fields: [orderId]'
);

// Add enum before PaymentMethod enum
schema = schema.replace(
  'enum PaymentMethod {',
  'enum PaymentVerificationStatus {\n  PENDING_VERIFICATION\n  VERIFIED\n  REJECTED\n}\n\nenum PaymentMethod {'
);

// Add relation to User model
schema = schema.replace(
  '  paymentsReceived  Payment[]       @relation("PaymentReceivedBy")',
  '  paymentsReceived  Payment[]       @relation("PaymentReceivedBy")\n  paymentsVerified  Payment[]       @relation("PaymentVerifiedBy")'
);

fs.writeFileSync(schemaPath, schema, { encoding: 'utf8', bom: false });
console.log('Schema updated!');
console.log('verificationStatus count:', (schema.match(/verificationStatus/g) || []).length);

// 2. Update accounts controller - add verification endpoints
const ctrlPath = path.join(BASE, 'src', 'accounts', 'accounts.controller.ts');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

// Add Req import if not present
if (!ctrl.includes('Req,')) {
  ctrl = ctrl.replace("import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';",
    "import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';");
  ctrl = ctrl.replace("import { AccountsService } from './accounts.service';",
    "import { AccountsService } from './accounts.service';\nimport { AuthGuard } from '@nestjs/passport';\ntype JwtUser = { id: string; role: string };");
}

const verifyEndpoints = `
  @Get('pending-payments')
  getPendingPayments() {
    return this.accountsService.getPendingPayments();
  }

  @Patch('payments/:id/verify')
  verifyPayment(@Param('id') id: string, @Req() req: any) {
    return this.accountsService.verifyPayment(id, req.user.id);
  }

  @Patch('payments/:id/reject')
  rejectPayment(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.accountsService.rejectPayment(id, req.user.id, reason);
  }

`;

ctrl = ctrl.replace("  @Get('vendor-statements')", verifyEndpoints + "  @Get('vendor-statements')");
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('Controller updated!');

// 3. Update accounts service - add verification methods
const svcPath = path.join(BASE, 'src', 'accounts', 'accounts.service.ts');
let svc = fs.readFileSync(svcPath, 'utf8');

const newMethods = `
  async getPendingPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { verificationStatus: 'PENDING_VERIFICATION' },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        paymentAccount: true,
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => ({
      id: p.id,
      orderId: p.orderId,
      orderNo: (p.order as any).orderNumber,
      customerName: (p.order as any).customer.businessName,
      customerPhone: (p.order as any).customer.phone,
      salesAgentName: (p.order as any).salesAgent?.fullName ?? null,
      amount: Number(p.amount),
      method: p.method,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
      paymentDate: p.paymentDate,
      paymentAccountName: p.paymentAccount.name,
      receivedByName: p.receivedBy?.fullName ?? null,
      verificationStatus: p.verificationStatus,
      createdAt: p.createdAt,
    }));
  }

  async verifyPayment(id: string, verifiedById: string) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'VERIFIED',
        verifiedById,
        verifiedAt: new Date(),
      },
    });
  }

  async rejectPayment(id: string, verifiedById: string, reason: string) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'REJECTED',
        verifiedById,
        verifiedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

`;

svc = svc.replace(/}\s*$/, newMethods + '\n}');
fs.writeFileSync(svcPath, svc, 'utf8');
console.log('Service updated!');
console.log('getPendingPayments count:', (svc.match(/getPendingPayments/g) || []).length);
