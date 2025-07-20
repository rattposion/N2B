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
      
      // Por enquanto, criar um QR Code simulado para teste
      const qrCodeData = `whatsapp://connect?session=${sessionId}&company=${companyId}`;
      const qrCodeDataURL = await QRCode.toDataURL(qrCodeData);
      
      const session: WhatsAppSession = {
        client: {} as Client, // Placeholder
        qrCode: qrCodeDataURL,
        isConnected: false,
        companyId,
        sessionId
      };

      this.sessions.set(sessionId, session);

      logger.info('Sessão criada com sucesso (modo simulado)', { sessionId, companyId });

      // Emitir QR Code via WebSocket
      io.to(`company-${companyId}`).emit('whatsapp-qr-generated', {
        sessionId,
        qrCode: qrCodeDataURL,
        sessionName
      });

      return {
        sessionId,
        qrCode: qrCodeDataURL
      };
    } catch (error) {
      logger.error('Erro ao criar sessão', { error: error instanceof Error ? error.message : String(error), companyId, sessionName });
      throw error;
    }
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
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

      logger.info('Mensagem enviada (simulado)', { sessionId, to, message });
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
