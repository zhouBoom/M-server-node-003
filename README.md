# 多人实时创作系统

一个基于 Vue 3 + TypeScript + Vite + Element Plus 前端和 Node.js (Express + WebSocket) 后端的多人实时创作系统。用户可以在线创建不同类型的协作内容（文本、画板、投票等）。

## 项目结构

```
.
├── client/              # 前端项目目录
│   ├── src/
│   │   ├── views/      # 页面组件
│   │   │   ├── Dashboard.vue      # 仪表盘 - 项目列表页
│   │   │   └── ProjectDetail.vue  # 项目详情页
│   │   ├── router/     # 路由配置
│   │   ├── utils/      # 工具类
│   │   │   └── websocket.ts       # WebSocket 客户端封装
│   │   ├── types/      # TypeScript 类型定义
│   │   ├── App.vue     # 根组件
│   │   └── main.ts     # 入口文件
│   └── package.json
├── server/              # 后端项目目录
│   ├── src/
│   │   └── index.ts    # 后端入口文件（Express + WebSocket）
│   ├── tsconfig.json   # TypeScript 配置
│   └── package.json
└── package.json         # 根项目配置
```

## 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript 超集
- **Vite** - 下一代前端构建工具
- **Element Plus** - 企业级 UI 组件库
- **Vue Router** - Vue.js 官方路由管理器

### 后端
- **Node.js** - JavaScript 运行时环境
- **Express** - 简洁而灵活的 Node.js Web 应用框架
- **WebSocket** - 实时双向通信协议
- **TypeScript** - 类型安全的后端开发
- **Nodemon** - 开发时自动重启服务器

## 功能特性

- ✅ 项目列表展示与管理
- ✅ 实时项目详情查看
- ✅ WebSocket 实时通信连接
- ✅ 多人实时聊天功能
- ✅ 多种类型协作项目支持（文本、画板、投票）
- ✅ 响应式 UI 设计
- ✅ TypeScript 类型安全

## 安装与运行

### 环境要求
- Node.js >= 16.x
- npm >= 8.x

### 安装依赖

```bash
# 安装所有依赖（根目录、server、client）
npm run install:all

# 或者分别安装
npm install              # 根目录
npm install --prefix server  # 后端
npm install --prefix client  # 前端
```

### 启动开发服务器

```bash
# 同时启动前后端开发服务器
npm run dev

# 或者分别启动
npm run dev --prefix server  # 启动后端（端口 3000）
npm run dev --prefix client  # 启动前端（端口 5173/5174）
```

### 访问应用

- 前端应用: http://localhost:5173
- 后端 API: http://localhost:3000
- WebSocket: ws://localhost:3000

## API 接口

### 获取项目列表
```
GET /api/projects
```

### 获取项目详情
```
GET /api/projects/:id
```

## WebSocket 消息格式

### 欢迎消息（服务器 -> 客户端）
```json
{
  "type": "welcome",
  "message": "Welcome to the collaborative platform!",
  "clientId": "unique-client-id"
}
```

### 聊天消息（客户端 <-> 服务器）
```json
{
  "type": "chat-message",
  "content": "消息内容",
  "projectId": "project-id",
  "from": "client-id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 用户离开（服务器 -> 客户端）
```json
{
  "type": "user-left",
  "clientId": "unique-client-id"
}
```

## 页面路由

- `/` - 默认重定向到 `/dashboard`
- `/dashboard` - 仪表盘，展示所有项目列表
- `/project/:id` - 项目详情页，实时协作区域

## 开发说明

### 前端开发
前端代码位于 `client/` 目录，使用 Vue 3 Composition API 和 TypeScript 开发。

主要文件：
- `client/src/views/Dashboard.vue` - 项目列表页
- `client/src/views/ProjectDetail.vue` - 项目详情页
- `client/src/utils/websocket.ts` - WebSocket 客户端封装
- `client/src/router/index.ts` - 路由配置

### 后端开发
后端代码位于 `server/` 目录，使用 Express 和 WebSocket 开发。

主要文件：
- `server/src/index.ts` - 后端入口文件，包含 Express 服务器和 WebSocket 服务

## 构建生产版本

```bash
# 构建前端生产版本
cd client
npm run build

# 构建后端生产版本
cd server
npm run build
```

## 注意事项

1. 确保端口 3000（后端）和 5173/5174（前端）未被占用
2. WebSocket 连接默认使用 ws://localhost:3000
3. 前端 API 请求默认使用 http://localhost:3000
4. 生产环境需要配置适当的 CORS 策略

## 未来计划

- [ ] 实现文本实时协作编辑功能
- [ ] 实现在线画板功能
- [ ] 实现投票系统功能
- [ ] 添加用户认证和权限管理
- [ ] 实现项目创建和管理功能
- [ ] 添加文件上传和共享功能
- [ ] 实现实时音视频通信

## License

ISC