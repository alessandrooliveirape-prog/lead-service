import { Request, Response } from 'express';
import { MessagingService } from '../services/messagingService';

const messagingService = new MessagingService();

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      res.status(400).json({ error: 'Parâmetro leadId é obrigatório na URL.' });
      return;
    }

    const result = await messagingService.sendProspectMessage(leadId);

    res.status(200).json({
      message: 'Mensagem de prospecção enviada com sucesso.',
      result,
    });
  } catch (error: any) {
    console.error('Erro na execução do sendMessageHandler:', error);
    res.status(500).json({
      error: 'Erro interno ao enviar mensagem de prospecção via WhatsApp.',
      message: error?.message || String(error),
    });
  }
}

export async function sendBatchHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadIds } = req.body || {};

    const batchResult = await messagingService.sendBatchProspectMessages(leadIds);

    res.status(200).json({
      message: 'Processamento de mensagens em lote concluído com sucesso.',
      stats: {
        totalProcessados: batchResult.processed,
        sucessos: batchResult.successful,
        falhas: batchResult.failed,
      },
      detalhes: batchResult.results,
    });
  } catch (error: any) {
    console.error('Erro na execução do sendBatchHandler:', error);
    res.status(500).json({
      error: 'Erro interno durante o processamento do lote de mensagens.',
      message: error?.message || String(error),
    });
  }
}
