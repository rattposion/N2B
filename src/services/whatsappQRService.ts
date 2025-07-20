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
    try {
      logger.info('Iniciando criação de sessão', { companyId, sessionName });
      
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

      logger.info('Cliente WhatsApp criado', { sessionId });

      // Eventos do cliente WhatsApp
      client.on('qr', async (qr) => {
        try {
          logger.info('QR Code recebido', { sessionId });
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          session.qrCode = qrCodeDataURL;
          
          // Emitir QR Code via WebSocket
          io.to(`company-${companyId}`).emit('whatsapp-qr-generated', {
            sessionId,
            qrCode: qrCodeDataURL,
            sessionName
          });

          logger.info('QR Code gerado com sucesso', { sessionId, companyId });
        } catch (error) {
          logger.error('Erro ao gerar QR Code', { error: error instanceof Error ? error.message : String(error), sessionId });
        }
      });

      client.on('ready', async () => {
        try {
          logger.info('WhatsApp pronto', { sessionId });
          session.isConnected = true;
          session.qrCode = undefined;
          session.phoneNumber = client.info.wid.user;

          // Emitir evento de conexão
          io.to(`company-${companyId}`).emit('whatsapp-connected', {
            sessionId,
            phoneNumber: session.phoneNumber,
            sessionName
          });

          logger.info('WhatsApp conectado com sucesso', { sessionId, phoneNumber: session.phoneNumber, companyId });
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
      logger.info('Inicializando cliente WhatsApp', { sessionId });
      await client.initialize();
      logger.info('Cliente WhatsApp inicializado', { sessionId });

      return {
        sessionId,
        qrCode: session.qrCode || ''
      };
    } catch (error) {
      logger.error('Erro ao criar sessão', { error: error instanceof Error ? error.message : String(error), companyId, sessionName });
      throw error;
    }
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
    try {
      // Por enquanto, retornar apenas as sessões em memória
      const sessions = Array.from(this.sessions.values())
        .filter(s => s.companyId === companyId)
        .map(s => ({
          id: s.sessionId,
          sessionId: s.sessionId,
          name: `Sessão ${s.sessionId.substring(0, 8)}`,
          phoneNumber: s.phoneNumber,
          isActive: true,
          isConnected: s.isConnected,
          qrCode: s.qrCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

      logger.info('Sessões da empresa retornadas', { companyId, count: sessions.length });
      return sessions;
    } catch (error) {
      logger.error('Erro ao buscar sessões da empresa', { error: error instanceof Error ? error.message : String(error), companyId });
      return [];
    }
  }

  private async saveSessionToDatabase(sessionId: string, sessionName: string, companyId: string, phoneNumber: string): Promise<void> {
    try {
      // Por enquanto, apenas log
      logger.info('Sessão salva (simulado)', { sessionId, sessionName, companyId, phoneNumber });
    } catch (error) {
      logger.error('Erro ao salvar sessão no banco', { error: error instanceof Error ? error.message : String(error), sessionId });
    }
  }

  private async handleIncomingMessage(session: WhatsAppSession, message: Message): Promise<void> {
    try {
      logger.info('Mensagem recebida', { 
        sessionId: session.sessionId,
        from: message.from,
        body: message.body?.substring(0, 50)
      });

      // Por enquanto, apenas log da mensagem
      logger.info('Mensagem processada (simulado)', { 
        sessionId: session.sessionId,
        from: message.from 
      });
    } catch (error) {
      logger.error('Erro ao processar mensagem', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export default new WhatsAppQRService(); 