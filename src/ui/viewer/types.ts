export interface Observation {
  id: number;
  memory_session_id: string;
  project: string;
  merged_into_project?: string | null;
  platform_source: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
  generated_by_model: string | null;
  agent_type: string | null;
  agent_id: string | null;
  visibility: string | null;
}

export interface Summary {
  id: number;
  session_id: string;
  project: string;
  platform_source: string;
  request?: string;
  investigated?: string;
  learned?: string;
  completed?: string;
  next_steps?: string;
  created_at_epoch: number;
}

export interface UserPrompt {
  id: number;
  content_session_id: string;
  project: string;
  platform_source: string;
  prompt_number: number;
  prompt_text: string;
  created_at_epoch: number;
}

export type FeedItem =
  | (Observation & { itemType: 'observation' })
  | (Summary & { itemType: 'summary' })
  | (UserPrompt & { itemType: 'prompt' });

export interface StreamEvent {
  type: 'initial_load' | 'new_observation' | 'new_summary' | 'new_prompt' | 'processing_status';
  observations?: Observation[];
  summaries?: Summary[];
  prompts?: UserPrompt[];
  projects?: string[];
  observation?: Observation;
  summary?: Summary;
  prompt?: UserPrompt;
  isProcessing?: boolean;
  queueDepth?: number;
}

export interface ProjectCatalog {
  projects: string[];
  sources: string[];
  projectsBySource: Record<string, string[]>;
}

export interface Settings {
  CLAUDE_MEM_MODEL: string;
  CLAUDE_MEM_CONTEXT_OBSERVATIONS: string;
  CLAUDE_MEM_WORKER_PORT: string;
  CLAUDE_MEM_WORKER_HOST: string;

  CLAUDE_MEM_PROVIDER?: string;  
  CLAUDE_MEM_GEMINI_API_KEY?: string;
  CLAUDE_MEM_GEMINI_MODEL?: string;  
  CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED?: string;  
  CLAUDE_MEM_OPENROUTER_API_KEY?: string;
  CLAUDE_MEM_OPENROUTER_MODEL?: string;
  CLAUDE_MEM_OPENROUTER_SITE_URL?: string;
  CLAUDE_MEM_OPENROUTER_APP_NAME?: string;

  CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT?: string;
  CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT?: string;

  CLAUDE_MEM_CONTEXT_FULL_COUNT?: string;
  CLAUDE_MEM_CONTEXT_FULL_FIELD?: string;
  CLAUDE_MEM_CONTEXT_SESSION_COUNT?: string;

  CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY?: string;
  CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE?: string;

  CLAUDE_MEM_SERVER_BETA_URL?: string;
  CLAUDE_MEM_SERVER_BETA_API_KEY?: string;
}

export interface WorkerStats {
  version?: string;
  uptime?: number;
  activeSessions?: number;
  sseClients?: number;
}

export interface DatabaseStats {
  size?: number;
  observations?: number;
  sessions?: number;
  summaries?: number;
  firstObservationAt?: string | null;
}

export interface Stats {
  worker?: WorkerStats;
  database?: DatabaseStats;
}

export interface ModelStats {
  first_seen_epoch: number;
  session_count: number;
  project_count: number;
  generated_by_model: string | null;
  platform_source: string;
  count: number;
  last_seen_epoch: number;
}

export interface CommitRecord {
  commit_sha: string;
  edit_count: number;
  earliest_epoch: number;
  files: string[];
  models: string[];        // agent_tool_ids involved
  actors: string[];        // actor_ids
  session_count: number;
  prompt_preview: string | null;
}

export interface TeamInfo {
  id: string;
  name: string;
  created_at: string;
}

export interface TeamMember {
  actor_id: string;
  role: string;
  joined_at: string;
}

export interface ApiKeyInfo {
  id: string;
  created_at: string;
  revoked_at: string | null;
}

export interface ProvenanceEntry {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  symbol_name: string | null;
  symbol_kind: string | null;
  commit_sha: string | null;
  prompt_text: string | null;
  agent_type: string | null;
  created_at_epoch: number;
  session_id: string | null;
  observation_id: number | null;
  stale: number;
  old_content_hash: string | null;
  new_content_hash: string | null;
  // observation semantic content — the AI's synthesis of this change
  obs_title: string | null;
  obs_text: string | null;
  obs_narrative: string | null;
  obs_facts: string | null;   // JSON-encoded string[]
  obs_type: string | null;
}
