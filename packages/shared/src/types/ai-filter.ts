/**
 * AI Filter Types — shared between API and Web
 */

export interface AIFilterCriteria {
  keywords?: string[];
  topics?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  minLength?: number;
  maxLength?: number;
}

export type AIFilterType = 'include' | 'exclude' | 'boost' | 'bury';

export interface AIFilter {
  id: string;
  name: string;
  description?: string;
  type: AIFilterType;
  criteria: AIFilterCriteria;
  score: number; // -100 to 100
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAIFilterInput {
  name: string;
  description?: string;
  type: AIFilterType;
  criteria?: AIFilterCriteria;
  score?: number;
  enabled?: boolean;
}

export interface UpdateAIFilterInput {
  name?: string;
  description?: string;
  type?: AIFilterType;
  criteria?: AIFilterCriteria;
  score?: number;
  enabled?: boolean;
}

export interface AIFiltersResponse {
  filters: AIFilter[];
}

export interface EntryScore {
  entryId: number;
  score: number;
  matchedFilters: { id: string; name: string; contribution: number }[];
  reasoning?: string;
}
