# Backend - Sistema de Chatbot

## 🚀 Configuração Inicial

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o arquivo de exemplo e configure suas variáveis:
```bash
cp config.example.env .env
```

**Variáveis Obrigatórias:**
- `DATABASE_URL`: URL do banco PostgreSQL
- `JWT_SECRET`: Chave secreta para JWT

**Variáveis Opcionais:**
- `OPENAI_API_KEY`: Chave da API OpenAI (para funcionalidades de IA)
- `WHATSAPP_TOKEN`: Token do WhatsApp Business API
- `WHATSAPP_PHONE_NUMBER_ID`: ID do número do WhatsApp
- `ELEVENLABS_API_KEY`: Chave da API ElevenLabs (para TTS)

### 3. Configurar Banco de Dados
```bash
# Gerar cliente Prisma
npx prisma generate

# Executar migrações
npx prisma migrate dev

# (Opcional) Popular dados iniciais
npx prisma db seed
```

### 4. Iniciar o Servidor
```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

## 🔧 Funcionalidades

### ✅ Funcionalidades Básicas (Sem API Keys)
- ✅ Autenticação JWT
- ✅ CRUD de usuários e empresas
- ✅ Gerenciamento de conversas
- ✅ Sistema de mensagens
- ✅ Dashboard básico

### 🤖 Funcionalidades de IA (Requer API Keys)
- ✅ Chat com assistentes IA
- ✅ Geração de respostas automáticas
- ✅ Análise de intenção
- ✅ Síntese de voz (TTS)

### 📱 Integrações (Requer API Keys)
- ✅ WhatsApp Business API
- ✅ OpenAI GPT
- ✅ ElevenLabs TTS

## 🐛 Solução de Problemas

### Erro: "OPENAI_API_KEY environment variable is missing"
**Solução:** O erro é esperado se você não configurou a chave da OpenAI. O sistema continuará funcionando com funcionalidades limitadas.

Para usar funcionalidades de IA:
1. Obtenha uma chave da OpenAI em: https://platform.openai.com/api-keys
2. Adicione no arquivo `.env`: `OPENAI_API_KEY=sk-sua-chave-aqui`

### Erro de Conexão com Banco
**Solução:** Verifique se o PostgreSQL está rodando e a URL está correta no `.env`

### Erro de Compilação TypeScript
**Solução:** Execute `npx tsc --noEmit` para verificar erros de tipo

## 📁 Estrutura do Projeto

```
server/
├── src/
│   ├── controllers/     # Controladores da API
│   ├── middleware/      # Middlewares (auth, validação)
│   ├── routes/          # Rotas da API
│   ├── services/        # Serviços (IA, WhatsApp, etc.)
│   ├── types/           # Tipos TypeScript
│   └── utils/           # Utilitários
├── prisma/
│   └── schema.prisma    # Schema do banco
└── config.example.env   # Exemplo de configuração
```

## 🔐 Segurança

- ✅ JWT para autenticação
- ✅ Rate limiting
- ✅ Validação de entrada
- ✅ Sanitização de dados
- ✅ Logs de auditoria

## 📊 Monitoramento

- ✅ Logs estruturados
- ✅ Métricas de performance
- ✅ Tratamento de erros
- ✅ Health checks

## 🚀 Deploy

### Docker
```bash
docker build -t chatbot-backend .
docker run -p 3001:3001 chatbot-backend
```

### Docker Compose
```bash
docker-compose up -d
```

## 📝 Licença

MIT License 