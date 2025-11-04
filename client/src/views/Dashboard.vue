<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ElCard, ElButton, ElRow, ElCol, ElIcon } from 'element-plus';
import { Plus, Document, Brush, ChatDotRound } from '@element-plus/icons-vue';
import type { Project } from '../types/project';
import wsClient from '../utils/websocket';
import { useRouter } from 'vue-router';

const router = useRouter();
const projects = ref<Project[]>([]);
const loading = ref(true);

// 获取项目列表
const fetchProjects = async () => {
  try {
    loading.value = true;
    const response = await fetch('http://localhost:3000/api/projects');
    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }
    projects.value = await response.json();
  } catch (error) {
    console.error('Error fetching projects:', error);
  } finally {
    loading.value = false;
  }
};

// 进入项目详情页
const enterProject = (projectId: string) => {
  router.push(`/project/${projectId}`);
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

// WebSocket 消息处理
const handleWebSocketMessage = (data: any) => {
  console.log('Received WebSocket message:', data);
  // 根据消息类型处理不同逻辑
  switch (data.type) {
    case 'welcome':
      console.log('Welcome message:', data.message);
      break;
    case 'user-left':
      console.log('User left:', data.clientId);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
};

onMounted(() => {
  // 初始化 WebSocket 连接
  wsClient.connect();
  wsClient.onMessage(handleWebSocketMessage);
  
  // 获取项目列表
  fetchProjects();
});

onBeforeUnmount(() => {
  // 断开 WebSocket 连接
  wsClient.disconnect();
});
</script>

<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h1>多人实时创作系统</h1>
      <ElButton type="primary" :icon="Plus">新建项目</ElButton>
    </div>

    <div class="dashboard-content">
      <ElRow :gutter="20">
        <ElCol :xs="24" :sm="12" :md="8" v-for="project in projects" :key="project.id">
          <ElCard class="project-card" @click="enterProject(project.id)">
            <div class="project-icon">
              <ElIcon :size="48">
                <component :is="getProjectIcon(project.type)" />
              </ElIcon>
            </div>
            <h3 class="project-name">{{ project.name }}</h3>
            <div class="project-meta">
              <span class="project-type">{{ project.type === 'text' ? '文本协作' : project.type === 'board' ? '在线画板' : '投票系统' }}</span>
              <span class="project-members">
                {{ project.members }} 人参与
              </span>
            </div>
            <div class="project-updated">
              最后更新: {{ project.lastUpdate }}
            </div>
          </ElCard>
        </ElCol>
      </ElRow>

      <div v-if="loading" class="loading-indicator">
        <el-loading-spinner size="large" />
        <span>加载中...</span>
      </div>

      <div v-else-if="projects.length === 0" class="empty-state">
        <ElIcon :size="64" color="#909399">
          <Document />
        </ElIcon>
        <p>暂无项目，点击右上角新建项目开始协作</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 20px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.dashboard-header h1 {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.dashboard-content {
  max-width: 1400px;
  margin: 0 auto;
}

.project-card {
  height: 100%;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 12px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 18px 0 rgba(0, 0, 0, 0.08);
}

.project-icon {
  margin-bottom: 16px;
  color: #409eff;
}

.project-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.project-type {
  background-color: #ecf5ff;
  color: #409eff;
  padding: 2px 8px;
  border-radius: 4px;
}

.project-members {
  color: #909399;
}

.project-updated {
  font-size: 12px;
  color: #909399;
}

.loading-indicator {
  text-align: center;
  padding: 60px 0;
  color: #909399;
}

.loading-indicator span {
  display: block;
  margin-top: 16px;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: #909399;
}

.empty-state p {
  margin-top: 16px;
  font-size: 16px;
}
</style>