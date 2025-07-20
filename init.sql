-- Script de inicialização do banco de dados
-- Este arquivo é executado automaticamente quando o container PostgreSQL é criado

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar índices para melhor performance
-- (Os índices serão criados automaticamente pelo Prisma)

-- Configurar timezone
SET timezone = 'UTC';

-- Log de inicialização
DO $$
BEGIN
    RAISE NOTICE 'Banco de dados inicializado com sucesso!';
END $$; 