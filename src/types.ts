export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Stage =
  | "to_evaluate"
  | "preparing"
  | "submitted"
  | "interviewing"
  | "offer"
  | "closed";

export type Opportunity = {
  id: string;
  company: string | null;
  title: string;
  location: string | null;
  salary: string | null;
  categoryId: string;
  categoryName: string | null;
  stage: Stage;
  responsibilities: string[];
  requirements: string[];
  abilities: {
    hard: string[];
    general: string[];
    experience: string[];
  };
  match: {
    level: "high" | "medium" | "low";
    strengths: string[];
    gaps: string[];
    evidence: string[];
  };
  deadline: string | null;
  sourceUrl: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  images: {
    id: string;
    url: string;
    mimeType: string;
  }[];
  interviewRounds: {
    id: string;
    roundType: string;
    scheduledAt: string | null;
    result: string | null;
    notes: string | null;
  }[];
  statusHistory: {
    id: string;
    previousStage: string | null;
    newStage: string;
    changedAt: string;
  }[];
};

export type Profile = {
  summary: string;
  skills: string[];
  experiences: string[];
  strengths: string[];
  gaps: string[];
};

export type AISettings = {
  baseUrl: string;
  model: string;
  dailyLimit: number;
  assistantDailyLimit?: number;
  hasApiKey: boolean;
};

export type AssistantCitation = {
  id: string;
  type: "opportunity" | "document" | "web";
  sourceId: string;
  title: string;
  snippet: string;
  url: string;
};

export type AssistantMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "completed" | "stopped" | "failed";
  attempt: number;
  replacesMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
  citations: AssistantCitation[];
};

export type AssistantConversation = {
  id: string;
  title: string;
  opportunityId: string | null;
  documentIds: string[];
  webSearchEnabled: boolean;
  summary: string;
  createdAt: string;
  updatedAt: string;
  messages?: AssistantMessage[];
};

export type AssistantUsage = {
  day: string;
  used: number;
  limit: number;
};

export type LibraryDocument = {
  id: string;
  title: string;
  kind: "resume" | "job" | "project" | "interview" | "other";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  enabled: boolean;
  content?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtractionJob = {
  id: string;
  status: string;
  categoryName: string;
  result: {
    title: string | null;
    company: string | null;
    location: string | null;
    salary: string | null;
    categoryName: string;
    responsibilities: string[];
    requirements: string[];
    abilities: {
      hard: string[];
      general: string[];
      experience: string[];
    };
    match: {
      level: string;
      strengths: string[];
      gaps: string[];
      evidence: string[];
    };
    missingFields: string[];
  } | null;
  error: string | null;
  imageCount: number;
  images: {
    id: string;
    url: string;
    mimeType: string;
  }[];
};
