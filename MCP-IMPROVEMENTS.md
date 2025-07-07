# MCP 服务改进功能

本文档描述了对 YoChat 中 MCP (Model Context Protocol) 服务的改进功能，包括健康检查、连接管理和错误处理增强。

## 新增功能

### 1. MCP 服务健康检查

#### 功能描述
- 检查单个或所有 MCP 服务的健康状态
- 验证服务连接是否正常
- 提供详细的健康状态报告

#### 使用方法

**前端调用 (Vue/TypeScript):**
```typescript
import { useMcpStore } from '@/stores/mcp'

const mcpStore = useMcpStore()

// 检查所有服务健康状态
const allHealthResults = await mcpStore.checkMcpServiceHealth()
console.log('所有服务健康状态:', allHealthResults)

// 检查特定服务健康状态
const serviceHealthResult = await mcpStore.checkMcpServiceHealth('service-id')
console.log('服务健康状态:', serviceHealthResult)
```

**直接 IPC 调用:**
```typescript
// 检查所有服务
const allResults = await window.api.invoke('mcp-health-check')

// 检查特定服务
const singleResult = await window.api.invoke('mcp-health-check', 'service-id')
```

### 2. 清理不健康的 MCP 客户端

#### 功能描述
- 自动检测并清理无响应或错误的客户端连接
- 释放系统资源
- 提供清理操作的详细报告

#### 使用方法

**前端调用:**
```typescript
const mcpStore = useMcpStore()

// 清理不健康的客户端
const cleanupResults = await mcpStore.cleanupUnhealthyMcpClients()
console.log('清理结果:', cleanupResults)
```

**直接 IPC 调用:**
```typescript
const cleanupResults = await window.api.invoke('mcp-cleanup-unhealthy')
```

### 3. 重置 MCP 客户端池

#### 功能描述
- 清空所有客户端连接池
- 强制重新建立所有连接
- 用于解决连接问题或重置状态

#### 使用方法

**前端调用:**
```typescript
const mcpStore = useMcpStore()

// 重置客户端池
const resetResult = await mcpStore.resetMcpClientPool()
console.log('重置结果:', resetResult)
```

**直接 IPC 调用:**
```typescript
const resetResult = await window.api.invoke('mcp-reset-pool')
```

### 4. 获取 MCP 连接状态

#### 功能描述
- 查看当前客户端池的状态
- 显示活跃连接数量和连接列表
- 用于监控和调试

#### 使用方法

**前端调用:**
```typescript
const mcpStore = useMcpStore()

// 获取连接状态
const status = await mcpStore.getMcpConnectionStatus()
console.log('连接状态:', status)
// 输出示例: { poolSize: 3, connections: ['service1', 'service2', 'service3'] }
```

**直接 IPC 调用:**
```typescript
const status = await window.api.invoke('mcp-get-connection-status')
```

## 改进的错误处理

### 1. 工具调用增强

- **参数安全解析**: 自动处理 JSON 解析错误
- **详细日志记录**: 记录工具调用的详细信息
- **工具名称验证**: 验证工具名称格式的有效性
- **服务状态检查**: 验证服务是否存在且已启用
- **统一错误处理**: 提供一致的错误信息格式

### 2. 连接重试机制

- **自动重试**: 连接失败时自动重试（最多2次）
- **超时设置**: stdio 服务30秒超时，http 服务45秒超时
- **连接错误检测**: 智能识别连接错误类型
- **客户端池清理**: 连接失败时自动清理无效客户端

### 3. 工具结果处理

- **格式化处理**: 根据结果类型自动格式化（字符串或JSON）
- **错误信息记录**: 详细记录工具调用失败的原因
- **循环调用防护**: 避免工具调用中的无限循环

## 测试功能

项目中包含了一个测试脚本 `test-mcp-improvements.js`，可以在浏览器开发者控制台中运行来测试所有新功能。

### 使用测试脚本

1. 在应用中打开开发者控制台 (F12)
2. 加载测试脚本（如果尚未自动加载）
3. 运行测试命令：

```javascript
// 运行所有测试
window.mcpTests.runAllTests()

// 或运行单个测试
window.mcpTests.testMcpHealthCheck()
window.mcpTests.testMcpConnectionStatus()
window.mcpTests.testCleanupUnhealthyClients()
window.mcpTests.testResetClientPool()
```

## 日志记录

所有 MCP 相关操作都会记录详细的日志信息，包括：

- 服务调用开始和结束时间
- 参数和返回值的摘要
- 错误信息和堆栈跟踪
- 性能指标（执行时间）
- 连接状态变化

日志可以在应用的日志文件中查看，也可以在开发者控制台中实时监控。

## 最佳实践

1. **定期健康检查**: 建议定期运行健康检查以确保服务正常运行
2. **错误处理**: 在调用 MCP 服务时始终包含适当的错误处理
3. **资源清理**: 在检测到连接问题时及时清理不健康的客户端
4. **监控连接状态**: 定期检查连接状态以识别潜在问题
5. **日志监控**: 关注日志输出以及时发现和解决问题

## 故障排除

### 常见问题

1. **服务无响应**
   - 运行健康检查确认服务状态
   - 清理不健康的客户端
   - 重置客户端池

2. **连接错误**
   - 检查服务配置是否正确
   - 验证网络连接
   - 查看详细的错误日志

3. **性能问题**
   - 监控连接池大小
   - 定期清理无用连接
   - 检查服务响应时间

### 调试步骤

1. 检查连接状态: `getMcpConnectionStatus()`
2. 运行健康检查: `checkMcpServiceHealth()`
3. 查看详细日志
4. 清理问题连接: `cleanupUnhealthyMcpClients()`
5. 如有必要，重置连接池: `resetMcpClientPool()`