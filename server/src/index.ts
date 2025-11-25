import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// 确保数据目录存在
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 日志记录函数
const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // 写入日志文件，使用 try-catch 防止日志系统自身错误导致死循环
  try {
    const logPath = path.join(dataDir, 'server.log');
    fs.appendFileSync(logPath, logMessage + '\n');
  } catch (error) {
    console.error(`Failed to write log: ${error}`);
  }
};

// 房间类型定义
interface Room {
  id: string;
  name: string;
  users: Map<string, User>;
  drawingHistory: DrawingAction[];
  lockedElements: Map<string, string>; // elementId -> userId
  createdAt: string;
  updatedAt: string;
}

// 用户类型定义
interface User {
  id: string;
  name: string;
  ws: WebSocket;
  roomId: string;
  isActive: boolean;
  lastSeen: string;
}

// 绘图动作类型定义
interface DrawingAction {
  id: string;
  userId: string;
  userName: string;
  actionType: 'draw' | 'erase' | 'move' | 'resize' | 'lock' | 'unlock';
  elementId: string;
  elementData: any;
  timestamp: string;
}

// 房间存储
const rooms: Map<string, Room> = new Map();

// 客户端存储
const clients: Map<string, User> = new Map();

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
  try {
    const logsPath = path.join(dataDir, 'mergeLogs.json');
    // 限制日志数量为1000条
    if (mergeLogs.length > 1000) {
      mergeLogs.splice(0, mergeLogs.length - 1000);
    }
    fs.writeFileSync(logsPath, JSON.stringify(mergeLogs, null, 2));
  } catch (error) {
    log(`Error saving merge logs: ${error}`, 'error');
  }
};

