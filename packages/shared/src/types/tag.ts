/**
 * Tag Types — shared between frontend and backend
 */

export interface Tag {
  id: string;
  name: string;
  color?: string;
  entryCount?: number;
  isAI?: boolean;
  createdAt?: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}
