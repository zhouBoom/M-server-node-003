<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElCard, ElButton, ElIcon, ElMessage } from 'element-plus';
import { Document, Brush, ChatDotRound, Delete } from '@element-plus/icons-vue';
import type { Project } from '../types/project';
import { useRoute } from 'vue-router';
import wsClient from '../utils/websocket';

// 定义投票选项类型
interface VoteOption {
  text: string;
  count: number;
}

// 定义投票类型
interface Vote {
  projectId: string;
  topic: string;
  options: VoteOption[];
  users: string[];
}

const route = useRoute();
const project = ref<Project | null>(null);
const loading = ref(true);

// 投票相关变量
const activeTab = ref('create');
const newVote = ref({
  topic: '',
  options: ['', '']
});
const currentVote = ref<Vote | null>(null);
const hasVoted = ref(false);
const votedOptionIndex = ref(-1);

// 获取项目 ID
const projectId = computed(() => route.params.id as string);
// WebSocket 连接状态
const isWsConnected = computed(() => wsClient.isConnected());

// 计算属性：总票数
const totalVotes = computed(() => {
  if (!currentVote.value) return 0;
  return currentVote.value.options.reduce((sum, option) => sum + option.count, 0);
});

// 获取项目详情
const fetchProjectDetail = async () => {
  try {
    loading.value = true;
    const response = await fetch(`http://localhost:3000/api/projects/${projectId.value}`);
    if (!response.ok) {
      throw new Error('Failed to fetch project detail');
    }
    project.value = await response.json();
    
    // 如果是投票类型项目，获取投票信息
    if (project.value && project.value.type === 'vote') {
      fetchVoteInfo(projectId.value);
    }
  } catch (error) {
    console.error('Error fetching project detail:', error);
  } finally {
    loading.value = false;
  }
};

// 获取投票信息
const fetchVoteInfo = async (projectId: string) => {
  try {
    const response = await fetch(`http://localhost:3000/api/votes/${projectId}`);
    if (response.ok) {
      const data = await response.json();
      currentVote.value = data;

      // 检查用户是否已经投票
      const clientId = localStorage.getItem('clientId');
      if (clientId && currentVote.value && currentVote.value.users.includes(clientId)) {
        hasVoted.value = true;
      }
    } else if (response.status !== 404) {
      ElMessage.error('获取投票信息失败');
    }
  } catch (error) {
    console.error('Error fetching vote info:', error);
    ElMessage.error('获取投票信息失败');
  }
};

// 添加投票选项
const addOption = () => {
  newVote.value.options.push('');
};

// 移除投票选项
const removeOption = (index: number) => {
  if (newVote.value.options.length > 2) {
    newVote.value.options.splice(index, 1);
  } else {
    ElMessage.warning('至少需要两个选项');
  }
};

// 发起投票
const createVote = async () => {
  if (!project.value || project.value.type !== 'vote') return;

  // 验证投票主题和选项
  if (!newVote.value.topic.trim()) {
    ElMessage.warning('请输入投票主题');
    return;
  }

  const validOptions = newVote.value.options.filter(option => option.trim() !== '');
  if (validOptions.length < 2) {
    ElMessage.warning('请至少输入两个有效选项');
    return;
  }

  try {
    const response = await fetch(`http://localhost:3000/api/votes/${project.value?.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: newVote.value.topic.trim(),
        options: validOptions.map(option => option.trim())
      })
    });

    if (response.ok) {
      const data = await response.json();
      currentVote.value = data;
      activeTab.value = 'results';
      newVote.value = {
        topic: '',
        options: ['', '']
      };
      ElMessage.success('投票创建成功');
    } else {
      const errorData = await response.json();
      ElMessage.error(errorData.error || '创建投票失败');
    }
  } catch (error) {
    console.error('Error creating vote:', error);
    ElMessage.error('创建投票失败');
  }
};

// 提交投票
const submitVote = async (optionIndex: number) => {
  if (!project.value || project.value.type !== 'vote' || !currentVote.value) return;

  // 获取客户端 ID
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    // 生成随机客户端 ID
    clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('clientId', clientId);
  }

  try {
    const response = await fetch(`http://localhost:3000/api/votes/${project.value?.id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId,
        optionIndex
      })
    });

    if (response.ok) {
      const data = await response.json();
      currentVote.value = data;
      hasVoted.value = true;
      votedOptionIndex.value = optionIndex;
      ElMessage.success('投票提交成功');
    } else {
      const errorData = await response.json();
      ElMessage.error(errorData.error || '提交投票失败');
    }
  } catch (error) {
    console.error('Error submitting vote:', error);
    ElMessage.error('提交投票失败');
  }
};

