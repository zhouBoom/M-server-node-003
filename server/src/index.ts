import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 启用 CORS
app.use(cors());
app.use(express.json());

// 模拟项目数据
const projects = [
  { id: '1', name: '项目 A', type: 'text', members: 3, lastUpdate: '2024-01-01' },
  { id: '2', name: '项目 B', type: 'board', members: 5, lastUpdate: '2024-01-02' },
  { id: '3', name: '项目 C', type: 'vote', members: 2, lastUpdate: '2024-01-03' },
];

// API 路由：获取项目列表
app.get('/api/projects', (req, res) => {
  res.json(projects);
});

// API 路由：获取项目详情
app.get('/api/projects/:id', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (project) {
    res.json(project);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// WebSocket 连接管理
const clients = new Map<string, WebSocket>();

wss.on('connection', (ws: WebSocket) => {
  // 生成唯一客户端 ID
  const clientId = Math.random().toString(36).substr(2, 9);
  clients.set(clientId, ws);

  console.log(`Client connected: ${clientId}`);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Welcome to the collaborative platform!',
    clientId,
  }));

  // 处理客户端消息
  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from ${clientId}:`, data);

      // 广播消息给所有客户端
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            ...data,
            from: clientId,
            timestamp: new Date().toISOString(),
          }));
        }
      });
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // 处理客户端断开连接
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);

    // 广播用户离开
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'user-left',
          clientId,
        }));
      }
    });
  });

  // 处理错误
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${clientId}:`, error);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});