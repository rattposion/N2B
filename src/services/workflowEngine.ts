import prisma from '../utils/database';
import logger from '../utils/logger';

interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: any;
  conditions: any[];
  actions: any[];
  order: number;
}

interface WorkflowData {
  [key: string]: any;
}

export class WorkflowEngine {
  async execute(executionId: string): Promise<any> {
    try {
      // Buscar a execução
      const execution = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        include: {
          flow: true,
          conversation: true
        }
      });

      if (!execution) {
        throw new Error('Execução não encontrada');
      }

      if (execution.status !== 'RUNNING') {
        return execution;
      }

      const steps = execution.flow.steps as WorkflowStep[];
      let currentData = execution.data as WorkflowData;
      let currentStep = execution.currentStep;

      logger.info('Iniciando execução do workflow', {
        executionId,
        flowId: execution.flowId,
        totalSteps: steps.length,
        currentStep
      });

      // Executar cada step
      for (let i = currentStep; i < steps.length; i++) {
        const step = steps[i];
        
        try {
          logger.info('Executando step', {
            executionId,
            stepName: step.name,
            stepType: step.type,
            stepOrder: i
          });

          // Verificar condições
          if (step.conditions && step.conditions.length > 0) {
            const shouldExecute = await this.evaluateConditions(step.conditions, currentData);
            if (!shouldExecute) {
              logger.info('Step pulado devido às condições', {
                executionId,
                stepName: step.name
              });
              continue;
            }
          }

          // Executar step
          const result = await this.executeStep(step, currentData, execution);
          
          // Atualizar dados
          currentData = { ...currentData, ...result };

          // Atualizar progresso
          await prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
              currentStep: i + 1,
              data: currentData
            }
          });

          logger.info('Step executado com sucesso', {
            executionId,
            stepName: step.name,
            result
          });

        } catch (error: any) {
          logger.error('Erro ao executar step', {
            executionId,
            stepName: step.name,
            error: error.message
          });

          // Marcar execução como falhada
          await prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
              status: 'FAILED',
              result: { error: error.message }
            }
          });

          throw error;
        }
      }

      // Marcar como concluída
      const completedExecution = await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          result: currentData,
          endedAt: new Date()
        }
      });

      logger.info('Workflow executado com sucesso', {
        executionId,
        totalSteps: steps.length
      });

      return completedExecution;

    } catch (error: any) {
      logger.error('Erro na execução do workflow', {
        executionId,
        error: error.message
      });

      // Marcar como falhada
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          result: { error: error.message },
          endedAt: new Date()
        }
      });

      throw error;
    }
  }

  private async evaluateConditions(conditions: any[], data: WorkflowData): Promise<boolean> {
    for (const condition of conditions) {
      const { field, operator, value } = condition;
      
      const fieldValue = this.getNestedValue(data, field);
      
      switch (operator) {
        case 'equals':
          if (fieldValue !== value) return false;
          break;
        case 'not_equals':
          if (fieldValue === value) return false;
          break;
        case 'contains':
          if (!String(fieldValue).includes(String(value))) return false;
          break;
        case 'greater_than':
          if (Number(fieldValue) <= Number(value)) return false;
          break;
        case 'less_than':
          if (Number(fieldValue) >= Number(value)) return false;
          break;
        case 'exists':
          if (fieldValue === undefined || fieldValue === null) return false;
          break;
        case 'not_exists':
          if (fieldValue !== undefined && fieldValue !== null) return false;
          break;
        default:
          return false;
      }
    }
    
    return true;
  }

  private async executeStep(step: WorkflowStep, data: WorkflowData, execution: any): Promise<any> {
    switch (step.type) {
      case 'MESSAGE':
        return await this.executeMessageStep(step, data, execution);
      
      case 'CONDITION':
        return await this.executeConditionStep(step, data);
      
      case 'ACTION':
        return await this.executeActionStep(step, data);
      
      case 'DELAY':
        return await this.executeDelayStep(step);
      
      case 'INTENT':
        return await this.executeIntentStep(step, data);
      
      case 'ENTITY':
        return await this.executeEntityStep(step, data);
      
      case 'API_CALL':
        return await this.executeApiCallStep(step, data);
      
      case 'DATABASE':
        return await this.executeDatabaseStep(step, data);
      
      case 'EMAIL':
        return await this.executeEmailStep(step, data);
      
      case 'NOTIFICATION':
        return await this.executeNotificationStep(step, data);
      
      default:
        throw new Error(`Tipo de step não suportado: ${step.type}`);
    }
  }

  private async executeMessageStep(step: WorkflowStep, data: WorkflowData, execution: any): Promise<any> {
    const { message, channel } = step.config;
    
    // Substituir variáveis na mensagem
    const processedMessage = this.processTemplate(message, data);
    
    // Enviar mensagem
    await prisma.message.create({
      data: {
        content: processedMessage,
        type: 'TEXT',
        sender: 'BOT',
        conversationId: execution.conversationId,
        channelId: execution.conversation.channelId,
        metadata: {
          workflowStep: step.name,
          workflowExecution: execution.id
        }
      }
    });

    return { messageSent: true, content: processedMessage };
  }

  private async executeConditionStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { conditions, trueBranch, falseBranch } = step.config;
    
    const result = await this.evaluateConditions(conditions, data);
    
    return {
      conditionResult: result,
      branch: result ? trueBranch : falseBranch
    };
  }

  private async executeActionStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { action, parameters } = step.config;
    
    // Executar ação específica
    switch (action) {
      case 'assign_conversation':
        return await this.assignConversation(parameters, data);
      
      case 'update_conversation_status':
        return await this.updateConversationStatus(parameters, data);
      
      case 'create_ticket':
        return await this.createTicket(parameters, data);
      
      case 'send_notification':
        return await this.sendNotification(parameters, data);
      
      default:
        throw new Error(`Ação não suportada: ${action}`);
    }
  }

  private async executeDelayStep(step: WorkflowStep): Promise<any> {
    const { duration } = step.config;
    
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    
    return { delayed: true, duration };
  }

  private async executeIntentStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { intent, confidence } = step.config;
    
    // Aqui você pode integrar com serviços de NLP como Dialogflow, Luis, etc.
    // Por enquanto, vamos simular
    return {
      detectedIntent: intent,
      confidence: confidence || 0.8,
      entities: []
    };
  }

  private async executeEntityStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { entity, value } = step.config;
    
    return {
      extractedEntity: entity,
      value: value,
      confidence: 0.9
    };
  }

  private async executeApiCallStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { url, method, headers, body } = step.config;
    
    // Aqui você faria a chamada HTTP real
    // Por enquanto, vamos simular
    return {
      apiCall: {
        url,
        method,
        status: 200,
        response: { success: true }
      }
    };
  }

  private async executeDatabaseStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { operation, table, query, data: dbData } = step.config;
    
    // Aqui você faria operações no banco de dados
    // Por enquanto, vamos simular
    return {
      databaseOperation: {
        operation,
        table,
        success: true,
        result: dbData
      }
    };
  }

  private async executeEmailStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { to, subject, template } = step.config;
    
    // Aqui você enviaria o email real
    // Por enquanto, vamos simular
    return {
      emailSent: true,
      to,
      subject,
      template
    };
  }

  private async executeNotificationStep(step: WorkflowStep, data: WorkflowData): Promise<any> {
    const { type, message, recipients } = step.config;
    
    // Aqui você enviaria a notificação real
    // Por enquanto, vamos simular
    return {
      notificationSent: true,
      type,
      message,
      recipients
    };
  }

  private async assignConversation(parameters: any, data: WorkflowData): Promise<any> {
    const { conversationId, userId } = parameters;
    
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedTo: userId }
    });

    return { assigned: true, userId };
  }

  private async updateConversationStatus(parameters: any, data: WorkflowData): Promise<any> {
    const { conversationId, status } = parameters;
    
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status }
    });

    return { statusUpdated: true, status };
  }

  private async createTicket(parameters: any, data: WorkflowData): Promise<any> {
    // Implementar criação de ticket
    return { ticketCreated: true };
  }

  private async sendNotification(parameters: any, data: WorkflowData): Promise<any> {
    // Implementar envio de notificação
    return { notificationSent: true };
  }

  private processTemplate(template: string, data: WorkflowData): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
} 