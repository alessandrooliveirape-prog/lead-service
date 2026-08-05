import { Request, Response } from 'express';
import { AuditService } from '../services/auditService';

const auditService = new AuditService();

export async function auditLeadHandler(req: Request, res: Response): Promise<void> {
  try {
    const { leadId } = req.params;

    if (!leadId) {
      res.status(400).json({ error: 'Parâmetro leadId é obrigatório na URL.' });
      return;
    }

    const updatedLead = await auditService.auditLeadById(leadId);

    res.status(200).json({
      message: 'Auditoria do Lead concluída com sucesso.',
      lead: updatedLead,
    });
  } catch (error: any) {
    console.error('Erro na execução da auditoria no auditController:', error);
    
    if (error.message?.includes('não encontrado')) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(500).json({
      error: 'Erro interno ao gerar auditoria para o lead.',
      message: error?.message || String(error),
    });
  }
}
