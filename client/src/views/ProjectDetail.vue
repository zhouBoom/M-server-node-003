<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElCard, ElButton, ElIcon, ElInput, List, ListItem, ElAvatar } from 'element-plus';
import { ArrowLeft, PaperPlane, Document, Brush, ChatDotRound, User, Calendar, Warning, Check, Close } from '@element-plus/icons-vue';
import type { Project, WebSocketMessage } from '../types/project';
import wsClient from '../utils/websocket';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const project = ref<Project | null>(null);
const loading = ref(true);
const messageInput = ref('');
const messages = ref<WebSocketMessage[]>([]);
const currentUser = ref<string>('');

// 获取项目 ID
const projectId = computed(() => route.params.id as string);

// 获取项目详情
const fetchProjectDetail = async () => {
  try {
    loading.value = true;
    const response = await fetch(`http://localhost:3000/api/projects/${projectId.value}`);
    if (!response.ok) {
      throw new Error('Failed to fetch project detail');
    }
    project.value = await response.json();
  } catch (error) {
    console.error('Error fetching project detail:', error);
  } finally {
    loading.value = false;
  }
};

// 返回仪表盘
const goBack = () => {
  router.push('/dashboard');
};

// 发送消息
const sendMessage = () => {
  if (!messageInput.value.trim() || !wsClient.isConnected()) return;

  wsClient.send({
    type: 'chat-message',
    content: messageInput.value.trim(),
    projectId: projectId.value,
  });

  messageInput.value = '';
};

// 处理 WebSocket 消息
const handleWebSocketMessage = (data: WebSocketMessage) => {
  console.log('Received WebSocket message:', data);

  // 保存聊天消息
  if (data.type === 'chat-message' && data.projectId === projectId.value) {
    messages.value.push(data);
    // 滚动到底部
    setTimeout(() => {
      const messageContainer = document.querySelector('.message-list');
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    }, 100);
  }

  // 处理欢迎消息，保存当前用户 ID
  if (data.type === 'welcome') {
    currentUser.value = data.clientId;
  }
};

// 获取项目类型对应的图标
const getProjectIcon = (type: string) => {
  switch (type) {
    case 'text':
      return Document;
    case 'board':
      return Brush;
    case 'vote':
      return ChatDotRound;
    default:
      return Document;
  }
};

onMounted(() => {
  // 初始化 WebSocket 连接
  wsClient.connect();
  wsClient.onMessage(handleWebSocketMessage);
  
  // 获取项目详情
  fetchProjectDetail();
});

onBeforeUnmount(() => {
  // 断开 WebSocket 连接
  wsClient.disconnect();
});
</script>

