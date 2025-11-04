<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElCard, ElButton, ElIcon } from 'element-plus';
import { Document, Brush, ChatDotRound } from '@element-plus/icons-vue';
import type { Project } from '../types/project';
import { useRoute } from 'vue-router';
import wsClient from '../utils/websocket';

const route = useRoute();
const project = ref<Project | null>(null);
const loading = ref(true);

// 获取项目 ID
const projectId = computed(() => route.params.id as string);
// WebSocket 连接状态
const isWsConnected = computed(() => wsClient.isConnected());

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

onMounted(() => {
  // 初始化 WebSocket 连接
  wsClient.connect();
  
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
      <div class="project-info">
        <ElIcon :size="32" class="project-type-icon">
          <component :is="project?.type === 'text' ? Document : project?.type === 'board' ? Brush : ChatDotRound" />
        </ElIcon>
        <div class="project-title">
          <h1>{{ project?.name }}</h1>
          <span class="project-type-tag">
            {{ project?.type === 'text' ? '文本协作' : project?.type === 'board' ? '在线画板' : '投票系统' }}
          </span>
        </div>
      </div>
    </div>

    <div class="project-detail-content">
      <ElCard class="collaboration-area">
        <template #header>
          <div class="card-header">
            <span>实时协作区</span>
            <ElButton type="success" size="small" :disabled="!isWsConnected.value">
              {{ isWsConnected.value ? '已连接' : '未连接' }}
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
              <ChatDotRound />
            </ElIcon>
            <p>项目不存在或已删除</p>
          </div>
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