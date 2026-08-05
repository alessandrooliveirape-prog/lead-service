import { Request, Response } from 'express';
import { AutomationPipelineService } from '../services/automationPipelineService';

const automationService = AutomationPipelineService.getInstance();

export async function getAutomationStatusHandler(_req: Request, res: Response): Promise<void> {
  try {
    const status = automationService.getStatus();
    res.status(200).json(status);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao consultar status da automação.', message: error?.message || String(error) });
  }
}

export async function startAutomationHandler(req: Request, res: Response): Promise<void> {
  try {
    const { cronExpression } = req.body || {};
    automationService.startScheduler(cronExpression);

    res.status(200).json({
      message: 'Piloto Automático ativado com sucesso!',
      status: automationService.getStatus(),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao ativar o Piloto Automático.', message: error?.message || String(error) });
  }
}

export async function stopAutomationHandler(_req: Request, res: Response): Promise<void> {
  try {
    automationService.stopScheduler();
    res.status(200).json({
      message: 'Piloto Automático pausado com sucesso.',
      status: automationService.getStatus(),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao pausar o Piloto Automático.', message: error?.message || String(error) });
  }
}

export async function runAutopilotNowHandler(req: Request, res: Response): Promise<void> {
  try {
    const { nicho, cidade } = req.body || {};

    // Dispara em background ou aguarda a conclusão do ciclo
    const summary = await automationService.runFullAutopilotCycle(nicho, cidade);

    res.status(200).json({
      message: 'Ciclo do Piloto Automático concluído com sucesso!',
      summary,
    });
  } catch (error: any) {
    console.error('Erro no runAutopilotNowHandler:', error);
    res.status(500).json({
      error: 'Erro ao executar ciclo imediato do Piloto Automático.',
      message: error?.message || String(error),
    });
  }
}
