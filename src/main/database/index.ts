import { app } from 'electron';
import { join } from 'path';
import Database from 'better-sqlite3';
import fs from 'fs';

// 数据库文件路径
const userDataPath = app.getPath('userData');
const dbPath = join(userDataPath, 'yochat.db');

// 确保数据库目录存在
const dbDir = join(userDataPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 初始化数据库表
function initDatabase() {
  // 创建对话表
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assistant_id TEXT NOT NULL,
      temperature REAL,
      max_tokens INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 创建消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // 创建模型表
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_type TEXT NOT NULL,
      model_name TEXT NOT NULL,
      api_url TEXT,
      api_key TEXT,
      default_temperature REAL DEFAULT 0.7,
      default_max_tokens INTEGER DEFAULT 2048,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 创建助手表
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_id TEXT,
      system_prompt TEXT,
      agent_type TEXT DEFAULT 'direct',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
    );
  `);
  
  // 创建MCP服务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      command TEXT,
      args TEXT,
      request_url TEXT,
      request_headers TEXT,
      config TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // 检查是否需要添加temperature和max_tokens列到conversations表
  const conversationsTableInfo = db.prepare("PRAGMA table_info(conversations)").all();
  const hasTemperature = conversationsTableInfo.some(column => column.name === 'temperature');
  const hasMaxTokens = conversationsTableInfo.some(column => column.name === 'max_tokens');
  
  if (!hasTemperature) {
    console.log('正在添加temperature列到conversations表...');
    db.exec('ALTER TABLE conversations ADD COLUMN temperature REAL;');
  }
  
  if (!hasMaxTokens) {
    console.log('正在添加max_tokens列到conversations表...');
    db.exec('ALTER TABLE conversations ADD COLUMN max_tokens INTEGER;');
  }
  
  // 检查是否需要添加工具调用相关字段到messages表
  const messagesTableInfo = db.prepare("PRAGMA table_info(messages)").all();
  const hasToolCalls = messagesTableInfo.some(column => column.name === 'tool_calls');
  const hasToolCallId = messagesTableInfo.some(column => column.name === 'tool_call_id');
  
  if (!hasToolCalls) {
    console.log('正在添加tool_calls列到messages表...');
    db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT;');
  }
  
  if (!hasToolCallId) {
    console.log('正在添加tool_call_id列到messages表...');
    db.exec('ALTER TABLE messages ADD COLUMN tool_call_id TEXT;');
  }
  
  // 检查是否需要添加mcp_services字段到conversations表
  const hasMcpServices = conversationsTableInfo.some(column => column.name === 'mcp_services');
  
  if (!hasMcpServices) {
    console.log('正在添加mcp_services列到conversations表...');
    db.exec('ALTER TABLE conversations ADD COLUMN mcp_services TEXT;');
  }
  
  // 检查是否需要添加agent_type字段到assistants表
  const assistantsTableInfo = db.prepare("PRAGMA table_info(assistants)").all();
  const hasAgentType = assistantsTableInfo.some(column => column.name === 'agent_type');
  
  if (!hasAgentType) {
    console.log('正在添加agent_type列到assistants表...');
    db.exec('ALTER TABLE assistants ADD COLUMN agent_type TEXT DEFAULT "direct";');
  }

  // 创建设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 插入默认设置
  const defaultSettings = [
    { key: 'theme', value: 'light' },
    { key: 'auto_start', value: 'false' },
    { key: 'auto_update', value: 'true' },
    { key: 'shortcut_toggle', value: 'CommandOrControl+Shift+Space' },
    { key: 'shortcut_send', value: 'Enter' },
    { key: 'default_model_id', value: '' }
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value);
  }
}

// 初始化数据库
initDatabase();

export default db;