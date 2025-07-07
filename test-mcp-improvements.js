// MCP 改进功能测试脚本
// 这个脚本可以在开发者控制台中运行来测试新的 MCP 功能

// 测试 MCP 服务健康检查
async function testMcpHealthCheck() {
  console.log('=== 测试 MCP 服务健康检查 ===');
  
  try {
    // 检查所有服务健康状态
    console.log('检查所有 MCP 服务健康状态...');
    const allHealthResults = await window.api.invoke('mcp-health-check');
    console.log('所有服务健康检查结果:', allHealthResults);
    
    // 如果有服务，检查第一个服务的健康状态
    const services = await window.api.mcp.getAll();
    if (services.length > 0) {
      const firstServiceId = services[0].id;
      console.log(`检查服务 ${firstServiceId} 的健康状态...`);
      const singleHealthResult = await window.api.invoke('mcp-health-check', firstServiceId);
      console.log(`服务 ${firstServiceId} 健康检查结果:`, singleHealthResult);
    } else {
      console.log('没有找到 MCP 服务');
    }
  } catch (error) {
    console.error('健康检查测试失败:', error);
  }
}

// 测试获取 MCP 连接状态
async function testMcpConnectionStatus() {
  console.log('=== 测试获取 MCP 连接状态 ===');
  
  try {
    const status = await window.api.invoke('mcp-get-connection-status');
    console.log('MCP 连接状态:', status);
  } catch (error) {
    console.error('获取连接状态失败:', error);
  }
}

// 测试清理不健康的客户端
async function testCleanupUnhealthyClients() {
  console.log('=== 测试清理不健康的 MCP 客户端 ===');
  
  try {
    const cleanupResults = await window.api.invoke('mcp-cleanup-unhealthy');
    console.log('清理结果:', cleanupResults);
  } catch (error) {
    console.error('清理不健康客户端失败:', error);
  }
}

// 测试重置客户端池
async function testResetClientPool() {
  console.log('=== 测试重置 MCP 客户端池 ===');
  
  try {
    const resetResult = await window.api.invoke('mcp-reset-pool');
    console.log('重置结果:', resetResult);
  } catch (error) {
    console.error('重置客户端池失败:', error);
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('开始运行 MCP 改进功能测试...');
  
  await testMcpConnectionStatus();
  await testMcpHealthCheck();
  await testCleanupUnhealthyClients();
  await testResetClientPool();
  
  // 再次检查连接状态
  await testMcpConnectionStatus();
  
  console.log('所有测试完成!');
}

// 导出测试函数，可以在控制台中调用
window.mcpTests = {
  testMcpHealthCheck,
  testMcpConnectionStatus,
  testCleanupUnhealthyClients,
  testResetClientPool,
  runAllTests
};

console.log('MCP 测试脚本已加载。使用以下命令运行测试:');
console.log('- window.mcpTests.runAllTests() - 运行所有测试');
console.log('- window.mcpTests.testMcpHealthCheck() - 测试健康检查');
console.log('- window.mcpTests.testMcpConnectionStatus() - 测试连接状态');
console.log('- window.mcpTests.testCleanupUnhealthyClients() - 测试清理客户端');
console.log('- window.mcpTests.testResetClientPool() - 测试重置客户端池');