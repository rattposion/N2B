import { Request } from 'express';
import { User, Company } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    companyId: string;
  };
}

export interface JWTPayload {
  userId: string;
  companyId: string;
  role: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  type: string;
  phoneNumberId?: string;
}

export interface ChannelConfig {
  whatsapp?: {
    token: string;
    phoneNumberId: string;
    verifyToken: string;
  };
  instagram?: {
    accessToken: string;
  };
  webchat?: {
    domain: string;
    theme: string;
    position: string;
  };
  telegram?: {
    botToken: string;
    username: string;
  };
}

export interface AIResponse {
  message: string;
  confidence: number;
  intent?: string;
  entities?: any[];
}

export interface TTSResponse {
  audioUrl: string;
  duration: number;
}

export interface Conversation {
  id: string;
  status: string;
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  channel: {
    id: string;
    type: string;
    name: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  startedAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  content: string;
  type: string;
  sender: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  category: string;
  triggers: string[];
  steps: any[];
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: 'BULK' | 'SCHEDULED' | 'TRIGGERED';
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  message: any;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  score: number;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppNumber {
  id: string;
  name: string;
  phoneNumber: string;
  phoneNumberId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIAssistant {
  id: string;
  name: string;
  description?: string;
  personality: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanBoard {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  columns: KanbanColumn[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
  color?: string;
  isActive: boolean;
  cards: KanbanCard[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  order: number;
  color?: string;
  dueDate?: string;
  leadId?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdTracking {
  id: string;
  adId: string;
  adName: string;
  platform: string;
  thumbnail?: string;
  title?: string;
  description?: string;
  conversionText?: string;
  createdAt: string;
  updatedAt: string;
}