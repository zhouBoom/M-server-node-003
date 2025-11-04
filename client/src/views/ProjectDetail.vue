<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElCard, ElButton, ElIcon, ElMessage, ElSelect, ElOption, ElForm, ElFormItem, ElTag, ElAvatar } from 'element-plus';
import { Document, Brush, ChatDotRound, Delete, ArrowRight, ArrowLeft, InfoFilled } from '@element-plus/icons-vue';
import type { Project } from '../types/project';
import { useRoute } from 'vue-router';
import wsClient from '../utils/websocket';
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

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

// 定义文档活动类型
interface DocumentActivity {
  id: string;
  userId: string;
  userName: string;
  actionType: 'add' | 'delete' | 'edit';
  cursorPosition: number;
  timestamp: string;
  content?: string;
  oldContent?: string;
}

// 定义活动过滤器类型
interface ActivityFilter {
  userId?: string;
  actionType?: 'add' | 'delete' | 'edit';
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

// 文档活动监控相关变量
const activities = ref<DocumentActivity[]>([]);
const filteredActivities = ref<DocumentActivity[]>([]);
const activityFilter = ref<ActivityFilter>({});
const isActivityPanelOpen = ref(true);
const uniqueUsers = ref<string[]>([]);
const MAX_ACTIVITIES = 20;

// 客户端用户信息
const clientId = ref<string | null>(localStorage.getItem('clientId'));
const userName = ref<string>(localStorage.getItem('userName') || `用户${Math.floor(Math.random() * 1000)}`);

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

// 处理文档活动消息
const handleDocumentActivity = (data: any) => {
  if (data.type === 'document-activity') {
    const activity = data.data as DocumentActivity;
    
    // 添加新活动到列表开头
    activities.value.unshift(activity);
    
    // 限制活动记录数量
    if (activities.value.length > MAX_ACTIVITIES) {
      activities.value.pop();
    }
    
    // 更新唯一用户列表
    updateUniqueUsers();
    
    // 应用过滤器
    applyActivityFilter();
  }
};

// 更新唯一用户列表
const updateUniqueUsers = () => {
  const users = [...new Set(activities.value.map(a => a.userName))];
  uniqueUsers.value = users;
};

// 应用活动过滤器
const applyActivityFilter = () => {
  let filtered = [...activities.value];
  
  if (activityFilter.value.userId) {
    filtered = filtered.filter(a => a.userName === activityFilter.value.userId);
  }
  
  if (activityFilter.value.actionType) {
    filtered = filtered.filter(a => a.actionType === activityFilter.value.actionType);
  }
  
  filteredActivities.value = filtered;
};

// 重置过滤器
const resetFilter = () => {
  activityFilter.value = {};
  applyActivityFilter();
};

// 高亮文档位置
const highlightDocumentPosition = (position: number) => {
  // 模拟高亮文档位置的逻辑
  console.log(`高亮文档位置: ${position}`);
  // 这里可以添加实际的文档高亮逻辑
  // 例如：滚动到文档中的特定位置并添加闪烁效果
  const documentContent = document.querySelector('.document-content');
  if (documentContent) {
    // 模拟光标闪烁效果
    const cursorElement = document.createElement('span');
    cursorElement.className = 'cursor-blink';
    cursorElement.textContent = '|';
    cursorElement.style.position = 'absolute';
    cursorElement.style.left = `${position}px`;
    cursorElement.style.top = '0';
    cursorElement.style.color = '#409eff';
    cursorElement.style.fontWeight = 'bold';
    cursorElement.style.fontSize = '16px';
    cursorElement.style.lineHeight = '1.6';
    cursorElement.style.animation = 'blink 1s infinite';
    
    documentContent.appendChild(cursorElement);
    
    // 3秒后移除闪烁效果
    setTimeout(() => {
      documentContent.removeChild(cursorElement);
    }, 3000);
  }
};

// 处理文档编辑
const handleDocumentEdit = (event: Event) => {
  const target = event.target as HTMLElement;
  // 这里可以添加文档编辑的处理逻辑
  // 例如：获取编辑内容、光标位置等
  
  // 发送文档编辑消息到服务器
  const cursorPosition = getCursorPosition(target);
  const content = target.innerText;
  
  wsClient.send({
    type: 'document-edit',
    projectId: project.value?.id,
    userId: clientId.value,
    userName: userName.value,
    actionType: 'edit',
    cursorPosition,
    content,
  });
};

// 处理键盘事件
const handleKeyUp = (event: KeyboardEvent) => {
  // 这里可以添加键盘事件的处理逻辑
  // 例如：处理Enter键、Tab键等
};

// 获取光标位置
const getCursorPosition = (element: HTMLElement): number => {
  let position = 0;
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(element);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    position = preSelectionRange.toString().length;
  }
  return position;
};

