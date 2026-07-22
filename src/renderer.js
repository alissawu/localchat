// State
let state = {
  messages: [],
  archive: [],
  selectedMessages: new Set(),
};

let settings = {
  providers: [],
  activeProvider: null,
  autoArchive: true,
};

// Provider configurations
const providerConfigs = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    transformRequest: (messages, model) => ({
      model,
      max_tokens: 4096,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    }),
    transformResponse: (data) => data.content[0].text,
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-sonnet-4',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  ollama: {
    endpoint: 'http://localhost:11434/api/chat',
    defaultModel: 'llama3.3',
    authHeader: () => ({}),
    transformRequest: (messages, model) => ({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
    }),
    transformResponse: (data) => data.message.content,
  },
  custom: {
    endpoint: '',
    defaultModel: '',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
};

// DOM elements
const elements = {
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  providerSelect: document.getElementById('providerSelect'),
  contextList: document.getElementById('contextList'),
  tokenCount: document.getElementById('tokenCount'),
  messageCount: document.getElementById('messageCount'),
  summarizeAll: document.getElementById('summarizeAll'),
  summarizeSelected: document.getElementById('summarizeSelected'),
  settingsBtn: document.getElementById('settingsBtn'),
  wipeBtn: document.getElementById('wipeBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  emptyState: document.getElementById('emptyState'),
  // Modals
  settingsModal: document.getElementById('settingsModal'),
  summarizeModal: document.getElementById('summarizeModal'),
  wipeModal: document.getElementById('wipeModal'),
};

// Initialize
async function init() {
  const savedData = await window.api.loadData();
  if (savedData) {
    state.messages = savedData.conversations || [];
    state.archive = savedData.archive || [];
  }

  const savedSettings = await window.api.loadSettings();
  if (savedSettings) {
    settings = { ...settings, ...savedSettings };
  }

  renderProviderSelect();
  renderMessages();
  renderContextList();
  updateStats();
  setupEventListeners();
}

// Event listeners
function setupEventListeners() {
  // Send message
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  elements.messageInput.addEventListener('input', () => {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
  });

  // Provider selection
  elements.providerSelect.addEventListener('change', (e) => {
    settings.activeProvider = e.target.value || null;
    saveSettings();
  });

  // Summarize buttons
  elements.summarizeAll.addEventListener('click', () => summarizeMessages('all'));
  elements.summarizeSelected.addEventListener('click', () => summarizeMessages('selected'));

  // New chat
  elements.newChatBtn.addEventListener('click', () => {
    if (state.messages.length > 0 && confirm('Start a new conversation? Current messages will be cleared.')) {
      state.messages = [];
      state.selectedMessages.clear();
      renderMessages();
      renderContextList();
      updateStats();
      saveData();
    }
  });

  // Settings modal
  elements.settingsBtn.addEventListener('click', () => openModal('settingsModal'));
  document.getElementById('closeSettings').addEventListener('click', () => closeModal('settingsModal'));
  document.getElementById('addProviderBtn').addEventListener('click', showProviderForm);
  document.getElementById('cancelProvider').addEventListener('click', hideProviderForm);
  document.getElementById('saveProvider').addEventListener('click', saveProvider);

  // Wipe modal
  elements.wipeBtn.addEventListener('click', () => openModal('wipeModal'));
  document.getElementById('cancelWipe').addEventListener('click', () => closeModal('wipeModal'));
  document.getElementById('confirmWipe').addEventListener('click', wipeAll);

  // Summarize modal
  document.getElementById('closeSummarize').addEventListener('click', () => closeModal('summarizeModal'));
  document.getElementById('cancelSummarize').addEventListener('click', () => closeModal('summarizeModal'));
  document.getElementById('applySummary').addEventListener('click', applySummary);

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

// API calls
async function sendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content || !settings.activeProvider) return;

  const provider = settings.providers.find(p => p.id === settings.activeProvider);
  if (!provider) {
    alert('Please configure a provider in settings');
    return;
  }

  // Add user message
  const userMsg = { id: Date.now(), role: 'user', content, tokens: estimateTokens(content) };
  state.messages.push(userMsg);
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  renderMessages();
  renderContextList();
  updateStats();

  // Prepare API call
  const config = providerConfigs[provider.type] || providerConfigs.custom;
  const endpoint = provider.endpoint || config.endpoint;
  const model = provider.model || config.defaultModel;

  const messagesToSend = state.messages
    .filter(m => !m.archived)
    .map(m => ({ role: m.role, content: m.content }));

  try {
    const requestBody = config.transformRequest 
      ? config.transformRequest(messagesToSend, model)
      : {
          model,
          messages: messagesToSend,
          max_tokens: 4096,
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.authHeader(provider.key),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const assistantContent = config.transformResponse 
      ? config.transformResponse(data)
      : data.choices[0].message.content;

    const assistantMsg = {
      id: Date.now(),
      role: 'assistant',
      content: assistantContent,
      tokens: estimateTokens(assistantContent),
    };
    state.messages.push(assistantMsg);
    renderMessages();
    renderContextList();
    updateStats();
    saveData();

  } catch (error) {
    console.error('API error:', error);
    alert(`Error: ${error.message}`);
    // Remove the user message on error
    state.messages.pop();
    renderMessages();
    renderContextList();
    updateStats();
  }
}

// Summarization
let pendingSummarization = null;

async function summarizeMessages(mode) {
  const provider = settings.providers.find(p => p.id === settings.activeProvider);
  if (!provider) {
    alert('Please select a provider first');
    return;
  }

  let messagesToSummarize;
  if (mode === 'all') {
    messagesToSummarize = state.messages.filter(m => !m.isSummary && !m.archived);
  } else {
    messagesToSummarize = state.messages.filter(m => state.selectedMessages.has(m.id));
  }

  if (messagesToSummarize.length < 2) {
    alert('Need at least 2 messages to summarize');
    return;
  }

  // Generate summary using the API
  const config = providerConfigs[provider.type] || providerConfigs.custom;
  const endpoint = provider.endpoint || config.endpoint;
  const model = provider.model || config.defaultModel;

  const summaryPrompt = [
    { role: 'user', content: `Summarize the following conversation concisely, preserving key facts, decisions, and context that would be needed to continue the discussion:\n\n${messagesToSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')}` }
  ];

  try {
    const requestBody = config.transformRequest 
      ? config.transformRequest(summaryPrompt, model)
      : { model, messages: summaryPrompt, max_tokens: 1024 };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.authHeader(provider.key),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error('Failed to generate summary');

    const data = await response.json();
    const summaryText = config.transformResponse 
      ? config.transformResponse(data)
      : data.choices[0].message.content;

    // Show modal for review
    pendingSummarization = {
      mode,
      messagesToSummarize,
      summaryText,
    };

    document.getElementById('summaryText').value = summaryText;
    document.getElementById('keepOriginals').checked = settings.autoArchive;
    openModal('summarizeModal');

  } catch (error) {
    console.error('Summarization error:', error);
    alert(`Summarization failed: ${error.message}`);
  }
}

function applySummary() {
  if (!pendingSummarization) return;

  const { messagesToSummarize } = pendingSummarization;
  const summaryText = document.getElementById('summaryText').value;
  const keepOriginals = document.getElementById('keepOriginals').checked;

  const messageIds = new Set(messagesToSummarize.map(m => m.id));

  if (keepOriginals) {
    // Archive the messages
    messagesToSummarize.forEach(m => {
      state.archive.push({ ...m, archivedAt: Date.now() });
    });
  }

  // Remove old messages and insert summary
  const firstIdx = state.messages.findIndex(m => messageIds.has(m.id));
  state.messages = state.messages.filter(m => !messageIds.has(m.id));

  const summaryMsg = {
    id: Date.now(),
    role: 'system',
    content: summaryText,
    tokens: estimateTokens(summaryText),
    isSummary: true,
    summarizedCount: messagesToSummarize.length,
  };

  state.messages.splice(firstIdx, 0, summaryMsg);
  state.selectedMessages.clear();

  renderMessages();
  renderContextList();
  updateStats();
  saveData();
  closeModal('summarizeModal');
  pendingSummarization = null;
}

// Rendering
function renderMessages() {
  if (state.messages.length === 0) {
    elements.emptyState.style.display = 'flex';
    elements.messages.innerHTML = '';
    elements.messages.appendChild(elements.emptyState);
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.messages.innerHTML = state.messages.map(msg => `
    <div class="message ${msg.role} ${msg.isSummary ? 'summary' : ''}" data-id="${msg.id}">
      <input type="checkbox" class="message-select" ${state.selectedMessages.has(msg.id) ? 'checked' : ''}>
      <div class="content">${escapeHtml(msg.content)}</div>
      <div class="actions">
        <button class="delete-msg" title="Delete">×</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  elements.messages.querySelectorAll('.message-select').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.closest('.message').dataset.id);
      if (e.target.checked) {
        state.selectedMessages.add(id);
      } else {
        state.selectedMessages.delete(id);
      }
      elements.summarizeSelected.disabled = state.selectedMessages.size < 2;
    });
  });

  elements.messages.querySelectorAll('.delete-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.closest('.message').dataset.id);
      deleteMessage(id);
    });
  });

  // Scroll to bottom
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderContextList() {
  elements.contextList.innerHTML = state.messages.map(msg => `
    <div class="context-item ${msg.isSummary ? 'summary' : ''} ${state.selectedMessages.has(msg.id) ? 'selected' : ''}" data-id="${msg.id}">
      <span class="preview">${msg.isSummary ? '📝 ' : ''}${msg.role}: ${truncate(msg.content, 30)}</span>
      <span class="tokens">${msg.tokens}t</span>
    </div>
  `).join('');

  elements.contextList.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const msgEl = elements.messages.querySelector(`[data-id="${id}"]`);
      if (msgEl) msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function renderProviderSelect() {
  elements.providerSelect.innerHTML = '<option value="">Select provider...</option>' +
    settings.providers.map(p => 
      `<option value="${p.id}" ${p.id === settings.activeProvider ? 'selected' : ''}>${p.name}</option>`
    ).join('');
}

function renderProvidersList() {
  const list = document.getElementById('providersList');
  list.innerHTML = settings.providers.map(p => `
    <div class="provider-item" data-id="${p.id}">
      <div>
        <div class="name">${p.name}</div>
        <div class="type">${p.type} · ${p.model || 'default model'}</div>
      </div>
      <button class="btn-icon delete-provider">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-provider').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.provider-item').dataset.id;
      settings.providers = settings.providers.filter(p => p.id !== id);
      if (settings.activeProvider === id) settings.activeProvider = null;
      renderProvidersList();
      renderProviderSelect();
      saveSettings();
    });
  });
}

