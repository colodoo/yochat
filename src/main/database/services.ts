import db from './index';
import { v4 as uuidv4 } from 'uuid';

// 对话相关服务
export const conversationService = {
  // 获取所有对话
  getAllConversations: () => {
    return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
  },

  // 获取单个对话
  getConversation: (id: number) => {
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (conversation && conversation.mcp_services) {
      try {
        conversation.mcp_services = JSON.parse(conversation.mcp_services);
      } catch (e) {
        console.error('解析MCP服务信息失败:', e);
        conversation.mcp_services = [];
      }
    } else {
      conversation.mcp_services = [];
    }
    return conversation;
  },

  // 创建新对话
  createConversation: (title: string, assistantId: string, temperature?: number, maxTokens?: number) => {
    const result = db
      .prepare('INSERT INTO conversations (title, assistant_id, temperature, max_tokens) VALUES (?, ?, ?, ?)')
      .run(title, assistantId, temperature, maxTokens);
    return result.lastInsertRowid;
  },

  // 更新对话
  updateConversation: (id: number, data: { title?: string, temperature?: number, maxTokens?: number, mcpServices?: string[] }) => {
    console.log('Services: updateConversation called with:', { id, data });
    const { title, temperature, maxTokens, mcpServices } = data;
    
    let query = 'UPDATE conversations SET ';
    const params: (string | number)[] = [];
    
    if (title !== undefined) {
      console.log('Services: 添加title更新:', title);
      query += 'title = ?, ';
      params.push(title);
    }
    
    if (temperature !== undefined) {
      console.log('Services: 添加temperature更新:', temperature);
      query += 'temperature = ?, ';
      params.push(temperature);
    }
    
    if (maxTokens !== undefined) {
      console.log('Services: 添加maxTokens更新:', maxTokens);
      query += 'max_tokens = ?, ';
      params.push(maxTokens);
    }
    
    if (mcpServices !== undefined) {
      console.log('Services: 添加mcpServices更新:', mcpServices);
      const mcpServicesJson = JSON.stringify(mcpServices);
      console.log('Services: mcpServices JSON化后:', mcpServicesJson);
      query += 'mcp_services = ?, ';
      params.push(mcpServicesJson);
    }
    
    query += 'updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    params.push(id);
    
    console.log('Services: 最终SQL查询:', query);
    console.log('Services: 查询参数:', params);
    
    const result = db.prepare(query).run(...params);
    console.log('Services: 数据库更新结果:', result);
    
    // 验证更新后的数据
    const updatedConversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    console.log('Services: 更新后的对话数据:', updatedConversation);
    
    return result;
  },

  // 删除对话
  deleteConversation: (id: number) => {
    return db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  },

  // 清空所有对话
  clearAllConversations: () => {
    // 先删除所有消息
    db.prepare('DELETE FROM messages').run();
    // 再删除所有对话
    return db.prepare('DELETE FROM conversations').run();
  }
};

// 消息相关服务
export const messageService = {
  // 获取对话中的所有消息
  getMessagesByConversation: (conversationId: number) => {
    const messages = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId);
    
    // 解析工具调用信息
    return messages.map(message => {
      if (message.tool_calls) {
        try {
          message.tool_calls = JSON.parse(message.tool_calls);
        } catch (e) {
          console.error('解析工具调用信息失败:', e);
          message.tool_calls = null;
        }
      }
      return message;
    });
  },

  // 添加消息
  addMessage: (conversationId: number, role: string, content: string, toolCalls?: any[], toolCallId?: string) => {
    const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
    
    const result = db
      .prepare('INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)')
      .run(conversationId, role, content, toolCallsJson, toolCallId || null);
    
    // 更新对话的更新时间
    db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(conversationId);
      
    return result.lastInsertRowid;
  },

  // 删除对话中的所有消息
  deleteAllMessages: (conversationId: number) => {
    return db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  },
  
  // 删除单条消息
  deleteMessage: (messageId: number) => {
    const message = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(messageId);
    if (!message) return { changes: 0 };
    
    const result = db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    
    // 更新对话的更新时间
    if (message.conversation_id) {
      db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(message.conversation_id);
    }
    
    return result;
  }
};

