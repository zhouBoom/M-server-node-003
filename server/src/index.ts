import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// 活动历史类型定义
interface Activity {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  actionType: string;
  cursorPosition: number;
  content: string;
  timestamp: string;
}

// 活动历史存储
const activities: Record<string, Activity[]> = {};

// 文档内容存储，包含版本管理
interface DocumentContent {
  content: string;
  version: number;
  lastModified: string;
  lastModifiedBy: string;
}

// 文档存储
const documents: Record<string, DocumentContent> = {};

// 合并日志存储
interface MergeLog {
  id: string;
  projectId: string;
  userA: string;
  userB: string;
  conflictRange: { start: number; end: number };
  resolvedBy: string;
  timestamp: string;
  resolutionType: 'auto' | 'manual';
  userAContent: string;
  userBContent: string;
  mergedContent: string;
}

// 合并日志存储
const mergeLogs: MergeLog[] = [];

// 保存合并日志到文件
const saveMergeLogs = () => {
  const logsPath = path.join(__dirname, '../data/mergeLogs.json');
  fs.writeFileSync(logsPath, JSON.stringify(mergeLogs, null, 2));
};

// 加载合并日志
const loadMergeLogs = () => {
  const logsPath = path.join(__dirname, '../data/mergeLogs.json');
  if (fs.existsSync(logsPath)) {
    const data = fs.readFileSync(logsPath, 'utf-8');
    return JSON.parse(data);
  }
  return [];
};

// 初始化合并日志
mergeLogs.push(...loadMergeLogs());

// 文档冲突处理函数
const handleDocumentConflict = (data: any) => {
  const { projectId, userId, userName, cursorPosition, content, timestamp } = data;
  
  // 确保文档存储存在
  if (!documents[projectId]) {
    // 如果文档不存在，创建初始版本
    documents[projectId] = {
      content,
      version: 1,
      lastModified: timestamp,
      lastModifiedBy: userId
    };
    return;
  }
  
  const currentDoc = documents[projectId];
  const currentContent = currentDoc.content;
  
  // 冲突检测：检查是否有重叠的修改范围
  // 这里简化处理，假设每个编辑操作都是修改整个文档
  // 在实际应用中，应该比较具体的修改范围
  const conflictDetected = currentDoc.lastModified !== timestamp && currentDoc.lastModifiedBy !== userId;
  
  if (!conflictDetected) {
    // 没有冲突，直接更新文档
    documents[projectId] = {
      content,
      version: currentDoc.version + 1,
      lastModified: timestamp,
      lastModifiedBy: userId
    };
    return;
  }
  
  // 有冲突，执行三向合并策略
  const mergedContent = mergeDocuments(currentContent, content, userId, userName, projectId);
  
  // 更新文档版本
  documents[projectId] = {
    content: mergedContent,
    version: currentDoc.version + 1,
    lastModified: new Date().toISOString(),
    lastModifiedBy: userId
  };
  
  // 广播合并后的文档状态
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'document-merged',
        projectId,
        content: mergedContent,
        version: documents[projectId].version,
        mergedBy: userId,
        mergeTimestamp: new Date().toISOString()
      }));
    }
  });
};

// 三向合并策略实现
const mergeDocuments = (currentContent: string, userContent: string, userId: string, userName: string, projectId: string): string => {
  const currentLines = currentContent.split('\n');
  const userLines = userContent.split('\n');
  
  // 不同段落自动合并
  const mergedLines = [...currentLines];
  
  // 比较每一行，处理冲突
  userLines.forEach((userLine, index) => {
    if (index < mergedLines.length) {
      if (mergedLines[index] !== userLine) {
        // 同一行有不同修改，保留最新修改
        const currentLineTimestamp = new Date(documents[projectId].lastModified).getTime();
        const userLineTimestamp = new Date(userId).getTime();
        
        if (userLineTimestamp > currentLineTimestamp) {
          mergedLines[index] = userLine;
        }
      }
    } else {
      // 新增行，直接添加
      mergedLines.push(userLine);
    }
  });
  
  // 记录合并日志
  const mergeLog: MergeLog = {
    id: uuidv4(),
    projectId,
    userA: documents[projectId].lastModifiedBy,
    userB: userId,
    conflictRange: { start: 0, end: Math.max(currentLines.length, userLines.length) - 1 },
    resolvedBy: userId,
    timestamp: new Date().toISOString(),
    resolutionType: 'auto',
    userAContent: currentContent,
    userBContent: userContent,
    mergedContent: mergedLines.join('\n')
  };
  
  mergeLogs.push(mergeLog);
  saveMergeLogs();
  
  return mergedLines.join('\n');
};

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

