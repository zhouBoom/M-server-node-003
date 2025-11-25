const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_CONFIG = {
  serverUrl: 'ws://localhost:3000',
  clientCount: 25, // 测试25个客户端
  testDuration: 60000, // 测试持续时间1分钟
  messageInterval: 500, // 消息发送间隔
  disconnectProbability: 0.1, // 随机断开概率
  reconnectProbability: 0.8, // 重连概率
  invalidDataProbability: 0.1, // 发送非法数据概率
  messageLossProbability: 0.1 // 消息丢失概率
};

// 客户端状态
const clients = [];
let testStartTime = null;
let totalMessagesSent = 0;
let totalMessagesReceived = 0;
let totalErrors = 0;
let totalDisconnects = 0;
let totalReconnects = 0;

// 日志记录
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
};

// 创建客户端
const createClient = (id) => {
  const client = {
    id,
    ws: null,
    isConnected: false,
    roomId: null,
    userName: `TestUser-${id}`,
    messagesSent: 0,
    messagesReceived: 0,
    errors: 0,
    disconnects: 0,
    reconnects: 0,
    lastMessageTime: null
  };

  // 连接到服务器
  const connect = () => {
    try {
      client.ws = new WebSocket(TEST_CONFIG.serverUrl);
      client.isConnected = false;

      client.ws.on('open', () => {
        client.isConnected = true;
        log(`Client ${client.id} connected`);

        // 发送欢迎消息确认
        sendMessage(client, {
          type: 'hello',
          clientId: client.id,
          userName: client.userName
        });

        // 获取房间列表
        setTimeout(() => {
          sendMessage(client, {
            type: 'get-rooms'
          });
        }, 1000);
      });

      client.ws.on('message', (message) => {
        client.messagesReceived++;
        totalMessagesReceived++;
        client.lastMessageTime = Date.now();

        try {
          const data = JSON.parse(message);

          // 处理房间列表
          if (data.type === 'room-list' && data.rooms && data.rooms.length > 0) {
            // 加入第一个房间
            client.roomId = data.rooms[0].id;
            sendMessage(client, {
              type: 'join-room',
              roomId: client.roomId,
              userName: client.userName
            });
          } 
          // 处理房间加入成功
          else if (data.type === 'room-joined') {
            log(`Client ${client.id} joined room ${client.roomId}`);

            // 开始发送绘图消息
            startSendingDrawingMessages(client);
          }
          // 处理绘图历史
          else if (data.type === 'drawing-history') {
            log(`Client ${client.id} received drawing history with ${data.history.length} actions`);
          }
        } catch (error) {
          client.errors++;
          totalErrors++;
          log(`Client ${client.id} error parsing message: ${error}`, 'error');
        }
      });

      client.ws.on('close', () => {
        client.isConnected = false;
        client.disconnects++;
        totalDisconnects++;
        log(`Client ${client.id} disconnected`);

        // 尝试重连
        if (Date.now() - testStartTime < TEST_CONFIG.testDuration) {
          if (Math.random() < TEST_CONFIG.reconnectProbability) {
            setTimeout(() => {
              client.reconnects++;
              totalReconnects++;
              log(`Client ${client.id} attempting to reconnect`);
              connect();
            }, Math.random() * 5000); // 随机延迟0-5秒重连
          }
        }
      });

      client.ws.on('error', (error) => {
        client.errors++;
        totalErrors++;
        log(`Client ${client.id} WebSocket error: ${error}`, 'error');
      });
    } catch (error) {
      client.errors++;
      totalErrors++;
      log(`Client ${client.id} connection error: ${error}`, 'error');
    }
  };

  // 发送消息
  const sendMessage = (client, message) => {
    if (!client.isConnected || !client.ws) return;

    try {
      // 模拟消息丢失
      if (Math.random() < TEST_CONFIG.messageLossProbability) {
        log(`Client ${client.id} message lost (simulated)`, 'warn');
        return;
      }

      // 模拟发送非法数据
      if (Math.random() < TEST_CONFIG.invalidDataProbability) {
        const invalidDataTypes = [
          'invalid json',
          { type: 'invalid-type' },
          { type: 'draw' }, // 缺少必要字段
          JSON.stringify({ type: 'draw', elementId: 'test', elementData: { x: 100, y: 100 } }).repeat(1000) // 超大消息
        ];
        const invalidData = invalidDataTypes[Math.floor(Math.random() * invalidDataTypes.length)];
        client.ws.send(invalidData);
        log(`Client ${client.id} sent invalid data: ${typeof invalidData === 'string' ? invalidData : JSON.stringify(invalidData)}`, 'warn');
      } else {
        // 发送正常消息
        client.ws.send(JSON.stringify(message));
      }

      client.messagesSent++;
      totalMessagesSent++;
    } catch (error) {
      client.errors++;
      totalErrors++;
      log(`Client ${client.id} error sending message: ${error}`, 'error');
    }
  };

  // 开始发送绘图消息
  const startSendingDrawingMessages = (client) => {
    if (!client.isConnected || !client.roomId) return;

    const messageInterval = setInterval(() => {
      if (!client.isConnected) {
        clearInterval(messageInterval);
        return;
      }

      // 随机选择绘图动作类型
      const actionTypes = ['draw', 'erase', 'move', 'resize', 'lock-element', 'unlock-element'];
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];

      // 创建绘图消息
      const message = {
        type: actionType,
        elementId: `element-${Math.floor(Math.random() * 100)}`,
        elementData: {
          x: Math.floor(Math.random() * 800),
          y: Math.floor(Math.random() * 600),
          width: Math.floor(Math.random() * 200) + 50,
          height: Math.floor(Math.random() * 200) + 50,
          color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
          strokeWidth: Math.floor(Math.random() * 10) + 1
        }
      };

      sendMessage(client, message);

      // 随机断开连接
      if (Math.random() < TEST_CONFIG.disconnectProbability) {
        log(`Client ${client.id} disconnecting (simulated)`, 'warn');
        clearInterval(messageInterval);
        client.ws.close();
      }
    }, TEST_CONFIG.messageInterval);
  };

  // 连接到服务器
  connect();

  return client;
};

