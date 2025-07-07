/**
 * 日志工具模块
 * 提供统一的日志输出接口，确保中文正确显示
 */

// 日志级别
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

// 日志颜色
const LogColors = {
  DEBUG: '\x1b[36m', // 青色
  INFO: '\x1b[32m',  // 绿色
  WARN: '\x1b[33m',  // 黄色
  ERROR: '\x1b[31m', // 红色
  RESET: '\x1b[0m'   // 重置
};

/**
 * 格式化日志消息
 * @param level 日志级别
 * @param tag 日志标签
 * @param message 日志消息
 * @param data 附加数据
 * @returns 格式化后的日志消息
 */
function formatLogMessage(level: LogLevel, tag: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const color = LogColors[level];
  const reset = LogColors.RESET;
  
  let logMessage = `${color}[${timestamp}] [${level}] [${tag}]${reset} ${message}`;
  
  if (data !== undefined) {
    if (typeof data === 'object') {
      try {
        // 尝试格式化对象，最大深度为2，保持输出简洁
        const formattedData = JSON.stringify(data, null, 2);
        logMessage += `\n${formattedData}`;
      } catch (error) {
        logMessage += `\n[无法序列化的对象: ${error instanceof Error ? error.message : String(error)}]`;
      }
    } else {
      logMessage += `\n${data}`;
    }
  }
  
  return logMessage;
}

/**
 * 日志工具类
 */
export class Logger {
  private tag: string;
  
  /**
   * 创建日志工具实例
   * @param tag 日志标签，通常为模块名称
   */
  constructor(tag: string) {
    this.tag = tag;
  }
  
  /**
   * 输出调试级别日志
   * @param message 日志消息
   * @param data 附加数据（可选）
   */
  debug(message: string, data?: any): void {
    console.log(formatLogMessage(LogLevel.DEBUG, this.tag, message, data));
  }
  
  /**
   * 输出信息级别日志
   * @param message 日志消息
   * @param data 附加数据（可选）
   */
  info(message: string, data?: any): void {
    console.log(formatLogMessage(LogLevel.INFO, this.tag, message, data));
  }
  
  /**
   * 输出警告级别日志
   * @param message 日志消息
   * @param data 附加数据（可选）
   */
  warn(message: string, data?: any): void {
    console.warn(formatLogMessage(LogLevel.WARN, this.tag, message, data));
  }
  
  /**
   * 输出错误级别日志
   * @param message 日志消息
   * @param data 附加数据（可选）
   */
  error(message: string, data?: any): void {
    console.error(formatLogMessage(LogLevel.ERROR, this.tag, message, data));
  }
}

/**
 * 创建日志工具实例
 * @param tag 日志标签，通常为模块名称
 * @returns 日志工具实例
 */
export function createLogger(tag: string): Logger {
  return new Logger(tag);
}