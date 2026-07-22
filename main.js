const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

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

// HTTP fetch helper
function httpFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...options.headers,
      },
      timeout: 30000,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpFetch(res.headers.location, options).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Web search using DuckDuckGo HTML
async function webSearch(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await httpFetch(searchUrl);
    
    if (response.status !== 200) {
      return `Search failed with status ${response.status}`;
    }
    
    // Parse results from HTML
    const html = response.data;
    const results = [];
    
    // Extract result snippets using regex (simple parsing)
    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    
    while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
      const url = match[1];
      const title = match[2].trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();
      
      if (url && title) {
        results.push({ title, url, snippet });
      }
    }
    
    // Fallback: simpler regex if the above doesn't match
    if (results.length === 0) {
      const simpleRegex = /<a class="result__url"[^>]*>([^<]+)<\/a>/g;
      const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      
      let urlMatch, snippetMatch;
      while ((urlMatch = simpleRegex.exec(html)) !== null && results.length < 8) {
        snippetMatch = snippetRegex.exec(html);
        results.push({
          url: urlMatch[1].trim(),
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        });
      }
    }
    
    if (results.length === 0) {
      return 'No results found';
    }
    
    return results.map((r, i) => 
      `[${i + 1}] ${r.title || r.url}\n${r.url}\n${r.snippet}`
    ).join('\n\n');
    
  } catch (error) {
    return `Search error: ${error.message}`;
  }
}

// Web fetch - get page content
async function webFetch(url) {
  try {
    const response = await httpFetch(url);
    
    if (response.status !== 200) {
      return `Fetch failed with status ${response.status}`;
    }
    
    let content = response.data;
    
    // Strip HTML tags and get text content
    content = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    // Truncate if too long
    if (content.length > 15000) {
      content = content.substring(0, 15000) + '\n\n[Content truncated...]';
    }
    
    return content;
    
  } catch (error) {
    return `Fetch error: ${error.message}`;
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

// Tool handlers
ipcMain.handle('tool:web-search', async (event, query) => {
  return await webSearch(query);
});

ipcMain.handle('tool:web-fetch', async (event, url) => {
  return await webFetch(url);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