// 投票数据文件路径
const votesFilePath = path.join(__dirname, '../data/votes.json');

// 加载投票数据
const loadVotes = (): any[] => {
  try {
    const data = fs.readFileSync(votesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading votes:', error);
    return [];
  }
};

// 保存投票数据
const saveVotes = (votes: any[]): void => {
  try {
    fs.writeFileSync(votesFilePath, JSON.stringify(votes, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving votes:', error);
  }
};

// 初始化投票数据
let votes = loadVotes();

// API 路由：获取投票
app.get('/api/votes/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const projectVote = votes.find((vote: any) => vote.projectId === projectId);
  if (projectVote) {
    res.json(projectVote);
  } else {
    res.status(404).json({ error: 'Vote not found' });
  }
});

// API 路由：创建投票
app.post('/api/votes/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const { topic, options } = req.body;

  // 检查项目是否存在
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // 检查是否已经存在投票
  const existingVote = votes.find((vote: any) => vote.projectId === projectId);
  if (existingVote) {
    return res.status(400).json({ error: 'Vote already exists for this project' });
  }

  // 创建新投票
  const newVote = {
    projectId,
    topic,
    options: options.map((option: string) => ({ text: option, count: 0 })),
    users: []
  };

  // 保存投票数据
  votes.push(newVote);
  saveVotes(votes);

  // 广播新投票
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'vote-created',
        data: newVote
      }));
    }
  });

  res.status(201).json(newVote);
});

// API 路由：提交投票
app.post('/api/votes/:projectId/submit', (req, res) => {
  const projectId = req.params.projectId;
  const { clientId, optionIndex } = req.body;

  // 检查投票是否存在
  const projectVote = votes.find((vote: any) => vote.projectId === projectId);
  if (!projectVote) {
    return res.status(404).json({ error: 'Vote not found' });
  }

  // 检查用户是否已经投票
  if (projectVote.users.includes(clientId)) {
    return res.status(400).json({ error: 'You have already voted' });
  }

  // 检查选项索引是否有效
  if (optionIndex < 0 || optionIndex >= projectVote.options.length) {
    return res.status(400).json({ error: 'Invalid option index' });
  }

  // 更新投票结果
  projectVote.options[optionIndex].count++;
  projectVote.users.push(clientId);

  // 保存投票数据
  saveVotes(votes);

  // 广播投票结果更新
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'vote-updated',
        data: projectVote
      }));
    }
  });

  res.status(200).json(projectVote);
});

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

// 获取项目活动历史
app.get('/api/activities/:projectId', (req, res) => {
  const { projectId } = req.params;
  
  // 检查项目是否存在
  if (!projects.find(p => p.id === projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  
  // 获取项目的活动历史
  const projectActivities = activities[projectId] || [];
  
  // 返回活动历史，按时间倒序排列
  res.json(projectActivities.reverse());
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
      // 检查消息是否为空
      if (!message) {
        console.log(`Received empty message from ${clientId}`);
        return;
      }
      
      const data = JSON.parse(message);
      console.log(`Received message from ${clientId}:`, data);

      // 处理文档编辑消息，保存活动历史并处理冲突
      if (data.type === 'document-edit') {
        // 确保活动历史对象存在
        if (!activities[data.projectId]) {
          activities[data.projectId] = [];
        }
        
        // 创建新的活动记录
        const activity = {
          id: uuidv4(),
          projectId: data.projectId,
          userId: data.userId,
          userName: data.userName,
          actionType: data.actionType,
          cursorPosition: data.cursorPosition,
          content: data.content,
          timestamp: new Date().toISOString(),
        };
        
        // 添加到活动历史
        activities[data.projectId].push(activity);
        
        // 限制活动历史数量为20条
        if (activities[data.projectId].length > 20) {
          activities[data.projectId].shift();
        }
        
        // 处理文档冲突检测和合并
        handleDocumentConflict(data);
      }

      // 广播消息给所有客户端
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            // 检查数据是否有效
            if (!data || typeof data !== 'object') {
              console.log(`Invalid message data from ${clientId}:`, data);
              return;
            }
            
            client.send(JSON.stringify({
              ...data,
              from: clientId,
              timestamp: new Date().toISOString(),
            }));
          } catch (error) {
            console.error(`Error sending message to client:`, error);
          }
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