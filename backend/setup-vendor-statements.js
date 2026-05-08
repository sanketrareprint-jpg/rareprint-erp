const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\ZEB\\Desktop\\print-erp-git\\backend';

// 1. Update schema
const schemaPath = path.join(BASE, 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Add isPaid to JobWork (before completedAt)
schema = schema.replace(
  '  completedAt   DateTime?',
  '  isPaid        Boolean     @default(false)\n  paidAt        DateTime?\n  completedAt   DateTime?'
);

// Add isPaid to SheetStageVendor (before createdAt in that model)
schema = schema.replace(
  '  vendorInvoiceNo String?\n  createdAt     DateTime    @default(now())\n  sheet         PrintSheet',
  '  vendorInvoiceNo String?\n  isPaid        Boolean     @default(false)\n  paidAt        DateTime?\n  createdAt     DateTime    @default(now())\n  sheet         PrintSheet'
);

fs.writeFileSync(schemaPath, schema, { encoding: 'utf8', bom: false });
console.log('Schema updated!');
console.log('isPaid count:', (schema.match(/isPaid/g) || []).length);

// 2. Update controller
const ctrlPath = path.join(BASE, 'src', 'accounts', 'accounts.controller.ts');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

const newEndpoints = `  @Get('vendor-statements')
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

  `;

ctrl = ctrl.replace("  @Patch(':id/approve-dispatch')", newEndpoints + "  @Patch(':id/approve-dispatch')");
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('Controller updated!');
console.log('vendor-statements count:', (ctrl.match(/vendor-statements/g) || []).length);

// 3. Update service - add new methods
const svcPath = path.join(BASE, 'src', 'accounts', 'accounts.service.ts');
let svc = fs.readFileSync(svcPath, 'utf8');

const newMethods = `
  async getVendorStatements() {
    const jobWorks = await this.prisma.jobWork.findMany({
      include: {
        vendor: true,
        orderItem: {
          include: {
            product: true,
            order: { include: { customer: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sheetStages = await this.prisma.sheetStageVendor.findMany({
      include: {
        vendor: true,
        sheet: {
          include: {
            items: {
              include: {
                orderItem: {
                  include: {
                    product: true,
                    order: { include: { customer: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jwEntries = jobWorks.map(jw => ({
      id: jw.id,
      type: 'JOBWORK' as const,
      vendorId: jw.vendorId,
      vendorName: jw.vendor.name,
      description: jw.description,
      cost: Number(jw.cost),
      vendorInvoiceNo: jw.vendorInvoiceNo,
      isPaid: jw.isPaid,
      paidAt: jw.paidAt,
      createdAt: jw.createdAt,
      status: jw.status,
      productName: jw.orderItem.product.name,
      productSku: jw.orderItem.product.sku,
      quantity: jw.orderItem.quantity,
      orderNo: (jw.orderItem.order as any).orderNumber,
      customerName: (jw.orderItem.order as any).customer.businessName,
      productionNotes: jw.orderItem.productionNotes,
    }));

    const ssEntries = sheetStages.map(ss => ({
      id: ss.id,
      type: 'SHEET_STAGE' as const,
      vendorId: ss.vendorId,
      vendorName: ss.vendor.name,
      description: ss.description,
      cost: Number(ss.cost),
      vendorInvoiceNo: ss.vendorInvoiceNo,
      isPaid: ss.isPaid,
      paidAt: ss.paidAt,
      createdAt: ss.createdAt,
      status: null,
      stage: ss.stage,
      sheetNo: ss.sheet.sheetNo,
      sheetGsm: ss.sheet.gsm,
      sheetSize: ss.sheet.sizeInches,
      products: ss.sheet.items.map(si => ({
        productName: si.orderItem.product.name,
        orderNo: (si.orderItem.order as any).orderNumber,
        customerName: (si.orderItem.order as any).customer.businessName,
        quantity: si.quantityOnSheet,
      })),
    }));

    return [...jwEntries, ...ssEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async markJobWorkPaid(id: string) {
    return this.prisma.jobWork.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }

  async markSheetStagePaid(id: string) {
    return this.prisma.sheetStageVendor.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }
`;

// Add before the last closing brace
svc = svc.replace(/}\s*$/, newMethods + '\n}');
fs.writeFileSync(svcPath, svc, 'utf8');
console.log('Service updated!');
console.log('getVendorStatements count:', (svc.match(/getVendorStatements/g) || []).length);