// 计算投票选项百分比
const calculatePercentage = (count: number) => {
  if (totalVotes.value === 0) return 0;
  return Math.round((count / totalVotes.value) * 100);
};

// 获取进度条颜色
const getProgressColor = (index: number) => {
  const colors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'];
  return colors[index % colors.length];
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
        <el-icon :size="32" class="project-type-icon">
          <component :is="project && project.type === 'text' ? Document : project && project.type === 'board' ? Brush : ChatDotRound" />
        </el-icon>
        <div class="project-title">
          <h1>{{ project?.name }}</h1>
          <span class="project-type-tag">
            {{ project?.type === 'text' ? '文本协作' : project?.type === 'board' ? '在线画板' : '投票系统' }}
          </span>
        </div>
      </div>
    </div>

    <div class="project-detail-content">
      <el-card class="collaboration-area">
        <template #header>
          <div class="card-header">
            <span>实时协作区</span>
            <el-button type="success" size="small" :disabled="!isWsConnected">
              {{ isWsConnected ? '已连接' : '未连接' }}
            </el-button>
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
              <!-- 投票功能 -->
              <el-tabs v-model="activeTab">
                <!-- 投票发起标签 -->
                <el-tab-pane label="发起投票" name="create">
                  <el-form :model="newVote" label-position="top">
                    <el-form-item label="投票主题">
                      <el-input v-model="newVote.topic" placeholder="请输入投票主题" />
                    </el-form-item>
                    <el-form-item label="投票选项">
                      <div v-for="(_, index) in newVote.options" :key="index" class="option-item">
                        <el-input v-model="newVote.options[index]" placeholder="请输入选项内容" />
                        <el-button type="danger" size="small" @click="removeOption(index)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                      <el-button type="primary" size="small" @click="addOption">添加选项</el-button>
                    </el-form-item>
                    <el-form-item>
                      <el-button type="primary" @click="createVote">发起投票</el-button>
                    </el-form-item>
                  </el-form>
                </el-tab-pane>

                <!-- 投票结果标签 -->
                <el-tab-pane label="投票结果" name="results" :disabled="!currentVote">
                  <div v-if="currentVote" class="vote-results">
                    <h3>{{ currentVote.topic }}</h3>
                    <div v-for="(option, index) in currentVote.options" :key="index" class="vote-option">
                      <div class="option-text">{{ option.text }}</div>
                      <div class="option-bar-container">
                        <el-progress
                          :percentage="calculatePercentage(option.count)"
                          :color="getProgressColor(index)"
                          :stroke-width="20"
                          :show-text="false"
                        />
                        <span class="vote-count">{{ option.count }} 票</span>
                      </div>
                      <el-button
                        v-if="!hasVoted"
                        type="primary"
                        size="small"
                        @click="submitVote(index)"
                      >
                        投票
                      </el-button>
                      <el-button
                        v-else-if="votedOptionIndex === index"
                        type="success"
                        size="small"
                        disabled
                      >
                        已投票
                      </el-button>
                    </div>
                    <div class="vote-summary">
                      <p>总票数: {{ totalVotes }}</p>
                      <p>参与人数: {{ currentVote.users.length }}</p>
                    </div>
                  </div>
                  <div v-else class="no-vote">
                    <p>暂无投票，请先发起投票</p>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </div>
          </div>

          <div v-else class="error-state">
            <el-icon :size="48" color="#f56c6c">
              <ChatDotRound />
            </el-icon>
            <p>项目不存在或已删除</p>
          </div>
        </div>
      </el-card>
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