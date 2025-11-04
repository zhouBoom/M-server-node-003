export interface Project {
  id: string;
  name: string;
  type: 'text' | 'board' | 'vote';
  members: number;
  lastUpdate: string;
}

export interface WebSocketMessage {
  type: string;
  from: string;
  timestamp: string;
  [key: string]: any;
}