import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupIPC } from './ipc'
import { setupTray } from './tray'
import './database/index' // 初始化数据库
import { settingService } from './database/services'
import { createLogger } from './utils/logger'

// 设置控制台输出编码为UTF-8，解决中文乱码问题
process.env.ELECTRON_FORCE_STDOUT_ENCODING = 'utf8'
process.env.ELECTRON_FORCE_STDERR_ENCODING = 'utf8'

// 创建日志记录器
const appLogger = createLogger('App')

// 存储窗口实例
let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let codeRunnerWindow: BrowserWindow | null = null

// 创建主窗口
function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false, // 无边框模式
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    appLogger.info('主窗口已显示')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  
  // 窗口关闭时清除引用
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 创建迷你窗口（快捷输入窗口）
function createMiniWindow(): void {
  appLogger.info('创建迷你窗口')
  miniWindow = new BrowserWindow({
    width: 600,
    height: 100,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 加载URL或文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    appLogger.info(process.env['ELECTRON_RENDERER_URL'])
    miniWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/mini.html`)
  } else {
    miniWindow.loadFile(join(__dirname, '../renderer/mini.html'))
  }

  // 窗口关闭时清除引用
  miniWindow.on('blur', () => {
    miniWindow?.hide()
  })

  miniWindow.on('closed', () => {
    miniWindow = null
  })
}

// 创建代码运行窗口
function createCodeRunnerWindow(): void {
  appLogger.info('创建代码运行窗口')
  codeRunnerWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  codeRunnerWindow.on('ready-to-show', () => {
    codeRunnerWindow?.show()
    appLogger.info('代码运行窗口已显示')
  })

  // 窗口关闭时清除引用
  codeRunnerWindow.on('closed', () => {
    codeRunnerWindow = null
  })

  // 加载代码运行器页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    codeRunnerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/code-runner.html`)
  } else {
    codeRunnerWindow.loadFile(join(__dirname, '../renderer/code-runner.html'))
  }
}

// 设置全局快捷键
function setupGlobalShortcuts(): void {
  // 清除所有现有快捷键
  globalShortcut.unregisterAll()

  // 获取快捷键设置，如果是无效的Control+Control则使用默认值
  let toggleShortcut = settingService.getSetting('shortcut_toggle') || 'CommandOrControl+Shift+Space'
  if (toggleShortcut === 'Control+Control') {
    toggleShortcut = 'CommandOrControl+Shift+Space'
    // 更新数据库中的设置
    settingService.updateSetting('shortcut_toggle', toggleShortcut)
  }

  try {
    // 注册快捷键
    globalShortcut.register(toggleShortcut, () => {
    if (miniWindow && !miniWindow.isVisible()) {
      // 显示迷你窗口
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize
      
      miniWindow.setPosition(Math.floor(width / 2 - 300), Math.floor(height / 2 - 50))
      miniWindow.show()
      miniWindow.focus()
    } else if (miniWindow && miniWindow.isVisible()) {
      miniWindow.hide()
    } else if (!miniWindow) {
      createMiniWindow()
      setTimeout(() => {
        if (miniWindow) {
          const { screen } = require('electron')
          const primaryDisplay = screen.getPrimaryDisplay()
          const { width, height } = primaryDisplay.workAreaSize
          
          miniWindow.setPosition(Math.floor(width / 2 - 300), Math.floor(height / 2 - 50))
          miniWindow.show()
          miniWindow.focus()
        }
      }, 100)
    }
  }) 
  } catch (error) {
    appLogger.error('快捷键注册失败:', error)
  }
}

// 应用准备就绪时
app.whenReady().then(() => {
  appLogger.info('应用启动')
  // 设置应用ID
  electronApp.setAppUserModelId('com.yochat.app')

  // 开发环境下F12打开开发工具
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 设置IPC处理程序
  appLogger.info('设置IPC处理程序')
  setupIPC()

  // 初始化全局环境配置
  appLogger.info('初始化全局环境配置')
  // 异步初始化，不阻塞应用启动
  ipcMain.emit('initialize-global-env-internal')

  // 创建主窗口
  appLogger.info('创建主窗口')
  createWindow()

  // 设置全局快捷键
  appLogger.info('设置全局快捷键')
  setupGlobalShortcuts()
  
  // 设置系统托盘
  appLogger.info('设置系统托盘')
  setupTray()

  // macOS激活应用时重新创建窗口
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出应用，macOS除外
app.on('window-all-closed', () => {
  appLogger.info('所有窗口已关闭')
  if (process.platform !== 'darwin') {
    appLogger.info('应用退出')
    app.quit()
  }
})

// 设置IPC消息处理程序 - 迷你窗口控制
ipcMain.on('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
})

ipcMain.on('hide-mini-window', () => {
  if (miniWindow) {
    miniWindow.hide()
  }
})

// 代码运行窗口控制
ipcMain.on('open-code-runner', (_, data) => {
  if (!codeRunnerWindow) {
    createCodeRunnerWindow()
    // 等待窗口创建完成后发送代码
    codeRunnerWindow?.webContents.once('did-finish-load', () => {
      codeRunnerWindow?.webContents.postMessage('RUN_CODE', data)
    })
  } else {
    codeRunnerWindow.show()
    codeRunnerWindow.focus()
    codeRunnerWindow.webContents.postMessage('RUN_CODE', data)
  }
})

ipcMain.on('close-code-runner', () => {
  if (codeRunnerWindow) {
    codeRunnerWindow.close()
  }
})

ipcMain.on('code-runner-ready', () => {
  appLogger.info('代码运行窗口已准备就绪')
})

// 窗口控制相关的IPC处理
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isMaximized()) mainWindow.maximize()
})

ipcMain.on('window-unmaximize', () => {
  if (mainWindow && mainWindow.isMaximized()) mainWindow.unmaximize()
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false
})

// 打开外部链接
ipcMain.on('open-external-link', (_, url) => {
  shell.openExternal(url)
})

// 应用退出前清理
app.on('will-quit', () => {
  appLogger.info('应用即将退出，执行清理操作')
  // 注销所有快捷键
  globalShortcut.unregisterAll()
  appLogger.info('已注销所有全局快捷键')
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
