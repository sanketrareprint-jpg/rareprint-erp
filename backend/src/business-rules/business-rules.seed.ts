import { CreateRuleDto } from './business-rules.service';

export const BUSINESS_RULES_SEED: CreateRuleDto[] = [
  {
    ruleCode: 'ORDERS-001',
    module: 'ORDERS',
    severity: 'CRITICAL',
    title: 'Non-sample order must start as PENDING APPROVAL',
    description:
      'When a sales agent creates a new order, it must go to accounts for approval first. It cannot jump directly to production or dispatch.',
    example:
      'Agent creates order for Monu Paan → order goes to accounts. Accounts checks cost and approves. Only then production begins.',
    testedBy: 'orders.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ORDERS-002',
    module: 'ORDERS',
    severity: 'HIGH',
    title: 'Sample order bypasses approval and goes directly to dispatch',
    description:
      'Sample kit orders (isSample = true) skip accounts and production approval entirely. They are created directly in READY_FOR_DISPATCH status.',
    example:
      'Agent creates a sample kit → immediately appears in dispatch queue. No accounts or agent approval needed.',
    testedBy: 'orders.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ORDERS-003',
    module: 'ORDERS',
    severity: 'HIGH',
    title: 'At least one product item required to create an order',
    description:
      'An order cannot be saved with zero items. Every order must have at least one product line.',
    example:
      'If agent tries to submit an empty order, the system must reject it with an error.',
    testedBy: 'orders.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ORDERS-004',
    module: 'ORDERS',
    severity: 'CRITICAL',
    title: 'Agent can only submit dispatch approval when order is READY FOR DISPATCH',
    description:
      "The agent's Submit for Dispatch button only works when the order is in READY_FOR_DISPATCH status AND at least one item has completed production.",
    example:
      'Agent tries to submit dispatch for an IN_PRODUCTION order → system blocks it.',
    testedBy: 'orders.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-001',
    module: 'ACCOUNTS',
    severity: 'CRITICAL',
    title: 'Only PENDING APPROVAL orders can be approved by accounts',
    description:
      'Accounts can only approve orders that are waiting for approval. Orders already approved, in production, or dispatched cannot be re-approved.',
    example:
      'Accounts tries to approve an APPROVED order again → system blocks it.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-002',
    module: 'ACCOUNTS',
    severity: 'CRITICAL',
    title: 'Cost slab required for every item before accounts can approve',
    description:
      'If any product in the order does not have a cost defined in the Cost Table, accounts cannot approve the order. Cost data must be added first.',
    example:
      'Order has 3 items. One product has no cost slab → accounts sees error and cannot approve.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-003',
    module: 'ACCOUNTS',
    severity: 'HIGH',
    title: 'Item margin must meet minimum threshold before approval',
    description:
      'If the profit margin of any item is below the configured minimum percentage, accounts cannot approve the order.',
    example:
      'Item selling at ₹10, cost is ₹9.5 → only 5% margin. Minimum is 10% → accounts blocked from approving.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-004',
    module: 'ACCOUNTS',
    severity: 'MEDIUM',
    title: 'Free items (offer code) skip cost and margin check',
    description:
      'Items added using an offer code are free promotional items. They are excluded from cost/margin approval checks.',
    example:
      'Order has 2 regular items + 1 free offer item → only the 2 regular items need cost slabs.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-005',
    module: 'ACCOUNTS',
    severity: 'MEDIUM',
    title: 'Super-admin can approve any order without restrictions',
    description:
      'The super-admin account (sanket.rareprint@gmail.com) bypasses cost and margin checks and can approve any order.',
    example:
      'Sanket approves order with no cost slabs → allowed. Regular accounts user tries same → blocked.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-006',
    module: 'ACCOUNTS',
    severity: 'CRITICAL',
    title: 'All payments must be verified before order approval',
    description:
      'If an order has any payments in PENDING_VERIFICATION status, the order cannot be approved. The accountant must first verify (or reject) all receipts in the Receipts Pending tab, then approve the order.',
    example:
      'Customer paid ₹5,000 via UPI. Agent submitted receipt but accounts has not verified it yet. Order approval button is blocked until receipt is verified.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'ACCOUNTS-007',
    module: 'ACCOUNTS',
    severity: 'CRITICAL',
    title: 'Minimum 40% advance required before order approval',
    description:
      'Accounts can only approve an order if at least 40% of the total order value has been received and verified. Only the super-admin (sanket.rareprint@gmail.com) can approve an order below this threshold.',
    example:
      'Order total ₹10,000. Customer paid ₹3,000 (30%). Accounts sees "30% advance received — minimum 40% required" and cannot approve. Sanket can override and approve.',
    testedBy: 'accounts.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'DISPATCH-001',
    module: 'DISPATCH',
    severity: 'CRITICAL',
    title: 'Non-sample orders must have dispatch approval log to appear in queue',
    description:
      'The dispatch queue must only show non-sample orders that have a status log entry: PENDING_DISPATCH_APPROVAL → READY_FOR_DISPATCH. Orders that bypassed agent + accounts dispatch approval must NOT appear.',
    example:
      'Monu Paan order: production marks all items done → order becomes READY_FOR_DISPATCH but agent never submitted → must NOT appear in dispatch queue.',
    testedBy: 'dispatch.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'DISPATCH-002',
    module: 'DISPATCH',
    severity: 'HIGH',
    title: 'Sample orders appear in dispatch queue without approval',
    description:
      'Sample kit orders bypass the entire agent + accounts dispatch approval flow by design. They appear in the dispatch queue immediately after creation.',
    example:
      'Sample kit for client demo created → immediately visible in dispatch queue for courier booking.',
    testedBy: 'dispatch.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'DISPATCH-003',
    module: 'DISPATCH',
    severity: 'CRITICAL',
    title: 'Shipment booking requires dispatch approval log (non-sample)',
    description:
      'The actual shipment booking (courier/transport/hand delivery) is blocked unless there is proof that accounts approved the dispatch.',
    example:
      "Dispatch team tries to book Shiprocket for an unapproved order → system throws error 'accounts must approve first'.",
    testedBy: 'dispatch.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'DISPATCH-004',
    module: 'DISPATCH',
    severity: 'CRITICAL',
    title: 'Only READY_FOR_DISPATCH or PARTIALLY_DISPATCHED orders can be booked',
    description:
      'Dispatch team cannot book shipment for orders in any other status like APPROVED, IN_PRODUCTION, or PENDING_APPROVAL.',
    example:
      'Order is IN_PRODUCTION → dispatch team cannot book it even if they try directly.',
    testedBy: 'dispatch.business-rules.spec.ts',
    active: true,
  },
  {
    ruleCode: 'DISPATCH-005',
    module: 'DISPATCH',
    severity: 'HIGH',
    title: 'Order must have at least one READY_FOR_DISPATCH item to appear in queue',
    description:
      'Even if the order status is READY_FOR_DISPATCH, at least one item must also have production stage READY_FOR_DISPATCH.',
    example:
      'Order with 3 items all still in PRINTING stage → does not appear in dispatch queue despite order status.',
    testedBy: 'dispatch.business-rules.spec.ts',
    active: true,
  },
];
