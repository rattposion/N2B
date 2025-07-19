const axios = require('axios');
const logger = require('../utils/logger');

class N8nService {
  constructor() {
    this.baseUrl = process.env.N8N_BASE_URL;
    this.apiKey = process.env.N8N_API_KEY;
    this.webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    // Configurar axios com interceptors
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': this.apiKey
      }
    });

    // Interceptor para logs
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`n8n request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('n8n request error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`n8n response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('n8n response error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Dispara um webhook para o n8n
   * @param {string} webhookUrl - URL do webhook
   * @param {Object} data - Dados a serem enviados
   * @param {Object} options - Opções adicionais
   */
  async triggerWebhook(webhookUrl, data, options = {}) {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        event: options.event || 'custom',
        data: data,
        metadata: {
          source: 'p2a-backend',
          version: process.env.npm_package_version || '1.0.0',
          ...options.metadata
        }
      };

      const response = await this.client.post(webhookUrl, payload, {
        timeout: options.timeout || 5000,
        headers: {
          ...options.headers,
          'X-P2A-Signature': this.generateSignature(payload)
        }
      });

      logger.info(`Webhook disparado com sucesso: ${webhookUrl}`, {
        event: options.event,
        responseStatus: response.status
      });

      return response.data;
    } catch (error) {
      logger.error(`Erro ao disparar webhook: ${webhookUrl}`, {
        error: error.message,
        event: options.event,
        data: data
      });
      throw error;
    }
  }

  /**
   * Dispara evento de nova conversa
   */
  async triggerConversationCreated(conversationData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_CHAT_EVENTS || `${this.webhookUrl}/chat-events`,
      {
        type: 'conversation_created',
        conversation: conversationData,
        bot: conversationData.bot,
        user: conversationData.user
      },
      {
        event: 'conversation_created',
        metadata: {
          action: 'conversation_created'
        }
      }
    );
  }

  /**
   * Dispara evento de nova mensagem
   */
  async triggerMessageReceived(messageData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_CHAT_EVENTS || `${this.webhookUrl}/chat-events`,
      {
        type: 'message_received',
        message: messageData,
        conversation: messageData.conversation
      },
      {
        event: 'message_received',
        metadata: {
          action: 'message_received'
        }
      }
    );
  }

  /**
   * Dispara evento de avaliação do usuário
   */
  async triggerUserRating(ratingData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_USER_ACTIONS || `${this.webhookUrl}/user-actions`,
      {
        type: 'user_rating',
        rating: ratingData,
        conversation: ratingData.conversation
      },
      {
        event: 'user_rating',
        metadata: {
          action: 'user_rating'
        }
      }
    );
  }

  /**
   * Dispara evento de cancelamento
   */
  async triggerCancellation(cancellationData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_SYSTEM_EVENTS || `${this.webhookUrl}/system-events`,
      {
        type: 'cancellation',
        cancellation: cancellationData
      },
      {
        event: 'cancellation',
        metadata: {
          action: 'cancellation'
        }
      }
    );
  }

  /**
   * Dispara evento de erro do sistema
   */
  async triggerSystemError(errorData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_SYSTEM_EVENTS || `${this.webhookUrl}/system-events`,
      {
        type: 'system_error',
        error: errorData,
        timestamp: new Date().toISOString()
      },
      {
        event: 'system_error',
        metadata: {
          action: 'system_error',
          severity: errorData.severity || 'error'
        }
      }
    );
  }

  /**
   * Dispara evento de atualização de status
   */
  async triggerStatusUpdate(statusData) {
    return this.triggerWebhook(
      process.env.N8N_WEBHOOK_SYSTEM_EVENTS || `${this.webhookUrl}/system-events`,
      {
        type: 'status_update',
        status: statusData
      },
      {
        event: 'status_update',
        metadata: {
          action: 'status_update'
        }
      }
    );
  }

  /**
   * Obtém workflows do n8n
   */
  async getWorkflows() {
    try {
      const response = await this.client.get('/api/v1/workflows');
      return response.data;
    } catch (error) {
      logger.error('Erro ao obter workflows do n8n:', error);
      throw error;
    }
  }

  /**
   * Obtém um workflow específico
   */
  async getWorkflow(workflowId) {
    try {
      const response = await this.client.get(`/api/v1/workflows/${workflowId}`);
      return response.data;
    } catch (error) {
      logger.error(`Erro ao obter workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Executa um workflow
   */
  async executeWorkflow(workflowId, data = {}) {
    try {
      const response = await this.client.post(`/api/v1/workflows/${workflowId}/execute`, {
        data: data,
        timestamp: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      logger.error(`Erro ao executar workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do n8n
   */
  async getN8nStats() {
    try {
      const response = await this.client.get('/api/v1/stats');
      return response.data;
    } catch (error) {
      logger.error('Erro ao obter estatísticas do n8n:', error);
      throw error;
    }
  }

  /**
   * Verifica se o n8n está online
   */
  async checkN8nHealth() {
    try {
      const response = await this.client.get('/healthz');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        response: response.data
      };
    } catch (error) {
      logger.error('n8n health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Gera assinatura para webhooks
   */
  generateSignature(payload) {
    const crypto = require('crypto');
    const secret = process.env.WEBHOOK_SECRET || 'default-secret';
    const data = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Valida assinatura de webhook recebido
   */
  validateSignature(payload, signature) {
    const expectedSignature = this.generateSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Processa webhook recebido do n8n
   */
  async processIncomingWebhook(payload, signature) {
    try {
      // Validar assinatura
      if (!this.validateSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      logger.info('Webhook recebido do n8n:', {
        type: payload.type,
        event: payload.event,
        timestamp: payload.timestamp
      });

      // Processar diferentes tipos de eventos
      switch (payload.type) {
        case 'workflow_completed':
          return await this.handleWorkflowCompleted(payload);
        case 'workflow_failed':
          return await this.handleWorkflowFailed(payload);
        case 'notification':
          return await this.handleNotification(payload);
        case 'data_update':
          return await this.handleDataUpdate(payload);
        default:
          logger.warn(`Tipo de webhook não reconhecido: ${payload.type}`);
          return { status: 'ignored', reason: 'unknown_type' };
      }
    } catch (error) {
      logger.error('Erro ao processar webhook do n8n:', error);
      throw error;
    }
  }

  /**
   * Manipula workflow completado
   */
  async handleWorkflowCompleted(payload) {
    logger.info('Workflow completado:', payload.workflowId);
    
    // Aqui você pode implementar lógica específica
    // como atualizar status, enviar notificações, etc.
    
    return {
      status: 'processed',
      action: 'workflow_completed',
      workflowId: payload.workflowId
    };
  }

  /**
   * Manipula workflow falhado
   */
  async handleWorkflowFailed(payload) {
    logger.error('Workflow falhou:', payload.workflowId, payload.error);
    
    // Implementar lógica de retry ou notificação
    await this.triggerSystemError({
      type: 'workflow_failed',
      workflowId: payload.workflowId,
      error: payload.error
    });
    
    return {
      status: 'processed',
      action: 'workflow_failed',
      workflowId: payload.workflowId
    };
  }

  /**
   * Manipula notificação
   */
  async handleNotification(payload) {
    logger.info('Notificação recebida:', payload.notification);
    
    // Implementar lógica de notificação
    // Pode ser email, push notification, etc.
    
    return {
      status: 'processed',
      action: 'notification',
      notification: payload.notification
    };
  }

  /**
   * Manipula atualização de dados
   */
  async handleDataUpdate(payload) {
    logger.info('Atualização de dados recebida:', payload.data);
    
    // Implementar lógica de atualização de dados
    // Pode ser atualizar cache, banco de dados, etc.
    
    return {
      status: 'processed',
      action: 'data_update',
      data: payload.data
    };
  }
}

module.exports = new N8nService(); 