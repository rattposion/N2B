import axios from 'axios';
import { WhatsAppMessage } from '../types';
import logger from '../utils/logger';
import prisma from '../utils/database';

export class WhatsAppService {
  async sendMessage(whatsappNumberId: string, to: string, message: string): Promise<boolean> {
    try {
      const whatsappNumber = await prisma.whatsappNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber || !whatsappNumber.isActive) {
        throw new Error('Número de WhatsApp não encontrado ou inativo');
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${whatsappNumber.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${whatsappNumber.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Mensagem WhatsApp enviada', { 
        whatsappNumberId, 
        to, 
        messageId: response.data.messages[0].id 
      });
      return true;
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem WhatsApp', { 
        error: error.message, 
        whatsappNumberId, 
        to 
      });
      return false;
    }
  }

  async sendMediaMessage(whatsappNumberId: string, to: string, mediaUrl: string, caption?: string): Promise<boolean> {
    try {
      const whatsappNumber = await prisma.whatsappNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber || !whatsappNumber.isActive) {
        throw new Error('Número de WhatsApp não encontrado ou inativo');
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${whatsappNumber.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: {
            link: mediaUrl,
            caption,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${whatsappNumber.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Mídia WhatsApp enviada', { whatsappNumberId, to, mediaUrl });
      return true;
    } catch (error: any) {
      logger.error('Erro ao enviar mídia WhatsApp', { 
        error: error.message, 
        whatsappNumberId, 
        to 
      });
      return false;
    }
  }

  async sendBulkMessage(whatsappNumberId: string, contacts: string[], message: any): Promise<any> {
    const results = [];
    
    for (const contact of contacts) {
      try {
        let success = false;
        
        if (message.type === 'text') {
          success = await this.sendMessage(whatsappNumberId, contact, message.content);
        } else if (message.type === 'media') {
          success = await this.sendMediaMessage(whatsappNumberId, contact, message.mediaUrl, message.caption);
        }
        
        results.push({
          contact,
          success,
          timestamp: new Date()
        });
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error: any) {
        results.push({
          contact,
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    }
    
    return results;
  }

  verifyWebhook(whatsappNumberId: string, mode: string, token: string, challenge: string): string | null {
    // Buscar o webhook específico do número
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('Webhook WhatsApp verificado com sucesso', { whatsappNumberId });
      return challenge;
    }
    return null;
  }

  parseWebhookMessage(body: any): WhatsAppMessage | null {
    try {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        return null;
      }

      const message = messages[0];
      return {
        from: message.from,
        id: message.id,
        timestamp: message.timestamp,
        text: message.text,
        type: message.type,
        phoneNumberId: value?.metadata?.phone_number_id
      };
    } catch (error: any) {
      logger.error('Erro ao processar webhook WhatsApp', { error: error.message });
      return null;
    }
  }

  async getWhatsAppNumbers(companyId: string): Promise<any[]> {
    return await prisma.whatsappNumber.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createWhatsAppNumber(data: {
    name: string;
    phoneNumber: string;
    phoneNumberId: string;
    token: string;
    companyId: string;
    settings?: any;
  }): Promise<any> {
    return await prisma.whatsappNumber.create({
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        phoneNumberId: data.phoneNumberId,
        token: data.token,
        companyId: data.companyId,
        settings: data.settings || {}
      }
    });
  }

  async updateWhatsAppNumber(id: string, data: any): Promise<any> {
    return await prisma.whatsappNumber.update({
      where: { id },
      data
    });
  }

  async deleteWhatsAppNumber(id: string): Promise<void> {
    await prisma.whatsappNumber.delete({
      where: { id }
    });
  }
}

export default new WhatsAppService();