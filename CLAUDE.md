# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server (Windows with UTF-8 fix)
- `npm run dev:win` - Windows-specific dev command with UTF-8 fix

### Code Quality
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript checks for bot Node and Web
- `npm run typecheck:node` - TypeScript check for Node/Electron main code
- `npm run typecheck:web` - TypeScript check for Vue/Renderer code

### Building
- `npm run build` - Build for production (runs typecheck + build)
- `npm run build:win` - Build Windows executable
- `npm run build:mac` - Build macOS executable
- `npm run build:linux` - Build Linux executable
- `npm run build:unpack` - Build unpacked directory

### Testing
- `npm start` - Preview built app

## Architecture Overview

YoChat is an Electron-based AI chat application built with Vue 3 + TypeScript. The app features:

### Main Process (`src/main/`)
- **index.ts**: Main entry point, creates main/mini windows, handles global shortcuts
- **ipc.ts**: Comprehensive IPC handlers for all app functionality including API calls, database operations, and MCP service management
- **tray.ts**: System tray management
- **database/**: SQLite-based data layer with services for conversations, messages, models, assistants, and MCP services

### Renderer Process (`src/renderer/`)
- **Vue 3 app** with router-based navigation
- **Main routes**: Home, Chat (/:id), Settings, Assistants, Models
- **Store system**: Pinia-based state management (assistant.ts, conversation.ts, mcp.ts, model.ts, setting.ts)
- **UI**: Vuetify component library with Material Design Icons

### Configuration
- **electron.vite.config.ts**: Vite configuration for main/renderer/preload processes
- **tsconfig**.json: TypeScript configuration (web/node separate configs)
- **eslint.config.mjs**: ESLint configuration

### Key Features
- **Multi-model support**: OpenAI, Anthropic, Google Gemini, Ollama (via LangChain)
- **MCP Integration**: Full Model Context Protocol support with tool usage
- **System tray**: Background operation with global hotkey (Cmd+Shift+Space)
- **Dual Window**: Main app + floating mini input window
- **Database**: SQLite for conversation history and settings persistence