// 启动测试
const startTest = () => {
  log('Starting real-time service test...');
  testStartTime = Date.now();

  // 创建多个客户端
  for (let i = 0; i < TEST_CONFIG.clientCount; i++) {
    setTimeout(() => {
      clients.push(createClient(i + 1));
    }, i * 1000); // 间隔1秒创建一个客户端
  }

  // 测试结束后输出结果
  setTimeout(() => {
    endTest();
  }, TEST_CONFIG.testDuration);
};

// 结束测试
const endTest = () => {
  log('Test completed!');

  // 断开所有客户端连接
  clients.forEach(client => {
    if (client.isConnected && client.ws) {
      client.ws.close();
    }
  });

  // 输出测试结果
  console.log('\n=== Test Results ===');
  console.log(`Test Duration: ${(TEST_CONFIG.testDuration / 1000).toFixed(2)} seconds`);
  console.log(`Number of Clients: ${TEST_CONFIG.clientCount}`);
  console.log(`Total Messages Sent: ${totalMessagesSent}`);
  console.log(`Total Messages Received: ${totalMessagesReceived}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Total Disconnects: ${totalDisconnects}`);
  console.log(`Total Reconnects: ${totalReconnects}`);
  console.log(`Message Loss Rate: ${((totalMessagesSent - totalMessagesReceived) / totalMessagesSent * 100).toFixed(2)}%`);
  console.log(`Error Rate: ${(totalErrors / totalMessagesSent * 100).toFixed(2)}%`);
  console.log(`Disconnect Rate: ${(totalDisconnects / TEST_CONFIG.clientCount * 100).toFixed(2)}%`);
  console.log(`Reconnect Rate: ${(totalReconnects / totalDisconnects * 100).toFixed(2)}%`);

  // 输出每个客户端的详细结果
  console.log('\n=== Client Details ===');
  clients.forEach(client => {
    console.log(`Client ${client.id}:`);
    console.log(`  Messages Sent: ${client.messagesSent}`);
    console.log(`  Messages Received: ${client.messagesReceived}`);
    console.log(`  Errors: ${client.errors}`);
    console.log(`  Disconnects: ${client.disconnects}`);
    console.log(`  Reconnects: ${client.reconnects}`);
    console.log(`  Message Loss Rate: ${((client.messagesSent - client.messagesReceived) / client.messagesSent * 100).toFixed(2)}%`);
    console.log(`  Error Rate: ${(client.errors / client.messagesSent * 100).toFixed(2)}%`);
  });

  // 保存测试结果到文件
  const testResult = {
    timestamp: new Date().toISOString(),
    config: TEST_CONFIG,
    results: {
      totalMessagesSent,
      totalMessagesReceived,
      totalErrors,
      totalDisconnects,
      totalReconnects,
      messageLossRate: ((totalMessagesSent - totalMessagesReceived) / totalMessagesSent * 100),
      errorRate: (totalErrors / totalMessagesSent * 100),
      disconnectRate: (totalDisconnects / TEST_CONFIG.clientCount * 100),
      reconnectRate: (totalReconnects / totalDisconnects * 100)
    },
    clients: clients.map(client => ({
      id: client.id,
      messagesSent: client.messagesSent,
      messagesReceived: client.messagesReceived,
      errors: client.errors,
      disconnects: client.disconnects,
      reconnects: client.reconnects,
      messageLossRate: ((client.messagesSent - client.messagesReceived) / client.messagesSent * 100),
      errorRate: (client.errors / client.messagesSent * 100)
    }))
  };

  const resultPath = path.join(__dirname, 'test_results.json');
  fs.writeFileSync(resultPath, JSON.stringify(testResult, null, 2));
  log(`Test results saved to ${resultPath}`);
};

// 启动测试
startTest();