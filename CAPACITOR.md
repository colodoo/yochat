# YoChat Capacitor 构建指南

本文档介绍如何使用 Capacitor 将 YoChat 应用构建为跨平台应用（移动端和桌面端）。

## 概述

YoChat 现在支持两种构建方式：
1. **Electron** - 原有的桌面应用构建方式
2. **Capacitor** - 新的跨平台构建方式，支持 iOS、Android 和桌面端

## 环境要求

### 通用要求
- Node.js 16+
- npm 或 yarn

### Android 开发
- Android Studio
- Android SDK (API 22+)
- Java 11+

### iOS 开发
- macOS
- Xcode 12+
- iOS 13+

### 桌面端 (Electron via Capacitor)
- 支持 Windows、macOS、Linux

## 安装依赖

```bash
# 安装项目依赖
npm install --legacy-peer-deps
```

## 构建命令

### 完整构建流程
```bash
# 完整的Capacitor构建流程（推荐）
npm run cap:build:complete
```

### Android 平台
```bash
# 构建并运行Android应用
npm run cap:android

# 或者分步执行
npm run cap:build:complete
npx cap run android

# 在Android Studio中打开
npx cap open android
```

### iOS 平台
```bash
# 构建并运行iOS应用
npm run cap:ios

# 或者分步执行
npm run cap:build:complete
npx cap run ios

# 在Xcode中打开
npx cap open ios
```

### 仅构建Web资源
```bash
# 仅构建Web资源（不同步到原生平台）
npm run cap:build
```

### 桌面端 (Capacitor Electron)
```bash
# 添加 Electron 平台
npm run cap:electron

# 或者分步执行
npm run cap:build
npx cap add @capacitor-community/electron
npx cap open @capacitor-community/electron
```

## 开发模式

### 实时重载开发
```bash
# 启动开发服务器并在Android设备上实时重载
npm run cap:serve

# 手动启动（两个终端）
# 终端1：启动开发服务器
vite --config vite.config.capacitor.ts --host

# 终端2：运行Android应用并连接到开发服务器
npx cap run android --livereload --external
```

### 开发服务器配置
开发服务器会在以下地址启动：
- 本地地址：http://localhost:5173
- 网络地址：http://[你的IP]:5173

确保你的移动设备和开发机器在同一网络中。

## 自动化构建脚本

项目包含了一个自动化构建脚本 `scripts/build-capacitor.js`，它会：

1. **构建Web应用**：使用Capacitor专用的Vite配置
2. **生成index.html**：自动创建Capacitor所需的入口文件
3. **同步资源**：将Web资源复制到原生平台
4. **更新插件**：确保所有Capacitor插件正确配置

### 脚本功能
- 自动检测生成的CSS和JS文件
- 创建优化的index.html入口文件
- 包含加载动画和PWA元标签
- 处理移动端适配

### 使用方法
```bash
# 直接运行脚本
node scripts/build-capacitor.js

# 或使用npm脚本
npm run cap:build:complete
```

## 平台特性

### 移动端特性
- **状态栏控制** - 自动适配状态栏样式
- **启动屏幕** - 自定义启动画面
- **返回按钮处理** - Android 返回按钮支持
- **键盘适配** - 自动调整布局避免键盘遮挡
- **触觉反馈** - 支持震动反馈
- **分享功能** - 原生分享支持
- **浏览器打开** - 使用系统浏览器打开链接
- **Toast 通知** - 原生 Toast 消息

### 桌面端特性
- **窗口控制** - 支持多窗口管理
- **文件系统访问** - 完整的文件操作能力
- **系统集成** - 托盘、快捷键等

### Web 端特性
- **渐进式 Web 应用** - PWA 支持
- **响应式设计** - 自适应不同屏幕尺寸
- **离线缓存** - 基础离线功能

## 配置文件

### capacitor.config.ts
```typescript
import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yochat.app',
  appName: 'YoChat',
  webDir: 'out/renderer',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1976D2',
      showSpinner: true,
      spinnerColor: '#ffffff'
    }
  }
}

export default config
```

### vite.config.capacitor.ts
专门用于 Capacitor 构建的 Vite 配置文件，包含：
- 正确的输出目录设置
- 移动端优化配置
- 依赖预构建优化

## 平台适配

### API 适配层
应用使用统一的 API 适配层 (`src/renderer/src/platform/`)，自动检测运行平台并提供相应的 API 实现：

```typescript
import { api, platformFeatures } from '../platform'

// 统一的 API 调用
const conversations = await api.conversations.getAll()

// 平台特性检测
if (platformFeatures.isMobile) {
  // 移动端特有逻辑
}

if (platformFeatures.supportsWindowControls) {
  // 桌面端窗口控制
}
```

### 移动端布局
使用 `MobileLayout.vue` 组件提供移动端优化的布局：
- 安全区域适配
- 触摸优化
- 键盘适配
- 底部导航

## 调试

### Android 调试
1. 启用开发者选项和 USB 调试
2. 连接设备或启动模拟器
3. 运行 `npm run cap:serve`
4. 在 Chrome 中访问 `chrome://inspect` 进行调试

### iOS 调试
1. 连接 iOS 设备
2. 在 Xcode 中运行应用
3. 使用 Safari 的开发者工具进行调试

### 桌面端调试
1. 运行 `npm run cap:electron`
2. 使用 Electron 的开发者工具

## 发布

### Android 发布
1. 在 Android Studio 中生成签名的 APK 或 AAB
2. 上传到 Google Play Store

### iOS 发布
1. 在 Xcode 中配置证书和描述文件
2. 构建并上传到 App Store Connect

### 桌面端发布
1. 使用 Capacitor Electron 的打包功能
2. 生成对应平台的安装包

## 故障排除

### 常见问题

1. **依赖冲突**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **构建失败**
   ```bash
   # 清理缓存
   npm run clean
   npx cap clean
   npm run cap:build
   ```

3. **Android 构建问题**
   - 检查 Android SDK 路径
   - 确保 Java 版本正确
   - 清理 Android 项目缓存

4. **iOS 构建问题**
   - 检查 Xcode 版本
   - 更新 iOS 部署目标
   - 清理 iOS 项目缓存

### 日志查看
```bash
# Capacitor 日志
npx cap doctor

# 平台特定日志
npx cap run android --verbose
npx cap run ios --verbose
```

## 性能优化

### 移动端优化
- 启用代码分割
- 优化图片资源
- 减少包体积
- 使用懒加载

### 内存优化
- 及时清理事件监听器
- 优化大列表渲染
- 控制并发请求数量

## 更多资源

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Capacitor 插件市场](https://capacitorjs.com/docs/plugins)
- [Vue 3 + Capacitor 指南](https://capacitorjs.com/docs/guides/vue)
- [Capacitor 社区插件](https://github.com/capacitor-community)

## 支持

如果遇到问题，请：
1. 查看本文档的故障排除部分
2. 检查 Capacitor 官方文档
3. 在项目 Issues 中搜索相关问题
4. 提交新的 Issue 并提供详细信息