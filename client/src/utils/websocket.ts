class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessageCallback: ((data: any) => void) | null = null;
  private onOpenCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Event) => void) | null = null;
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
        if (this.onOpenCallback) {
          this.onOpenCallback();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (this.onMessageCallback) {
            this.onMessageCallback(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (this.onCloseCallback) {
          this.onCloseCallback();
        }

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
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
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

  // 设置消息回调
  onMessage(callback: (data: any) => void): void {
    this.onMessageCallback = callback;
  }

  // 设置连接打开回调
  onOpen(callback: () => void): void {
    this.onOpenCallback = callback;
  }

  // 设置连接关闭回调
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  // 设置错误回调
  onError(callback: (error: Event) => void): void {
    this.onErrorCallback = callback;
  }

  // 检查连接状态
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// 导出单例实例
const wsClient = new WebSocketClient('ws://localhost:3000');

export default wsClient;