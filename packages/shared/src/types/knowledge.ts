/**
 * Knowledge Graph Types — shared between frontend and backend
 */

export interface GraphNode {
  id: string;
  label: string;
  type: 'article' | 'topic' | 'feed';
  size?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'similar' | 'same_topic' | 'references';
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}
