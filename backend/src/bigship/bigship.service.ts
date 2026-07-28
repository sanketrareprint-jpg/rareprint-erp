import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { createReadStream, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import FormData from 'form-data';
import PDFDocument from 'pdfkit';

// ─── Base URL ────────────────────────────────────────────────────────────────
// Bigship Direct (new unified outbound API — v1.3, April 2026)
const BIGSHIP_BASE = 'https://api.bigship.direct';

// ─── India pincode prefix → state lookup ─────────────────────────────────────
// First 2 digits of a 6-digit pincode identify the postal circle / state.
const PINCODE_STATE: Record<string, string> = {
  '11': 'DELHI',        '12': 'HARYANA',       '13': 'HARYANA',
  '14': 'PUNJAB',       '15': 'PUNJAB',        '16': 'PUNJAB',
  '17': 'HIMACHAL PRADESH', '18': 'JAMMU AND KASHMIR', '19': 'JAMMU AND KASHMIR',
  '20': 'UTTAR PRADESH', '21': 'UTTAR PRADESH', '22': 'UTTAR PRADESH',
  '23': 'UTTAR PRADESH', '24': 'UTTAR PRADESH', '25': 'UTTAR PRADESH',
  '26': 'UTTAR PRADESH', '27': 'UTTAR PRADESH', '28': 'UTTAR PRADESH',
  '30': 'RAJASTHAN',    '31': 'RAJASTHAN',     '32': 'RAJASTHAN',
  '33': 'RAJASTHAN',    '34': 'RAJASTHAN',
  '36': 'GUJARAT',      '37': 'GUJARAT',       '38': 'GUJARAT',       '39': 'GUJARAT',
  '40': 'MAHARASHTRA',  '41': 'MAHARASHTRA',   '42': 'MAHARASHTRA',
  '43': 'MAHARASHTRA',  '44': 'MAHARASHTRA',
  '45': 'MADHYA PRADESH', '46': 'MADHYA PRADESH', '47': 'MADHYA PRADESH',
  '48': 'MADHYA PRADESH', '49': 'CHHATTISGARH',
  '50': 'TELANGANA',    '51': 'TELANGANA',     '52': 'TELANGANA',
  '53': 'ANDHRA PRADESH', '54': 'ANDHRA PRADESH', '55': 'ANDHRA PRADESH',
  '56': 'KARNATAKA',    '57': 'KARNATAKA',     '58': 'KARNATAKA',     '59': 'KARNATAKA',
  '60': 'TAMIL NADU',   '61': 'TAMIL NADU',    '62': 'TAMIL NADU',    '63': 'TAMIL NADU',
  '64': 'TAMIL NADU',
  '67': 'KERALA',       '68': 'KERALA',        '69': 'KERALA',
  '70': 'WEST BENGAL',  '71': 'WEST BENGAL',   '72': 'WEST BENGAL',   '73': 'WEST BENGAL',
  '74': 'WEST BENGAL',
  '75': 'ODISHA',       '76': 'ODISHA',        '77': 'ODISHA',
  '78': 'ASSAM',        '79': 'ASSAM',
  '80': 'BIHAR',        '81': 'BIHAR',         '82': 'BIHAR',         '83': 'JHARKHAND',
  '84': 'BIHAR',        '85': 'JHARKHAND',
};

const STATE_CODE: Record<string, string> = {
  'DELHI': 'DL',
  'HARYANA': 'HR',
  'PUNJAB': 'PB',
  'HIMACHAL PRADESH': 'HP',
  'JAMMU AND KASHMIR': 'JK',
  'UTTAR PRADESH': 'UP',
  'RAJASTHAN': 'RJ',
  'GUJARAT': 'GJ',
  'MAHARASHTRA': 'MH',
  'MADHYA PRADESH': 'MP',
  'CHHATTISGARH': 'CG',
  'TELANGANA': 'TS',
  'ANDHRA PRADESH': 'AP',
  'KARNATAKA': 'KA',
  'TAMIL NADU': 'TN',
  'KERALA': 'KL',
  'WEST BENGAL': 'WB',
  'ODISHA': 'OD',
  'ASSAM': 'AS',
  'BIHAR': 'BR',
  'JHARKHAND': 'JH',
  'UTTARAKHAND': 'UK',
  'GOA': 'GA',
  'ARUNACHAL PRADESH': 'AR',
  'MEGHALAYA': 'ML',
  'MANIPUR': 'MN',
  'MIZORAM': 'MZ',
  'NAGALAND': 'NL',
  'TRIPURA': 'TR',
  'SIKKIM': 'SK',
};

// Reverse map: 2-letter state code → full uppercase name
const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE).map(([name, code]) => [code, name])
);

/** Bigship requires Y-m-d H:i:s format (UTC+5:30) */
function bigshipDateNow(): string {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().replace('T', ' ').slice(0, 19);
}

/** Resolve a state value (full name or 2-letter code) to a title-cased full name */
function resolveStateName(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  // If it looks like a 2-letter code, resolve to full name
  if (cleaned.length <= 3 && STATE_CODE_TO_NAME[cleaned]) {
    return titleCase(STATE_CODE_TO_NAME[cleaned]);
  }
  return titleCase(raw.trim());
}

