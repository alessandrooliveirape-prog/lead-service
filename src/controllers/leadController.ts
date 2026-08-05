import { Request, Response } from 'express';
import { LeadQueryService } from '../services/leadQueryService';

const leadQueryService = new LeadQueryService();

export async function getStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await leadQueryService.getStats();
    res.status(200).json(stats);
  } catch (error: any) {
    console.error('Erro ao buscar estatísticas dos leads:', error);
    res.status(500).json({
      error: 'Erro interno ao consultar KPIs do funil.',
      message: error?.message || String(error),
    });
  }
}

export async function getLeadsHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 15;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await leadQueryService.getLeads({ page, limit, status, search });
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Erro ao consultar lista de leads:', error);
    res.status(500).json({
      error: 'Erro interno ao listar leads.',
      message: error?.message || String(error),
    });
  }
}
