/** Mensagens no formato OpenAI Chat Completions (tool calling). */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** Uma ou mais chaves separadas por vírgula (rotação dentro do provedor). */
  apiKey: string;
  enabled: boolean;
}

export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'denied';

export interface ToolRun {
  status: ToolStatus;
  output: string;
  startedAt?: number;
  latencyMs?: number;
}

/** Mensagem como guardada na conversa: formato OpenAI + metadados de exibição. */
export type StoredMessage = ChatMessage & { provider?: string; voice?: boolean };

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  toolRuns: Record<string, ToolRun>;
}

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
