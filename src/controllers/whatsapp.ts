import { Response } from 'express';
import { AuthRequest } from '../types';
import whatsappService from '../services/whatsapp';
import logger from '../utils/logger';

export class WhatsAppController {
  async getNumbers(req: AuthRequest, res: Response) {
    try {
      const companyId = req.user!.companyId;
      const numbers = await whatsappService.getWhatsAppNumbers(companyId);

      logger.info('Números de WhatsApp listados', { companyId, count: numbers.length });

      res.json({ numbers });
    } catch (error: any) {
      logger.error('Erro ao listar números de WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async createNumber(req: AuthRequest, res: Response) {
    try {
      const { name, phoneNumber, phoneNumberId, token, settings } = req.body;
      const companyId = req.user!.companyId;

      if (!name || !phoneNumber || !phoneNumberId || !token) {
        return res.status(400).json({ 
          error: 'Nome, número de telefone, phoneNumberId e token são obrigatórios' 
        });
      }

      const number = await whatsappService.createWhatsAppNumber({
        name,
        phoneNumber,
        phoneNumberId,
        token,
        companyId,
        settings
      });

      logger.info('Número de WhatsApp criado', { numberId: number.id, companyId });

      res.status(201).json({ number });
    } catch (error: any) {
      logger.error('Erro ao criar número de WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async updateNumber(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, phoneNumber, phoneNumberId, token, isActive, settings } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const updatedNumber = await whatsappService.updateWhatsAppNumber(id, {
        name,
        phoneNumber,
        phoneNumberId,
        token,
        isActive,
        settings
      });

      logger.info('Número de WhatsApp atualizado', { numberId: id, companyId });

      res.json({ number: updatedNumber });
    } catch (error: any) {
      logger.error('Erro ao atualizar número de WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async deleteNumber(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      await whatsappService.deleteWhatsAppNumber(id);

      logger.info('Número de WhatsApp deletado', { numberId: id, companyId });

      res.json({ message: 'Número de WhatsApp deletado com sucesso' });
    } catch (error: any) {
      logger.error('Erro ao deletar número de WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async connectWhatsApp(req: AuthRequest, res: Response) {
    try {
      logger.info('ConnectWhatsApp chamado', { 
        params: req.params, 
        method: req.method, 
        url: req.url,
        headers: req.headers
      });

      const { id } = req.params;
      const companyId = req.user!.companyId;

      logger.info('Dados extraídos', { id, companyId });

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      logger.info('Verificação de número', { 
        totalNumbers: existingNumber.length, 
        numberExists: !!numberExists 
      });

      if (!numberExists) {
        logger.warn('Número de WhatsApp não encontrado', { id, companyId });
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const connectionResult = await whatsappService.connectWhatsApp(id);

      logger.info('WhatsApp conectado', { numberId: id, companyId });

      res.json({ 
        success: true, 
        message: 'WhatsApp conectado com sucesso',
        qrCode: connectionResult.qrCode,
        status: connectionResult.status
      });
    } catch (error: any) {
      logger.error('Erro ao conectar WhatsApp', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async disconnectWhatsApp(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      await whatsappService.disconnectWhatsApp(id);

      logger.info('WhatsApp desconectado', { numberId: id, companyId });

      res.json({ 
        success: true, 
        message: 'WhatsApp desconectado com sucesso' 
      });
    } catch (error: any) {
      logger.error('Erro ao desconectar WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getQRCode(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const qrCode = await whatsappService.getQRCode(id);

      logger.info('QR Code gerado', { numberId: id, companyId });

      res.json({ qrCode });
    } catch (error: any) {
      logger.error('Erro ao gerar QR Code', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getConnectionStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const status = await whatsappService.getConnectionStatus(id);

      logger.info('Status de conexão verificado', { numberId: id, companyId, status });

      res.json({ status });
    } catch (error: any) {
      logger.error('Erro ao verificar status de conexão', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async sendMessage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { to, message } = req.body;
      const companyId = req.user!.companyId;

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === id);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      if (!to || !message) {
        return res.status(400).json({ error: 'Destinatário e mensagem são obrigatórios' });
      }

      const success = await whatsappService.sendMessage(id, to, message);

      if (success) {
        logger.info('Mensagem WhatsApp enviada', { numberId: id, to, companyId });
        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
      } else {
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
      }
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem WhatsApp', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async sendBulkMessage(req: AuthRequest, res: Response) {
    try {
      const { whatsappNumberId, contacts, message } = req.body;
      const companyId = req.user!.companyId;

      if (!whatsappNumberId || !contacts || !message) {
        return res.status(400).json({ 
          error: 'whatsappNumberId, contacts e message são obrigatórios' 
        });
      }

      // Verificar se o número pertence à empresa
      const existingNumber = await whatsappService.getWhatsAppNumbers(companyId);
      const numberExists = existingNumber.find(n => n.id === whatsappNumberId);

      if (!numberExists) {
        return res.status(404).json({ error: 'Número de WhatsApp não encontrado' });
      }

      const results = await whatsappService.sendBulkMessage(whatsappNumberId, contacts, message);

      logger.info('Mensagens em massa enviadas', { 
        whatsappNumberId, 
        totalContacts: contacts.length,
        successCount: results.filter((r: any) => r.success).length 
      });

      res.json({ results });
    } catch (error: any) {
      logger.error('Erro ao enviar mensagens em massa', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async verifyWebhook(req: AuthRequest, res: Response) {
    try {
      const { whatsappNumberId } = req.params;
      const { mode, token, challenge } = req.query;

      const challengeResponse = whatsappService.verifyWebhook(
        whatsappNumberId,
        mode as string,
        token as string,
        challenge as string
      );

      if (challengeResponse) {
        res.status(200).send(challengeResponse);
      } else {
        res.status(403).json({ error: 'Token inválido' });
      }
    } catch (error: any) {
      logger.error('Erro ao verificar webhook', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async handleWebhook(req: AuthRequest, res: Response) {
    try {
      const { whatsappNumberId } = req.params;
      const body = req.body;

      const message = whatsappService.parseWebhookMessage(body);

      if (message) {
        // Processar a mensagem recebida em tempo real
        await whatsappService.processIncomingMessage(message);
        
        logger.info('Mensagem processada em tempo real', { 
          whatsappNumberId, 
          from: message.from,
          type: message.type 
        });
      }

      res.status(200).json({ status: 'ok' });
    } catch (error: any) {
      logger.error('Erro ao processar webhook', { error: error.message });
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

export default new WhatsAppController(); 