// 加载合并日志
const loadMergeLogs = () => {
  try {
    const logsPath = path.join(dataDir, 'mergeLogs.json');
    if (fs.existsSync(logsPath)) {
      const data = fs.readFileSync(logsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    log(`Error loading merge logs: ${error}`, 'error');
  }
  return [];
};

// 初始化合并日志
mergeLogs.push(...loadMergeLogs());

// 创建房间
const createRoom = (name: string): Room => {
  const roomId = uuidv4();
  const room: Room = {
    id: roomId,
    name,
    users: new Map(),
    drawingHistory: [],
    lockedElements: new Map(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  rooms.set(roomId, room);
  log(`Created room: ${roomId} (${name})`);
  return room;
};

// 获取房间
const getRoom = (roomId: string): Room | undefined => {
  return rooms.get(roomId);
};

// 删除房间
const deleteRoom = (roomId: string): boolean => {
  const result = rooms.delete(roomId);
  if (result) {
    log(`Deleted room: ${roomId}`);
  }
  return result;
};

// 添加用户到房间
const addUserToRoom = (roomId: string, user: User): boolean => {
  const room = getRoom(roomId);
  if (!room) {
    log(`Room not found: ${roomId}`, 'error');
    return false;
  }
  
  // 检查房间用户数量限制（至少5个，这里设置为20个）
  if (room.users.size >= 20) {
    log(`Room ${roomId} is full`, 'warn');
    return false;
  }
  
  room.users.set(user.id, user);
  user.roomId = roomId;
  user.isActive = true;
  user.lastSeen = new Date().toISOString();
  
  room.updatedAt = new Date().toISOString();
  log(`Added user ${user.id} (${user.name}) to room ${roomId}`);
  
  // 广播用户加入
  broadcastToRoom(roomId, {
    type: 'user-joined',
    userId: user.id,
    userName: user.name,
    userCount: room.users.size
  });
  
  // 发送房间当前状态给新用户
  sendToUser(user.id, {
    type: 'room-state',
    roomId,
    roomName: room.name,
    users: Array.from(room.users.values()).map(u => ({ id: u.id, name: u.name })),
    drawingHistory: room.drawingHistory,
    lockedElements: Array.from(room.lockedElements.entries()).map(([elementId, userId]) => ({ elementId, userId }))
  });
  
  return true;
};

// 从房间移除用户
const removeUserFromRoom = (userId: string): boolean => {
  const user = clients.get(userId);
  if (!user) {
    log(`User not found: ${userId}`, 'error');
    return false;
  }
  
  const room = getRoom(user.roomId);
  if (!room) {
    log(`Room not found: ${user.roomId}`, 'error');
    return false;
  }
  
  room.users.delete(userId);
  user.isActive = false;
  
  room.updatedAt = new Date().toISOString();
  log(`Removed user ${userId} (${user.name}) from room ${user.roomId}`);
  
  // 广播用户离开
  broadcastToRoom(user.roomId, {
    type: 'user-left',
    userId: user.id,
    userName: user.name,
    userCount: room.users.size
  });
  
  // 如果房间为空，删除房间
  if (room.users.size === 0) {
    deleteRoom(user.roomId);
  }
  
  return true;
};

// 锁定绘图元素
const lockElement = (roomId: string, elementId: string, userId: string): boolean => {
  const room = getRoom(roomId);
  if (!room) {
    log(`Room not found: ${roomId}`, 'error');
    return false;
  }
  
  if (room.lockedElements.has(elementId)) {
    const lockedBy = room.lockedElements.get(elementId);
    log(`Element ${elementId} is already locked by user ${lockedBy}`, 'warn');
    return false;
  }
  
  room.lockedElements.set(elementId, userId);
  room.updatedAt = new Date().toISOString();
  log(`User ${userId} locked element ${elementId} in room ${roomId}`);
  
  // 广播元素锁定
  broadcastToRoom(roomId, {
    type: 'element-locked',
    elementId,
    lockedBy: userId
  });
  
  return true;
};

// 解锁绘图元素
const unlockElement = (roomId: string, elementId: string, userId: string): boolean => {
  const room = getRoom(roomId);
  if (!room) {
    log(`Room not found: ${roomId}`, 'error');
    return false;
  }
  
  const lockedBy = room.lockedElements.get(elementId);
  if (!lockedBy) {
    log(`Element ${elementId} is not locked`, 'warn');
    return false;
  }
  
  if (lockedBy !== userId) {
    log(`User ${userId} cannot unlock element ${elementId} locked by ${lockedBy}`, 'warn');
    return false;
  }
  
  room.lockedElements.delete(elementId);
  room.updatedAt = new Date().toISOString();
  log(`User ${userId} unlocked element ${elementId} in room ${roomId}`);
  
  // 广播元素解锁
  broadcastToRoom(roomId, {
    type: 'element-unlocked',
    elementId,
    unlockedBy: userId
  });
  
  return true;
};

// 添加绘图动作到历史记录
const addDrawingAction = (roomId: string, action: DrawingAction): boolean => {
  const room = getRoom(roomId);
  if (!room) {
    log(`Room not found: ${roomId}`, 'error');
    return false;
  }
  
  room.drawingHistory.push(action);
  // 限制历史记录数量为1000条
  if (room.drawingHistory.length > 1000) {
    room.drawingHistory.splice(0, room.drawingHistory.length - 1000);
  }
  room.updatedAt = new Date().toISOString();
  log(`Added drawing action ${action.actionType} for element ${action.elementId} in room ${roomId}`);
  
  return true;
};

// 发送消息给指定用户
const sendToUser = (userId: string, message: any): boolean => {
  const user = clients.get(userId);
  if (!user || !user.ws || user.ws.readyState !== WebSocket.OPEN) {
    log(`User not connected: ${userId}`, 'warn');
    return false;
  }
  
  try {
    const messageStr = JSON.stringify(message);
    // 检查消息大小限制（1MB）
    if (messageStr.length > 1024 * 1024) {
      log(`Message too large for user ${userId}: ${messageStr.length} bytes`, 'warn');
      return false;
    }
    
    user.ws.send(messageStr);
    user.lastSeen = new Date().toISOString();
    return true;
  } catch (error) {
    log(`Error sending message to user ${userId}: ${error}`, 'error');
    return false;
  }
};

// 广播消息到房间内所有用户
const broadcastToRoom = (roomId: string, message: any): void => {
  const room = getRoom(roomId);
  if (!room) {
    log(`Room not found: ${roomId}`, 'error');
    return;
  }
  
  try {
    const messageStr = JSON.stringify(message);
    // 检查消息大小限制（1MB）
    if (messageStr.length > 1024 * 1024) {
      log(`Message too large for room ${roomId}: ${messageStr.length} bytes`, 'warn');
      return;
    }
    
    room.users.forEach((user) => {
      if (user.ws.readyState === WebSocket.OPEN) {
        try {
          user.ws.send(messageStr);
          user.lastSeen = new Date().toISOString();
        } catch (error) {
          log(`Error sending message to user ${user.id} in room ${roomId}: ${error}`, 'error');
        }
      }
    });
  } catch (error) {
    log(`Error broadcasting message to room ${roomId}: ${error}`, 'error');
  }
};

// 广播消息到所有用户
const broadcastToAll = (message: any): void => {
  try {
    const messageStr = JSON.stringify(message);
    // 检查消息大小限制（1MB）
    if (messageStr.length > 1024 * 1024) {
      log(`Message too large for broadcast: ${messageStr.length} bytes`, 'warn');
      return;
    }
    
    clients.forEach((user) => {
      if (user.ws.readyState === WebSocket.OPEN) {
        try {
          user.ws.send(messageStr);
          user.lastSeen = new Date().toISOString();
        } catch (error) {
          log(`Error sending broadcast message to user ${user.id}: ${error}`, 'error');
        }
      }
    });
  } catch (error) {
    log(`Error broadcasting message: ${error}`, 'error');
  }
};

// 文档冲突处理函数
const handleDocumentConflict = (data: any) => {
  // 使用定时器确保冲突处理在10秒内完成
  const conflictTimeout = setTimeout(() => {
    log(`Document conflict handling timed out for project ${data.projectId}`, 'error');
    return;
  }, 10000);
  
  try {
    // 验证输入数据
    if (!data || !data.projectId || !data.userId || !data.content || !data.timestamp) {
      log(`Invalid document edit data: ${JSON.stringify(data)}`, 'error');
      clearTimeout(conflictTimeout);
      return;
    }
    
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
      log(`Created initial document version for project ${projectId}`, 'info');
      clearTimeout(conflictTimeout);
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
      log(`Updated document version ${documents[projectId].version} for project ${projectId}`, 'info');
      clearTimeout(conflictTimeout);
      return;
    }
    
    // 有冲突，执行三向合并策略
    const mergedContent = mergeDocuments(currentContent, content, userId, userName || 'Unknown', projectId);
    
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
        try {
          client.send(JSON.stringify({
            type: 'document-merged',
            projectId,
            content: mergedContent,
            version: documents[projectId].version,
            mergedBy: userId,
            mergeTimestamp: new Date().toISOString()
          }));
        } catch (error) {
          log(`Error sending merged document to client: ${error}`, 'error');
        }
      }
    });
    
    log(`Merged document version ${documents[projectId].version} for project ${projectId}`, 'info');
    clearTimeout(conflictTimeout);
  } catch (error) {
    log(`Error handling document conflict: ${error}`, 'error');
    clearTimeout(conflictTimeout);
  }
};

