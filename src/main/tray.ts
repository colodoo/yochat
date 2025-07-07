import { app, Tray, Menu, BrowserWindow } from 'electron';
import { join } from 'path';
import icon from '../../resources/icon.png?asset';
import { createLogger } from './utils/logger';

// 创建日志记录器
const trayLogger = createLogger('Tray');

// 托盘实例
let tray: Tray | null = null;

/**
 * 设置系统托盘
 */
export function setupTray(): void {
  trayLogger.info('设置系统托盘');
  
  // 创建托盘图标
  tray = new Tray(icon);
  tray.setToolTip('YoChat');
  
  // 更新托盘菜单
  updateTrayMenu();
}

/**
 * 更新托盘菜单
 */
function updateTrayMenu(): void {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.getTitle().includes('Mini'));
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: '助手管理',
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.getTitle().includes('Mini'));
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate-to', '/assistants');
        } else {
          createMainWindow('/assistants');
        }
      }
    },
    {
      label: '模型管理',
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.getTitle().includes('Mini'));
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate-to', '/models');
        } else {
          createMainWindow('/models');
        }
      }
    },
    {
      label: '设置',
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.getTitle().includes('Mini'));
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('navigate-to', '/settings');
        } else {
          createMainWindow('/settings');
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

/**
 * 创建主窗口
 */
function createMainWindow(route: string = '/'): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });
  
  // 加载URL或文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: route.substring(1) });
  }
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}