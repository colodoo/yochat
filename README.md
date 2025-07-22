# YoChat 🚀

<p align="center">
  <img src="./resources/icon.png" alt="YoChat Logo" width="150">
</p>

<p align="center">
  <strong>一款功能强大的跨平台 AI 聊天助手。</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#项目结构">项目结构</a> •
  <a href="#构建">构建</a>
</p>

---

YoChat 是一款现代化的 AI 聊天应用，旨在提供流畅、可定制的对话体验。它支持多种 AI 模型，并集成了强大的工具生态系统，让您能够轻松地与 AI 进行交互和协作。

## ✨ 功能特性

*   **多模型支持**: 轻松连接和切换不同的 AI 模型（如 OpenAI、Anthropic、Ollama、Moonshot 等）。
*   **可定制的助手**: 创建和管理具有不同个性、能力和知识的 AI 助手。
*   **工具使用 (Agent)**: 支持 LangChain Agent，允许 AI 调用外部工具来完成更复杂的任务。
*   **对话管理**: 清晰的对话列表，方便您管理和回顾历史记录。
*   **Markdown 支持**: 优雅地渲染 Markdown 格式的聊天内容，包括代码高亮。
*   **跨平台**: 支持 Windows、macOS 和 Linux。
*   **本地化部署**: 支持连接本地运行的 Ollama 等模型，保护您的数据隐私。

## 🛠️ 技术栈

*   **框架**: [Electron](https://www.electronjs.org/), [Vue 3](https://vuejs.org/)
*   **语言**: [TypeScript](https://www.typescriptlang.org/)
*   **UI 库**: [Vuetify 3](https://vuetifyjs.com/)
*   **状态管理**: [Pinia](https://pinia.vuejs.org/)
*   **AI/LLM 集成**: [LangChain.js](https://js.langchain.com/), [@modelcontextprotocol/sdk](https://github.com/model-context-protocol/mcp-sdk-js)
*   **数据库**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
*   **打包工具**: [Electron Vite](https://electron-vite.org/)
*   **构建和打包**: [Electron Builder](https://www.electron.build/)

## 🚀 快速开始

### 环境要求

*   [Node.js](https://nodejs.org/en) (v18.x 或更高版本)
*   [pnpm](https://pnpm.io/)

### 安装依赖

```bash
pnpm install
```

### 开发模式

运行此命令将启动应用程序并开启热重载。

```bash
pnpm run dev
```

## 🏗️ 构建

您可以为不同的操作系统构建应用程序。

```bash
# Windows
pnpm run build:win

# macOS
pnpm run build:mac

# Linux
pnpm run build:linux
```

## 📁 项目结构

```
YoChat/
├── src/
│   ├── main/         # Electron 主进程代码
│   │   ├── database/   # 数据库相关模块
│   │   ├── index.ts    # 主进程入口
│   │   └── ipc.ts      # IPC 通信处理
│   ├── preload/      # Preload 脚本
│   └── renderer/     # Electron 渲染进程代码 (Vue 应用)
│       ├── src/
│       │   ├── components/ # Vue 组件
│       │   ├── stores/     # Pinia stores
│       │   ├── views/      # Vue 视图
│       │   └── main.ts     # Vue 应用入口
│       └── index.html
├── electron-builder.yml # Electron Builder 配置
├── electron.vite.config.ts # Electron Vite 配置
└── package.json
```

## 🤝 贡献

欢迎提交问题和拉取请求！

## 📄 许可证

本项目采用 MIT 许可证。