<template>
  <div class="project-detail-container">
    <div class="project-detail-header">
      <ElButton @click="goBack" :icon="ArrowLeft" type="default">返回</ElButton>
      <div class="project-info">
        <ElIcon :size="32" class="project-type-icon">
          <component :is="getProjectIcon(project?.type || 'text')" />
        </ElIcon>
        <div class="project-title">
          <h1>{{ project?.name }}</h1>
          <span class="project-type-tag">
            {{ project?.type === 'text' ? '文本协作' : project?.type === 'board' ? '在线画板' : '投票系统' }}
          </span>
        </div>
      </div>
      <div class="project-stats">
        <span class="stat-item">
          <ElIcon><User /></ElIcon>
          {{ project?.members }} 人
        </span>
        <span class="stat-item">
          <ElIcon><Calendar /></ElIcon>
          {{ project?.lastUpdate }}
        </span>
      </div>
    </div>

    <div class="project-detail-content">
      <ElCard class="collaboration-area">
        <template #header>
          <div class="card-header">
            <span>实时协作区</span>
            <ElButton type="success" size="small" :disabled="!wsClient.isConnected()">
              <ElIcon>{{ wsClient.isConnected() ? 'Check' : 'Close' }}</ElIcon>
              {{ wsClient.isConnected() ? '已连接' : '未连接' }}
            </ElButton>
          </div>
        </template>

        <div class="collaboration-content">
          <div v-if="loading" class="loading-indicator">
            <el-loading-spinner size="large" />
            <span>加载项目中...</span>
          </div>

          <div v-else-if="project" class="project-content">
            <!-- 根据项目类型显示不同的协作内容 -->
            <div v-if="project.type === 'text'" class="text-editor">
              <h3>文本协作编辑器（开发中）</h3>
              <p>这是一个多人实时文本编辑器，支持多人同时编辑同一文档。</p>
            </div>

            <div v-else-if="project.type === 'board'" class="whiteboard">
              <h3>在线画板（开发中）</h3>
              <p>这是一个多人实时在线画板，支持多人同时绘制。</p>
            </div>

            <div v-else-if="project.type === 'vote'" class="vote-system">
              <h3>投票系统（开发中）</h3>
              <p>这是一个多人实时投票系统，支持创建和参与投票。</p>
            </div>
          </div>

          <div v-else class="error-state">
            <ElIcon :size="48" color="#f56c6c">
              <Warning />
            </ElIcon>
            <p>项目不存在或已删除</p>
          </div>
        </div>
      </ElCard>

      <ElCard class="chat-area">
        <template #header>
          <div class="card-header">
            <span>聊天消息</span>
            <span class="message-count">{{ messages.length }} 条</span>
          </div>
        </template>

        <div class="chat-content">
          <List class="message-list" v-if="messages.length > 0">
            <ListItem v-for="(msg, index) in messages" :key="index">
              <template #default>
                <div class="message-item" :class="{ 'own-message': msg.from === currentUser }">
                  <ElAvatar :size="32" class="user-avatar">
                    {{ msg.from.substring(0, 2).toUpperCase() }}
                  </ElAvatar>
                  <div class="message-content">
                    <div class="message-header">
                      <span class="user-name">用户 {{ msg.from.substring(0, 6) }}</span>
                      <span class="message-time">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
                    </div>
                    <div class="message-text">{{ msg.content }}</div>
                  </div>
                </div>
              </template>
            </ElListItem>
          </ElList>

          <div v-else class="no-messages">
            <ElIcon :size="32" color="#909399">
              <ChatDotRound />
            </ElIcon>
            <p>暂无消息，开始发送第一条消息吧！</p>
          </div>
        </div>

        <div class="message-input-area">
          <ElInput
            v-model="messageInput"
            placeholder="输入消息..."
            @keyup.enter="sendMessage"
            clearable
          >
            <template #append>
              <ElButton @click="sendMessage" type="primary" :icon="PaperPlane" />
            </template>
          </ElInput>
        </div>
      </ElCard>
    </div>
  </div>
</template>

<style scoped>
.project-detail-container {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 20px;
}

.project-detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.project-type-icon {
  color: #409eff;
}

.project-title h1 {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 4px 0;
}

.project-type-tag {
  background-color: #ecf5ff;
  color: #409eff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.project-stats {
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: #606266;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-detail-content {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
}

@media (max-width: 1024px) {
  .project-detail-content {
    grid-template-columns: 1fr;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.message-count {
  font-size: 14px;
  font-weight: 400;
  color: #909399;
}

.collaboration-area {
  min-height: 400px;
}

.collaboration-content {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.loading-indicator {
  text-align: center;
  color: #909399;
}

.loading-indicator span {
  display: block;
  margin-top: 16px;
}

.error-state {
  text-align: center;
  color: #f56c6c;
}

.error-state p {
  margin-top: 16px;
}

.project-content {
  width: 100%;
  padding: 40px 20px;
}

.project-content h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #303133;
}

.project-content p {
  color: #606266;
  line-height: 1.6;
}

.chat-area {
  height: fit-content;
  max-height: 600px;
  display: flex;
  flex-direction: column;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.message-list {
  padding: 0;
}

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.message-item:last-child {
  border-bottom: none;
}

.own-message {
  flex-direction: row-reverse;
}

.user-avatar {
  flex-shrink: 0;
  background-color: #409eff;
  color: white;
}

.message-content {
  max-width: 70%;
}

.own-message .message-content {
  text-align: right;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-right: 8px;
}

.message-time {
  font-size: 12px;
  color: #909399;
}

.message-text {
  margin-top: 4px;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 8px;
  color: #303133;
  line-height: 1.4;
}

.own-message .message-text {
  background-color: #409eff;
  color: white;
}

.no-messages {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.no-messages p {
  margin-top: 16px;
}

.message-input-area {
  margin-top: 16px;
}
</style>