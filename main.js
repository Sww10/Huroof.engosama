const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Set an environment variable so server.js knows it's running inside Electron
process.env.IS_ELECTRON = 'true';

// Require the server so it starts automatically in the same Node process
const serverModule = require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Since server.js might take a second to connect Ngrok, we just load localhost immediately
  const port = process.env.PORT || 3000;
  mainWindow.loadURL(`http://localhost:${port}/home.html`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