// Provider management
function showProviderForm() {
  document.getElementById('providerForm').style.display = 'flex';
  document.getElementById('addProviderBtn').style.display = 'none';
}

function hideProviderForm() {
  document.getElementById('providerForm').style.display = 'none';
  document.getElementById('addProviderBtn').style.display = 'block';
  // Clear form
  document.getElementById('providerName').value = '';
  document.getElementById('providerKey').value = '';
  document.getElementById('providerEndpoint').value = '';
  document.getElementById('providerModel').value = '';
}

function saveProvider() {
  const type = document.getElementById('providerType').value;
  const name = document.getElementById('providerName').value || type;
  const key = document.getElementById('providerKey').value;
  const endpoint = document.getElementById('providerEndpoint').value;
  const model = document.getElementById('providerModel').value;

  if (!key && type !== 'ollama') {
    alert('API key is required');
    return;
  }

  const provider = {
    id: Date.now().toString(),
    type,
    name,
    key,
    endpoint: endpoint || null,
    model: model || null,
  };

  settings.providers.push(provider);
  renderProvidersList();
  renderProviderSelect();
  hideProviderForm();
  saveSettings();
}

// Utilities
function deleteMessage(id) {
  state.messages = state.messages.filter(m => m.id !== id);
  state.selectedMessages.delete(id);
  renderMessages();
  renderContextList();
  updateStats();
  saveData();
}

function updateStats() {
  const totalTokens = state.messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  elements.tokenCount.textContent = `${totalTokens.toLocaleString()} tokens`;
  elements.messageCount.textContent = `${state.messages.length} messages`;
}

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// Modal helpers
function openModal(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'settingsModal') renderProvidersList();
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Data persistence
async function saveData() {
  await window.api.saveData({
    conversations: state.messages,
    archive: state.archive,
  });
}

async function saveSettings() {
  await window.api.saveSettings(settings);
}

async function wipeAll() {
  await window.api.wipeAll();
  state = { messages: [], archive: [], selectedMessages: new Set() };
  settings = { providers: [], activeProvider: null, autoArchive: true };
  renderMessages();
  renderContextList();
  renderProviderSelect();
  updateStats();
  closeModal('wipeModal');
  alert('All data wiped');
}

// Start
init();
