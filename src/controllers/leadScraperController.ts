import { Request, Response } from 'express';
import { LeadScraperService } from '../services/leadScraperService';

const scraperService = new LeadScraperService();

export async function runScraperHandler(req: Request, res: Response): Promise<void> {
  try {
    const nicho = req.query.nicho as string;
    const cidade = req.query.cidade as string;

    if (!nicho || !cidade) {
      res.status(400).json({
        error: 'Parâmetros "nicho" e "cidade" são obrigatórios na query string.',
        example: '/api/scraper/run?nicho=Oficina%20Mecanica&cidade=Recife',
      });
      return;
    }

    const result = await scraperService.searchAndStoreLeads(nicho, cidade);

    res.status(200).json({
      message: 'Processo de raspagem e salvamento concluído com sucesso.',
      nicho,
      cidade,
      stats: {
        totalEncontrados: result.totalFound,
        totalElegiveis: result.totalEligible,
        totalSalvos: result.totalSaved,
      },
      leadsSalvos: result.leadsSaved,
    });
  } catch (error: any) {
    console.error('Erro na execução do leadScraperController:', error);
    res.status(500).json({
      error: 'Erro interno durante a raspagem de leads.',
      message: error?.message || String(error),
    });
  }
}
