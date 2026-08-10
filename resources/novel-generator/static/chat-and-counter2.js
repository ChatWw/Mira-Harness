// enhanced-chat-v2.js

// 首先创建全局样式
const globalStyles = document.createElement('style');
globalStyles.textContent = `
    /* 聊天助手核心样式 */
    #enhanced-chat-sidebar {
        position: fixed;
        left: -360px;
        top: 10vh; /* 上下各留10%的空间 */
        height: 80vh;
        width: 360px;
        background: white;
        box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 0 8px 8px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
    }

    /* 智能触发区 */
    .smart-trigger {
        position: fixed;
        left: 0;
        top: 0;
        height: 100vh;
        pointer-events: none;
        z-index: 998;
    }

    .smart-trigger-inner {
        position: absolute;
        left: 0;
        top: 10vh;
        height: 80vh;
        width: 20px;
        background: linear-gradient(to right, rgba(0,0,0,0.03), transparent);
        pointer-events: all;
        transition: background 0.3s;
    }

    .smart-trigger-inner:hover {
        background: linear-gradient(to right, rgba(0,0,0,0.08), transparent);
    }

    /* 鼠标移入时显示侧边栏 */
    #enhanced-chat-sidebar.visible,
    .smart-trigger-inner:hover + #enhanced-chat-sidebar,
    #enhanced-chat-sidebar:hover {
        left: 0;
    }

    .chat-sidebar-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px;
        background: linear-gradient(135deg, #ffffff, #fafafa);
    }

    .chat-header {
        padding-bottom: 15px;
        border-bottom: 2px solid #f0f0f0;
        margin-bottom: 15px;
    }

    .chat-header h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 1.5em;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .chat-header .minimize-btn {
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        transition: background 0.3s;
    }

    .chat-header .minimize-btn:hover {
        background: rgba(0,0,0,0.1);
    }

    .chat-settings {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .preset-prompts select {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        color: #333;
        background: #fff;
        cursor: pointer;
        transition: border-color 0.3s;
    }

    .preset-prompts select:hover {
        border-color: #4CAF50;
    }

    .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 15px 5px;
        margin: 10px 0;
        scrollbar-width: thin;
        scrollbar-color: #4CAF50 #f0f0f0;
    }

    .chat-messages::-webkit-scrollbar {
        width: 6px;
    }

    .chat-messages::-webkit-scrollbar-track {
        background: #f0f0f0;
        border-radius: 3px;
    }

    .chat-messages::-webkit-scrollbar-thumb {
        background: #4CAF50;
        border-radius: 3px;
    }

    .message {
        margin-bottom: 12px;
        padding: 12px 15px;
        border-radius: 12px;
        max-width: 85%;
        word-wrap: break-word;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        animation: messageAppear 0.3s ease-out;
        font-size: 14px;
        line-height: 1.6;
    }

    @keyframes messageAppear {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .user-message {
        background: #e3f2fd;
        margin-left: auto;
        color: #1565c0;
    }

    .assistant-message {
        background: #f5f5f5;
        margin-right: auto;
        color: #333;
    }

    .system-message {
        background: #fff3e0;
        margin: 10px auto;
        color: #e65100;
        width: 90%;
        text-align: center;
    }

    /* 按钮样式 */
    .button-group {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        padding: 5px;
        background: rgba(255,255,255,0.9);
        border-radius: 8px;
    }

    .button-group button {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.3s ease;
        background: #4CAF50;
        color: white;
        text-shadow: 0 1px 1px rgba(0,0,0,0.1);
    }

    .button-group button:hover {
        background: #45a049;
        transform: translateY(-1px);
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .button-group button:active {
        transform: translateY(0);
        box-shadow: none;
    }

    /* 文本计数器样式 */
    .text-container {
        position: relative;
        width: 100%;
        margin-bottom: 10px;
    }

    .word-count-bubble {
        position: absolute;
        right: 8px;
        top: 8px;
        background: #4CAF50;
        color: white;
        padding: 3px 10px;
        border-radius: 15px;
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        min-width: 30px;
        text-align: center;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0.9;
    }

    .word-count-bubble.warning {
        background: #ff9800;
    }

    .word-count-bubble.danger {
        background: #f44336;
    }

    .word-count-bubble.pulse {
        animation: pulse 0.3s ease-out;
    }

    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
    }

    /* 智能提示 */
    .smart-tip {
        position: fixed;
        left: 25px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
    }

    .smart-trigger-inner:hover + .smart-tip {
        opacity: 1;
    }

    /* 输入区域样式 */
    textarea, .text-area {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        transition: border-color 0.3s, box-shadow 0.3s;
        font-family: inherit;
    }

    textarea:focus, .text-area:focus {
        outline: none;
        border-color: #4CAF50;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
    }

    .system-prompt textarea {
        min-height: 80px;
    }

    #chat-input {
        min-height: 60px;
    }

    /* 加载动画 */
    .loading-dots {
        display: inline-block;
    }

    .loading-dots::after {
        content: '';
        animation: loading 1.2s infinite;
    }

    @keyframes loading {
        0% { content: ''; }
        25% { content: '.'; }
        50% { content: '..'; }
        75% { content: '...'; }
    }

    /* 响应式设计 */
    @media (max-width: 768px) {
        #enhanced-chat-sidebar {
            width: 300px;
        }
    }
`;

