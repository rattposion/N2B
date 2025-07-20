import axios from 'axios';
import { WhatsAppMessage } from '../types';
import logger from '../utils/logger';
import prisma from '../utils/database';
import { io } from '../index';
import QRCode from 'qrcode';

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

  async connectWhatsApp(whatsappNumberId: string): Promise<{ qrCode?: string; status: string }> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber) {
        throw new Error('Número de WhatsApp não encontrado');
      }

      // Verificar se já está conectado
      if (whatsappNumber.isConnected) {
        return { status: 'CONNECTED' };
      }

      // Gerar QR Code para conexão
      const qrCodeData = `whatsapp://connect?phone=${whatsappNumber.phoneNumber}&token=${whatsappNumber.token}`;
      const qrCode = await QRCode.toDataURL(qrCodeData);

      // Atualizar status no banco
      await prisma.whatsAppNumber.update({
        where: { id: whatsappNumberId },
        data: { 
          isConnected: false,
          qrCode,
          updatedAt: new Date()
        }
      });

      // Emitir evento de status
      await this.emitConnectionStatus(whatsappNumberId, 'CONNECTING');

      logger.info('QR Code gerado para conexão WhatsApp', { whatsappNumberId });

      return { qrCode, status: 'CONNECTING' };
    } catch (error: any) {
      logger.error('Erro ao conectar WhatsApp', { error: error.message, whatsappNumberId });
      throw error;
    }
  }

  async disconnectWhatsApp(whatsappNumberId: string): Promise<void> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber) {
        throw new Error('Número de WhatsApp não encontrado');
      }

      // Atualizar status no banco
      await prisma.whatsAppNumber.update({
        where: { id: whatsappNumberId },
        data: { 
          isConnected: false,
          qrCode: null,
          updatedAt: new Date()
        }
      });

      // Emitir evento de status
      await this.emitConnectionStatus(whatsappNumberId, 'DISCONNECTED');

      logger.info('WhatsApp desconectado', { whatsappNumberId });
    } catch (error: any) {
      logger.error('Erro ao desconectar WhatsApp', { error: error.message, whatsappNumberId });
      throw error;
    }
  }

  async getQRCode(whatsappNumberId: string): Promise<string | null> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber) {
        throw new Error('Número de WhatsApp não encontrado');
      }

      if (whatsappNumber.isConnected) {
        return null; // Já conectado, não precisa de QR Code
      }

      // Se já tem QR Code, retornar
      if (whatsappNumber.qrCode) {
        return whatsappNumber.qrCode;
      }

      // Gerar novo QR Code
      const qrCodeData = `whatsapp://connect?phone=${whatsappNumber.phoneNumber}&token=${whatsappNumber.token}`;
      const qrCode = await QRCode.toDataURL(qrCodeData);

      // Salvar QR Code no banco
      await prisma.whatsAppNumber.update({
        where: { id: whatsappNumberId },
        data: { qrCode, updatedAt: new Date() }
      });

      logger.info('QR Code gerado', { whatsappNumberId });

      return qrCode;
    } catch (error: any) {
      logger.error('Erro ao gerar QR Code', { error: error.message, whatsappNumberId });
      throw error;
    }
  }

  async getConnectionStatus(whatsappNumberId: string): Promise<string> {
    try {
      const whatsappNumber = await prisma.whatsAppNumber.findUnique({
        where: { id: whatsappNumberId }
      });

      if (!whatsappNumber) {
        throw new Error('Número de WhatsApp não encontrado');
      }

      // Verificar status real com a API do Facebook
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v18.0/${whatsappNumber.phoneNumberId}`,
          {
            headers: {
              'Authorization': `Bearer ${whatsappNumber.token}`,
            },
          }
        );

        const isConnected = response.data.verified_name !== undefined;
        
        // Atualizar status no banco se mudou
        if (isConnected !== whatsappNumber.isConnected) {
          await prisma.whatsAppNumber.update({
            where: { id: whatsappNumberId },
            data: { 
              isConnected,
              qrCode: isConnected ? null : whatsappNumber.qrCode,
              updatedAt: new Date()
            }
          });
        }

        return isConnected ? 'CONNECTED' : 'DISCONNECTED';
      } catch (apiError: any) {
        // Se erro na API, usar status do banco
        return whatsappNumber.isConnected ? 'CONNECTED' : 'DISCONNECTED';
      }
    } catch (error: any) {
      logger.error('Erro ao verificar status de conexão', { error: error.message, whatsappNumberId });
      throw error;
    }
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
          sender: 'CUSTOMER',
          metadata: {
            whatsappMessageId: message.id,
            from: message.from,
            timestamp: message.timestamp
          }
        }
      });

      // Emitir evento em tempo real
      io.to(`company-${whatsappNumber.companyId}`).emit('whatsapp-message-received', {
        conversationId: conversation.id,
        message: savedMessage,
        customer,
        whatsappNumberId: whatsappNumber.id
      });

      logger.info('Mensagem WhatsApp processada', { 
        messageId: savedMessage.id, 
        conversationId: conversation.id,
        from: message.from 
      });
    } catch (error: any) {
      logger.error('Erro ao processar mensagem WhatsApp', { error: error.message });
    }
  }

  async getWhatsAppNumbers(companyId: string): Promise<any[]> {
    return await prisma.whatsAppNumber.findMany({
      where: { companyId },
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
        ...data,
        isActive: true,
        isConnected: false,
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

  async emitConnectionStatus(whatsappNumberId: string, status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'CONNECTING'): Promise<void> {
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
  }

  async emitMetrics(whatsappNumberId: string, metrics: any): Promise<void> {
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
  }
}

export default new WhatsAppService();