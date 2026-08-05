import { Request, Response } from 'express';
import { PaymentService } from '../services/paymentService';

const paymentService = new PaymentService();

export async function createPixHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.body || {};

    if (!leadId) {
      res.status(400).json({ error: 'O parâmetro leadId é obrigatório no corpo da requisição.' });
      return;
    }

    const pixData = await paymentService.createPixPayment(leadId);

    res.status(200).json({
      message: 'Cobrança PIX gerada com sucesso.',
      amount: pixData.amount,
      leadId: pixData.leadId,
      paymentId: pixData.paymentId,
      qrCodeBase64: pixData.qrCodeBase64,
      qrCodeCopyPaste: pixData.qrCodeCopyPaste,
    });
  } catch (error: any) {
    console.error('Erro ao gerar PIX no createPixHandler:', error);
    res.status(500).json({
      error: 'Erro interno ao gerar cobrança PIX.',
      message: error?.message || String(error),
    });
  }
}

export async function webHookHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const query = req.query || {};

    // Notificações do Mercado Pago podem vir via query param (?id=...&topic=payment) ou no body ({ action: "payment.updated", data: { id: "..." } })
    const paymentId = query.id || body.data?.id || body.id || body.leadId;

    if (!paymentId) {
      // Responde 200 para webhooks de teste do MP sem ID
      res.status(200).send('Webhook recebido, sem id de pagamento.');
      return;
    }

    const result = await paymentService.handleWebhookNotification(String(paymentId));

    res.status(200).json({
      message: 'Notificação de Webhook processada.',
      result,
    });
  } catch (error: any) {
    console.error('Erro no processamento do Webhook:', error);
    res.status(500).json({
      error: 'Erro interno ao processar Webhook de pagamento.',
      message: error?.message || String(error),
    });
  }
}
