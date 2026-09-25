const fs = require("fs");

function patch(path, replacements) {
  let src = fs.readFileSync(path, "utf8");
  for (const [label, oldStr, newStr] of replacements) {
    if (!src.includes(oldStr)) {
      throw new Error(`Could not find target text for "${label}" in ${path} -- stopping without writing anything.`);
    }
    if (src.split(oldStr).length - 1 !== 1) {
      throw new Error(`Target text for "${label}" in ${path} is not unique -- stopping without writing anything.`);
    }
    src = src.replace(oldStr, newStr);
  }
  fs.writeFileSync(path, src, "utf8");
  console.log(`Patched ${path}`);
}

patch("backend/src/dispatch/dispatch.service.ts", [
  ["orderAmount/totalAmount/extraCharges",
`          orderAmount: orderIsCod ? (orderCodAmt ?? dispatchItemsValue) : dispatchItemsValue,
          totalAmount: orderIsCod ? (orderCodAmt ?? dispatchItemsValue) : dispatchItemsValue,
          weightKg,`,
`          // orderAmount is the real value of the goods in THIS shipment --
          // always dispatchItemsValue, for both COD and Prepaid. Before this
          // fix it was set equal to the COD/balance-due amount for COD
          // orders (same value as totalAmount below), which meant Fship had
          // no correct standalone goods figure and its own auto-generated
          // invoice/shipping label ended up printing a "Shipping Charge"
          // line that was really just the outstanding COD balance (wrong
          // whenever balance-due != goods value, e.g. after an advance
          // payment -- order 1519 printed Rs 3625 instead of the real Rs 625
          // courier rate). orderAmount no longer needs to equal totalAmount:
          // Fship's collection step only reads totalAmount/cod_Amount.
          orderAmount: dispatchItemsValue,
          // totalAmount stays exactly what it was -- the actual amount to
          // collect on delivery -- so the order-1574 collection fix is
          // unaffected by this change.
          totalAmount: orderIsCod ? (orderCodAmt ?? dispatchItemsValue) : dispatchItemsValue,
          // The real courier freight charge for this shipment (same number
          // saved as Order.shippingCharge). Previously never sent to Fship --
          // extra_Charges was hardcoded to 0, so their invoice/label had no
          // correct freight figure to print.
          extraCharges: picked.amount,
          weightKg,`],
]);

patch("backend/src/fship/fship.service.ts", [
  ["extraCharges type field",
`    totalAmount: number;
    weightKg: number;`,
`    totalAmount: number;
    // Real courier freight charge for this shipment, sent as Fship's
    // extra_Charges field so their invoice/label has a correct standalone
    // freight figure instead of Rs 0 or the COD balance. Optional/defaults
    // to 0 for any other caller.
    extraCharges?: number;
    weightKg: number;`],
  ["extra_Charges payload value",
`        extra_Charges: 0,`,
`        extra_Charges: input.extraCharges ?? 0,`],
]);