// 模型相关服务
export const modelService = {
  // 获取所有模型
  getAllModels: () => {
    return db.prepare('SELECT * FROM models ORDER BY created_at DESC').all();
  },

  // 获取单个模型
  getModel: (id: string) => {
    return db.prepare('SELECT * FROM models WHERE id = ?').get(id);
  },

  // 创建新模型
  createModel: (model: {
    name: string;
    model_type: string;
    model_name: string;
    api_url?: string;
    api_key?: string;
    default_temperature?: number;
    default_max_tokens?: number;
  }) => {
    const id = uuidv4();
    const {
      name,
      model_type,
      model_name,
      api_url = '',
      api_key = '',
      default_temperature = 0.7,
      default_max_tokens = 2048
    } = model;



    db.prepare(
      'INSERT INTO models (id, name, model_type, model_name, api_url, api_key, default_temperature, default_max_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, model_type, model_name, api_url, api_key, default_temperature, default_max_tokens);

    return id;
  },

  // 更新模型
  updateModel: (id: string, model: {
    name?: string;
    model_type?: string;
    model_name?: string;
    api_url?: string;
    api_key?: string;
    default_temperature?: number;
    default_max_tokens?: number;
  }) => {
    const existingModel = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
    if (!existingModel) {
      return false;
    }

    const updatedModel = { ...existingModel, ...model };

    return db
      .prepare(
        'UPDATE models SET name = ?, model_type = ?, model_name = ?, api_url = ?, api_key = ?, default_temperature = ?, default_max_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .run(
        updatedModel.name,
        updatedModel.model_type,
        updatedModel.model_name,
        updatedModel.api_url,
        updatedModel.api_key,
        updatedModel.default_temperature,
        updatedModel.default_max_tokens,
        id
      );
  },

  // 删除模型
  deleteModel: (id: string) => {
    return db.prepare('DELETE FROM models WHERE id = ?').run(id);
  }
};

// 助手相关服务
export const assistantService = {
  // 获取所有助手
  getAllAssistants: () => {
    return db.prepare(`
      SELECT a.*, m.name as model_display_name, m.model_type, m.model_name, 
             m.default_temperature, m.default_max_tokens 
      FROM assistants a 
      LEFT JOIN models m ON a.model_id = m.id 
      ORDER BY a.created_at DESC
    `).all();
  },

  // 获取单个助手
  getAssistant: (id: string) => {
    return db.prepare(`
      SELECT a.*, m.name as model_display_name, m.model_type, m.model_name, 
             m.default_temperature, m.default_max_tokens, m.api_url, m.api_key 
      FROM assistants a 
      LEFT JOIN models m ON a.model_id = m.id 
      WHERE a.id = ?
    `).get(id);
  },

  // 创建新助手
  createAssistant: (assistant: {
    name: string;
    model_id?: string;
    system_prompt?: string;
    agent_type?: string;
  }) => {
    const id = uuidv4();
    const {
      name,
      model_id = null,
      system_prompt = '',
      agent_type = 'direct'
    } = assistant;



    db.prepare(
      'INSERT INTO assistants (id, name, model_id, system_prompt, agent_type) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, model_id, system_prompt, agent_type);

    return id;
  },

  // 更新助手
  updateAssistant: (id: string, assistant: {
    name?: string;
    model_id?: string;
    system_prompt?: string;
    agent_type?: string;
  }) => {
    const existingAssistant = db.prepare('SELECT * FROM assistants WHERE id = ?').get(id);
    if (!existingAssistant) {
      return false;
    }

    const updatedAssistant = { ...existingAssistant, ...assistant };

    return db
      .prepare(
        'UPDATE assistants SET name = ?, model_id = ?, system_prompt = ?, agent_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .run(
        updatedAssistant.name,
        updatedAssistant.model_id,
        updatedAssistant.system_prompt,
        updatedAssistant.agent_type,
        id
      );
  },

  // 删除助手
  deleteAssistant: (id: string) => {
    return db.prepare('DELETE FROM assistants WHERE id = ?').run(id);
  }
};

// 设置相关服务
export const settingService = {
  // 获取所有设置
  getAllSettings: () => {
    const settings = db.prepare('SELECT key, value FROM settings').all();
    return settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);
  },

  // 获取单个设置
  getSetting: (key: string) => {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return setting ? setting.value : null;
  },

  // 更新设置
  updateSetting: (key: string, value: string) => {
    return db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
      )
      .run(key, value, value);
  }
};

