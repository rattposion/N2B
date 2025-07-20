import axios from 'axios';
import logger from '../utils/logger';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private baseURL = 'https://openrouter.ai/api/v1';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('OpenRouter API key não configurada');
    }
  }

  async chat(request: OpenRouterRequest): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenRouter API key não configurada');
      }

      const response = await axios.post<OpenRouterResponse>(
        `${this.baseURL}/chat/completions`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'WhatsApp AI Assistant'
          }
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Resposta vazia do OpenRouter');
      }

      logger.info('Resposta OpenRouter gerada', {
        model: request.model,
        tokens: response.data.usage.total_tokens,
        finishReason: response.data.choices[0]?.finish_reason
      });

      return content;
    } catch (error: any) {
      logger.error('Erro ao chamar OpenRouter', {
        error: error.message,
        model: request.model,
        messagesCount: request.messages.length
      });
      throw new Error(`Erro OpenRouter: ${error.message}`);
    }
  }

  async generateResponse(
    messages: OpenRouterMessage[],
    model: string = 'anthropic/claude-3.5-sonnet',
    temperature: number = 0.7,
    maxTokens: number = 1000
  ): Promise<string> {
    const request: OpenRouterRequest = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    return this.chat(request);
  }

  async generateAssistantResponse(
    personality: string,
    userMessage: string,
    conversationHistory: OpenRouterMessage[] = [],
    model: string = 'anthropic/claude-3.5-sonnet'
  ): Promise<string> {
    const systemMessage: OpenRouterMessage = {
      role: 'system',
      content: `Você é um assistente de atendimento especializado em vendas e suporte ao cliente. 

${personality}

Instruções importantes:
- Seja sempre cordial e profissional
- Foque em resolver o problema do cliente
- Ofereça soluções práticas e relevantes
- Se não souber algo, seja honesto e sugira contato humano
- Mantenha o tom de voz consistente com a personalidade definida
- Use linguagem clara e acessível
- Evite jargões técnicos desnecessários`
    };

    const userMessageObj: OpenRouterMessage = {
      role: 'user',
      content: userMessage
    };

    const messages = [systemMessage, ...conversationHistory, userMessageObj];

    return this.generateResponse(messages, model);
  }

  // Método para listar modelos disponíveis
  async getAvailableModels(): Promise<any[]> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenRouter API key não configurada');
      }

      const response = await axios.get(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'WhatsApp AI Assistant'
        }
      });

      return response.data.data || [];
    } catch (error: any) {
      logger.error('Erro ao buscar modelos OpenRouter', { error: error.message });
      return [];
    }
  }

  // Método para obter informações de uso
  async getUsage(): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenRouter API key não configurada');
      }

      const response = await axios.get(`${this.baseURL}/auth/key`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'WhatsApp AI Assistant'
        }
      });

      return response.data;
    } catch (error: any) {
      logger.error('Erro ao buscar uso OpenRouter', { error: error.message });
      return null;
    }
  }

  // Método para validar configuração
  async validateConfig(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }

      const response = await this.generateResponse([
        { role: 'user', content: 'Teste de conexão' }
      ], 'anthropic/claude-3.5-sonnet', 0.1, 10);

      return response.length > 0;
    } catch (error: any) {
      logger.error('Erro na validação OpenRouter', { error: error.message });
      return false;
    }
  }

  // Método para obter modelos recomendados por categoria
  getRecommendedModels(): { [key: string]: string[] } {
    return {
      'Claude (Anthropic)': [
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3.5-haiku',
        'anthropic/claude-3-opus'
      ],
      'GPT (OpenAI)': [
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4-turbo',
        'openai/gpt-3.5-turbo'
      ],
      'Gemini (Google)': [
        'google/gemini-pro',
        'google/gemini-flash-1.5'
      ],
      'Llama (Meta)': [
        'meta-llama/llama-3.1-8b-instruct',
        'meta-llama/llama-3.1-70b-instruct'
      ],
      'Mistral': [
        'mistralai/mistral-7b-instruct',
        'mistralai/mixtral-8x7b-instruct'
      ]
    };
  }
}

export default new OpenRouterService(); 