// 三向合并策略实现
const mergeDocuments = (currentContent: string, userContent: string, userId: string, userName: string, projectId: string): string => {
  try {
    // 验证输入
    if (!currentContent || !userContent || !userId || !projectId) {
      log(`Invalid merge documents input: currentContent=${currentContent}, userContent=${userContent}, userId=${userId}, projectId=${projectId}`, 'error');
      return currentContent; // 回退到当前内容
    }
    
    const currentLines = currentContent.split('\n');
    const userLines = userContent.split('\n');
    
    // 不同段落自动合并
    const mergedLines = [...currentLines];
    
    // 比较每一行，处理冲突
    userLines.forEach((userLine, index) => {
      if (index < mergedLines.length) {
        if (mergedLines[index] !== userLine) {
          // 同一行有不同修改，保留最新修改
          try {
            const currentLineTimestamp = new Date(documents[projectId].lastModified).getTime();
            // userId不是时间戳，这里使用当前时间作为用户修改时间
            const userLineTimestamp = new Date().getTime();
            
            if (userLineTimestamp > currentLineTimestamp) {
              mergedLines[index] = userLine;
            }
          } catch (error) {
            log(`Error comparing timestamps during merge: ${error}`, 'warn');
            // 时间戳比较失败，保留用户修改
            mergedLines[index] = userLine;
          }
        }
      } else {
        // 新增行，直接添加
        mergedLines.push(userLine);
      }
    });
    
    const mergedContent = mergedLines.join('\n');
    
    // 记录合并日志
    const mergeLog: MergeLog = {
      id: uuidv4(),
      projectId,
      userA: documents[projectId]?.lastModifiedBy || 'unknown',
      userB: userId,
      conflictRange: { start: 0, end: Math.max(currentLines.length, userLines.length) - 1 },
      resolvedBy: userId,
      timestamp: new Date().toISOString(),
      resolutionType: 'auto',
      userAContent: currentContent,
      userBContent: userContent,
      mergedContent
    };
    
    mergeLogs.push(mergeLog);
    saveMergeLogs();
    
    log(`Merged documents for project ${projectId} between users ${mergeLog.userA} and ${mergeLog.userB}`, 'info');
    return mergedContent;
  } catch (error) {
    log(`Error merging documents for project ${projectId}: ${error}`, 'error');
    return currentContent; // 回退到当前内容
  }
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
wss.on('connection', (ws: WebSocket) => {
  // 生成唯一客户端 ID
  const clientId = uuidv4();
  
  // 创建用户对象
  const user: User = {
    id: clientId,
    name: `User ${Math.floor(Math.random() * 1000)}`,
    ws,
    roomId: '',
    isActive: false,
    lastSeen: new Date().toISOString()
  };
  
  clients.set(clientId, user);
  log(`Client connected: ${clientId} (${user.name})`);

  // 发送欢迎消息
  sendToUser(clientId, {
    type: 'welcome',
    message: 'Welcome to the collaborative platform!',
    clientId,
    userName: user.name
  });

  // 处理客户端消息
  ws.on('message', (message: WebSocket.Data) => {
    // 使用定时器确保消息处理在10秒内完成
    const messageTimeout = setTimeout(() => {
      log(`Message processing timed out for user ${clientId}`, 'error');
    }, 10000);
    
    try {
      // 检查消息是否为空
      if (!message) {
        log(`Received empty message from ${clientId}`, 'warn');
        clearTimeout(messageTimeout);
        return;
      }
      
      // 确保消息是字符串类型
      const messageStr = typeof message === 'string' ? message : String(message);
      
      // 检查消息大小限制（1MB）
      if (messageStr.length > 1024 * 1024) {
        log(`Received oversized message from ${clientId}: ${messageStr.length} bytes`, 'warn');
        clearTimeout(messageTimeout);
        return;
      }
      
      const data = JSON.parse(messageStr);
      log(`Received message from ${clientId}: ${JSON.stringify(data)}`);

      // 验证消息格式
      if (!data || typeof data !== 'object' || !data.type) {
        log(`Invalid message format from ${clientId}`, 'warn');
        clearTimeout(messageTimeout);
        return;
      }

      // 处理不同类型的消息
      switch (data.type) {
        // 房间管理
        case 'create-room':
          const roomName = data.name || 'New Room';
          const newRoom = createRoom(roomName);
          sendToUser(clientId, {
            type: 'room-created',
            roomId: newRoom.id,
            roomName: newRoom.name
          });
          break;
          
        case 'join-room':
          const roomId = data.roomId;
          const userName = data.userName || user.name;
          user.name = userName;
          if (addUserToRoom(roomId, user)) {
            sendToUser(clientId, {
              type: 'room-joined',
              roomId,
              userName
            });
          } else {
            sendToUser(clientId, {
              type: 'room-join-failed',
              roomId,
              error: 'Room not found or full'
            });
          }
          break;
          
        case 'leave-room':
          removeUserFromRoom(clientId);
          break;
          
        case 'get-rooms':
          const roomList = Array.from(rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            userCount: room.users.size,
            createdAt: room.createdAt
          }));
          sendToUser(clientId, {
            type: 'room-list',
            rooms: roomList
          });
          break;
          
        // 绘图操作
        case 'draw':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          // 检查元素是否被锁定
          if (data.elementId) {
            const room = getRoom(user.roomId);
            if (room && room.lockedElements.has(data.elementId)) {
              const lockedBy = room.lockedElements.get(data.elementId);
              sendToUser(clientId, {
                type: 'error',
                message: `Element is locked by user ${lockedBy}`
              });
              break;
            }
          }
          
          // 创建绘图动作
          const drawAction: DrawingAction = {
            id: uuidv4(),
            userId: clientId,
            userName: user.name,
            actionType: 'draw',
            elementId: data.elementId || uuidv4(),
            elementData: data.elementData,
            timestamp: new Date().toISOString()
          };
          
          // 添加到历史记录
          addDrawingAction(user.roomId, drawAction);
          
          // 广播绘图动作
          broadcastToRoom(user.roomId, {
            type: 'draw',
            action: drawAction
          });
          break;
          
        case 'erase':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          // 检查元素是否被锁定
          if (data.elementId) {
            const room = getRoom(user.roomId);
            if (room && room.lockedElements.has(data.elementId)) {
              const lockedBy = room.lockedElements.get(data.elementId);
              sendToUser(clientId, {
                type: 'error',
                message: `Element is locked by user ${lockedBy}`
              });
              break;
            }
          }
          
          // 创建擦除动作
          const eraseAction: DrawingAction = {
            id: uuidv4(),
            userId: clientId,
            userName: user.name,
            actionType: 'erase',
            elementId: data.elementId,
            elementData: data.elementData,
            timestamp: new Date().toISOString()
          };
          
          // 添加到历史记录
          addDrawingAction(user.roomId, eraseAction);
          
          // 广播擦除动作
          broadcastToRoom(user.roomId, {
            type: 'erase',
            action: eraseAction
          });
          break;
          
        case 'move':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          // 检查元素是否被锁定
          if (data.elementId) {
            const room = getRoom(user.roomId);
            if (room && room.lockedElements.has(data.elementId)) {
              const lockedBy = room.lockedElements.get(data.elementId);
              sendToUser(clientId, {
                type: 'error',
                message: `Element is locked by user ${lockedBy}`
              });
              break;
            }
          }
          
          // 创建移动动作
          const moveAction: DrawingAction = {
            id: uuidv4(),
            userId: clientId,
            userName: user.name,
            actionType: 'move',
            elementId: data.elementId,
            elementData: data.elementData,
            timestamp: new Date().toISOString()
          };
          
          // 添加到历史记录
          addDrawingAction(user.roomId, moveAction);
          
          // 广播移动动作
          broadcastToRoom(user.roomId, {
            type: 'move',
            action: moveAction
          });
          break;
          
        case 'resize':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          // 检查元素是否被锁定
          if (data.elementId) {
            const room = getRoom(user.roomId);
            if (room && room.lockedElements.has(data.elementId)) {
              const lockedBy = room.lockedElements.get(data.elementId);
              sendToUser(clientId, {
                type: 'error',
                message: `Element is locked by user ${lockedBy}`
              });
              break;
            }
          }
          
          // 创建调整大小动作
          const resizeAction: DrawingAction = {
            id: uuidv4(),
            userId: clientId,
            userName: user.name,
            actionType: 'resize',
            elementId: data.elementId,
            elementData: data.elementData,
            timestamp: new Date().toISOString()
          };
          
          // 添加到历史记录
          addDrawingAction(user.roomId, resizeAction);
          
          // 广播调整大小动作
          broadcastToRoom(user.roomId, {
            type: 'resize',
            action: resizeAction
          });
          break;
          
        // 元素锁定
        case 'lock-element':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          if (data.elementId) {
            if (lockElement(user.roomId, data.elementId, clientId)) {
              sendToUser(clientId, {
                type: 'element-locked',
                elementId: data.elementId
              });
            } else {
              sendToUser(clientId, {
                type: 'error',
                message: 'Failed to lock element'
              });
            }
          }
          break;
          
        case 'unlock-element':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          if (data.elementId) {
            if (unlockElement(user.roomId, data.elementId, clientId)) {
              sendToUser(clientId, {
                type: 'element-unlocked',
                elementId: data.elementId
              });
            } else {
              sendToUser(clientId, {
                type: 'error',
                message: 'Failed to unlock element'
              });
            }
          }
          break;
          
        // 历史回放
        case 'get-drawing-history':
          if (!user.roomId) {
            sendToUser(clientId, {
              type: 'error',
              message: 'You must join a room first'
            });
            break;
          }
          
          const room = getRoom(user.roomId);
          if (room) {
            sendToUser(clientId, {
              type: 'drawing-history',
              history: room.drawingHistory
            });
          }
          break;
          
        // 文档编辑
        case 'document-edit':
          // 确保活动历史对象存在
          if (!activities[data.projectId]) {
            activities[data.projectId] = [];
          }
          
          // 创建新的活动记录
          const activity = {
            id: uuidv4(),
            projectId: data.projectId,
            userId: clientId,
            userName: user.name,
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
          break;
          
        // 未知消息类型
        default:
          log(`Unknown message type from ${clientId}: ${data.type}`, 'warn');
          sendToUser(clientId, {
            type: 'error',
            message: `Unknown message type: ${data.type}`
          });
      }
      
      clearTimeout(messageTimeout);
    } catch (error) {
      log(`Error processing message from ${clientId}: ${error}`, 'error');
      sendToUser(clientId, {
        type: 'error',
        message: 'Failed to process message'
      });
      clearTimeout(messageTimeout);
    }
  });

  // 处理客户端断开连接
  ws.on('close', () => {
    log(`Client disconnected: ${clientId} (${user.name})`);
    
    // 从房间移除用户
    removeUserFromRoom(clientId);
    
    // 从客户端列表移除
    clients.delete(clientId);
  });

  // 处理错误
  ws.on('error', (error) => {
    log(`WebSocket error for ${clientId}: ${error}`, 'error');
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});