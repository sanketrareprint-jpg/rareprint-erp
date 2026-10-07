// Fship B2B request/response contract. Request shapes here were checked
// against Fship's live QC API on 2026-10-07 -- notably shipmentcurrentstatus
// takes { waybill } (not the PDF's { waybills: [] }) and Create Forward
// Order must go out as real multipart/form-data.
import axios from 'axios';
import { FshipService, parseFshipB2BRateId } from './fship.service';

jest.mock('axios', () => {
  const instance = { post: jest.fn(), get: jest.fn() };
  return {
    __esModule: true,
    default: { create: jest.fn(() => instance), isAxiosError: jest.fn(() => false) },
  };
});

const mockedAxios = axios as unknown as { create: jest.Mock };
const http = mockedAxios.create() as { post: jest.Mock };

function makeService(clientKey = 'key') {
  const carrierConfig = { getConfig: () => ({ fship: { clientKey, pickupPincode: '440032', pickupAddressId: null, pickupAddresses: [] } }) };
  return new FshipService(carrierConfig as never);
}

const boxes = [{ noOfBoxes: 2, length: 40, breadth: 30, height: 30, weight: 12 }];

describe('FshipService B2B', () => {
  beforeEach(() => {
    http.post.mockReset();
    mockedAxios.create.mockClear();
  });

  it('parses B2B rate ids and keeps them distinct from B2C "fs-" ids', () => {
    expect(parseFshipB2BRateId('fsb-10056-surface')).toEqual({ courierId: 10056, mode: 'surface' });
    expect(parseFshipB2BRateId('fsb-10070')).toEqual({ courierId: 10070, mode: 'surface' });
    expect(parseFshipB2BRateId('fsb-0-surface')).toBeNull();
    expect(parseFshipB2BRateId('fs-123')).toBeNull();
    expect('fsb-10056-surface'.startsWith('fs-')).toBe(false);
  });

  it('maps rate calculator providers to bookable quotes', async () => {
    http.post.mockResolvedValue({
      data: {
        status: true,
        providers: [
          { serviceProviderId: 10056, serviceProviderName: 'DelhiveryB2B', serviceProviderMode: 'surface', totalCharges: 1097.4,
            expectedDeliveryDate: new Date(Date.now() + 4.5 * 86_400_000).toLocaleString('en-US') },
          { serviceProviderId: 10070, serviceProviderName: 'Ekart', serviceProviderMode: 'surface', totalCharges: 0 },
        ],
      },
    });
    const res = await makeService().fetchB2BRates({
      pickupPincode: '440032', deliveryPincode: '400001', boxes, isCod: true, codAmount: 5000, invoiceAmount: 20000,
    });
    expect(http.post).toHaveBeenCalledWith('/b2bapi/ratecalculator', expect.objectContaining({
      paymentType: 1, codAmount: 5000, invoiceAmount: 20000,
      boxDimensions: [{ boxCount: 2, length: 40, width: 30, height: 30, weight: 12 }],
    }));
    expect(res.rates).toEqual([
      { rateId: 'fsb-10056-surface', carrierName: 'DelhiveryB2B', amount: 1097.4, currency: 'INR', estimatedDays: 5 },
    ]);
  });

  it('sends prepaid with zero COD and surfaces Fship\'s message when nothing is serviceable', async () => {
    http.post.mockResolvedValue({ data: { status: false, message: 'Pickup/Desitination pincode not servicable.', providers: [] } });
    const res = await makeService().fetchB2BRates({
      pickupPincode: '440032', deliveryPincode: '400001', boxes, isCod: false, codAmount: 999, invoiceAmount: 20000,
    });
    expect(http.post.mock.calls[0][1]).toEqual(expect.objectContaining({ paymentType: 2, codAmount: 0 }));
    expect(res).toEqual({ rates: [], message: 'Pickup/Desitination pincode not servicable.' });
  });

  it('creates the forward order as multipart form data without a JSON content type', async () => {
    http.post.mockResolvedValue({
      data: { status: true, apiorderid: 37796544, lr_no: '221631562', mps_waybills: ['938522709', '938522710'] },
    });
    const res = await makeService().createB2BForwardOrder({
      customerName: 'Acme', customerMobile: '9876543210', customerEmail: 'a@b.c', address: 'Addr', pincode: '400001', city: 'Mumbai',
      externalOrderId: 'ORD-1', invoiceNumber: 'ORD-1', isCod: true, collectableAmount: 5000, invoiceAmount: 20000,
      courierId: 10056, expressType: 'surface', pickAddressId: 3783, productName: 'Envelopes', boxes,
      ewayBillNumber: '545753255554', invoiceFile: { fileName: 'inv.pdf', content: Buffer.from('%PDF-1.4') },
    });
    expect(res).toEqual({ apiOrderId: 37796544, lrNumber: '221631562', waybills: ['938522709', '938522710'] });

    const multipartCreate = mockedAxios.create.mock.calls.at(-1)![0];
    expect(multipartCreate.headers).toEqual({ signature: 'key' });
    const [url, form] = http.post.mock.calls[0];
    expect(url).toBe('/b2bapi/createforwardorder');
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('Payment_Mode')).toBe('1');
    expect(form.get('CollectableAmount')).toBe('5000');
    expect(form.get('CourierId')).toBe('10056');
    expect(form.get('Pick_Address_ID')).toBe('3783');
    expect(form.get('Return_Address_ID')).toBe('3783');
    expect(form.get('b2BProductName.TotalNoOfBoxes')).toBe('2');
    expect(JSON.parse(form.get('BoxDetails'))).toEqual([{ NumberOfBoxes: 2, Weight: 12, Length: 40, Width: 30, Height: 30 }]);
    expect(form.get('EwayBillNumber')).toBe('545753255554');
    expect(form.get('B2BInVoiceFile')).toBeInstanceOf(Blob);
    expect(form.get('EwayBillFile')).toBeNull();
  });

  it('treats a response without waybills as a failed booking', async () => {
    http.post.mockResolvedValue({ data: { status: false, response: 'Pickup/Warehouse AddressId doesn`t exist.' } });
    const res = await makeService().createB2BForwardOrder({
      customerName: 'Acme', customerMobile: '9876543210', customerEmail: 'a@b.c', address: 'Addr', pincode: '400001', city: 'Mumbai',
      externalOrderId: 'ORD-1', invoiceNumber: 'ORD-1', isCod: false, collectableAmount: 5000, invoiceAmount: 20000,
      courierId: 10056, expressType: 'surface', pickAddressId: 1, productName: 'Envelopes', boxes,
    });
    expect(res).toEqual({ waybills: [], message: 'Pickup/Warehouse AddressId doesn`t exist.' });
    expect(http.post.mock.calls[0][1].get('CollectableAmount')).toBe('0');
  });

  it('registers pickup and reads the pickup order id', async () => {
    http.post.mockResolvedValue({
      data: { status: true, apipickuporderids: [{ pickupOrderId: 213033, pickupDate: '2026-09-22T00:00:00', pickupTime: '12:00:00' }] },
    });
    const res = await makeService().registerB2BPickup(['938522709', '938522710']);
    expect(http.post).toHaveBeenCalledWith('/b2bapi/registerpickup', { waybills: ['938522709', '938522710'] });
    expect(res).toEqual({ pickupOrderId: 213033, pickupDate: '2026-09-22 12:00:00' });
  });

  it('does not trust the label endpoint\'s "Success" when no file came back', async () => {
    http.post.mockResolvedValueOnce({ data: { status: 'Success', shipmentData: [{ remark: 'Pickup OrderId is not valid.', pickupOrderId: 0, manifestfile: '', invoicefile: '', labelfile: '' }] } });
    expect(await makeService().getB2BLabel(1)).toEqual({ message: 'Pickup OrderId is not valid.' });

    http.post.mockResolvedValueOnce({ data: { status: 'Success', shipmentData: [{ pickupOrderId: 213035, manifestfile: 'm.pdf', invoicefile: 'i.pdf', labelfile: 'l.pdf' }] } });
    expect(await makeService().getB2BLabel(213035)).toEqual({ labelUrl: 'l.pdf', manifestUrl: 'm.pdf', invoiceUrl: 'i.pdf' });
    expect(http.post).toHaveBeenLastCalledWith('/b2bapi/shippinglabelbypickupid', { pickupOrderId: [213035] });
  });

  it('queries current status with a single waybill string', async () => {
    http.post.mockResolvedValue({ data: { status: true, summary: { status: 'Pickup Initiated', remarks: 'Manifested' } } });
    expect(await makeService().getB2BShipmentStatus('2000701338')).toEqual({ status: 'Pickup Initiated', remark: 'Manifested' });
    expect(http.post).toHaveBeenCalledWith('/b2bapi/shipmentcurrentstatus', { waybill: '2000701338' });
  });

  it('does nothing when Fship is not configured', async () => {
    const svc = makeService('');
    expect(await svc.fetchB2BRates({ pickupPincode: '1', deliveryPincode: '2', boxes, isCod: false, codAmount: 0, invoiceAmount: 1 }))
      .toEqual({ rates: [], message: 'Fship not configured' });
    expect(http.post).not.toHaveBeenCalled();
  });
});