/** Sanitize mobile to a valid 10-digit Indian mobile number */
function sanitizeMobile(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  // Strip leading country code (91)
  const stripped = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  const ten = stripped.slice(0, 10);
  // Must be 10 digits starting with 6/7/8/9
  if (ten.length === 10 && /^[6-9]/.test(ten)) return ten;
  return '9999999999';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function limitText(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = (value ?? fallback).replace(/\s+/g, ' ').trim() || fallback;
  return cleaned.slice(0, maxLength);
}

function limitBigshipName(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = (value ?? fallback)
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
  return cleaned.slice(0, maxLength).trim() || fallback;
}

function limitBigshipAddress(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = (value ?? fallback)
    .replace(/[^a-zA-Z0-9\-./,#_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
  return cleaned.slice(0, maxLength).trim() || fallback;
}

function bigshipErrorMessage(error: unknown): string {
  const err = error as { response?: { data?: unknown }; message?: string };
  const data = err.response?.data;
  if (!data) return err.message ?? 'Bigship request failed';
  if (typeof data === 'string') return data;
  const message = (data as { message?: string }).message;
  const errors = (data as { errors?: unknown }).errors;
  return [message, errors ? JSON.stringify(errors) : ''].filter(Boolean).join(' ');
}

function isBigshipInvoiceUploadError(error: unknown): boolean {
  const err = error as { response?: { data?: unknown; status?: number } };
  const data = err.response?.data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return err.response?.status === 422 && /invoice data failed to upload/i.test(text);
}

function isBigshipInvoiceRequiredError(error: unknown): boolean {
  const err = error as { response?: { data?: unknown; status?: number } };
  const data = err.response?.data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return /invoice.*(mandatory|required|must be uploaded|attachment is required)|invoice data failed to upload|generated invoices are only supported for international|order_invoice_amount/i.test(text);
}

// 3-digit prefix overrides for pincodes that straddle two states under the same 2-digit prefix.
// These handle states carved out after 2000 or union territories sharing a postal circle:
//
// Jharkhand (split from Bihar 2000): 81x/82x are mostly Bihar but some are Jharkhand
//   81x: 814-819 = Jharkhand (Deoghar, Giridih, Godda, Pakur, Sahebganj, Dumka)
//   82x: 825-829 = Jharkhand (Hazaribagh, Dhanbad, Bokaro, Dhanbad, Ramgarh)
//
// Uttarakhand (split from UP 2000): 24x/26x are mostly UP but some are Uttarakhand
//   246 = Pauri Garhwal/Chamoli (Uttarakhand)
//   248 = Dehradun (Uttarakhand)
//   249 = Haridwar/Rishikesh (Uttarakhand)
//   263 = Nainital/Almora/Pithoragarh (Uttarakhand)
//
// Goa: prefix 40 = Maharashtra, but 403 = Goa
//
// Northeastern states: prefix 79 = Assam, but 790-799 are other NE states
//   790-792 = Arunachal Pradesh, 793-794 = Meghalaya, 795 = Manipur,
//   796 = Mizoram, 797-798 = Nagaland, 799 = Tripura
const PINCODE3_STATE: Record<string, string> = {
  // Jharkhand overrides (81x and 82x base → Bihar)
  '814': 'JHARKHAND', '815': 'JHARKHAND', '816': 'JHARKHAND',
  '817': 'JHARKHAND', '818': 'JHARKHAND', '819': 'JHARKHAND',
  '825': 'JHARKHAND', '826': 'JHARKHAND', '827': 'JHARKHAND',
  '828': 'JHARKHAND', '829': 'JHARKHAND',
  // Uttarakhand overrides (24x/25x/26x base → Uttar Pradesh)
  '246': 'UTTARAKHAND', '248': 'UTTARAKHAND', '249': 'UTTARAKHAND',
  '256': 'UTTARAKHAND', '258': 'UTTARAKHAND',  // Roorkee, Rishikesh
  '263': 'UTTARAKHAND', '269': 'UTTARAKHAND',  // Nainital, Rudrapur/Udham Singh Nagar
  // Andhra Pradesh overrides (51x base → Telangana, but 515-518 are AP)
  // 515=Anantapur, 516=Cuddapah/Kadapa, 517=Chittoor, 518=Kurnool — all in AP
  '515': 'ANDHRA PRADESH', '516': 'ANDHRA PRADESH',
  '517': 'ANDHRA PRADESH', '518': 'ANDHRA PRADESH',
  // Goa override (40x base → Maharashtra)
  '403': 'GOA', '404': 'GOA',
  // Sikkim override (73x base → West Bengal, but 737 = Gangtok/Sikkim)
  '737': 'SIKKIM',
  // Northeast states (79x base → Assam)
  '790': 'ARUNACHAL PRADESH', '791': 'ARUNACHAL PRADESH', '792': 'ARUNACHAL PRADESH',
  '793': 'MEGHALAYA',         '794': 'MEGHALAYA',
  '795': 'MANIPUR',
  '796': 'MIZORAM',
  '797': 'NAGALAND',          '798': 'NAGALAND',
  '799': 'TRIPURA',
};

/** Look up Indian state name from a 6-digit pincode */
function stateFromPincode(pin: string): string {
  const p = pin.trim();
  // Check 3-digit prefix first for pincodes that split across states
  const prefix3 = p.slice(0, 3);
  if (PINCODE3_STATE[prefix3]) return titleCase(PINCODE3_STATE[prefix3]);
  const prefix2 = p.slice(0, 2);
  return titleCase(PINCODE_STATE[prefix2] ?? 'DELHI');
}

function stateCodeFromPincode(pin: string): string {
  const p = pin.trim();
  const stateName = (PINCODE3_STATE[p.slice(0, 3)] ?? PINCODE_STATE[p.slice(0, 2)] ?? 'DELHI').toUpperCase();
  return STATE_CODE[stateName] ?? 'DL';
}

function uniqueInvoiceNo(base: string | undefined, prefix: string): string {
  const cleanBase = (base ?? prefix).replace(/[^a-zA-Z0-9\-/]/g, '').slice(0, 12) || prefix;
  const suffix = Date.now().toString(36).toUpperCase().slice(-8);
  return `${cleanBase}-${suffix}`.slice(0, 25);
}

function bigshipActiveFlag(value: unknown): boolean {
  if (value == null) return true;
  if (value === true || value === 1) return true;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'active', 'yes', 'y'].includes(text);
}

/** Look up a plausible city from pincode — used only when no city is in the address */
function cityFromPincode(pin: string, fallback?: string): string {
  const cleanPin = pin.trim();
  const exactCityMap: Record<string, string> = {
    '132001': 'KARNAL',
    '230403': 'PRATAPGARH',
    '262701': 'KHERI',
    '477441': 'LAHAR',
    '848210': 'ROSERA',
  };
  const prefix2 = pin.trim().slice(0, 2);
  const prefix3 = pin.trim().slice(0, 3);
  const CITY_MAP: Record<string, string> = {
    // Delhi
    '110': 'DELHI', '111': 'DELHI',
    // Maharashtra
    '400': 'MUMBAI', '401': 'MUMBAI', '402': 'MUMBAI',
    '403': 'PANAJI',  // Goa (state fixed via PINCODE3_STATE)
    '404': 'MARGAO',  // South Goa
    '410': 'NAVI MUMBAI', '411': 'PUNE', '412': 'PUNE', '413': 'SOLAPUR',
    '414': 'AHMEDNAGAR', '415': 'SATARA', '416': 'KOLHAPUR', '417': 'LATUR',
    '418': 'OSMANABAD', '421': 'THANE', '422': 'NASHIK', '423': 'NASHIK',
    '424': 'DHULE', '425': 'JALGAON', '431': 'AURANGABAD', '432': 'AURANGABAD',
    '440': 'NAGPUR', '441': 'NAGPUR', '442': 'CHANDRAPUR', '443': 'WARDHA',
    '444': 'AMRAVATI', '445': 'YAVATMAL', '446': 'AKOLA',
    // Gujarat
    '380': 'AHMEDABAD', '381': 'AHMEDABAD', '382': 'AHMEDABAD', '383': 'GANDHINAGAR',
    '384': 'MEHSANA', '385': 'RAJKOT', '360': 'RAJKOT', '361': 'JAMNAGAR',
    '362': 'JUNAGADH', '363': 'SURENDRANAGAR', '364': 'BHAVNAGAR',
    '370': 'KUTCH', '371': 'KUTCH', '390': 'VADODARA', '391': 'VADODARA',
    '394': 'SURAT', '395': 'SURAT', '396': 'VALSAD',
    // Karnataka
    '560': 'BANGALORE', '561': 'BANGALORE', '562': 'MYSORE', '563': 'KOLAR',
    '570': 'MYSORE', '571': 'MYSORE', '572': 'TUMKUR', '573': 'HASSAN',
    '574': 'MANGALORE', '575': 'MANGALORE', '576': 'UDUPI', '577': 'SHIMOGA',
    '580': 'HUBLI', '581': 'DHARWAD', '582': 'GADAG', '583': 'BELLARY',
    '584': 'RAICHUR', '585': 'GULBARGA', '586': 'BIJAPUR',
    // Tamil Nadu
    '600': 'CHENNAI', '601': 'CHENNAI', '602': 'CHENNAI', '603': 'CHENNAI',
    '604': 'PONDICHERRY', '605': 'PONDICHERRY', '606': 'VILLUPURAM',
    '607': 'CUDDALORE', '608': 'CUDDALORE', '609': 'NAGAPATTINAM',
    '610': 'THANJAVUR', '611': 'THANJAVUR', '612': 'THANJAVUR',
    '613': 'TRICHY', '614': 'TRICHY', '615': 'TRICHY', '616': 'TRICHY',
    '620': 'TRICHY', '621': 'TRICHY', '622': 'PUDUKKOTTAI',
    '623': 'RAMANATHAPURAM', '624': 'DINDIGUL', '625': 'MADURAI',
    '626': 'VIRUDHUNAGAR', '627': 'TIRUNELVELI', '628': 'TUTICORIN',
    '629': 'KANYAKUMARI', '630': 'SIVAGANGA', '631': 'VELLORE',
    '632': 'VELLORE', '635': 'KRISHNAGIRI', '636': 'SALEM', '637': 'SALEM',
    '638': 'ERODE', '639': 'KARUR', '641': 'COIMBATORE', '642': 'COIMBATORE',
    '643': 'NILGIRIS', '644': 'COIMBATORE',
    // Telangana / Andhra Pradesh
    '500': 'HYDERABAD', '501': 'HYDERABAD', '502': 'HYDERABAD', '503': 'HYDERABAD',
    '504': 'ADILABAD', '505': 'KARIMNAGAR', '506': 'WARANGAL', '507': 'KHAMMAM',
    '508': 'NALGONDA', '509': 'MAHBUBNAGAR',
    '515': 'ANANTAPUR', '516': 'CUDDAPAH', '517': 'CHITTOOR', '518': 'KURNOOL',
    '520': 'VIJAYAWADA', '521': 'KRISHNA', '522': 'GUNTUR', '523': 'PRAKASAM',
    '524': 'NELLORE', '530': 'VISAKHAPATNAM', '531': 'VISAKHAPATNAM',
    '532': 'SRIKAKULAM', '533': 'EAST GODAVARI', '534': 'WEST GODAVARI',
    // Kerala
    '670': 'KANNUR', '671': 'KANNUR', '672': 'KASARAGOD', '673': 'KOZHIKODE',
    '674': 'MALAPPURAM', '676': 'MALAPPURAM', '677': 'PALAKKAD', '678': 'PALAKKAD',
    '679': 'PALAKKAD', '680': 'THRISSUR', '681': 'THRISSUR', '682': 'ERNAKULAM',
    '683': 'ERNAKULAM', '684': 'ALAPPUZHA', '685': 'IDUKKI', '686': 'KOTTAYAM',
    '688': 'ALAPPUZHA', '689': 'PATHANAMTHITTA', '690': 'KOLLAM', '691': 'KOLLAM',
    '695': 'THIRUVANANTHAPURAM', '696': 'THIRUVANANTHAPURAM',
    // West Bengal
    '700': 'KOLKATA', '701': 'KOLKATA', '702': 'KOLKATA', '703': 'KOLKATA',
    '711': 'HOWRAH', '712': 'HOOGHLY', '713': 'BURDWAN', '721': 'MIDNAPORE',
    '722': 'BANKURA', '723': 'PURULIA', '731': 'BIRBHUM', '732': 'MURSHIDABAD',
    '733': 'MALDA', '734': 'DARJEELING', '735': 'JALPAIGURI', '736': 'COOCH BEHAR',
    '741': 'NADIA', '742': 'NADIA', '743': 'NORTH 24 PARGANAS',
    '744': 'SOUTH 24 PARGANAS',
    // Odisha
    '751': 'BHUBANESWAR', '752': 'BHUBANESWAR', '753': 'CUTTACK', '754': 'JAGATSINGHPUR',
    '755': 'JAJPUR', '756': 'BALESWAR', '757': 'MAYURBHANJ', '758': 'KEONJHAR',
    '759': 'ANGUL', '760': 'SAMBALPUR', '761': 'GANJAM', '762': 'PHULBANI',
    '763': 'KORAPUT', '764': 'RAYAGADA', '765': 'KALAHANDI', '766': 'BARGARH',
    '767': 'BOLANGIR',
    // Assam
    '781': 'GUWAHATI', '782': 'NAGAON', '783': 'GOALPARA', '784': 'SONITPUR',
    '785': 'JORHAT', '786': 'DIBRUGARH', '787': 'LAKHIMPUR',
    '788': 'SILCHAR',
    // Arunachal Pradesh
    '790': 'ITANAGAR', '791': 'ITANAGAR', '792': 'ITANAGAR',
    // Meghalaya
    '793': 'SHILLONG', '794': 'SHILLONG',
    // Manipur
    '795': 'IMPHAL',
    // Mizoram
    '796': 'AIZAWL',
    // Nagaland
    '797': 'KOHIMA', '798': 'KOHIMA',
    // Tripura
    '799': 'AGARTALA',
    // Sikkim
    '737': 'GANGTOK',
    // Bihar
    '800': 'PATNA', '801': 'PATNA', '802': 'PATNA', '803': 'NALANDA',
    '804': 'JEHANABAD', '805': 'GAYA', '811': 'MUNGER', '812': 'BHAGALPUR',
    '813': 'BHAGALPUR', '814': 'DUMKA', '815': 'GIRIDIH', '816': 'GODDA',
    '821': 'ROHTAS', '822': 'GAYA', '823': 'GAYA', '824': 'AURANGABAD',
    '825': 'HAZARIBAGH', '826': 'DHANBAD', '827': 'BOKARO', '828': 'DHANBAD',
    '829': 'RAMGARH', '831': 'JAMSHEDPUR', '832': 'EAST SINGHBHUM',
    '833': 'WEST SINGHBHUM', '834': 'RANCHI', '835': 'LOHARDAGA',
    '841': 'SARAN', '842': 'SIWAN', '843': 'MUZAFFARPUR', '844': 'VAISHALI',
    '845': 'EAST CHAMPARAN', '846': 'DARBHANGA', '847': 'MADHUBANI',
    '848': 'SAMASTIPUR', '849': 'BEGUSARAI', '851': 'KHAGARIA',
    '852': 'SUPAUL', '853': 'SAHARSA', '854': 'MADHEPURA', '855': 'PURNEA',
    '856': 'KATIHAR', '857': 'ARARIA',
    // Rajasthan
    '302': 'JAIPUR', '303': 'JAIPUR', '304': 'JAIPUR', '305': 'AJMER',
    '306': 'PALI', '307': 'SIROHI', '311': 'BHILWARA', '312': 'CHITTORGARH',
    '313': 'UDAIPUR', '314': 'DUNGARPUR', '321': 'BHARATPUR', '322': 'SAWAI MADHOPUR',
    '323': 'KOTA', '324': 'KOTA', '325': 'BARAN', '326': 'JHALAWAR',
    '327': 'JHALAWAR', '331': 'CHURU', '332': 'SIKAR', '333': 'JHUNJHUNU',
    '334': 'BIKANER', '335': 'GANGANAGAR', '341': 'NAGAUR', '342': 'JODHPUR',
    '343': 'BARMER', '344': 'JAISALMER', '345': 'JODHPUR',
    // Madhya Pradesh
    '450': 'KHANDWA', '451': 'KHARGONE', '452': 'INDORE', '453': 'INDORE',
    '454': 'DHAR', '455': 'DEWAS', '456': 'UJJAIN', '457': 'RATLAM',
    '458': 'MANDSOUR', '460': 'BETUL', '461': 'HARDA', '462': 'BHOPAL',
    '463': 'SEHORE', '464': 'VIDISHA', '465': 'RAJGARH', '466': 'GUNA',
    '470': 'SAGAR', '471': 'CHHATARPUR', '472': 'TIKAMGARH', '473': 'GUNA',
    '474': 'GWALIOR', '475': 'BHIND', '476': 'MORENA', '477': 'BHIND',
    '480': 'CHHINDWARA', '481': 'BALAGHAT', '482': 'JABALPUR', '483': 'JABALPUR',
    '484': 'MANDLA', '485': 'SATNA', '486': 'REWA', '487': 'NARSINGHPUR',
    '488': 'PANNA', '489': 'SHAHDOL',
    // Chhattisgarh
    '490': 'DURG', '491': 'DURG', '492': 'RAIPUR', '493': 'MAHASAMUND',
    '494': 'KANKER', '495': 'BILASPUR', '496': 'KORBA', '497': 'SURGUJA',
    '498': 'RAIGARH',
    // Uttar Pradesh
    '201': 'NOIDA', '202': 'NOIDA', '203': 'BULANDSHAHR', '204': 'ALIGARH',
    '205': 'MAINPURI', '206': 'ETAWAH', '207': 'KANPUR', '208': 'KANPUR',
    '209': 'FATEHPUR', '210': 'BANDA', '211': 'ALLAHABAD', '212': 'ALLAHABAD',
    '213': 'ALLAHABAD', '214': 'JAUNPUR', '221': 'VARANASI', '222': 'VARANASI',
    '223': 'GHAZIPUR', '224': 'AZAMGARH', '225': 'FAIZABAD', '226': 'LUCKNOW',
    '227': 'LUCKNOW', '228': 'SULTANPUR', '229': 'PRATAPGARH',
    '230': 'PRATAPGARH', '231': 'MIRZAPUR', '232': 'CHANDAULI',
    '241': 'HARDOI', '242': 'SHAHJAHANPUR', '243': 'BAREILLY', '244': 'MORADABAD',
    '245': 'HAPUR', '246': 'PAURI GARHWAL', '247': 'SAHARANPUR',
    '248': 'DEHRADUN', '249': 'HARIDWAR', '250': 'MEERUT', '251': 'MEERUT',
    '261': 'SITAPUR', '262': 'LAKHIMPUR KHERI', '263': 'NAINITAL',
    // Uttarakhand (state fixed via PINCODE3_STATE for 246, 248, 249, 263)
    '256': 'ROORKEE', '258': 'RISHIKESH', '269': 'RUDRAPUR',
    '271': 'GORAKHPUR', '272': 'BASTI', '273': 'GORAKHPUR', '274': 'DEORIA',
    '275': 'MAU', '276': 'AZAMGARH', '281': 'MATHURA', '282': 'AGRA',
    '283': 'AGRA', '284': 'JHANSI', '285': 'KANPUR', '301': 'ALWAR',
    // Haryana
    '121': 'FARIDABAD', '122': 'GURUGRAM', '123': 'REWARI', '124': 'ROHTAK',
    '125': 'HISAR', '126': 'JIND', '127': 'BHIWANI', '128': 'SIRSA',
    '129': 'KURUKSHETRA', '130': 'SONIPAT', '131': 'SONIPAT', '132': 'KARNAL',
    '133': 'AMBALA', '134': 'AMBALA', '135': 'YAMUNANAGAR', '136': 'KAITHAL',
    // Punjab
    '140': 'MOHALI', '141': 'LUDHIANA', '142': 'LUDHIANA', '143': 'AMRITSAR',
    '144': 'JALANDHAR', '145': 'JALANDHAR', '146': 'HOSHIARPUR', '147': 'PATIALA',
    '148': 'PATIALA', '149': 'BATHINDA', '151': 'BATHINDA', '152': 'FEROZEPUR',
    '153': 'FAZILKA', '154': 'MUKTSAR', '155': 'MANSA', '160': 'CHANDIGARH',
    // Himachal Pradesh
    '170': 'PANCHKULA', '171': 'SHIMLA', '172': 'SHIMLA', '173': 'SOLAN',
    '174': 'BILASPUR', '175': 'MANDI', '176': 'KANGRA', '177': 'HAMIRPUR',
    // J&K
    '180': 'JAMMU', '181': 'JAMMU', '182': 'JAMMU', '184': 'KATHUA',
    '185': 'ANANTNAG', '190': 'SRINAGAR', '191': 'SRINAGAR', '193': 'BARAMULLA',
  };
  return titleCase(exactCityMap[cleanPin] ?? CITY_MAP[prefix3] ?? CITY_MAP[prefix2] ?? fallback ?? 'Delhi');
}

// State capital fallbacks — used as last resort when all city attempts fail
const STATE_CAPITAL: Record<string, string> = {
  'Delhi': 'Delhi', 'Haryana': 'Gurugram', 'Punjab': 'Ludhiana',
  'Himachal Pradesh': 'Shimla', 'Jammu And Kashmir': 'Jammu',
  'Uttar Pradesh': 'Lucknow', 'Rajasthan': 'Jaipur', 'Gujarat': 'Ahmedabad',
  'Maharashtra': 'Mumbai', 'Madhya Pradesh': 'Bhopal', 'Chhattisgarh': 'Raipur',
  'Telangana': 'Hyderabad', 'Andhra Pradesh': 'Vijayawada', 'Karnataka': 'Bangalore',
  'Tamil Nadu': 'Chennai', 'Kerala': 'Kochi', 'West Bengal': 'Kolkata',
  'Odisha': 'Bhubaneswar', 'Assam': 'Guwahati', 'Bihar': 'Patna',
  'Jharkhand': 'Ranchi',
  'Uttarakhand': 'Dehradun',
  'Goa': 'Panaji',
  'Arunachal Pradesh': 'Itanagar',
  'Meghalaya': 'Shillong',
  'Manipur': 'Imphal',
  'Mizoram': 'Aizawl',
  'Nagaland': 'Kohima',
  'Tripura': 'Agartala',
  'Sikkim': 'Gangtok',
};

function cityStateAttemptsFromPincode(pin: string, fallbackCity?: string, fallbackState?: string): Array<{ city: string; state: string }> {
  const state = stateFromPincode(pin);  // always derive from pincode — stored state may be abbreviated or wrong
  const extraCityMap: Record<string, string[]> = {
    '132001': ['KARNAL'],
    '262701': ['KHERI', 'LAKHIMPUR', 'LAKHIMPUR KHERI', 'LAKHIMPUR-KHERI'],
    '477441': ['LAHAR', 'BHIND'],
    '848210': ['ROSERA', 'SAMASTIPUR'],
    // Jamshedpur pincodes — BigShip uses district name "East Singhbhum" not "Jamshedpur"
    '831001': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831002': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831003': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831004': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831005': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831006': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831007': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831009': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831011': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831012': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831013': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831014': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831015': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831016': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831017': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831018': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831019': ['EAST SINGHBHUM', 'SINGHBHUM'],
    '831020': ['EAST SINGHBHUM', 'SINGHBHUM'],
  };

  // Only use fallbackCity if it looks like a real city (not a full address)
  const cleanFallback = fallbackCity && fallbackCity.trim().length < 30 && !fallbackCity.includes(',')
    ? fallbackCity
    : undefined;

  const stateCapital = STATE_CAPITAL[state] ?? 'Delhi';

  const cityCandidates = [
    cityFromPincode(pin),
    ...(extraCityMap[pin.trim()] ?? []),
    cleanFallback,
    stateCapital,       // last-resort: use state capital
  ]
    .filter((city): city is string => !!city?.trim())
    .flatMap((city) => [titleCase(city), city.toUpperCase()]);

  const seen = new Set<string>();
  return cityCandidates
    .map((city) => ({ city, state }))
    .filter((attempt) => {
      const key = `${attempt.city}|${attempt.state}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type BigshipWarehouse = {
  bigshipWarehouseId: number;
  name: string;
  pincode: string;
  city: string;
  state: string;
  address: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
};

export type BigshipRateRow = {
  rateId: string;
  carrierName: string;
  amount: number;
  currency: string;
  estimatedDays: number;
  courierId: number;
  bigshipOrderId: string;
};

export type BigshipPackageBox = {
  noOfBoxes: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
};

function normalizePackageBoxes(boxes?: BigshipPackageBox[], fallbackWeightKg = 0.5): BigshipPackageBox[] {
  const normalized = (boxes ?? [])
    .map((box) => ({
      noOfBoxes: Math.max(1, Math.floor(Number(box.noOfBoxes) || 1)),
      length: Math.max(1, Number(box.length) || 0),
      breadth: Math.max(1, Number(box.breadth) || 0),
      height: Math.max(1, Number(box.height) || 0),
      weight: Math.max(0.1, Number(box.weight) || 0),
    }))
    .filter((box) => box.length > 0 && box.breadth > 0 && box.height > 0 && box.weight > 0);

  return normalized.length > 0
    ? normalized
    : [{ noOfBoxes: 1, length: 20, breadth: 15, height: 10, weight: Math.max(0.1, fallbackWeightKg) }];
}

/**
 * Bigship's domestic_b2c segment has no concept of multiple physical parcels per
 * order at all — confirmed by two separate live errors ("Exactly one box is required
 * for B2C orders" / "Number of boxes must be 1 for B2C orders") and explicitly stated
 * in Bigship's own Rate Calculator API docs ("for B2C shipments, the boxes array must
 * contain only one box"). Our multi-box UI lets users enter several box rows with
 * different dimensions/weights, so every row has to be consolidated into ONE declared
 * parcel here: combined weight (sum of all rows, not divided) and the largest
 * dimension seen per side (so the declared size never understates the real parcel).
 * Shared by both toBigshipBoxes() (create-order) and fetchCourierRates() (rate
 * calculator) since both B2C endpoints have this same one-box constraint.
 */
function collapseBoxesForB2C(boxes?: BigshipPackageBox[], fallbackWeightKg = 0.5): { length: number; breadth: number; height: number; weight: number } {
  const normalized = normalizePackageBoxes(boxes, fallbackWeightKg);
  return {
    length:  Math.max(...normalized.map((box) => box.length)),
    breadth: Math.max(...normalized.map((box) => box.breadth)),
    height:  Math.max(...normalized.map((box) => box.height)),
    weight: Math.max(0.1, Math.round(
      normalized.reduce((sum, box) => sum + box.noOfBoxes * box.weight, 0) * 100
    ) / 100),
  };
}

function toBigshipBoxes(boxes?: BigshipPackageBox[], fallbackWeightKg = 0.5) {
  const box = collapseBoxesForB2C(boxes, fallbackWeightKg);
  return {
    totalNumOfBoxes: 1,
    boxes: [{
      weight_unit: 'kg',
      dimension_unit: 'cm',
      noOfBoxes: 1,
      dimensions: [{
        length: box.length,
        breadth: box.breadth,
        height: box.height,
        weight: box.weight,
      }],
    }],
  };
}

@Injectable()
export class BigshipService {
  private readonly logger = new Logger(BigshipService.name);
  private token?: string;
  private tokenUntil = 0;
  private tokenExpiresAt?: string; // ISO string from API

  // ── Warehouse cache ──────────────────────────────────────────────────────────
  warehouseCache: BigshipWarehouse[] = []; // public so DispatchService can read it
  private warehouseCacheAt = 0; // timestamp of last fetch
  private static WAREHOUSE_CACHE_TTL = 30 * 60 * 1000; // 30 min

  /** Returns cached warehouses, refreshing if stale. Non-blocking version available via refreshWarehouseCache(). */
  async getCachedWarehouses(): Promise<BigshipWarehouse[]> {
    if (this.warehouseCache.length > 0 && Date.now() - this.warehouseCacheAt < BigshipService.WAREHOUSE_CACHE_TTL) {
      return this.warehouseCache;
    }
    return this.refreshWarehouseCache();
  }

  /** Fetches fresh warehouse list, stores in cache and returns it */
  async refreshWarehouseCache(): Promise<BigshipWarehouse[]> {
    try {
      const list = await this.getWarehouseList();
      if (list.length > 0) {
        this.warehouseCache = list;
        this.warehouseCacheAt = Date.now();
      }
    } catch (e) {
      this.logger.warn(`Warehouse cache refresh failed: ${e}`);
    }
    return this.warehouseCache;
  }

  // ── HTTP client ─────────────────────────────────────────────────────────────

  private api(): AxiosInstance {
    return axios.create({
      baseURL: BIGSHIP_BASE,
      timeout: 25_000,
    });
  }

  // ── Config check ────────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(
      process.env.BIGSHIP_USERNAME?.trim() &&
      process.env.BIGSHIP_PASSWORD?.trim() &&
      process.env.BIGSHIP_ACCESS_KEY?.trim()
    );
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  /**
   * POST /api/outbound/login
   * Returns a Bearer token valid for ~12 h.
   * Token is cached in memory; re-login happens automatically on expiry or 401.
   */
  async getAuthToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenUntil) {
      return this.token;
    }
    const { data } = await this.api().post('/api/outbound/login', {
      username:   process.env.BIGSHIP_USERNAME!.trim(),
      password:   process.env.BIGSHIP_PASSWORD!.trim(),
      access_key: process.env.BIGSHIP_ACCESS_KEY!.trim(),
    });

    const token     = data?.data?.token as string | undefined;
    const expiresAt = data?.data?.tokenExpiringAt as string | undefined;
    if (!token) throw new Error(`Bigship Direct auth failed: ${JSON.stringify(data)?.slice(0, 200)}`);

    this.token          = token;
    this.tokenExpiresAt = expiresAt;
    // Cache for 11 h (API says 12 h; keep 1 h buffer)
    this.tokenUntil     = expiresAt
      ? new Date(expiresAt).getTime() - 60 * 60 * 1000
      : Date.now() + 11 * 60 * 60 * 1000;

    this.logger.log(`Bigship Direct: token refreshed, expires ${expiresAt ?? 'unknown'}`);
    return token;
  }

  /** Returns current token expiry ISO string (or null if not yet logged in) */
  getTokenExpiry(): string | null {
    return this.tokenExpiresAt ?? null;
  }

  // ── Test connection ─────────────────────────────────────────────────────────

  /**
   * Attempts login and returns a status object — used by the Settings panel
   * "Test Connection" button.
   */
  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    walletBalance?: string;
    tokenExpiresAt?: string;
  }> {
    if (!this.isConfigured()) {
      return { ok: false, message: 'API credentials are not configured.' };
    }
    try {
      // Force a fresh login to validate credentials
      this.clearToken();
      const { data } = await this.api().post('/api/outbound/login', {
        username:   process.env.BIGSHIP_USERNAME!.trim(),
        password:   process.env.BIGSHIP_PASSWORD!.trim(),
        access_key: process.env.BIGSHIP_ACCESS_KEY!.trim(),
      });

      const token     = data?.data?.token as string | undefined;
      const expiresAt = data?.data?.tokenExpiringAt as string | undefined;
      const balance   = data?.data?.userWallet?.Balance as string | undefined;

      if (!token) {
        return { ok: false, message: data?.message ?? 'Login failed — no token returned.' };
      }

      // Persist the fresh token
      this.token          = token;
      this.tokenExpiresAt = expiresAt;
      this.tokenUntil     = expiresAt
        ? new Date(expiresAt).getTime() - 60 * 60 * 1000
        : Date.now() + 11 * 60 * 60 * 1000;

      return {
        ok: true,
        message: 'Connected successfully.',
        walletBalance: balance,
        tokenExpiresAt: expiresAt,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message ?? err.message ?? 'Connection failed.';
      return { ok: false, message: msg };
    }
  }

  // ── Courier rates ───────────────────────────────────────────────────────────

  /**
   * POST /api/outbound/user-rate-calculator — added to Bigship's API in their June
   * 2026 update. Computes shipping rates directly from pincodes + box info with NO
   * draft order involved at all. This replaces the older approach (still used at
   * actual dispatch time in tryCreateAdhocOrder) of creating a real throwaway
   * create-order draft purely to read its courier-wise-shipment-cost — which needed
   * a full shipping address, a unique invoice number per rate-check, and a city/state
   * guessing cascade (cityStateAttemptsFromPincode) to get past address validation.
   * None of that is needed here: no order, no address, no invoice number, just
   * pincodes and box dimensions.
   *
   * courier_partner_id returned here is Bigship's rate-calculator ID for the courier
   * and may not be the same ID space as the courierId returned later by
   * courier-wise-shipment-cost for an actual order — so the rateId encodes ONLY the
   * courier id (format `bs-<courierId>`, already supported by parseBigshipRateId)
   * rather than pairing it with an order id. tryCreateAdhocOrder always creates its
   * own fresh order at dispatch time regardless (this rate-check step's job is only
   * to show the user pricing/courier options), so no order id needs to survive from
   * here to booking time.
   */
  async fetchCourierRates(params: {
    pickupPostcode: string;
    deliveryPostcode: string;
    weightKg: number;
    codAmount?: number;
    pickupWarehouseId?: number;
    orderNumber?: string;
    invoiceAmount?: number;
    shippingName?: string;
    shippingMobile?: string;
    shippingEmail?: string;
    shippingAddress?: string;
    shippingCity?: string;
    shippingState?: string;
    isCod?: boolean;
    packageBoxes?: BigshipPackageBox[];
  }): Promise<BigshipRateRow[]> {
    if (!this.isConfigured()) return [];

    const token  = await this.getAuthToken();
    const weight = Math.max(0.1, Number(params.weightKg) || 0.1);
    const deliveryPostcode = params.deliveryPostcode?.trim() ||
                             params.pickupPostcode?.trim()   ||
                             '110001'; // last-resort default (Delhi)
    const declaredValue = Math.max(1, Math.round(Number(params.invoiceAmount) || 1000));
    const codAmount = params.isCod ? Math.max(1, Math.round(Number(params.codAmount) || declaredValue)) : 0;
    const box = collapseBoxesForB2C(params.packageBoxes, weight);

    this.logger.log(`Bigship fetchCourierRates — pickup=${params.pickupPostcode} delivery=${deliveryPostcode} weight=${weight}kg`);

    try {
      const { data } = await this.api().post(
        '/api/outbound/user-rate-calculator',
        {
          segment_type:   'domestic_b2c',
          sourcePincode:  params.pickupPostcode,
          destPincode:    deliveryPostcode,
          invoiceValue:   declaredValue,
          paymentModeId:  params.isCod ? 2 : 1, // 1: Prepaid, 2: COD, 3: ToPay
          ...(params.isCod ? { codAmount: Math.min(codAmount, declaredValue) } : {}),
          riskTypeId:     1, // Third-Party Insurance — matches the risk type used at place-order time
          boxes: [{
            no_of_box:        '1', // B2C: rate calculator docs require exactly one box entry
            box_length:       String(box.length),
            box_width:        String(box.breadth),
            box_height:       String(box.height),
            box_dead_weight:  String(box.weight),
          }],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data?.status === false) {
        throw new Error(data?.message ?? 'Bigship rate calculator failed');
      }

      const list = data?.data;
      if (!Array.isArray(list)) return [];

      return list
        .map((c: Record<string, unknown>) => ({
          rateId:        `bs-${c.courier_partner_id}`,
          carrierName:   String(c.courierName ?? c.planName ?? 'Courier'),
          amount:        Math.round(Number(c.totalCharge ?? c.courierCharge ?? 0) * 100) / 100,
          currency:      'INR',
          estimatedDays: Number(c.tat ?? 3),
          courierId:     Number(c.courier_partner_id),
          bigshipOrderId: '',
        }))
        .filter((r) => r.courierId > 0 && r.amount >= 0);
    } catch (e) {
      const message = bigshipErrorMessage(e);
      this.logger.warn(`Bigship fetchCourierRates — user-rate-calculator failed: ${message}`);
      throw new Error(`Bigship rates fetch failed: ${message}`);
    }
  }

  // ── Order creation ──────────────────────────────────────────────────────────

  /**
   * Order booking, steps 1-2 of 3 (Bigship Direct):
   *   1. POST /api/outbound/create-order              → CustomGlobalOrderId
   *   2. POST /api/outbound/courier-wise-shipment-cost → confirm courier available
   * Step 3 (POST /api/outbound/place-order → AWB) is NOT done here — call
   * placeExistingOrder() with the returned bigshipOrderId to manifest and get the AWB.
   */
  async tryCreateAdhocOrder(input: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    billingAddress: string;
    billingCity: string;
    billingPincode: string;
    billingState: string;
    weightKg: number;
    subTotal: number;
    courierId: number;
    isCod?: boolean;
    codAmount?: number;
    pickupWarehouseId?: number;  // override; falls back to env var if omitted
    packageBoxes?: BigshipPackageBox[];
  }): Promise<{ bigshipOrderId?: string; awbNumber?: string; message?: string }> {
    if (!this.isConfigured()) return {};

    const pickupWarehouseId = input.pickupWarehouseId
      ?? (process.env.BIGSHIP_PICKUP_WAREHOUSE_ID
          ? parseInt(process.env.BIGSHIP_PICKUP_WAREHOUSE_ID, 10)
          : null);

    if (!pickupWarehouseId) {
      this.logger.warn('Bigship: BIGSHIP_PICKUP_WAREHOUSE_ID not set — skipping order creation');
      return { message: 'Bigship warehouse ID not configured' };
    }

    const token         = await this.getAuthToken();
    const declaredValue = Math.max(1, Math.round(input.subTotal));
    const codAmount     = input.isCod ? Math.max(1, Math.round(input.codAmount ?? input.subTotal)) : 0;
    // Invoice candidates: RP prefix = RarePrint; 0/00 prefix = rebook attempts
    //   RP1189   = original dispatch
    //   0RP1189  = 1st rebook (stale draft blocks RP1189)
    //   00RP1189 = 2nd rebook
    const orderStr = String(input.orderNumber).replace(/[^a-zA-Z0-9\-/]/g, '');
    const invoiceCandidates = [
      `RP${orderStr}`.slice(0, 25),
      `0RP${orderStr}`.slice(0, 25),
      `00RP${orderStr}`.slice(0, 25),
    ];
    const packagePayload = toBigshipBoxes(input.packageBoxes, input.weightKg);
    // Use the same city+state cascade as fetchCourierRates — BigShip validates city
    // and may require a specific casing or alternate name. cityStateAttemptsFromPincode
    // generates titleCase + UPPERCASE variants with state-capital fallback.
    const cityStateAttempts = cityStateAttemptsFromPincode(input.billingPincode);

    try {
      // ── Step 1: Create draft order (city cascade + invoice fallback) ──────
      let createData: unknown = null;
      let lastCreateError = '';
      outer: for (const invoiceNo of invoiceCandidates) {
      for (const attempt of cityStateAttempts) {
        try {
          const res = await this.api().post(
            '/api/outbound/create-order',
            {
              segment_type:               'domestic_b2c',
              MasterOrderPickUpLocation:  pickupWarehouseId,
              MasterOrderReturnLocation:  pickupWarehouseId,
              MasterOrderDate:            bigshipDateNow(),
              MasterOrderPaymentMode:     input.isCod ? 2 : 1,  // 1=Prepaid, 2=COD
              OrderInvoiceNo:             invoiceNo,
              MasterOrderInvoiceAmount:   declaredValue,
              MasterOrderCollectableAmount: input.isCod ? String(codAmount) : '',
              MasterOrderShippingName:    limitBigshipName(input.customerName, 'Customer', 25),
              MasterOrderShippingEmail:   input.customerEmail || '',
              MasterOrderShippingMobileNo: sanitizeMobile(input.customerPhone),
              MasterOrderShippingAddress: limitBigshipAddress(input.billingAddress, 'Address', 75),
              MasterOrderShippingAddress2: '',
              MasterOrderShippingLandmark: '',
              MasterOrderShippingZipCode: input.billingPincode,
              MasterOrderShippingCity:    attempt.city,
              MasterOrderShippingState:   attempt.state,
              MasterOrderShippingCountry: 'India',
              totalNumOfBoxes: packagePayload.totalNumOfBoxes,
              boxes: packagePayload.boxes.map((box) => ({
                ...box,
                products: [{
                  productName:       'Print order',
                  qty:               '1',
                  amount:            String(declaredValue),
                  totalAmount:       declaredValue,
                  collectableAmount: codAmount,
                  categoryId:        '1',
                }],
              })),
            },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          // BigShip sometimes returns HTTP 200 with { status: false } for validation errors.
          // Treat status:false as a failure so the cascade continues to the next city.
          if (res.data?.status === false) {
            const msg = res.data?.message ?? 'city validation failed';
            lastCreateError = msg;
            this.logger.warn(`Bigship tryCreateAdhocOrder — status:false for ${attempt.city}/${attempt.state} invoice=${invoiceNo}: ${msg}`);
            const isInvoiceDuplicate = msg.toLowerCase().includes('invoice') || msg.toLowerCase().includes('unique');
            if (isInvoiceDuplicate) break; // break city loop, try next invoice
            continue;
          }
          createData = res.data;
          this.logger.log(`Bigship tryCreateAdhocOrder — order created with city=${attempt.city} state=${attempt.state} invoice=${invoiceNo}`);
          break outer;
        } catch (e: unknown) {
          lastCreateError = bigshipErrorMessage(e);
          this.logger.warn(`Bigship tryCreateAdhocOrder — create failed for ${attempt.city}/${attempt.state} invoice=${invoiceNo}: ${lastCreateError}`);
          const isInvoiceDuplicate = lastCreateError.toLowerCase().includes('invoice') || lastCreateError.toLowerCase().includes('unique');
          if (isInvoiceDuplicate) break;
        }
      }
      if (createData) break outer;
      } // end invoice candidate loop
      if (!createData) {
        return { message: `Bigship order creation failed after all attempts: ${lastCreateError}` };
      }

      // Log full response so we can see the actual field names
      this.logger.log(`Bigship create-order response: ${JSON.stringify(createData)?.slice(0, 400)}`);
      const dataPayload = (createData as any)?.data ?? createData;
      const rawOrderId = (
        dataPayload?.CustomGlobalOrderId ??
        dataPayload?.MasterCustomOrderId ??
        dataPayload?.custom_order_id ??
        dataPayload?.order_id ??
        dataPayload?.id ??
        String(dataPayload?.orderId ?? '')
      ) as string | undefined;
      // Validate: must be a non-empty string that is not '0' or 'undefined'
      const customOrderId = rawOrderId && rawOrderId !== '0' && rawOrderId !== 'undefined' && rawOrderId !== 'null'
        ? rawOrderId : undefined;
      if (!customOrderId) {
        this.logger.warn(`Bigship: create-order returned no valid order ID (raw="${rawOrderId}") — full response: ${JSON.stringify(createData)?.slice(0, 400)}`);
        return { message: `Order created in Bigship but ID not found. Response: ${JSON.stringify(createData)?.slice(0, 300)}` };
      }

      // ── Step 2: Confirm courier rates (Bigship API requires this before place-order) ──
      try {
        this.logger.log(`Bigship tryCreateAdhocOrder — calling courier-wise-shipment-cost for order ${customOrderId}`);
        await this.api().post(
          '/api/outbound/courier-wise-shipment-cost',
          { MasterCustomOrderId: customOrderId },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        this.logger.log(`Bigship tryCreateAdhocOrder — rate confirmation passed for ${customOrderId}`);
      } catch (e) {
        // Log but continue — some couriers may still allow place-order without prior rate check
        const errMsg = JSON.stringify((e as { response?: { data?: unknown } }).response?.data ?? (e as { message?: string }).message ?? '');
        this.logger.warn(`Bigship tryCreateAdhocOrder — rate confirmation step failed (continuing): ${errMsg.slice(0, 200)}`);
      }

      // ── Order + courier confirmed. Manifesting (place-order) is done by the caller
      // via placeExistingOrder() right after this returns, so the AWB comes back and
      // gets saved in the ERP instead of requiring a manual step in the Bigship UI. ──
      this.logger.log(`Bigship tryCreateAdhocOrder — order ${customOrderId} ready. Courier ${input.courierId} confirmed.`);
      return { bigshipOrderId: customOrderId };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      const detail = JSON.stringify(err.response?.data ?? err.message ?? 'unknown')?.slice(0, 400);
      this.logger.warn(`Bigship tryCreateAdhocOrder failed: ${detail}`);
      return { message: detail };
    }
  }

  async placeExistingOrder(input: {
    masterCustomOrderId: string;
    courierId: number;
    invoiceData?: { orderNumber: string; customerName: string; amount: number };
    invoiceBuffer?: Buffer;
  }): Promise<{ bigshipOrderId?: string; awbNumber?: string; message?: string }> {
    if (!this.isConfigured()) return { message: 'Bigship API credentials are not configured' };

    try {
      // getAuthToken() is inside this try block on purpose — a login/token-refresh
      // failure here must never throw uncaught, since a stale draft order was already
      // created in Bigship (with a specific invoice number) right before this call.
      // An uncaught exception would fail the whole /dispatch/book request before the
      // ERP shipment record is saved, and a retry would burn through the RP/0RP/00RP
      // invoice-candidate fallback until create-order itself starts failing too —
      // i.e. no order reaches Bigship at all.
      const token = await this.getAuthToken();
      // Per Bigship API docs, domestic B2C place-order MUST use multipart/form-data, NOT JSON.
      // Sending JSON always fails for domestic segments, so skip the basic JSON attempt entirely
      // and go directly to multipart with the invoice PDF.
      const pdfBuffer = input.invoiceBuffer && input.invoiceBuffer.length > 0
        ? input.invoiceBuffer
        : await generateInvoicePdf({
            invoiceNo: input.masterCustomOrderId,
            orderNumber: input.invoiceData?.orderNumber ?? input.masterCustomOrderId,
            customerName: input.invoiceData?.customerName ?? 'Customer',
            amount: input.invoiceData?.amount ?? 0,
            date: bigshipDateNow().slice(0, 10),
          });
      this.logger.log(`Bigship place-order — invoice ${pdfBuffer.length}b user-uploaded=${!!(input.invoiceBuffer?.length)} orderId=${input.masterCustomOrderId}`);
      const { data: multipartData } = await this.postPlaceOrderMultipart({
        token,
        masterCustomOrderId: input.masterCustomOrderId,
        courierId: input.courierId,
        invoiceAmount: input.invoiceData?.amount ?? 0,
        pdfBuffer,
      });
      this.logger.log(`Bigship place-order multipart success — ${JSON.stringify(multipartData)?.slice(0, 200)}`);
      const placeData: Record<string, unknown> = multipartData;

      const placePayload = placeData?.data as Record<string, unknown> | undefined;
      const awb = String(placePayload?.awb_assigned ?? placePayload?.reference_number ?? '');
      return {
        bigshipOrderId: input.masterCustomOrderId,
        awbNumber: awb || undefined,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown }; message?: string };
      const response = err.response?.data ?? err.message ?? 'Bigship place-order failed';
      this.logger.warn(`Bigship place-order failed: ${JSON.stringify(response)?.slice(0, 300)}`);
      return {
        message: typeof response === 'string' ? response : JSON.stringify(response)?.slice(0, 300),
      };
    }
  }

  private async postPlaceOrderBasic(input: {
    token: string;
    masterCustomOrderId: string;
    courierId: number;
    invoiceAmount: number;
  }): Promise<{ data: Record<string, unknown> }> {
    const invoiceAmt = Math.max(1, Math.round(Number(input.invoiceAmount) || 1));
    return this.api().post(
      '/api/outbound/place-order',
      {
        MasterCustomOrderId: input.masterCustomOrderId,
        courierId: input.courierId,
        riskTypeId: 1,
        invoiceNumber: input.masterCustomOrderId,
        invoiceDate: bigshipDateNow(),
        MasterOrderInvoiceAmount: invoiceAmt,
      },
      { headers: { Authorization: `Bearer ${input.token}` } },
    );
  }

  private async postPlaceOrderMultipart(input: {
    token: string;
    masterCustomOrderId: string;
    courierId: number;
    invoiceAmount: number;
    pdfBuffer: Buffer;
  }): Promise<{ data: Record<string, unknown> }> {
    try {
      const form = new FormData();
      const invoiceAmt = String(Math.max(1, Math.round(Number(input.invoiceAmount) || 1)));
      form.append('MasterCustomOrderId', input.masterCustomOrderId);
      form.append('courierId', String(input.courierId));
      form.append('riskTypeId', '1');
      form.append('invoiceType', 'uploaded');
      form.append('invoiceNumber', input.masterCustomOrderId);
      form.append('invoiceDate', bigshipDateNow());
      form.append('order_invoice_amount', invoiceAmt);
      form.append('MasterOrderInvoiceAmount', invoiceAmt);
      form.append('InvoiceData', input.pdfBuffer, {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        knownLength: input.pdfBuffer.length,
      });

      return await this.api().post('/api/outbound/place-order', form, {
        headers: {
          Authorization: `Bearer ${input.token}`,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (e) {
      throw e;
    }
  }

  // ── Warehouse list ──────────────────────────────────────────────────────────

  /**
   * Fetches all saved pickup warehouses from Bigship Direct.
   * GET /api/outbound/get-warehouse-list
   * Paginates automatically (max 25 per page) until all pages are fetched.
   */
  async getWarehouseList(): Promise<BigshipWarehouse[]> {
    if (!this.isConfigured()) return [];
    const token = await this.getAuthToken();

    // Bigship stores warehouses per segment_type.
    // Try all known types and merge, deduplicating by warehouseId.
    const segmentTypes = ['local', 'hyperlocal', 'domestic_b2b', 'domestic_b2c'];
    const seen = new Set<number>();
    const results: BigshipWarehouse[] = [];

    for (const segmentType of segmentTypes) {
      let page = 1;
      const perPage = 25;
      let fetchedForSegment = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // Bigship documents this as GET with JSON body — send via URL params to be safe
          const url = `/api/outbound/get-warehouse-list?page=${page}&perPage=${perPage}&segment_type=${segmentType}`;
          const { data } = await this.api().get(url, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // Bigship may return the array under different keys depending on API version
          const dataPayload = data?.data ?? data;
          const list: unknown = dataPayload?.warehouse
            ?? dataPayload?.warehouseList
            ?? dataPayload?.warehouses
            ?? dataPayload?.list
            ?? (Array.isArray(dataPayload) ? dataPayload : undefined);

          this.logger.log(`Bigship getWarehouseList segment=${segmentType} page=${page}: keys=${Object.keys(dataPayload ?? {}).join(',')}, count=${Array.isArray(list) ? list.length : typeof list}`);

          if (!Array.isArray(list) || list.length === 0) break;

          for (const w of list as Record<string, unknown>[]) {
            const id = Number(w.warehouseId ?? w.id);
            if (!seen.has(id)) {
              seen.add(id);
              results.push({
                bigshipWarehouseId: id,
                name:          String(w.warehouseName         ?? w.name ?? w.warehouseContactPerson ?? `Warehouse ${id}`),
                pincode:       String(w.pincode               ?? w.zip ?? ''),
                city:          String(w.city                  ?? ''),
                state:         String(w.state                 ?? ''),
                address:       String(w.warehouseAddressLine1 ?? w.address ?? ''),
                contactPerson: String(w.warehouseContactPerson ?? ''),
                phone:         String(w.warehouseAddressPhone  ?? w.phone ?? ''),
                isActive:      bigshipActiveFlag(w.isActive ?? w.active),
              });
            }
          }

          fetchedForSegment += (list as unknown[]).length;
          // Use per-segment total so cross-segment accumulation doesn't break pagination
          const total = Number(dataPayload?.total ?? data?.data?.total ?? 0);
          if (fetchedForSegment >= total || (list as unknown[]).length < perPage) break;
          page++;
        } catch (e) {
          this.logger.warn(`Bigship getWarehouseList segment=${segmentType} page=${page}: ${bigshipErrorMessage(e)}`);
          break;
        }
      }
    }

    this.logger.log(`Bigship getWarehouseList: found ${results.length} warehouse(s) across all segment types`);
    return results;
  }

  // ── Order status / AWB sync ─────────────────────────────────────────────────

  /**
   * GET /api/outbound/order-shipment-details
   * Pulls the current AWB + tracking status for an already-created Bigship order.
   * Used by the ERP's on-demand "Sync" action so a shipment's real status/AWB can
   * be refreshed after booking, instead of only ever showing what was captured at
   * dispatch time (which may be stale if the order was manifested or updated later).
   */
  async getOrderShipmentDetails(masterCustomOrderId: string): Promise<{
    awbNumber?: string;
    status?: string;
    message?: string;
  }> {
    if (!this.isConfigured()) return { message: 'Bigship API credentials are not configured' };
    try {
      const token = await this.getAuthToken();
      // Docs list this as Method: GET but with a JSON request body containing
      // MasterCustomOrderId (their API reads req.body even on GET, same pattern as
      // several other Bigship endpoints). Sending it as a query param instead
      // returned "Order not found" for every order — confirmed live on 2026-07-28 —
      // so send it the way the doc's sample request actually shows: as the body,
      // with method still GET.
      const { data } = await this.api().request({
        method: 'get',
        url: '/api/outbound/order-shipment-details',
        data: { MasterCustomOrderId: masterCustomOrderId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.status === false) {
        return { message: data?.message ?? 'Bigship order-shipment-details lookup failed' };
      }
      const details = data?.data?.getOrderDetails ?? data?.data ?? {};
      const awb = String(details?.AwbNumber ?? details?.awb_assigned ?? details?.tracking_number ?? '');
      const status = String(details?.status ?? details?.order_status ?? details?.tag ?? '');
      // TEMP DEBUG (2026-07-28): status field here has read "Unshipped" for at least one
      // order that Bigship's own Reports page showed as "Out For Delivery" with a real
      // AWB assigned — logging the raw payload once per sync to see whether there's a
      // more accurate scans/tracking field we should be preferring instead of
      // getOrderDetails.status. Safe to remove once that's confirmed.
      this.logger.log(`Bigship getOrderShipmentDetails raw for ${masterCustomOrderId}: ${JSON.stringify(data)?.slice(0, 1500)}`);
      return { awbNumber: awb || undefined, status: status || undefined };
    } catch (e: unknown) {
      const message = bigshipErrorMessage(e);
      this.logger.warn(`Bigship getOrderShipmentDetails failed for ${masterCustomOrderId}: ${message}`);
      return { message };
    }
  }

  // ── Token management ────────────────────────────────────────────────────────

  /** Call this after updating credentials so the cached token is re-fetched */
  clearToken(): void {
    this.token          = undefined;
    this.tokenUntil     = 0;
    this.tokenExpiresAt = undefined;
  }
}

// ── Invoice PDF generator ─────────────────────────────────────────────────────

async function generateInvoicePdf(params: {
  invoiceNo: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  date: string;
}): Promise<Buffer> {
  const amount = Number.isFinite(params.amount) ? params.amount : 0;
  const doc = new PDFDocument({ size: 'A4', margin: 50, compress: false });
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Header
    doc.rect(50, 50, 495, 60).fill('#1a1a2e');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('TAX INVOICE', 60, 68);
    doc.fillColor('#cccccc').font('Helvetica').fontSize(10).text('RarePrint — Dispatch Invoice', 60, 95);

    // Invoice details box
    doc.fillColor('black').rect(50, 125, 495, 90).stroke('#cccccc');
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Invoice No:', 65, 140);
    doc.text('Order No:', 65, 158);
    doc.text('Date:', 65, 176);
    doc.text('Bill To:', 65, 194);
    doc.font('Helvetica').fontSize(11);
    doc.text(sanitizePdfText(params.invoiceNo), 160, 140);
    doc.text(sanitizePdfText(params.orderNumber), 160, 158);
    doc.text(sanitizePdfText(params.date), 160, 176);
    doc.text(sanitizePdfText(params.customerName).slice(0, 50), 160, 194);

    // Table header
    doc.rect(50, 230, 495, 28).fill('#f0f0f0').stroke('#cccccc');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(11);
    doc.text('Description', 65, 239);
    doc.text('Qty', 320, 239);
    doc.text('Amount (INR)', 390, 239);

    // Table row
    doc.rect(50, 258, 495, 32).stroke('#cccccc');
    doc.font('Helvetica').fontSize(11);
    doc.text('Print Order / Stationery', 65, 268);
    doc.text('1', 320, 268);
    doc.text(amount.toFixed(2), 390, 268);

    // Total
    doc.rect(50, 290, 495, 32).fill('#f8f8f8').stroke('#cccccc');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL', 65, 300);
    doc.text(`INR ${amount.toFixed(2)}`, 390, 300);

    // Footer
    doc.fillColor('#666666').font('Helvetica').fontSize(8);
    doc.text('This is a system-generated invoice for courier dispatch purposes.', 50, 350, { align: 'center', width: 495 });
    doc.text('RarePrint — Print Solutions', 50, 362, { align: 'center', width: 495 });

    doc.end();
  });
}

function sanitizePdfText(value: string): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}