document.head.appendChild(globalStyles);
// 字数统计器类
class WordCounter {
    constructor() {
        this.counters = new WeakMap(); // 存储计数器刷新间隔
        this.init();
    }

    init() {
        this.initializeExisting();
        this.observeNewElements();
    }

    initializeExisting() {
        const textAreas = document.querySelectorAll('textarea, .text-area');
        textAreas.forEach(this.addWordCounter.bind(this));
    }

    addWordCounter(element) {
        // 防止重复添加
        if (element.parentElement?.classList.contains('text-container')) {
            return;
        }

        // 保存原始样式
        const originalStyles = window.getComputedStyle(element);
        const width = originalStyles.width;
        const margin = originalStyles.margin;
        const position = originalStyles.position;

        // 创建容器
        const container = document.createElement('div');
        container.className = 'text-container';

        // 包装元素
        element.parentNode.insertBefore(container, element);
        container.appendChild(element);

        // 恢复原始样式
        container.style.width = width;
        container.style.margin = margin;
        if (position === 'absolute' || position === 'fixed') {
            container.style.position = position;
            container.style.top = originalStyles.top;
            container.style.left = originalStyles.left;
        }

        // 创建计数气泡
        const bubble = document.createElement('div');
        bubble.className = 'word-count-bubble';
        container.appendChild(bubble);

        // 初始更新
        this.updateWordCount(element, bubble);
        
        // 设置定时刷新（每20秒）
        const intervalId = setInterval(() => {
            this.updateWordCount(element, bubble);
        }, 20000);
        
        // 存储定时器ID
        this.counters.set(element, intervalId);

        // 实时输入监听
        element.addEventListener('input', () => {
            this.updateWordCount(element, bubble);
        });

        // 元素移除时清理
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (!document.contains(element)) {
                    clearInterval(this.counters.get(element));
                    this.counters.delete(element);
                    observer.disconnect();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    updateWordCount(element, bubble) {
        const count = element.value.length;
        const oldContent = bubble.textContent;
        bubble.textContent = count;

        // 更新样式
        bubble.classList.remove('warning', 'danger');
        if (count > 1000) {
            bubble.classList.add('danger');
        } else if (count > 500) {
            bubble.classList.add('warning');
        }

        // 数值变化动画
        if (oldContent !== bubble.textContent) {
            bubble.classList.remove('pulse');
            void bubble.offsetWidth; // 重置动画
            bubble.classList.add('pulse');
        }
    }

    observeNewElements() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // 元素节点
                        if (node.matches('textarea, .text-area')) {
                            this.addWordCounter(node);
                        }
                        const textAreas = node.querySelectorAll('textarea, .text-area');
                        textAreas.forEach(this.addWordCounter.bind(this));
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// 智能鼠标跟踪器类
class MouseTracker {
    constructor(callback) {
        this.callback = callback;
        this.lastX = 0;
        this.lastY = 0;
        this.threshold = 20;
        this.init();
    }

    init() {
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    }

    handleMouseMove(e) {
        const deltaX = Math.abs(e.clientX - this.lastX);
        const deltaY = Math.abs(e.clientY - this.lastY);
        
        if (deltaX > this.threshold || deltaY > this.threshold) {
            this.callback(e.clientX, e.clientY);
        }

        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }
}

// 聊天助手类
class ChatAssistant {
    constructor(options = {}) {
        this.maxMemory = options.maxMemory || 10;
        this.conversation = [];
        this.systemPrompt = options.systemPrompt || '你是一个有用的AI助手';
        this.presetPrompts = [
            {
                name: '通用对话',
                prompt: '你是一个有用的AI助手，可以帮助用户解决各种问题。'
            },
            {
                name: '代码辅助',
                prompt: '你是一个专业的编程助手，擅长编写、优化和调试代码。'
            },
            {
                name: '文学创作',
                prompt: '你是一个富有创造力的文学助手，可以帮助用户进行写作和创作。'
            },
            {
                name: '数据分析',
                prompt: '你是一个数据分析专家，擅长处理和分析各类数据问题。'
            }
        ];
        
        this.init();
        this.wordCounter = new WordCounter();
        this.setupMouseTracking();
    }

    init() {
        this.createChatInterface();
        this.bindEvents();
        this.setupAutoSave();
        this.loadFromLocalStorage();
    }

    setupMouseTracking() {
        this.mouseTracker = new MouseTracker((x, y) => {
            const sidebar = document.getElementById('enhanced-chat-sidebar');
            const trigger = document.querySelector('.smart-trigger-inner');
            
            // 只在鼠标靠近左侧时才显示触发区
            if (x < 50) {
                trigger.style.opacity = '1';
            } else {
                trigger.style.opacity = '0';
            }
        });
    }

    createChatInterface() {
        // 创建智能触发区
        const trigger = document.createElement('div');
        trigger.className = 'smart-trigger';
        trigger.innerHTML = `
            <div class="smart-trigger-inner"></div>
            <div class="smart-tip">移入打开AI助手</div>
        `;
        document.body.appendChild(trigger);

        // 创建主界面
        const sidebar = document.createElement('div');
        sidebar.id = 'enhanced-chat-sidebar';
        sidebar.innerHTML = `
            <div class="chat-sidebar-content">
                <div class="chat-header">
                    <h3>
                        AI对话助手
                        <span class="minimize-btn" title="最小化">⟨</span>
                    </h3>
                    <div class="chat-settings">
                        <div class="preset-prompts">
                            <label>预设提示词:</label>
                            <select id="preset-prompt-select">
                                <option value="">选择预设模式...</option>
                                ${this.presetPrompts.map(p => 
                                    `<option value="${p.prompt}">${p.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="system-prompt">
                            <label>系统提示词:</label>
                            <textarea id="system-prompt">${this.systemPrompt}</textarea>
                        </div>
                    </div>
                </div>

                <div class="chat-messages" id="chat-messages"></div>

                <div class="chat-input-area">
                    <textarea id="chat-input" 
                              placeholder="输入消息，按 Enter 发送，Shift + Enter 换行..." 
                              rows="3"></textarea>
                    <div class="button-group">
                        <button id="send-btn">发送</button>
                        <button id="export-btn">导出</button>
                        <button id="clear-btn">清空</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(sidebar);
    }
bindEvents() {
        // 最小化按钮事件
        document.querySelector('.minimize-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const sidebar = document.getElementById('enhanced-chat-sidebar');
            sidebar.classList.remove('visible');
            sidebar.style.left = '-360px';
        });

        // 发送消息
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        
        // 输入框事件
        const chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 自动调整输入框高度
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // 其他按钮事件
        document.getElementById('clear-btn').addEventListener('click', () => this.clearConversation());
        document.getElementById('export-btn').addEventListener('click', () => this.exportConversation());
        
        // 预设提示词选择
        document.getElementById('preset-prompt-select').addEventListener('change', (e) => {
            if (e.target.value) {
                const systemPromptArea = document.getElementById('system-prompt');
                systemPromptArea.value = e.target.value;
                this.systemPrompt = e.target.value;
                
                // 添加选择反馈动画
                systemPromptArea.style.transition = 'background-color 0.3s';
                systemPromptArea.style.backgroundColor = '#f0fff0';
                setTimeout(() => {
                    systemPromptArea.style.backgroundColor = '';
                }, 500);

                // 保存更改
                this.saveToLocalStorage();
            }
        });

        // 系统提示词更改
        document.getElementById('system-prompt').addEventListener('change', (e) => {
            this.systemPrompt = e.target.value;
            this.saveToLocalStorage();
        });

        // 添加拖拽调整大小功能
        this.setupResizable();
    }

    setupResizable() {
        const sidebar = document.getElementById('enhanced-chat-sidebar');
        const resizer = document.createElement('div');
        resizer.className = 'chat-resizer';
        resizer.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            width: 5px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
        `;
        
        sidebar.appendChild(resizer);

        let startX, startWidth;
        
        const startResize = (e) => {
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        };

        const resize = (e) => {
            const width = startWidth + (e.clientX - startX);
            if (width >= 300 && width <= 600) {
                sidebar.style.width = `${width}px`;
            }
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        };

        resizer.addEventListener('mousedown', startResize);
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

        this.addMessageToChat('user', message);
        input.value = '';
        input.style.height = 'auto';

        try {
            await this.processMessage(message);
        } catch (error) {
            this.addMessageToChat('system', `发送失败: ${error.message}`);
            console.error('发送消息失败:', error);
        }
    }

    async processMessage(message) {
        try {
            const response = await fetch('gen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: this.buildPromptWithContext(message)
                })
            });

            if (!response.ok) {
                throw new Error(`API错误: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';
            let isFirstChunk = true;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                aiResponse += chunk;

                if (isFirstChunk) {
                    this.addMessageToChat('assistant', aiResponse, true);
                    isFirstChunk = false;
                } else {
                    this.updateLastMessage('assistant', aiResponse);
                }
            }

            // 添加到对话历史
            this.conversation.push(
                { role: 'user', content: message },
                { role: 'assistant', content: aiResponse }
            );

            // 维护对话长度
            if (this.conversation.length > this.maxMemory * 2) {
                this.conversation = this.conversation.slice(-this.maxMemory * 2);
            }

            this.saveToLocalStorage();

        } catch (error) {
            throw new Error(`处理消息失败: ${error.message}`);
        }
    }

    buildPromptWithContext(newMessage) {
        let prompt = `${this.systemPrompt}\n\n历史对话:\n`;
        
        this.conversation.slice(-this.maxMemory * 2).forEach(msg => {
            prompt += `${msg.role === 'user' ? '用户' : 'AI'}：${msg.content}\n`;
        });

        prompt += `用户：${newMessage}\nAI：`;
        return prompt;
    }

    addMessageToChat(role, content, isStreaming = false) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${role}-message`);
        
        if (role === 'assistant' && isStreaming) {
            messageDiv.innerHTML = this.renderMarkdown(content) + '<span class="loading-dots"></span>';
        } else {
            messageDiv.innerHTML = this.renderMarkdown(content);
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    renderMarkdown(text) {
        return text
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    }

    updateLastMessage(role, content) {
        const chatMessages = document.getElementById('chat-messages');
        let lastMessage = chatMessages.querySelector(`.${role}-message:last-child`);
        
        if (!lastMessage) {
            this.addMessageToChat(role, content);
        } else {
            lastMessage.innerHTML = this.renderMarkdown(content);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    clearConversation() {
        if (confirm('确定要清空所有对话记录吗？此操作不可恢复。')) {
            this.conversation = [];
            document.getElementById('chat-messages').innerHTML = '';
            this.saveToLocalStorage();
            
            // 显示清空提示
            this.addMessageToChat('system', '对话已清空');
        }
    }

    exportConversation() {
        const exportData = {
            systemPrompt: this.systemPrompt,
            conversation: this.conversation,
            exportTime: new Date().toISOString(),
            metadata: {
                version: '2.0.0',
                exportDate: new Date().toLocaleString()
            }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        a.href = url;
        a.download = `chat-export-${timestamp}.json`;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showToast('对话记录已导出！');
        }, 100);
    }

    showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'chat-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
            animation: fadeInUp 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOutDown 0.3s ease-in';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, duration);
    }

    setupAutoSave() {
        setInterval(() => {
            this.saveToLocalStorage();
        }, 30000); // 每30秒自动保存

        window.addEventListener('beforeunload', () => {
            this.saveToLocalStorage();
        });
    }

    saveToLocalStorage() {
        try {
            const data = {
                conversation: this.conversation,
                systemPrompt: this.systemPrompt,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('enhancedChatData', JSON.stringify(data));
        } catch (error) {
            console.error('保存数据失败:', error);
            this.showToast('自动保存失败，请检查浏览器存储空间', 5000);
        }
    }

    loadFromLocalStorage() {
        try {
            const data = JSON.parse(localStorage.getItem('enhancedChatData'));
            if (data) {
                this.conversation = data.conversation || [];
                this.systemPrompt = data.systemPrompt || this.systemPrompt;
                
                // 更新UI
                document.getElementById('system-prompt').value = this.systemPrompt;
                
                // 恢复对话历史
                this.conversation.forEach(msg => {
                    this.addMessageToChat(msg.role, msg.content);
                });
            }
        } catch (error) {
            console.error('加载保存的数据失败:', error);
            this.showToast('加载历史数据失败', 5000);
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 添加必要的动画样式
    const animationStyles = document.createElement('style');
    animationStyles.textContent = `
        @keyframes fadeInUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes fadeOutDown {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(20px); opacity: 0; }
        }

        .chat-toast {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
            box-shadow: 0 3px 6px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(animationStyles);

    // 创建聊天助手实例
    window.chatAssistant = new ChatAssistant({
        maxMemory: 10,
        systemPrompt: '你是一个有用的AI助手'
    });
});
