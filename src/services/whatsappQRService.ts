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
  sessionName: string;
}

class WhatsAppQRService {
  private sessions: Map<string, WhatsAppSession> = new Map();

  async createSession(companyId: string, sessionName: string): Promise<{ sessionId: string; qrCode: string }> {
    try {
      logger.info('Iniciando criação de sessão WhatsApp', { companyId, sessionName });
      
      // Verificar se o diretório de sessões existe
      const fs = require('fs');
      const path = require('path');
      const sessionsDir = path.join(process.cwd(), 'sessions', companyId);
      
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        logger.info('Diretório de sessões criado', { sessionsDir });
      }
      
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info('Criando cliente WhatsApp', { sessionId });

      // Configurações mais simples do Puppeteer para evitar problemas
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-ipc-flooding-protection',
        '--enable-logging',
        '--log-level=0',
        '--silent-launch',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-experiments',
        '--no-pings',
        '--single-process',
        '--disable-background-networking',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list'
      ];

      // Verificar se estamos em produção e ajustar configurações
      if (process.env.NODE_ENV === 'production') {
        puppeteerArgs.push('--disable-dev-shm-usage');
        puppeteerArgs.push('--disable-accelerated-2d-canvas');
        puppeteerArgs.push('--disable-web-security');
      }

      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: `./sessions/${companyId}`
        }),
        puppeteer: {
          headless: true,
          args: puppeteerArgs,
          timeout: 120000, // Aumentar timeout para 2 minutos
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
      });

      const session: WhatsAppSession = {
        client,
        qrCode: undefined,
        isConnected: false,
        companyId,
        sessionId,
        sessionName
      };

      this.sessions.set(sessionId, session);

      logger.info('Cliente WhatsApp criado', { sessionId });

      // Promise para aguardar o QR Code
      let qrCodePromise: Promise<string> | null = null;
      let qrCodeResolve: ((value: string) => void) | null = null;

      // Eventos do cliente WhatsApp
      client.on('qr', async (qr) => {
        try {
          logger.info('QR Code recebido do WhatsApp', { sessionId });
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          session.qrCode = qrCodeDataURL;
          
          // Resolver a promise do QR Code
          if (qrCodeResolve) {
            qrCodeResolve(qrCodeDataURL);
          }
          
          // Emitir QR Code via WebSocket
          io.to(`company-${companyId}`).emit('whatsapp-qr-generated', {
            sessionId,
            qrCode: qrCodeDataURL,
            sessionName
          });

          logger.info('QR Code gerado e emitido', { sessionId, companyId });
        } catch (error) {
          logger.error('Erro ao gerar QR Code', { error: error instanceof Error ? error.message : String(error), sessionId });
        }
      });

      client.on('ready', async () => {
        try {
          logger.info('WhatsApp pronto para uso', { sessionId });
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

          logger.info('WhatsApp conectado com sucesso', { 
            sessionId, 
            phoneNumber: session.phoneNumber, 
            companyId,
            sessionName 
          });
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

      client.on('auth_failure', (msg) => {
        logger.error('Falha na autenticação WhatsApp', { sessionId, message: msg });
      });

      client.on('loading_screen', (percent, message) => {
        logger.info('Carregando WhatsApp', { sessionId, percent, message });
      });

      // Inicializar cliente
      logger.info('Inicializando cliente WhatsApp', { sessionId });
      
      try {
        await client.initialize();
        logger.info('Cliente WhatsApp inicializado com sucesso', { sessionId });
        
        // Aguardar QR Code por até 30 segundos
        qrCodePromise = new Promise<string>((resolve, reject) => {
          qrCodeResolve = resolve;
          
          // Timeout de 30 segundos
          setTimeout(() => {
            if (session.qrCode) {
              resolve(session.qrCode);
            } else {
              reject(new Error('Timeout aguardando QR Code'));
            }
          }, 30000);
        });
        
        const qrCode = await qrCodePromise;
        
        logger.info('Sessão criada com sucesso', { 
          sessionId, 
          hasQRCode: !!qrCode,
          qrCodeLength: qrCode?.length,
          sessionsInMemory: this.sessions.size
        });
        
        return {
          sessionId,
          qrCode
        };
      } catch (initError) {
        logger.error('Erro ao inicializar cliente WhatsApp', { 
          error: initError instanceof Error ? initError.message : String(initError),
          stack: initError instanceof Error ? initError.stack : undefined,
          sessionId 
        });
        
        // Limpar sessão em caso de erro
        this.sessions.delete(sessionId);
        throw new Error(`Falha ao inicializar WhatsApp: ${initError instanceof Error ? initError.message : String(initError)}`);
      }
    } catch (error) {
      logger.error('Erro ao criar sessão WhatsApp', { 
        error: error instanceof Error ? error.message : String(error), 
        stack: error instanceof Error ? error.stack : undefined,
        companyId, 
        sessionName 
      });
      throw error;
    }
  }

  async disconnectSession(sessionId: string): Promise<void> {
    try {
      logger.info('Iniciando desconexão da sessão', { sessionId });
      
      const session = this.sessions.get(sessionId);
      if (session) {
        try {
          // Verificar se o cliente ainda existe antes de tentar destruí-lo
          if (session.client && typeof session.client.destroy === 'function') {
            await session.client.destroy();
            logger.info('Cliente WhatsApp destruído', { sessionId });
          } else {
            logger.warn('Cliente WhatsApp não existe ou não pode ser destruído', { sessionId });
          }
        } catch (destroyError) {
          logger.error('Erro ao destruir cliente WhatsApp', { 
            error: destroyError instanceof Error ? destroyError.message : String(destroyError), 
            sessionId 
          });
        }
        
        // Remover da memória
        this.sessions.delete(sessionId);
        logger.info('Sessão removida da memória', { sessionId });
      } else {
        logger.warn('Sessão não encontrada na memória', { sessionId });
      }

      // Remover do banco de dados também
      try {
        await prisma.whatsAppSession.deleteMany({
          where: { sessionId }
        });
        logger.info('Sessão removida do banco de dados', { sessionId });
      } catch (dbError) {
        logger.error('Erro ao remover sessão do banco de dados', { 
          error: dbError instanceof Error ? dbError.message : String(dbError), 
          sessionId 
        });
      }

      logger.info('Sessão desconectada com sucesso', { sessionId });
    } catch (error) {
      logger.error('Erro ao desconectar sessão', { 
        error: error instanceof Error ? error.message : String(error), 
        sessionId 
      });
      throw error;
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

      logger.info('Mensagem enviada com sucesso', { sessionId, to, message });
      return true;
    } catch (error) {
      logger.error('Erro ao enviar mensagem', { error: error instanceof Error ? error.message : String(error), sessionId, to });
      return false;
    }
  }

  async getSessionStatus(sessionId: string): Promise<{ isConnected: boolean; phoneNumber?: string; qrCode?: string }> {
    try {
      logger.info('Verificando status da sessão', { sessionId });
      
      const session = this.sessions.get(sessionId);
      
      if (session) {
        logger.info('Sessão encontrada na memória', { 
          sessionId, 
          isConnected: session.isConnected, 
          hasQRCode: !!session.qrCode,
          phoneNumber: session.phoneNumber 
        });
        
        return {
          isConnected: session.isConnected,
          phoneNumber: session.phoneNumber,
          qrCode: session.qrCode
        };
      } else {
        logger.warn('Sessão não encontrada na memória', { sessionId });
        
        // Verificar se existe no banco de dados
        try {
          const dbSession = await prisma.whatsAppSession.findFirst({
            where: { sessionId }
          });
          
          if (dbSession) {
            logger.info('Sessão encontrada no banco de dados', { 
              sessionId, 
              isConnected: dbSession.isConnected,
              isActive: dbSession.isActive 
            });
            
            return {
              isConnected: dbSession.isConnected,
              phoneNumber: dbSession.phoneNumber || undefined,
              qrCode: undefined // QR Code só existe na memória
            };
          } else {
            logger.warn('Sessão não encontrada no banco de dados', { sessionId });
            return { isConnected: false };
          }
        } catch (dbError) {
          logger.error('Erro ao buscar sessão no banco', { 
            error: dbError instanceof Error ? dbError.message : String(dbError), 
            sessionId 
          });
          return { isConnected: false };
        }
      }
    } catch (error) {
      logger.error('Erro ao verificar status da sessão', { 
        error: error instanceof Error ? error.message : String(error), 
        sessionId 
      });
      return { isConnected: false };
    }
  }

  async getCompanySessions(companyId: string): Promise<any[]> {
    try {
      // Buscar sessões do banco de dados
      const dbSessions = await prisma.whatsAppSession.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' }
      });

      // Combinar com sessões em memória
      const memorySessions = Array.from(this.sessions.values())
        .filter(s => s.companyId === companyId)
        .map(s => ({
          id: s.sessionId,
          sessionId: s.sessionId,
          name: s.sessionName,
          phoneNumber: s.phoneNumber,
          isActive: true,
          isConnected: s.isConnected,
          qrCode: s.qrCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

      // Combinar e remover duplicatas
      const allSessions = [...memorySessions, ...dbSessions];
      const uniqueSessions = allSessions.filter((session, index, self) => 
        index === self.findIndex(s => s.sessionId === session.sessionId)
      );

      // Limpar sessões órfãs do banco (que não estão mais na memória)
      const memorySessionIds = new Set(memorySessions.map(s => s.sessionId));
      const orphanedDbSessions = dbSessions.filter(dbSession => !memorySessionIds.has(dbSession.sessionId));
      
      if (orphanedDbSessions.length > 0) {
        logger.info('Limpando sessões órfãs do banco', { 
          companyId, 
          orphanedCount: orphanedDbSessions.length,
          orphanedIds: orphanedDbSessions.map(s => s.sessionId)
        });
        
        // Marcar como inativas em vez de deletar para manter histórico
        await prisma.whatsAppSession.updateMany({
          where: {
            id: { in: orphanedDbSessions.map(s => s.id) }
          },
          data: {
            isActive: false,
            isConnected: false
          }
        });
      }

      logger.info('Sessões da empresa retornadas', { 
        companyId, 
        count: uniqueSessions.length,
        memoryCount: memorySessions.length,
        dbCount: dbSessions.length
      });
      
      return uniqueSessions;
    } catch (error) {
      logger.error('Erro ao buscar sessões da empresa', { 
        error: error instanceof Error ? error.message : String(error), 
        companyId 
      });
      return [];
    }
  }

  private async saveSessionToDatabase(sessionId: string, sessionName: string, companyId: string, phoneNumber: string): Promise<void> {
    try {
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
      logger.info('Sessão salva no banco de dados', { sessionId, sessionName, companyId, phoneNumber });
    } catch (error) {
      logger.error('Erro ao salvar sessão no banco', { error: error instanceof Error ? error.message : String(error), sessionId });
    }
  }

  private async handleIncomingMessage(session: WhatsAppSession, message: Message): Promise<void> {
    try {
      logger.info('Mensagem recebida do WhatsApp', { 
        sessionId: session.sessionId,
        from: message.from,
        body: message.body?.substring(0, 50),
        type: message.type
      });

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
        logger.info('Novo customer criado', { customerId: customer.id, phone: message.from });
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

        logger.info('Nova conversa criada', { conversationId: conversation.id, sessionId: session.sessionId });
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
            timestamp: message.timestamp,
            type: message.type
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

      logger.info('Mensagem processada e salva', { 
        messageId: savedMessage.id, 
        conversationId: conversation.id,
        from: message.from 
      });
    } catch (error) {
      logger.error('Erro ao processar mensagem', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Método para limpar sessões antigas e órfãs
  async cleanupOldSessions(): Promise<void> {
    try {
      logger.info('Iniciando limpeza de sessões antigas');
      
      // Limpar sessões do banco que estão inativas há mais de 24 horas
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const deletedSessions = await prisma.whatsAppSession.deleteMany({
        where: {
          isActive: false,
          updatedAt: {
            lt: twentyFourHoursAgo
          }
        }
      });
      
      if (deletedSessions.count > 0) {
        logger.info('Sessões antigas removidas do banco', { count: deletedSessions.count });
      }
      
      // Limpar sessões da memória que não estão conectadas
      const disconnectedSessions = Array.from(this.sessions.entries())
        .filter(([sessionId, session]) => !session.isConnected);
      
      disconnectedSessions.forEach(([sessionId, session]) => {
        try {
          if (session.client && typeof session.client.destroy === 'function') {
            session.client.destroy();
          }
          this.sessions.delete(sessionId);
          logger.info('Sessão desconectada removida da memória', { sessionId });
        } catch (error) {
          logger.error('Erro ao limpar sessão da memória', { 
            error: error instanceof Error ? error.message : String(error), 
            sessionId 
          });
        }
      });
      
      logger.info('Limpeza de sessões concluída', { 
        memorySessionsCount: this.sessions.size,
        disconnectedSessionsRemoved: disconnectedSessions.length
      });
    } catch (error) {
      logger.error('Erro durante limpeza de sessões', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  // Método para obter estatísticas das sessões
  getSessionStats(): { total: number; connected: number; disconnected: number } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      connected: sessions.filter(s => s.isConnected).length,
      disconnected: sessions.filter(s => !s.isConnected).length
    };
  }
}

export default new WhatsAppQRService(); 