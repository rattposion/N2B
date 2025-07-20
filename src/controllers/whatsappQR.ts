import { Response } from 'express';
import { AuthRequest } from '../types';
import whatsappQRService from '../services/whatsappQRService';
import logger from '../utils/logger';

export class WhatsAppQRController {
  async createSession(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body;
      const companyId = req.user!.companyId;

      if (!name) {
        return res.status(400).json({ 
          error: 'Nome da sessão é obrigatório' 
        });
      }

      const result = await whatsappQRService.createSession(companyId, name);

      logger.info('Sessão WhatsApp criada', { sessionId: result.sessionId, companyId });

      res.json({ 
        success: true, 
        sessionId: result.sessionId,
        qrCode: result.qrCode
      });
    } catch (error: any) {
      logger.error('Erro ao criar sessão WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async disconnectSession(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se a sessão pertence à empresa
      const sessions = await whatsappQRService.getCompanySessions(companyId);
      const sessionExists = sessions.find(s => s.sessionId === sessionId);

      if (!sessionExists) {
        return res.status(404).json({ error: 'Sessão WhatsApp não encontrada' });
      }

      await whatsappQRService.disconnectSession(sessionId);

      logger.info('Sessão WhatsApp desconectada', { sessionId, companyId });

      res.json({ 
        success: true, 
        message: 'Sessão desconectada com sucesso' 
      });
    } catch (error: any) {
      logger.error('Erro ao desconectar sessão WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getSessionStatus(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se a sessão pertence à empresa
      const sessions = await whatsappQRService.getCompanySessions(companyId);
      const sessionExists = sessions.find(s => s.sessionId === sessionId);

      if (!sessionExists) {
        return res.status(404).json({ error: 'Sessão WhatsApp não encontrada' });
      }

      const status = await whatsappQRService.getSessionStatus(sessionId);

      logger.info('Status da sessão verificado', { sessionId, companyId, status });

      res.json(status);
    } catch (error: any) {
      logger.error('Erro ao verificar status da sessão', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getSessions(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;
      const sessions = await whatsappQRService.getCompanySessions(companyId);

      logger.info('Sessões WhatsApp listadas', { companyId, count: sessions.length });

      res.json({ sessions });
    } catch (error: any) {
      logger.error('Erro ao listar sessões WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async sendMessage(req: AuthRequest, res: Response) {
    try {
      const { sessionId } = req.params;
      const { to, message } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se a sessão pertence à empresa
      const sessions = await whatsappQRService.getCompanySessions(companyId);
      const sessionExists = sessions.find(s => s.sessionId === sessionId);

      if (!sessionExists) {
        return res.status(404).json({ error: 'Sessão WhatsApp não encontrada' });
      }

      if (!to || !message) {
        return res.status(400).json({ error: 'Destinatário e mensagem são obrigatórios' });
      }

      const success = await whatsappQRService.sendMessage(sessionId, to, message);

      if (success) {
        logger.info('Mensagem WhatsApp enviada', { sessionId, to, companyId });
        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
      } else {
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
      }
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new WhatsAppQRController(); 