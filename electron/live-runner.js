/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const cp = require('child_process');
const chokidar = require('chokidar');
const electron = require('electron');
const fs = require('fs-extra');
const path = require('path');

let child = null;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
  restarting: false,
};

// Copy web app files to electron app directory
function copyWebApp() {
  return new Promise((resolve, reject) => {
    try {
      const sourceDir = path.join('..', 'out', 'renderer');
      const targetDir = path.join('.', 'app');
      
      // Ensure target directory exists
      fs.ensureDirSync(targetDir);
      
      // Copy files
      fs.copySync(sourceDir, targetDir, { overwrite: true });
      console.log('Web app files copied to electron/app directory');
      resolve();
    } catch (error) {
      console.error('Error copying web app files:', error);
      reject(error);
    }
  });
}

///*
function runBuild() {
  return new Promise(async (resolve, _reject) => {
    let tempChild = cp.spawn(npmCmd, ['run', 'build'], { shell: true });
    tempChild.once('exit', async () => {
      // Copy web app files after build
      await copyWebApp();
      resolve();
    });
    tempChild.stdout.pipe(process.stdout);
  });
}
//*/

async function spawnElectron() {
  if (child !== null) {
    child.stdin.pause();
    child.kill();
    child = null;
    await runBuild();
  }
  child = cp.spawn(electron, ['--inspect=5858', './'], { shell: true });
  child.on('exit', () => {
    if (!reloadWatcher.restarting) {
      process.exit(0);
    }
  });
  child.stdout.pipe(process.stdout);
}

function setupReloadWatcher() {
  reloadWatcher.watcher = chokidar
    .watch('./src/**/*', {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          console.log('Restarting');
          reloadWatcher.restarting = true;
          await spawnElectron();
          reloadWatcher.restarting = false;
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher();
        }, 500);
      }
    });
}

(async () => {
  // Ensure web app files are copied on startup
  await copyWebApp();
  await runBuild();
  await spawnElectron();
  setupReloadWatcher();
})();