// MCP服务相关服务
export const mcpService = {
  // 获取所有MCP服务
  getAllMcpServices: () => {
    return db.prepare('SELECT * FROM mcp_services ORDER BY created_at DESC').all();
  },

  // 获取单个MCP服务
  getMcpService: (id: string) => {
    return db.prepare('SELECT * FROM mcp_services WHERE id = ?').get(id);
  },

  // 创建新MCP服务
  createMcpService: (service: {
    name: string;
    type: string;
    command?: string;
    args?: string;
    request_url?: string;
    request_headers?: string;
    config?: string;
  }) => {
    const id = uuidv4();
    const {
      name,
      type,
      command = '',
      args = '',
      request_url = '',
      request_headers = '',
      config = '{}'
    } = service;



    db.prepare(
      'INSERT INTO mcp_services (id, name, type, command, args, request_url, request_headers, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, type, command, args, request_url, request_headers, config);

    return id;
  },

  // 更新MCP服务
  updateMcpService: (id: string, service: {
    name?: string;
    type?: string;
    command?: string;
    args?: string;
    request_url?: string;
    request_headers?: string;
    config?: string;
  }) => {
    const existingService = db.prepare('SELECT * FROM mcp_services WHERE id = ?').get(id);
    if (!existingService) {
      return false;
    }

    const updatedService = { ...existingService, ...service };

    return db
      .prepare(
        'UPDATE mcp_services SET name = ?, type = ?, command = ?, args = ?, request_url = ?, request_headers = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .run(
        updatedService.name,
        updatedService.type,
        updatedService.command,
        updatedService.args,
        updatedService.request_url,
        updatedService.request_headers,
        updatedService.config,
        id
      );
  },

  // 删除MCP服务
  deleteMcpService: (id: string) => {
    return db.prepare('DELETE FROM mcp_services WHERE id = ?').run(id);
  },
  
  // 通过JSON配置导入MCP服务
  importMcpServiceFromJson: (jsonConfig: string) => {
    try {
      const config = JSON.parse(jsonConfig);
      
      // 处理Model Context Protocol格式
      // 例如: { "mcpServers": { "filesystem": { "command": "npx", "args": [ "-y", "@modelcontextprotocol/server-filesystem", "/path1", "/path2" ] } } }
      if (config.mcpServers) {
        const mcpServers = config.mcpServers;
        const serverName = Object.keys(mcpServers)[0]; // 获取第一个服务名称
        
        if (serverName && mcpServers[serverName]) {
          const serverConfig = mcpServers[serverName];
          
          // 将args数组转换为换行分隔的字符串格式，便于手动维护
          let argsString = '';
          if (serverConfig.args && Array.isArray(serverConfig.args)) {
            argsString = serverConfig.args.join('\n');
          }
          
          return mcpService.createMcpService({
            name: serverName,
            type: 'stdio', // MCP服务默认为stdio类型
            command: serverConfig.command || '',
            args: argsString,
            request_url: '',
            request_headers: '',
            config: jsonConfig
          });
        }
      }
      
      // 处理标准格式
      const {
        name,
        type,
        command,
        args,
        request_url,
        request_headers
      } = config;
      
      if (!name || !type) {
        throw new Error('MCP服务配置必须包含name和type字段');
      }
      
      // 根据类型验证必要字段
      if (type === 'stdio' && !command) {
        throw new Error('stdio类型的MCP服务必须包含command字段');
      }
      
      if (type === 'http' && !request_url) {
        throw new Error('http类型的MCP服务必须包含request_url字段');
      }
      
      // 处理args格式转换
      let argsString = '';
      if (args) {
        if (Array.isArray(args)) {
          // 如果是数组，转换为换行分隔的字符串
          argsString = args.join('\n');
        } else if (typeof args === 'string') {
          // 如果已经是字符串，直接使用
          argsString = args;
        } else {
          // 其他类型，转换为JSON字符串再处理
          argsString = JSON.stringify(args);
        }
      }
      
      return mcpService.createMcpService({
        name,
        type,
        command: command || '',
        args: argsString,
        request_url: request_url || '',
        request_headers: request_headers ? JSON.stringify(request_headers) : '',
        config: jsonConfig
      });
    } catch (error) {
      console.error('导入MCP服务配置失败:', error);
      throw error;
    }
  }
};