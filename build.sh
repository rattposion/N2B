#!/bin/bash

echo "🔧 Iniciando build..."

# Instalar dependências
echo "📦 Instalando dependências..."
npm ci

# Gerar cliente Prisma
echo "🗄️ Gerando cliente Prisma..."
npx prisma generate

# Build TypeScript
echo "⚙️ Compilando TypeScript..."
npm run build

# Verificar se o build foi bem-sucedido
if [ -f "dist/index.js" ]; then
    echo "✅ Build concluído com sucesso!"
else
    echo "❌ Erro no build!"
    exit 1
fi 