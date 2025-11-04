class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessageCallbacks: Set<(data: any) => void> = new Set();
  private onOpenCallbacks: Set<() => void> = new Set();
  private onCloseCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: Event) => void> = new Set();
  private retryAttempts = 0;
  private maxRetries = 5;
  private retryDelay = 1000; // ms

  constructor(url: string) {
    this.url = url;
  }

  // 连接 WebSocket 服务器
  connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.retryAttempts = 0;
        this.onOpenCallbacks.forEach(callback => callback());
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onMessageCallbacks.forEach(callback => callback(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.onCloseCallbacks.forEach(callback => callback());

        // 自动重连
        if (this.retryAttempts < this.maxRetries) {
          this.retryAttempts++;
          setTimeout(() => {
            console.log(`Reconnecting... Attempt ${this.retryAttempts}/${this.maxRetries}`);
            this.connect();
          }, this.retryDelay * Math.pow(2, this.retryAttempts - 1)); // 指数退避
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onErrorCallbacks.forEach(callback => callback(error));
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  }

  // 断开连接
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 发送消息
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }

  // 添加消息回调
  onMessage(callback: (data: any) => void): void {
    this.onMessageCallbacks.add(callback);
  }

  // 移除消息回调
  offMessage(callback: (data: any) => void): void {
    this.onMessageCallbacks.delete(callback);
  }

  // 添加连接打开回调
  onOpen(callback: () => void): void {
    this.onOpenCallbacks.add(callback);
  }

  // 移除连接打开回调
  offOpen(callback: () => void): void {
    this.onOpenCallbacks.delete(callback);
  }

  // 添加连接关闭回调
  onClose(callback: () => void): void {
    this.onCloseCallbacks.add(callback);
  }

  // 移除连接关闭回调
  offClose(callback: () => void): void {
    this.onCloseCallbacks.delete(callback);
  }

  // 添加错误回调
  onError(callback: (error: Event) => void): void {
    this.onErrorCallbacks.add(callback);
  }

  // 移除错误回调
  offError(callback: (error: Event) => void): void {
    this.onErrorCallbacks.delete(callback);
  }

  // 检查连接状态
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// 导出单例实例
const wsClient = new WebSocketClient('ws://localhost:3000');

export default wsClient;