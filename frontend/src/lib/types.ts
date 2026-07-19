export type Access = "owner" | "editor" | "viewer";
export type Role = "viewer" | "editor";

export interface DocumentSummary {
  id: string;
  title: string;
  updated_at: string;
  owner_email: string;
  access: Access;
}

export interface DocumentDetail extends DocumentSummary {
  content: Record<string, unknown>;
  created_at: string;
}

export interface Share {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface ImportResult {
  title: string;
  html: string;
}

export type AIAction =
  | "improve"
  | "fix"
  | "shorten"
  | "lengthen"
  | "professional"
  | "casual"
  | "custom"
  | "summarize"
  | "continue";

export interface AIAssistResult {
  action: AIAction;
  result: string;
}
