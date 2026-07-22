const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Storage paths
const userDataPath = app.getPath('userData');
const storagePath = path.join(userDataPath, 'data.enc');
const settingsPath = path.join(userDataPath, 'settings.enc');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  });

  mainWindow.loadFile('src/index.html');
}

// Encryption helpers using electron's safeStorage (OS keychain)
function encrypt(data) {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: simple encryption with app-specific key
    const key = crypto.scryptSync('localchat-fallback', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('hex'), data: encrypted, tag: authTag.toString('hex') });
  }
  return safeStorage.encryptString(JSON.stringify(data)).toString('base64');
}

function decrypt(encryptedData) {
  if (!encryptedData) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      const parsed = JSON.parse(encryptedData);
      const key = crypto.scryptSync('localchat-fallback', 'salt', 32);
      const iv = Buffer.from(parsed.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    }
    return JSON.parse(safeStorage.decryptString(Buffer.from(encryptedData, 'base64')));
  } catch (e) {
    console.error('Decryption failed:', e);
    return null;
  }
}

// IPC handlers for storage
ipcMain.handle('storage:load', async () => {
  try {
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf8');
      return decrypt(data);
    }
    return { conversations: [], archive: [] };
  } catch (e) {
    return { conversations: [], archive: [] };
  }
});

ipcMain.handle('storage:save', async (event, data) => {
  try {
    const encrypted = encrypt(data);
    fs.writeFileSync(storagePath, encrypted);
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
});

ipcMain.handle('storage:wipe', async () => {
  try {
    if (fs.existsSync(storagePath)) {
      // Overwrite with random data before deleting
      const size = fs.statSync(storagePath).size;
      fs.writeFileSync(storagePath, crypto.randomBytes(size));
      fs.unlinkSync(storagePath);
    }
    if (fs.existsSync(settingsPath)) {
      const size = fs.statSync(settingsPath).size;
      fs.writeFileSync(settingsPath, crypto.randomBytes(size));
      fs.unlinkSync(settingsPath);
    }
    return true;
  } catch (e) {
    console.error('Wipe failed:', e);
    return false;
  }
});

ipcMain.handle('settings:load', async () => {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return decrypt(data);
    }
    return { providers: [], activeProvider: null };
  } catch (e) {
    return { providers: [], activeProvider: null };
  }
});

ipcMain.handle('settings:save', async (event, settings) => {
  try {
    const encrypted = encrypt(settings);
    fs.writeFileSync(settingsPath, encrypted);
    return true;
  } catch (e) {
    console.error('Settings save failed:', e);
    return false;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
