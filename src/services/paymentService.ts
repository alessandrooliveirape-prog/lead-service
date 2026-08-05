import { pool } from '../config/database';
import { MessagingService } from './messagingService';
import { LeadRecord } from './auditService';

export interface PixPaymentResponse {
  paymentId: number | string;
  status: string;
  qrCodeBase64: string;
  qrCodeCopyPaste: string;
  amount: number;
  leadId: string;
}

export class PaymentService {
  private mpAccessToken: string;
  private messagingService: MessagingService;

  constructor() {
    this.mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    this.messagingService = new MessagingService();
  }

  /**
   * Gera uma cobrança PIX de R$ 47,00 via Mercado Pago API
   */
  public async createPixPayment(leadId: string): Promise<PixPaymentResponse> {
    // 1. Busca o Lead no banco de dados
    const selectQuery = `SELECT * FROM leads WHERE id = $1;`;
    const selectRes = await pool.query(selectQuery, [leadId]);

    if (selectRes.rowCount === 0) {
      throw new Error(`Lead com ID ${leadId} não encontrado.`);
    }

    const lead: LeadRecord = selectRes.rows[0];

    // Se o token do Mercado Pago não estiver configurado, podemos simular em desenvolvimento
    if (!this.mpAccessToken) {
      console.warn('Aviso: MERCADOPAGO_ACCESS_TOKEN não fornecido. Gerando PIX de simulação.');
      return {
        paymentId: `SIM_PIX_${Date.now()}`,
        status: 'pending',
        qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        qrCodeCopyPaste: '00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540547.005802BR5925EMPREGA PE6008RECIFE62070503***6304E2CA',
        amount: 47.00,
        leadId: lead.id,
      };
    }

    // 2. Monta a requisição para a API do Mercado Pago
    const url = 'https://api.mercadopago.com/v1/payments';
    const idempotencyKey = `pix_${leadId}_${Date.now()}`;

    const bodyData = {
      transaction_amount: 47.00,
      description: `Diagnóstico e Plano de Ação Digital - ${lead.name}`,
      payment_method_id: 'pix',
      payer: {
        email: 'lead.contato@empregape.com.br',
        first_name: lead.name,
      },
      external_reference: leadId,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.mpAccessToken}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(bodyData),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro ao gerar PIX no Mercado Pago: ${response.status} - ${errText}`);
    }

    const data: any = await response.json();

    const transactionData = data?.point_of_interaction?.transaction_data;
    if (!transactionData) {
      throw new Error('Resposta do Mercado Pago não contém os dados do PIX.');
    }

    return {
      paymentId: data.id,
      status: data.status,
      qrCodeBase64: transactionData.qr_code_base64,
      qrCodeCopyPaste: transactionData.qr_code,
      amount: data.transaction_amount,
      leadId: lead.id,
    };
  }

  /**
   * Processa notificações de Webhook do Mercado Pago
   */
  public async handleWebhookNotification(paymentId: string): Promise<{ success: boolean; leadId?: string; status?: string }> {
    if (!paymentId) {
      throw new Error('ID do pagamento é obrigatório.');
    }

    let paymentStatus = 'approved';
    let leadId = '';

    // Se o token estiver configurado, busca os dados reais da transação
    if (this.mpAccessToken) {
      const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.mpAccessToken}`,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro ao consultar pagamento no Mercado Pago: ${response.status} - ${errText}`);
      }

      const data: any = await response.json();
      paymentStatus = data.status;
      leadId = data.external_reference;
    } else {
      // Em modo de simulação, o paymentId recebido pode ser o leadId
      leadId = paymentId;
    }

    if (paymentStatus === 'approved') {
      if (!leadId) {
        throw new Error('Pagamento aprovado, porém external_reference (leadId) não foi localizado.');
      }

      // 1. Atualiza o status do lead no banco para 'PAID'
      const updateQuery = `
        UPDATE leads
        SET status = 'PAID',
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `;
      const updateRes = await pool.query(updateQuery, [leadId]);

      if (updateRes.rowCount === 0) {
        throw new Error(`Lead ${leadId} associado ao pagamento não foi localizado no banco.`);
      }

      // 2. Dispara o relatório completo via WhatsApp para o cliente
      console.log(`[Webhook MercadoPago] Pagamento aprovado para o Lead ${leadId}. Disparando relatório via WhatsApp...`);
      await this.messagingService.sendFullReportMessage(leadId);

      return {
        success: true,
        leadId,
        status: paymentStatus,
      };
    }

    return {
      success: false,
      leadId,
      status: paymentStatus,
    };
  }
}
