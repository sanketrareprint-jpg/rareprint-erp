const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend/src/production/production.service.ts');
let content = fs.readFileSync(file, 'utf8');

const oldMethod = /async listInProduction\(\) \{[\s\S]*?designFiles: designFilesMap\[i\.id\] \?\? \[\],[\s\S]*?\}\)\);\s*\}\);?\s*\}/;

const newMethod = `async listInProduction() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION] } },
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { businessName: true, phone: true } },
        salesAgent: { select: { id: true, fullName: true } },
        items: {
          select: {
            id: true, productionCategory: true, itemProductionStage: true,
            productionNotes: true, artworkNotes: true, quantity: true,
            unitPrice: true, lineTotal: true,
            product: { select: { name: true, sku: true } },
          }
        },
      },
    });

    const itemIds = orders.flatMap(o => o.items.map(i => i.id));
    let designFilesMap: Record<string, any[]> = {};
    if (itemIds.length > 0) {
      const results = await this.prisma.(
        'SELECT id, "designFiles" FROM "OrderItem" WHERE id = ANY(::text[])',
        itemIds
      );
      designFilesMap = Object.fromEntries(
        results.map(r => [r.id, summarizeDesignFiles(r.designFiles)])
      );
    }

    return orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNumber,
      customerName: o.customer.businessName,
      customerPhone: o.customer.phone,
      salesAgentName: o.salesAgent?.fullName ?? null,
      status: o.status,
      productionStage: o.productionStage,
      orderDate: o.orderDate.toISOString(),
      notes: o.notes,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.product.name,
        sku: i.product.sku,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
        productionNotes: i.productionNotes,
        artworkNotes: i.artworkNotes,
        itemProductionStage: i.itemProductionStage,
        productionCategory: i.productionCategory,
        designFiles: designFilesMap[i.id] ?? [],
      })),
    }));
}`;

if (!oldMethod.test(content)) {
  console.log('Pattern not found');
  process.exit(1);
}

content = content.replace(oldMethod, newMethod);
fs.writeFileSync(file, content, 'utf8');
console.log('Done');
