# Dockerfile para Backend Node.js (Railway)
FROM node:18-alpine

# Definir diretório de trabalho
WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/cache/apk/*

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências (usando npm install para Railway)
RUN npm install --production=false

# Gerar cliente Prisma
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p logs uploads

# Definir permissões
RUN chown -R node:node /app
USER node

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando de inicialização
CMD ["npm", "start"] 