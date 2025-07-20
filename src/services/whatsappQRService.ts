import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { io } from '../index';
import prisma from '../utils/database';
import logger from '../utils/logger';

interface WhatsAppSession {
  client: Client;
  qrCode?: string;
  isConnected: boolean;
  phoneNumber?: string;
  companyId: string;
  sessionId: string;
}

class WhatsAppQRService {
  private sessions: Map<string, WhatsAppSession> = new Map();

  async createSession(companyId: string, sessionName: string): Promise<{ sessionId: string; qrCode: string }> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: `./sessions/${companyId}`
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    const session: WhatsAppSession = {
      client,
      qrCode: undefined,
      isConnected: false,
      companyId,
      sessionId
    };

    this.sessions.set(sessionId, session);

    // Eventos do cliente WhatsApp
    client.on('qr', async (qr) => {
      try {
        const qrCodeDataURL = await QRCode.toDataURL(qr);
        session.qrCode = qrCodeDataURL;
        
        // Emitir QR Code via WebSocket
        io.to(`company-${companyId}`).emit('whatsapp-qr-generated', {
          sessionId,
          qrCode: qrCodeDataURL,
          sessionName
        });

        logger.info('QR Code gerado', { sessionId, companyId });
      } catch (error) {
        logger.error('Erro ao gerar QR Code', { error: error instanceof Error ? error.message : String(error), sessionId });
      }
    });

    client.on('ready', async () => {
      try {
        session.isConnected = true;
        session.qrCode = undefined;
        session.phoneNumber = client.info.wid.user;

        // Salvar sessão no banco de dados
        await this.saveSessionToDatabase(sessionId, sessionName, companyId, session.phoneNumber);

        // Emitir evento de conexão
        io.to(`company-${companyId}`).emit('whatsapp-connected', {
          sessionId,
          phoneNumber: session.phoneNumber,
          sessionName
        });

        logger.info('WhatsApp conectado', { sessionId, phoneNumber: session.phoneNumber, companyId });
      } catch (error) {
        logger.error('Erro ao processar conexão', { error: error instanceof Error ? error.message : String(error), sessionId });
      }
    });

    client.on('disconnected', async (reason) => {
      try {
        session.isConnected = false;
        session.qrCode = undefined;

        // Emitir evento de desconexão
        io.to(`company-${companyId}`).emit('whatsapp-disconnected', {
          sessionId,
          reason,
          sessionName
        });

        // Remover sessão
        this.sessions.delete(sessionId);

        logger.info('WhatsApp desconectado', { sessionId, reason, companyId });
      } catch (error) {
        logger.error('Erro ao processar desconexão', { error: error instanceof Error ? error.message : String(error), sessionId });
      }
    });

    client.on('message', async (message) => {
      try {
        await this.handleIncomingMessage(session, message);
      } catch (error) {
        logger.error('Erro ao processar mensagem', { error: error instanceof Error ? error.message : String(error), sessionId });
      }
    });

    // Inicializar cliente
    await client.initialize();

    return {
      sessionId,
      qrCode: session.qrCode || ''
    };
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.client.destroy();
      this.sessions.delete(sessionId);
      logger.info('Sessão desconectada', { sessionId });
    }
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isConnected) {
        throw new Error('Sessão não encontrada ou não conectada');
      }

      const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
      await session.client.sendMessage(chatId, message);

      logger.info('Mensagem enviada', { sessionId, to, message });
      return true;
    } catch (error) {
      logger.error('Erro ao enviar mensagem', { error: error instanceof Error ? error.message : String(error), sessionId, to });
      return false;
    }
  }

  async getSessionStatus(sessionId: string): Promise<{ isConnected: boolean; phoneNumber?: string; qrCode?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { isConnected: false };
    }

    return {
      isConnected: session.isConnected,
      phoneNumber: session.phoneNumber,
      qrCode: session.qrCode
    };
  }

  async getCompanySessions(companyId: string): Promise<any[]> {
    return await prisma.whatsAppSession.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async saveSessionToDatabase(sessionId: string, sessionName: string, companyId: string, phoneNumber: string): Promise<void> {
    await prisma.whatsAppSession.create({
      data: {
        sessionId,
        name: sessionName,
        phoneNumber,
        companyId,
        isActive: true,
        isConnected: true
      }
    });
  }

  private async handleIncomingMessage(session: WhatsAppSession, message: Message): Promise<void> {
    try {
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

      // Buscar sessão no banco
      const dbSession = await prisma.whatsAppSession.findFirst({
        where: { sessionId: session.sessionId }
      });

      if (!dbSession) {
        logger.error('Sessão não encontrada no banco', { sessionId: session.sessionId });
        return;
      }

      // Criar ou buscar conversa
      let conversation = await prisma.conversation.findFirst({
        where: {
          whatsappSessionId: dbSession.id,
          customerId: customer.id
        }
      });

      if (!conversation) {
        // Criar channel se não existir
        let channel = await prisma.channel.findFirst({
          where: {
            companyId: session.companyId,
            type: 'WHATSAPP'
          }
        });

        if (!channel) {
          channel = await prisma.channel.create({
            data: {
              name: 'WhatsApp',
              type: 'WHATSAPP',
              companyId: session.companyId,
              isConnected: true
            }
          });
        }

        conversation = await prisma.conversation.create({
          data: {
            whatsappSessionId: dbSession.id,
            customerId: customer.id,
            channelId: channel.id,
            companyId: session.companyId,
            status: 'ACTIVE'
          }
        });
      }

      // Salvar mensagem
      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: conversation.channelId,
          content: message.body || '',
          type: 'TEXT',
          sender: 'CUSTOMER',
          metadata: {
            whatsappMessageId: message.id.id,
            from: message.from,
            timestamp: message.timestamp
          }
        }
      });

      // Emitir evento em tempo real
      io.to(`company-${session.companyId}`).emit('whatsapp-message-received', {
        conversationId: conversation.id,
        message: savedMessage,
        customer,
        sessionId: session.sessionId
      });

      logger.info('Mensagem processada', { 
        messageId: savedMessage.id, 
        conversationId: conversation.id,
        from: message.from 
      });
    } catch (error) {
      logger.error('Erro ao processar mensagem', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export default new WhatsAppQRService(); 