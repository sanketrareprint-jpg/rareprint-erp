// Shared by the Shopify inbox list and review screens (frontend/app/shopify).
// gateway is the backend's classifyGateway() value (shopify.mapper.ts).
export function paymentLabel(gateway: string | null, financialStatus: string | null) {
  const paid = financialStatus === "paid";
  if (gateway === "RAZORPAY") return paid ? "Razorpay paid" : `Razorpay (${financialStatus ?? "unknown"})`;
  if (gateway === "COD") return "COD";
  if (gateway === "MANUAL") return paid ? "Manual (paid)" : "Manual (unpaid)";
  return `${gateway ?? "Other"} (${financialStatus ?? "unknown"})`;
}
