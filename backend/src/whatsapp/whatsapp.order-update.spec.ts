// Contract with the AiSensy template order_status_support_erp (approved
// 2026-10-02): 6 variables — {{1}} customer, {{2}} order no, {{3}} product,
// {{4}} status, {{5}} agent, {{6}} complaint form link. A count mismatch
// makes AiSensy reject every status message.
import { WhatsAppService } from './whatsapp.service';
import { complaintFormUrl } from '../common/complaint-link';

describe('WhatsAppService.sendOrderUpdate', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sends order_status_support_erp with the complaint form link as {{6}}', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const sent = await new WhatsAppService().sendOrderUpdate({
      customerName: 'MOHIT MEDICAL', customerPhone: '9876543210', orderNo: '1542',
      product: 'Visiting Card', status: 'Delivered', agentName: 'Ritu Ghosh',
    });

    expect(sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.campaignName).toBe('order_status_support_erp');
    expect(body.templateParams).toEqual([
      'MOHIT MEDICAL', '1542', 'Visiting Card', 'Delivered', 'Ritu Ghosh', complaintFormUrl('1542'),
    ]);
  });
});
