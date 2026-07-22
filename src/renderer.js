// State
let state = {
  messages: [],
  archive: [],
  selectedMessages: new Set(),
  pendingToolCalls: [],
};

let settings = {
  providers: [],
  activeProvider: null,
  autoArchive: true,
  strictMode: true,
  systemPrompt: `You are a legal research assistant. When stating facts, case law, or precedents, cite your sources. If you're uncertain about something, say so clearly. Do not make up case names, statutes, or quotes. When you need current information, use the web_search tool. When you need to read a specific page, use the web_fetch tool.`,
};

// Tool definitions (OpenAI format)
const tools = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use this for case law, statutes, news, or any factual claims you need to verify.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read the contents of a web page. Use this to read full articles, legal documents, or case details.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch',
          },
        },
        required: ['url'],
      },
    },
  },
];

// Anthropic tool format
const anthropicTools = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this for case law, statutes, news, or any factual claims you need to verify.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and read the contents of a web page. Use this to read full articles, legal documents, or case details.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  },
];

// Provider configurations
const providerConfigs = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    supportsTools: true,
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    supportsTools: true,
    useAnthropicTools: true,
    transformRequest: (messages, model, systemPrompt, toolsEnabled) => {
      const req = {
        model,
        max_tokens: 4096,
        messages: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      };
      if (systemPrompt) req.system = systemPrompt;
      if (toolsEnabled) req.tools = anthropicTools;
      return req;
    },
    transformResponse: (data) => {
      // Handle tool use
      if (data.stop_reason === 'tool_use') {
        const toolUse = data.content.find(c => c.type === 'tool_use');
        if (toolUse) {
          return { toolCall: { name: toolUse.name, arguments: toolUse.input, id: toolUse.id } };
        }
      }
      const textContent = data.content.find(c => c.type === 'text');
      return textContent ? textContent.text : '';
    },
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    supportsTools: true,
  },
  kimi: {
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    defaultModel: 'kimi-k3',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    supportsTools: true,
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'moonshotai/kimi-k3',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` }),
    supportsTools: true,
  },
  ollama: {
    endpoint: 'http://localhost:11434/api/chat',
    defaultModel: 'llama3.3',
    authHeader: () => ({}),
    supportsTools: false,
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
    supportsTools: true,
  },
};

// DOM elements
const elements = {
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  providerSelect: document.getElementById('providerSelect'),
  reasoningEffort: document.getElementById('reasoningEffort'),
  contextList: document.getElementById('contextList'),
  tokenCount: document.getElementById('tokenCount'),
  messageCount: document.getElementById('messageCount'),
  summarizeAll: document.getElementById('summarizeAll'),
  summarizeSelected: document.getElementById('summarizeSelected'),
  settingsBtn: document.getElementById('settingsBtn'),
  wipeBtn: document.getElementById('wipeBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  emptyState: document.getElementById('emptyState'),
  toolStatus: document.getElementById('toolStatus'),
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
  elements.settingsBtn.addEventListener('click', () => {
    document.getElementById('strictMode').checked = settings.strictMode;
    document.getElementById('systemPromptText').value = settings.systemPrompt;
    openModal('settingsModal');
  });
  document.getElementById('closeSettings').addEventListener('click', () => closeModal('settingsModal'));
  document.getElementById('addProviderBtn').addEventListener('click', showProviderForm);
  document.getElementById('cancelProvider').addEventListener('click', hideProviderForm);
  document.getElementById('saveProvider').addEventListener('click', saveProvider);
  document.getElementById('strictMode').addEventListener('change', (e) => {
    settings.strictMode = e.target.checked;
    saveSettings();
  });
  document.getElementById('systemPromptText').addEventListener('change', (e) => {
    settings.systemPrompt = e.target.value;
    saveSettings();
  });

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

// Tool execution
async function executeWebSearch(query) {
  showToolStatus(`Searching: ${query}`);
  try {
    // Use DuckDuckGo HTML search (no API key needed)
    const response = await window.api.webSearch(query);
    hideToolStatus();
    return response;
  } catch (error) {
    hideToolStatus();
    return `Search failed: ${error.message}`;
  }
}

async function executeWebFetch(url) {
  showToolStatus(`Fetching: ${url}`);
  try {
    const response = await window.api.webFetch(url);
    hideToolStatus();
    return response;
  } catch (error) {
    hideToolStatus();
    return `Fetch failed: ${error.message}`;
  }
}

async function executeTool(name, args) {
  switch (name) {
    case 'web_search':
      return await executeWebSearch(args.query);
    case 'web_fetch':
      return await executeWebFetch(args.url);
    default:
      return `Unknown tool: ${name}`;
  }
}

function showToolStatus(text) {
  if (elements.toolStatus) {
    elements.toolStatus.textContent = text;
    elements.toolStatus.style.display = 'block';
  }
}

function hideToolStatus() {
  if (elements.toolStatus) {
    elements.toolStatus.style.display = 'none';
  }
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

  await getAssistantResponse(provider);
}

async function getAssistantResponse(provider, toolResults = null) {
  const config = providerConfigs[provider.type] || providerConfigs.custom;
  const endpoint = provider.endpoint || config.endpoint;
  const model = provider.model || config.defaultModel;
  const reasoningEffort = elements.reasoningEffort.value;

  let messagesToSend = state.messages
    .filter(m => !m.archived)
    .map(m => {
      if (m.toolCallId) {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });

  // Add system prompt if strict mode
  const systemPrompt = settings.strictMode ? settings.systemPrompt : null;

  try {
    let requestBody;
    
    if (config.transformRequest) {
      requestBody = config.transformRequest(messagesToSend, model, systemPrompt, settings.strictMode && config.supportsTools);
    } else {
      requestBody = {
        model,
        messages: systemPrompt 
          ? [{ role: 'system', content: systemPrompt }, ...messagesToSend]
          : messagesToSend,
        max_tokens: 4096,
      };
      
      // Add tools if supported and strict mode enabled
      if (settings.strictMode && config.supportsTools) {
        requestBody.tools = tools;
      }
    }
    
    // Add reasoning effort for supported providers
    if (reasoningEffort !== 'default') {
      const supportsReasoning = ['kimi', 'deepseek', 'openrouter'].includes(provider.type);
      const modelSupportsReasoning = model.includes('kimi') || model.includes('deepseek');
      
      if (supportsReasoning || modelSupportsReasoning) {
        requestBody.reasoning_effort = reasoningEffort;
      }
    }

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
    
    // Handle response based on provider
    let result;
    if (config.transformResponse) {
      result = config.transformResponse(data);
    } else {
      const choice = data.choices[0];
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        result = { 
          toolCall: { 
            name: toolCall.function.name, 
            arguments: JSON.parse(toolCall.function.arguments),
            id: toolCall.id,
          } 
        };
      } else {
        result = choice.message.content;
      }
    }

    // Check if we got a tool call
    if (result && typeof result === 'object' && result.toolCall) {
      const { name, arguments: args, id } = result.toolCall;
      
      // Show tool call in UI
      const toolCallMsg = {
        id: Date.now(),
        role: 'assistant',
        content: `🔧 Using ${name}: ${JSON.stringify(args)}`,
        tokens: 10,
        isToolCall: true,
      };
      state.messages.push(toolCallMsg);
      renderMessages();
      
      // Execute the tool
      const toolResult = await executeTool(name, args);
      
      // Add tool result as a message
      const toolResultMsg = {
        id: Date.now() + 1,
        role: 'tool',
        toolCallId: id,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        tokens: estimateTokens(typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)),
        isToolResult: true,
      };
      state.messages.push(toolResultMsg);
      renderMessages();
      renderContextList();
      updateStats();
      
      // Continue the conversation to get final response
      await getAssistantResponse(provider);
      return;
    }

    // Regular text response
    const assistantMsg = {
      id: Date.now(),
      role: 'assistant',
      content: result,
      tokens: estimateTokens(result),
    };
    state.messages.push(assistantMsg);
    renderMessages();
    renderContextList();
    updateStats();
    saveData();

  } catch (error) {
    console.error('API error:', error);
    alert(`Error: ${error.message}`);
    hideToolStatus();
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
    messagesToSummarize = state.messages.filter(m => !m.isSummary && !m.archived && !m.isToolCall && !m.isToolResult);
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
    { role: 'user', content: `Summarize the following conversation concisely, preserving key facts, decisions, legal points, and context that would be needed to continue the discussion:\n\n${messagesToSummarize.map(m => `${m.role}: ${m.content}`).join('\n\n')}` }
  ];

  try {
    const requestBody = config.transformRequest 
      ? config.transformRequest(summaryPrompt, model, null, false)
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
    let summaryText;
    if (config.transformResponse) {
      const result = config.transformResponse(data);
      summaryText = typeof result === 'string' ? result : result.content || '';
    } else {
      summaryText = data.choices[0].message.content;
    }

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
  elements.messages.innerHTML = state.messages.map(msg => {
    let classes = `message ${msg.role}`;
    if (msg.isSummary) classes += ' summary';
    if (msg.isToolCall) classes += ' tool-call';
    if (msg.isToolResult) classes += ' tool-result';
    
    return `
      <div class="${classes}" data-id="${msg.id}">
        <input type="checkbox" class="message-select" ${state.selectedMessages.has(msg.id) ? 'checked' : ''}>
        <div class="content">${escapeHtml(msg.content)}</div>
        <div class="actions">
          <button class="delete-msg" title="Delete">×</button>
        </div>
      </div>
    `;
  }).join('');

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
  elements.contextList.innerHTML = state.messages.map(msg => {
    let prefix = '';
    if (msg.isSummary) prefix = '📝 ';
    if (msg.isToolCall) prefix = '🔧 ';
    if (msg.isToolResult) prefix = '📄 ';
    
    return `
      <div class="context-item ${msg.isSummary ? 'summary' : ''} ${state.selectedMessages.has(msg.id) ? 'selected' : ''}" data-id="${msg.id}">
        <span class="preview">${prefix}${msg.role}: ${truncate(msg.content, 30)}</span>
        <span class="tokens">${msg.tokens}t</span>
      </div>
    `;
  }).join('');

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
  state = { messages: [], archive: [], selectedMessages: new Set(), pendingToolCalls: [] };
  settings = { 
    providers: [], 
    activeProvider: null, 
    autoArchive: true, 
    strictMode: true,
    systemPrompt: settings.systemPrompt,
  };
  renderMessages();
  renderContextList();
  renderProviderSelect();
  updateStats();
  closeModal('wipeModal');
  alert('All data wiped');
}

// Start
init();
