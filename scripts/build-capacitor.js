#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(message) {
  console.log(`[Capacitor Build] ${message}`);
}

function executeCommand(command, description) {
  log(description);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    log(`✓ ${description} completed successfully`);
  } catch (error) {
    log(`✗ ${description} failed`);
    process.exit(1);
  }
}

function createIndexHtml() {
  const outDir = path.join(process.cwd(), 'out', 'renderer');
  const indexPath = path.join(outDir, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    log('Creating index.html for Capacitor...');
    
    // 查找生成的CSS和JS文件
    const assetsDir = path.join(outDir, 'assets');
    let cssFile = '';
    let jsFile = '';
    
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      cssFile = files.find(f => f.startsWith('index-capacitor-') && f.endsWith('.css')) || '';
      jsFile = files.find(f => f.startsWith('index-capacitor-') && f.endsWith('.js')) || '';
    }
    
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YoChat</title>
    
    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#1976D2">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="YoChat">
    
    <!-- 移动端适配 -->
    <meta name="format-detection" content="telephone=no">
    <meta name="msapplication-tap-highlight" content="no">
    
    ${cssFile ? `<link rel="stylesheet" href="./assets/${cssFile}">` : ''}
    
    <style>
      .loading-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #1976D2;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      }
      
      .loading-spinner {
        width: 50px;
        height: 50px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top: 3px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .loading-text {
        color: white;
        margin-top: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
    </style>
</head>
<body>
    <div id="app"></div>
    
    <div id="loading" class="loading-container">
      <div>
        <div class="loading-spinner"></div>
        <div class="loading-text">正在加载 YoChat...</div>
      </div>
    </div>
    
    ${jsFile ? `<script type="module" src="./assets/${jsFile}"></script>` : ''}
    
    <script>
      window.addEventListener('load', function() {
        setTimeout(function() {
          const loading = document.getElementById('loading');
          if (loading) {
            loading.style.opacity = '0';
            loading.style.transition = 'opacity 0.3s ease';
            setTimeout(function() {
              loading.style.display = 'none';
            }, 300);
          }
        }, 1000);
      });
    </script>
</body>
</html>`;
    
    fs.writeFileSync(indexPath, htmlContent);
    log('✓ index.html created successfully');
  }
}

function main() {
  log('Starting Capacitor build process...');
  
  // 1. 构建Web应用
  executeCommand('npm run cap:build', 'Building web application');
  
  // 2. 创建index.html
  createIndexHtml();
  
  // 3. 同步到Capacitor
  executeCommand('npx cap sync', 'Syncing to Capacitor');
  
  log('Capacitor build process completed successfully!');
  log('You can now run:');
  log('  - npx cap run android (for Android)');
  log('  - npx cap run ios (for iOS)');
  log('  - npx cap open android (to open in Android Studio)');
  log('  - npx cap open ios (to open in Xcode)');
}

if (require.main === module) {
  main();
}

module.exports = { main, createIndexHtml };