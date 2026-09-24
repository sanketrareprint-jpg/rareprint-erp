// Pickup-address defaults shared by the Dispatch page and the Orders page's
// Book Shipment modal, so both quote courier rates from the same pickup
// address. Keep this the single source of truth -- the two pages used to
// quote different rates because only Dispatch sent a pickup warehouse.

export type PickupWarehouse = { id: string; name: string; pincode: string; location: string; address?: string; city?: string; state?: string; source?: string };

// Put RAZA ENVELOP FACTORY 3 first as default pickup location --
// Bigship/Shiprocket only. This predates Fship's per-shipment
// pickup addresses and matches purely on the substring "RAZA" in
// the name, with no source check. Two of the saved Fship pickup
// addresses happen to be named "Raza Envelope MAHAL OFFICE" and
// "Raza Envelope NAGPUR FACTORY" (added 2026-09), so without this
// exclusion they'd get swept into the same top-priority group by
// pure name coincidence, and pickupWarehousesForCarrier()'s Fship-filtered
// list would silently default to Mahal Office for every shipment
// with no pickup explicitly chosen yet -- reported 2026-09-17.
export function sortPickupWarehouses<T extends PickupWarehouse>(data: T[]): T[] {
  return [...data].sort((a, b) => {
    const aIsRaza = a.source !== "fship" && a.name.toUpperCase().includes("RAZA") ? -1 : 0;
    const bIsRaza = b.source !== "fship" && b.name.toUpperCase().includes("RAZA") ? -1 : 0;
    return aIsRaza - bIsRaza;
  });
}

// Pickup addresses selectable for a shipment. When that shipment is
// effectively going via Fship (either "Ship via: Fship" was picked for it,
// or it's left at "Default" and Fship is the globally active carrier), only
// Fship-registered addresses (Settings > Carrier Config > Fship > Additional
// Pickup Addresses) are offered -- every other entry is a Shiprocket/Bigship
// pickup location with no corresponding Fship address id, so picking one
// always silently fell back to the Fship default (reported 2026-09-16/17;
// the fallback itself is correct given no Fship id exists for those, but
// dispatchers had no way to tell which entries actually worked before
// booking). "compare" is left unfiltered since it quotes Bigship + Fship
// together and needs both carriers' addresses visible.
export function pickupWarehousesForCarrier<T extends PickupWarehouse>(warehouses: T[], selectedCarrier: string, activeCarrier: string): T[] {
  const carrier = selectedCarrier || activeCarrier;
  return carrier === "fship" ? warehouses.filter(w => w.source === "fship") : warehouses;
}