// 格式化时间
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 计算时间差（秒）
  const seconds = Math.floor(diff / 1000);
  
  // 如果是今天，显示时分
  if (now.toDateString() === date.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  
  // 如果是昨天，显示"昨天 时分"
  const yesterday = new Date(now.getTime() - 86400000);
  if (yesterday.toDateString() === date.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // 如果是今年，显示月日时分
  if (now.getFullYear() === date.getFullYear()) {
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  
  // 否则显示完整日期时间
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// 生成随机用户昵称
const generateRandomUserName = () => {
  const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'];
  return names[Math.floor(Math.random() * names.length)];
};

// 获取活动历史
const fetchActivityHistory = async () => {
  try {
    const response = await fetch(`http://localhost:3000/api/activities/${projectId.value}`);
    if (response.ok) {
      const data = await response.json();
      activities.value = data;
      updateUniqueUsers();
      applyActivityFilter();
    }
  } catch (error) {
    console.error('Error fetching activity history:', error);
  }
};

onMounted(() => {
  // 初始化 WebSocket 连接
  wsClient.connect();
  
  // 获取项目详情
  fetchProjectDetail();
  
  // 监听 WebSocket 消息
  wsClient.onMessage(handleDocumentActivity);
  
  // 监听 WebSocket 连接打开事件
  wsClient.onOpen(() => {
    // 连接建立后，获取活动历史
    fetchActivityHistory();
    
    // 如果是文本类型项目，发送订阅消息
    if (project.value && project.value.type === 'text') {
      wsClient.send({
        type: 'subscribe',
        projectId: project.value.id
      });
    }
  });
  
  // 如果没有客户端 ID，生成一个并保存
  if (!clientId.value) {
    clientId.value = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('clientId', clientId.value);
    
    // 保存用户名
    localStorage.setItem('userName', userName.value);
  }
  
  // 模拟初始活动数据
  setTimeout(() => {
    for (let i = 0; i < 5; i++) {
      const activity: DocumentActivity = {
        id: `activity-${i}`,
        userId: `user-${i}`,
        userName: generateRandomUserName(),
        actionType: ['add', 'delete', 'edit'][Math.floor(Math.random() * 3)] as 'add' | 'delete' | 'edit',
        cursorPosition: Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString(),
        content: i % 2 === 0 ? '这是一段新添加的内容' : undefined,
        oldContent: i % 2 === 1 ? '这是一段被删除的内容' : undefined
      };
      activities.value.unshift(activity);
    }
    updateUniqueUsers();
    applyActivityFilter();
  }, 1000);
});

onBeforeUnmount(() => {
  // 断开 WebSocket 连接
  wsClient.disconnect();
  
  // 移除消息监听
  wsClient.offMessage(handleDocumentActivity);
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
              <h3>文本协作编辑器</h3>
              <div class="document-content" ref="documentContentRef" contenteditable @input="handleDocumentEdit" @keyup="handleKeyUp">
                <p>这是文档的示例内容。</p>
                <p>点击右侧活动列表中的项目可以高亮对应的文档位置。</p>
              </div>
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

      <!-- 文档活动监控面板 -->
      <div class="activity-panel-container">
        <div class="activity-panel-header">
          <span>活动监控</span>
          <el-button
            type="text"
            size="small"
            @click="isActivityPanelOpen = !isActivityPanelOpen"
          >
            <el-icon>{{ isActivityPanelOpen ? 'ArrowRight' : 'ArrowLeft' }}</el-icon>
          </el-button>
        </div>
        
        <div v-show="isActivityPanelOpen" class="activity-panel-content">
          <!-- 过滤器 -->
          <div class="activity-filter">
            <el-form :model="activityFilter" inline>
              <el-form-item label="用户">
                <el-select
                  v-model="activityFilter.userId"
                  placeholder="选择用户"
                  size="small"
                  clearable
                >
                  <el-option label="所有用户" value="" />
                  <el-option
                    v-for="user in uniqueUsers"
                    :key="user"
                    :label="user"
                    :value="user"
                  />
                </el-select>
              </el-form-item>
              
              <el-form-item label="操作类型">
                <el-select
                  v-model="activityFilter.actionType"
                  placeholder="选择操作类型"
                  size="small"
                  clearable
                >
                  <el-option label="所有操作" value="" />
                  <el-option label="新增" value="add" />
                  <el-option label="删除" value="delete" />
                  <el-option label="编辑" value="edit" />
                </el-select>
              </el-form-item>
              
              <el-form-item>
                <el-button type="primary" size="small" @click="resetFilter">重置</el-button>
              </el-form-item>
            </el-form>
          </div>
          
          <!-- 活动列表 -->
          <div class="activity-list-container">
            <RecycleScroller
              class="activity-list"
              :items="filteredActivities"
              :item-size="80"
              key-field="id"
            >
              <template #default="{ item }">
                <div
                  class="activity-item"
                  @click="highlightDocumentPosition(item.cursorPosition)"
                >
                  <el-avatar
                    class="user-avatar"
                    :size="40"
                  >
                    {{ item.userName.charAt(0) }}
                  </el-avatar>
                  
                  <div class="activity-content">
                    <div class="activity-header">
                      <span class="user-name">{{ item.userName }}</span>
                      <el-tag
                        :type="item.actionType === 'add' ? 'success' : item.actionType === 'delete' ? 'danger' : 'warning'"
                        size="small"
                      >
                        {{ item.actionType === 'add' ? '新增' : item.actionType === 'delete' ? '删除' : '编辑' }}
                      </el-tag>
                    </div>
                    
                    <div class="activity-details">
                      <span class="cursor-position">光标位置: {{ item.cursorPosition }}</span>
                      <span class="activity-time">
                        {{ formatTime(item.timestamp) }}
                      </span>
                    </div>
                    
                    <div class="activity-text" v-if="item.content">
                      {{ item.content }}
                    </div>
                  </div>
                </div>
              </template>
            </RecycleScroller>
            
            <div v-if="filteredActivities.length === 0" class="no-activities">
              <el-icon :size="32" color="#909399">
                <InfoFilled />
              </el-icon>
              <p>暂无活动记录</p>
            </div>
          </div>
        </div>
      </div>
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

/* 文档活动监控面板样式 */
.activity-panel-container {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 380px;
  max-height: calc(100vh - 40px);
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.activity-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  border-radius: 8px 8px 0 0;
  background-color: #fafafa;
  cursor: pointer;
}

.activity-panel-header span {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.activity-panel-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.activity-filter {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.activity-list-container {
  height: calc(100vh - 200px);
  overflow: hidden;
}

.activity-list {
  height: 100%;
}

.activity-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.3s;
}

.activity-item:hover {
  background-color: #f5f7fa;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-right: 8px;
}

.activity-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12px;
  color: #909399;
}

.activity-text {
  font-size: 14px;
  color: #606266;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.no-activities {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.no-activities p {
  margin-top: 16px;
}

/* 光标闪烁动画 */
@keyframes blink {
  0% { opacity: 1; }
  50% { opacity: 0; }
  100% { opacity: 1; }
}

.cursor-blink {
  animation: blink 1s infinite;
}

/* 响应式布局 */
@media (max-width: 1024px) {
  .activity-panel-container {
    position: static;
    width: 100%;
    max-height: none;
    margin-top: 20px;
  }
  
  .activity-list-container {
    height: 300px;
  }
}
</style>