const ts = require('typescript');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const BILLING_DIR = '/sessions/zealous-great-bohr/mnt/rareprint-erp/backend/src/billing';

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('.') && parent && parent.filename && parent.filename.startsWith(BILLING_DIR)) {
    const base = path.resolve(path.dirname(parent.filename), request);
    const tsFile = base + '.ts';
    if (fs.existsSync(tsFile)) {
      const cacheKey = tsFile;
      if (!Module._cache[cacheKey]) {
        const src = fs.readFileSync(tsFile, 'utf8');
        const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true }, fileName: tsFile }).outputText;
        const m = new Module(cacheKey, parent);
        m.filename = cacheKey;
        m.paths = Module._nodeModulePaths(path.dirname(cacheKey));
        Module._cache[cacheKey] = m;
        m._compile(out, cacheKey);
      }
      return cacheKey;
    }
  }
  return origResolve.call(this, request, parent, ...rest);
};

function loadTs(relPath) {
  const fullPath = path.join(BILLING_DIR, relPath);
  const src = fs.readFileSync(fullPath, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true }, fileName: fullPath }).outputText;
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(out, fullPath);
  return mod.exports;
}

const invoicePdf = loadTs('invoice-pdf.ts');

const data = {
  invoiceNumber: '1579',
  issueDate: '31-08-2026',
  customerName: 'SWASTHY HOMEO CLINIC',
  customerAddress: 'THANE, MAHARASHTRA, 421201',
  customerPhone: '9920092621',
  customerGstin: '',
  customerState: 'MAHARASHTRA',
  gstTreatment: 'INTRA_STATE',
  previousBalance: 0,
  currentBalance: 0,
  paidAmount: 4500,
  balanceAmount: 0,
  subtotal: 4500,
  totalAmount: 4500,
  items: [
    { productName: 'ENVELOPE', hsnSac: null, productDetails: 'Size: 10x4.5 inch, GSM: 90, Paper: Cream Wove, Sides: Single', quantity: 5000, unit: 'PCS', unitPrice: 0.9, gstRatePct: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, taxableAmount: 4500, lineTotal: 4500 },
  ],
  agentName: 'AAKANSHA TOTAWAR',
  termsAndConditions: '-',
  company: {
    companyName: 'RAREPRINT.IN',
    companyAddress: 'RAREPRINT.IN, BEHIND NUTAN GYM, TUKDOJI CHOWK, GHUTKALA WARD, CHANDRAPUR,',
    companyPhone: '9637318960',
    companyEmail: 'sales.rareprint@gmail.com',
    companyGstin: '27GEKPP2259Q1ZI',
    companyState: 'Maharashtra',
    bankName: 'IDBI BANK',
    bankAccountNumber: '0513102000013378',
    bankIfsc: 'IBKL0000513',
    bankAccountHolderName: 'RAREPRINT IN',
  },
  status: 'ISSUED',
};

(async () => {
  const buf = await invoicePdf.buildInvoicePdf(data);
  fs.writeFileSync('/tmp/quicktest_items.pdf', buf);
  console.log('done', buf.length);
})().catch(e => { console.error(e); process.exit(1); });
