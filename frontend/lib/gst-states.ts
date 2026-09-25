// The first two digits of a GSTIN are the GST state code of the state it is
// registered in — this maps them to the state names used in the Create Order
// "State" dropdown (INDIAN_STATES in app/orders/create/page.tsx). Free and
// offline: no GST-portal lookup (the portal has no open API; name lookup would
// need a paid provider).
const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  // 25 (Daman & Diu) and 26 (Dadra & Nagar Haveli) were merged in 2020.
  "25": "Dadra and Nagar Haveli and Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh", // pre-2014 Andhra Pradesh code, still on older GSTINs
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** State name for a complete, valid GSTIN; null while it's incomplete/invalid. */
export function stateFromGstin(gstin: string | null | undefined): string | null {
  const value = (gstin ?? "").trim().toUpperCase();
  if (!GSTIN_FORMAT.test(value)) return null;
  return GST_STATE_CODES[value.slice(0, 2)] ?? null;
}

/** True when both name the same state, ignoring case/extra spaces. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}
