import axios from 'axios';
import { WhatsAppMessage } from '../types';
import logger from '../utils/logger';
import prisma from '../utils/database';
import { io } from '../index';

export class WhatsAppService {
  async sendMessage(whatsappNumberId: string, to: string, message: string): Promise<boolean> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
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

      // Emitir evento em tempo real
      io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-message-sent', {
        whatsappNumberId,
        to,
        message,
        messageId: response.data.messages[0].id,
        timestamp: new Date()
      });

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
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
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

      // Emitir evento em tempo real
      io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-media-sent', {
        whatsappNumberId,
        to,
        mediaUrl,
        caption,
        messageId: response.data.messages[0].id,
        timestamp: new Date()
      });

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

  async processIncomingMessage(message: WhatsAppMessage): Promise<void> {
    try {
      // Buscar o número de WhatsApp
      const whatsappNumber = await prisma.whatsAppNumber.findFirst({
        where: { phoneNumberId: message.phoneNumberId }
      });

      if (!whatsappNumber) {
        logger.error('Número de WhatsApp não encontrado', { phoneNumberId: message.phoneNumberId });
        return;
      }

      // Buscar ou criar customer
      let customer = await prisma.customer.findFirst({
        where: { phone: message.from }
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            name: `Cliente ${message.from}`,
            phone: message.from
          }
        });
      }

      // Criar ou buscar conversa
      let conversation = await prisma.conversation.findFirst({
        where: {
          whatsappNumberId: whatsappNumber.id,
          customerId: customer.id
        }
      });

      if (!conversation) {
        // Criar channel se não existir
        let channel = await prisma.channel.findFirst({
          where: {
            companyId: whatsappNumber.companyId,
            type: 'WHATSAPP'
          }
        });

        if (!channel) {
          channel = await prisma.channel.create({
            data: {
              name: 'WhatsApp',
              type: 'WHATSAPP',
              companyId: whatsappNumber.companyId,
              isConnected: true
            }
          });
        }

        conversation = await prisma.conversation.create({
          data: {
            whatsappNumberId: whatsappNumber.id,
            customerId: customer.id,
            channelId: channel.id,
            companyId: whatsappNumber.companyId,
            status: 'ACTIVE'
          }
        });
      }

      // Salvar mensagem
      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: conversation.channelId,
          content: message.text?.body || '',
          type: message.type as any,
          sender: 'USER',
          metadata: {
            whatsappMessageId: message.id,
            timestamp: message.timestamp
          }
        }
      });

      // Emitir evento em tempo real
      io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-message-received', {
        conversationId: conversation.id,
        message: {
          id: savedMessage.id,
          content: savedMessage.content,
          type: savedMessage.type,
          sender: savedMessage.sender,
          timestamp: savedMessage.createdAt,
          customerPhone: message.from
        },
        whatsappNumber: {
          id: whatsappNumber.id,
          name: whatsappNumber.name,
          phoneNumber: whatsappNumber.phoneNumber
        }
      });

      // Emitir para sala específica da conversa
      io.to(`conversation-${conversation.id}`).emit('conversation-message', {
        conversationId: conversation.id,
        message: {
          id: savedMessage.id,
          content: savedMessage.content,
          type: savedMessage.type,
          sender: savedMessage.sender,
          timestamp: savedMessage.createdAt
        }
      });

      logger.info('Mensagem WhatsApp processada', {
        conversationId: conversation.id,
        messageId: savedMessage.id,
        customerPhone: message.from
      });

    } catch (error: any) {
      logger.error('Erro ao processar mensagem WhatsApp', { error: error.message });
    }
  }

  async getWhatsAppNumbers(companyId: string): Promise<any[]> {
    return await prisma.whatsAppNumber.findMany({
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
    return await prisma.whatsAppNumber.create({
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
    return await prisma.whatsAppNumber.update({
      where: { id },
      data
    });
  }

  async deleteWhatsAppNumber(id: string): Promise<void> {
    await prisma.whatsAppNumber.delete({
      where: { id }
    });
  }

  // Método para emitir status de conexão em tempo real
  async emitConnectionStatus(whatsappNumberId: string, status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'): Promise<void> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (whatsappNumber) {
        io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-connection-status', {
          whatsappNumberId,
          status,
          timestamp: new Date()
        });
      }
    } catch (error: any) {
      logger.error('Erro ao emitir status de conexão', { error: error.message });
    }
  }

  // Método para emitir métricas em tempo real
  async emitMetrics(whatsappNumberId: string, metrics: any): Promise<void> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (whatsappNumber) {
        io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-metrics', {
          whatsappNumberId,
          metrics,
          timestamp: new Date()
        });
      }
    } catch (error: any) {
      logger.error('Erro ao emitir métricas', { error: error.message });
    }
  }
}

export default new WhatsAppService();