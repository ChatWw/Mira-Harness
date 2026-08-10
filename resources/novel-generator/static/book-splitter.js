// book-splitter-enhanced.js

class BookSplitter {
    constructor() {
        // 配置常量
        this.CONFIG = {
            MAX_FILE_SIZE: 50 * 1024 * 1024,
            STORAGE_KEY: 'bookSplitter_v1_data',
            SUPPORTED_ENCODINGS: ['UTF-8', 'GBK', 'GB2312', 'BIG5'],
            MAX_RETRIES: 3,
            RETRY_DELAY: 1000,
            Z_INDEX: {
                MODAL: 999998,
                BALL: 999999,
                STATUS: 1000000
            }
        };

        // 状态管理
        this.state = {
            totalChapters: 0,
            processedChapters: 0,
            currentOperation: null,
            isProcessing: false
        };

        this.chapters = [];
        
        // 增强的章节匹配模式
        this.splitPattern = new RegExp(
            '(?:^|\\n)(?:' + 
            '.*第[0-9一二三四五六七八九十百千万零]+[章节]\\s*[:：]?.*|' + 
            '章节[0-9]+.*|' + 
            '###第[0-9一二三四五六七八九十百千万零]+章.*###|' + 
            '.*第[0-9一二三四五六七八九十百千万零]+章.*|' + 
            '章节[一二三四五六七八九十百千万零]+.*' + 
            ')',
            'gm'
        );

        // 初始化组件
        this.createFloatingBall();
        this.createModal();
        this.bindEvents();
        this.initializeFromStorage();
    }

    createFloatingBall() {
        const ball = document.createElement('div');
        ball.id = 'book-splitter-ball';
        ball.innerHTML = '拆书';
        ball.style.cssText = `
            position: fixed;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            width: 60px;
            height: 60px;
            background: #1a73e8;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: ${this.CONFIG.Z_INDEX.BALL};
            user-select: none;
            transition: background-color 0.3s;
        `;
        document.body.appendChild(ball);
        this.makeDraggable(ball);
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'book-splitter-modal';
        modal.innerHTML = `
            <div class="splitter-content">
                <h2>拆书工具 <span class="version">v1.0</span></h2>
                <div class="progress-container" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-inner"></div>
                    </div>
                    <div class="progress-text">处理进度: 0%</div>
                    <div class="progress-status">待处理章节: 0 | 已处理: 0 | 总计: 0</div>
                </div>
                <div class="splitter-buttons">
                    <input type="file" id="book-splitter-file" accept=".txt" style="display: none">
                    <select id="book-splitter-encoding" class="encoding-select">
                        ${this.CONFIG.SUPPORTED_ENCODINGS.map(enc => 
                            `<option value="${enc}"${enc === 'UTF-8' ? ' selected' : ''}>${enc}</option>`
                        ).join('')}
                    </select>
                    <button id="book-splitter-import" class="primary-button">导入文本</button>
                    <button id="book-splitter-split" class="primary-button" disabled>开始分割</button>
                    <button id="book-splitter-analyze-all" class="primary-button" disabled>全部拆书</button>
                    <button id="book-splitter-export" class="primary-button" disabled>导出数据</button>
                    <button id="book-splitter-clear" class="warning-button">清除数据</button>
                </div>
                <div class="prompt-section">
                    <h3>拆书提示词</h3>
                    <div class="prompt-controls">
                        <button id="book-splitter-reset-prompt" class="secondary-button">重置默认提示词</button>
                        <button id="book-splitter-save-prompt" class="secondary-button">保存提示词</button>
                    </div>
                    <textarea id="book-splitter-prompt" rows="6" placeholder="输入拆书提示词...">${this.getDefaultPrompt()}</textarea>
                </div>
                <div id="book-splitter-chapters" class="chapters-containerxxx">
                    <div class="ttttt1"></div>
                </div>
                <div id="book-splitter-status" class="status-message"></div>
            </div>
        `;

        this.addStyles();
        document.body.appendChild(modal);
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #book-splitter-modal {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 20px rgba(0,0,0,0.2);
                z-index: ${this.CONFIG.Z_INDEX.MODAL};
                width: 80%;
                max-width: 1400px;
                height: 80vh;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            .splitter-content {
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }

            .version {
                font-size: 12px;
                color: #666;
                margin-left: 10px;
            }

            .progress-container {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 10px;
            }

            .progress-bar {
                width: 100%;
                height: 20px;
                background: #e9ecef;
                border-radius: 10px;
                overflow: hidden;
            }

            .progress-inner {
                width: 0%;
                height: 100%;
                background: #1a73e8;
                transition: width 0.3s ease;
            }

            .progress-text {
                text-align: center;
                margin-top: 5px;
                font-size: 14px;
                color: #495057;
            }

            .progress-status {
                text-align: center;
                margin-top: 5px;
                font-size: 12px;
                color: #6c757d;
            }

            .splitter-buttons {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }

            .encoding-select {
                padding: 8px 12px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-size: 14px;
            }

            .primary-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #1a73e8;
                color: white;
                cursor: pointer;
                transition: background 0.3s;
            }

            .primary-button:hover {
                background: #1557b0;
            }

            .primary-button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }

            .warning-button {
                background: #dc3545;
                color: white;
            }

            .warning-button:hover {
                background: #c82333;
            }

            .secondary-button {
                padding: 6px 12px;
                border: 1px solid #1a73e8;
                border-radius: 4px;
                background: white;
                color: #1a73e8;
                cursor: pointer;
                transition: all 0.3s;
            }

            .secondary-button:hover {
                background: #f8f9fa;
            }

            .prompt-section {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
            }

            .prompt-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }

            #book-splitter-prompt {
                width: 100%;
                padding: 10px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                resize: vertical;
                font-size: 14px;
                line-height: 1.5;
                min-height: 100px;
            }

            .chapters-containerxxx {
                flex: 1;
                overflow: hidden;
                background: white;
                border: 1px solid #ced4da;
                border-radius: 4px;
            }

            .ttttt1 {
                height: 100%;
                overflow-y: auto;
                padding: 10px;
            }

            .okkkkklallala {
                margin-bottom: 10px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                overflow: hidden;
            }

            .xnms66 {
                padding: 10px 15px;
                background: #f8f9fa;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .xnms66:hover {
                background: #e9ecef;
            }

            .llllx {
                font-weight: 500;
                color: #212529;
            }

            .ccccccx {
                display: none;
                padding: 15px;
                background: white;
            }

            .ccccccx.show {
                display: block;
            }

            .iiwiozj {
                width: 100%;
                min-height: 100px;
                padding: 10px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                margin-bottom: 10px;
                resize: vertical;
                font-size: 14px;
                line-height: 1.5;
            }

            .chapter-analysis {
                width: 100%;
                min-height: 100px;
                padding: 10px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                background: #f8f9fa;
                margin-top: 10px;
                font-size: 14px;
                line-height: 1.5;
                white-space: pre-wrap;
            }

            .chapter-buttons {
                display: flex;
                gap: 10px;
                margin: 10px 0;
            }

            .status-message {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 4px;
                color: white;
                display: none;
                z-index: ${this.CONFIG.Z_INDEX.STATUS};
                animation: fadeIn 0.3s ease;
            }

            .status-message.success {
                background: #28a745;
            }

            .status-message.error {
                background: #dc3545;
            }

            .status-message.info {
                background: #17a2b8;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    getDefaultPrompt() {
        return `请仔细分析本章节内容，并提供以下分析结果：

1. 章节概要：
   - 主要情节梳理
   - 时间地点背景

2. 人物分析：
   - 主要人物及其行为
   - 人物关系变化
   - 性格特征展现

3. 情节解析：
   - 关键场景描写
   - 重要对话内容
   - 情节转折点

4. 主题探讨：
   - 章节主旨
   - 与整体故事的关联
   - 伏笔或呼应

5. 写作技巧：
   - 特色描写手法
   - 叙事视角运用
   - 语言风格特点

请确保分析全面且准确，并突出重点内容。`;
    }

    async readFileWithEncoding(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    let content = e.target.result;
                    
                    if (encoding !== 'UTF-8') {
                        // 尝试转换编码
                        const decoder = new TextDecoder(encoding);
                        const encoder = new TextEncoder();
                        content = decoder.decode(encoder.encode(content));
                    }
                    
                    // 检查是否有乱码
                    if (content.includes('�')) {
                        throw new Error('文件编码可能不正确，请尝试其他编码');
                    }
                    
                    resolve(content);
                } catch (error) {
                    reject(new Error(`无法以 ${encoding} 编码读取文件: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, encoding);
        });
    }

    async tryReadFileWithEncodings(file) {
        const selectedEncoding = document.getElementById('book-splitter-encoding').value;
        let lastError = null;
        
        // 首先尝试用选定的编码
        try {
            return await this.readFileWithEncoding(file, selectedEncoding);
        } catch (error) {
            lastError = error;
            this.showStatus(`使用 ${selectedEncoding} 编码读取失败，尝试其他编码...`, 'info');



// 尝试其他编码
        for (const encoding of this.CONFIG.SUPPORTED_ENCODINGS) {
            if (encoding === selectedEncoding) continue;
            try {
                const content = await this.readFileWithEncoding(file, encoding);
                this.showStatus(`成功使用 ${encoding} 编码读取文件`, 'success');
                return content;
            } catch (error) {
                lastError = error;
                continue;
            }
        }
        
        throw lastError || new Error('所有编码尝试均失败');
    }
    }
    async splitBook(content) {
        try {
            const chaptersContainer = document.querySelector('.ttttt1');
            if (!chaptersContainer) throw new Error('找不到章节容器元素');

            chaptersContainer.innerHTML = '';
            this.chapters = [];

            // 使用正则表达式找到所有章节标题
            const matches = content.match(this.splitPattern);
            if (!matches) {
                this.showStatus('未找到任何章节', 'error');
                return;
            }

            this.state.totalChapters = matches.length;
            this.state.processedChapters = 0;
            this.updateProgress();

            // 获取每章节的内容
            for (let i = 0; i < matches.length; i++) {
                const title = matches[i].trim();
                const nextTitle = matches[i + 1];
                let chapterContent = '';

                if (nextTitle) {
                    const startIndex = content.indexOf(title) + title.length;
                    const endIndex = content.indexOf(nextTitle);
                    chapterContent = content.substring(startIndex, endIndex).trim();
                } else {
                    const startIndex = content.indexOf(title) + title.length;
                    chapterContent = content.substring(startIndex).trim();
                }

                this.chapters.push({
                    id: `chapter-${i}`,
                    title,
                    content: chapterContent,
                    analysis: '',
                    status: 'pending'
                });

                await this.createChapterElement(title, chapterContent, i);
                this.state.processedChapters++;
                this.updateProgress();
            }

            this.saveToStorage();
            this.enableButtons();
            this.showStatus(`成功分割出 ${this.chapters.length} 章`, 'success');
        } catch (error) {
            console.error('分割文本失败:', error);
            this.showStatus(`分割文本失败: ${error.message}`, 'error');
        }
    }

    createChapterElement(title, content, index) {
        return new Promise((resolve) => {
            const container = document.createElement('div');
            container.className = 'okkkkklallala';
            container.id = this.chapters[index].id;
            container.innerHTML = `
                <div class="xnms66">
                    <span class="llllx">${title}</span>
                    <span class="kkkko">${this.getStatusIcon('pending')}</span>
                </div>
                <div class="ccccccx">
                    <textarea class="iiwiozj" readonly>${content}</textarea>
                    <div class="chapter-buttons">
                        <button class="primary-button analyze-button">拆解本章</button>
                        <button class="warning-button retry-button" style="display: none;">重试</button>
                    </div>
                    <div class="chapter-analysis" style="display: none;"></div>
                </div>
            `;

            const chaptersContainer = document.querySelector('.ttttt1');
            chaptersContainer.appendChild(container);

            const header = container.querySelector('.xnms66');
            const chapterContent = container.querySelector('.ccccccx');
            const analyzeBtn = container.querySelector('.analyze-button');
            const retryBtn = container.querySelector('.retry-button');

            header.addEventListener('click', () => {
                chapterContent.classList.toggle('show');
            });

            analyzeBtn.addEventListener('click', () => this.analyzeChapter(container, index));
            retryBtn.addEventListener('click', () => this.analyzeChapter(container, index, true));

            // 添加一点延迟以实现平滑的动画效果
            setTimeout(resolve, 50);
        });
    }

    getStatusIcon(status) {
        const icons = {
            pending: '⚪',
            processing: '������',
            success: '✅',
            error: '❌'
        };
        return icons[status] || icons.pending;
    }

    updateChapterStatus(container, status) {
        const statusSpan = container.querySelector('.kkkko');
        if (statusSpan) {
            statusSpan.textContent = this.getStatusIcon(status);
        }
    }

async analyzeChapter(container, index, isRetry = false) {
    const chapterId = this.chapters[index].id;
    const analysisContent = container.querySelector('.chapter-analysis');
    const analyzeBtn = container.querySelector('.analyze-button');
    const retryBtn = container.querySelector('.retry-button');

    if (!analysisContent || !analyzeBtn || !retryBtn) {
        this.showStatus('DOM元素未找到，请刷新页面重试', 'error');
        return;
    }

    // Update UI state
    analyzeBtn.disabled = true;
    retryBtn.style.display = 'none';
    analysisContent.style.display = 'block';
    analysisContent.textContent = '正在分析...';
    this.updateChapterStatus(container, 'processing');

    // Get chapter data and prompt
    const chapter = this.chapters[index];
    const basePrompt = document.getElementById('book-splitter-prompt')?.value || this.getDefaultPrompt();

    try {
        // Construct the analysis prompt
        const prompt = `\n\n章节标题：${chapter.title}\n\n章节内容：${chapter.content} \n\n${basePrompt}`;

        // Make the API request with simplified body
        const response = await this.makeRequest('gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let analysisText = '';

        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, {stream: true});
            analysisText += chunk;
            analysisContent.textContent = analysisText;
        }

        // Update chapter data and UI
        this.chapters[index].analysis = analysisText;
        this.chapters[index].status = 'success';
        this.updateChapterStatus(container, 'success');
        this.saveToStorage();
        this.updateProgress();
        analyzeBtn.disabled = false;

    } catch (error) {
        console.error('Analysis failed:', error);
        this.chapters[index].status = 'error';
        this.updateChapterStatus(container, 'error');
        analysisContent.textContent = '分析失败';
        analyzeBtn.disabled = false;
        retryBtn.style.display = 'inline-block';
        this.showStatus('分析失败，请重试', 'error');
    }
}


    async analyzeAllChapters() {
        const unanalyzedChapters = this.chapters.filter(c => c.status !== 'success');
        if (unanalyzedChapters.length === 0) {
            this.showStatus('所有章节已分析完成', 'success');
            return;
        }

        const analyzeAllBtn = document.getElementById('book-splitter-analyze-all');
        analyzeAllBtn.disabled = true;

        for (let i = 0; i < this.chapters.length; i++) {
            if (this.chapters[i].status === 'success') continue;
            
            const container = document.getElementById(this.chapters[i].id);
            if (!container) continue;

            this.showStatus(`正在分析第 ${i + 1}/${this.chapters.length} 章`, 'info');
            await this.analyzeChapter(container, i);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 添加延迟避免请求过快
        }

        analyzeAllBtn.disabled = false;
        this.showStatus('全部分析完成', 'success');
    }

    async makeRequest(url, options, retries = 3) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.makeRequest(url, options, retries - 1);
            }
            throw error;
        }
    }

    updateProgress() {
        const progressContainer = document.querySelector('.progress-container');
        const progressInner = document.querySelector('.progress-inner');
        const progressText = document.querySelector('.progress-text');
        const progressStatus = document.querySelector('.progress-status');
        
        if (!progressContainer || !progressInner || !progressText || !progressStatus) return;

        const analyzedCount = this.chapters.filter(c => c.status === 'success').length;
        const totalChapters = this.chapters.length;
        const progress = totalChapters ? (analyzedCount / totalChapters) * 100 : 0;

        progressContainer.style.display = 'block';
        progressInner.style.width = `${progress}%`;
        progressText.textContent = `处理进度: ${Math.round(progress)}%`;
        progressStatus.textContent = `待处理章节: ${totalChapters - analyzedCount} | 已处理: ${analyzedCount} | 总计: ${totalChapters}`;
    }

    exportData() {
        try {
            const data = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                prompt: document.getElementById('book-splitter-prompt')?.value,
                chapters: this.chapters
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `book-analysis-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showStatus('数据导出成功', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showStatus('导出失败', 'error');
        }
    }

    clearData() {
        if (confirm('确定要清除所有数据吗？此操作不可恢复。')) {
            try {
                localStorage.removeItem(this.CONFIG.STORAGE_KEY);
                this.chapters = [];
                document.querySelector('.ttttt1').innerHTML = '';
                document.getElementById('book-splitter-prompt').value = this.getDefaultPrompt();
                this.state.totalChapters = 0;
                this.state.processedChapters = 0;
                this.updateProgress();
                this.disableButtons();
                this.showStatus('数据已清除', 'success');
            } catch (error) {
                console.error('Clear data failed:', error);
                this.showStatus('清除数据失败', 'error');
            }
        }
    }

    enableButtons() {
        document.getElementById('book-splitter-split').disabled = false;
        document.getElementById('book-splitter-analyze-all').disabled = false;
        document.getElementById('book-splitter-export').disabled = false;
    }

    disableButtons() {
        document.getElementById('book-splitter-split').disabled = true;
        document.getElementById('book-splitter-analyze-all').disabled = true;
        document.getElementById('book-splitter-export').disabled = true;
    }

    showStatus(message, type = 'info') {
        const status = document.getElementById('book-splitter-status');
        if (!status) return;

        status.textContent = message;
        status.className = `status-message ${type}`;
        status.style.display = 'block';

        // 3秒后自动消失
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }

    makeDraggable(element) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;

                // 限制在窗口范围内
                const maxX = window.innerWidth - element.offsetWidth;
                const maxY = window.innerHeight - element.offsetHeight;
                const x = Math.max(0, Math.min(maxX, e.clientX - element.offsetWidth / 2));
                const y = Math.max(0, Math.min(maxY, e.clientY - element.offsetHeight / 2));

                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
                element.style.right = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        element.addEventListener('dragstart', (e) => e.preventDefault());
    }

    initializeFromStorage() {
        try {
            const savedData = localStorage.getItem(this.CONFIG.STORAGE_KEY);
            if (savedData) {
                const data = JSON.parse(savedData);
                this.chapters = data.chapters || [];
                if (data.prompt) {
                    const promptElement = document.getElementById('book-splitter-prompt');
                    if (promptElement) promptElement.value = data.prompt;
                }
                this.renderSavedChapters();
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
            this.showStatus('加载保存的数据失败', 'error');
        }
    }

    async renderSavedChapters() {
        const chaptersContainer = document.querySelector('.ttttt1');
        if (!chaptersContainer) return;

        chaptersContainer.innerHTML = '';
        for (let i = 0; i < this.chapters.length; i++) {
            const chapter = this.chapters[i];
            await this.createChapterElement(chapter.title, chapter.content, i);
            
            const container = document.getElementById(chapter.id);
            if (container && chapter.analysis) {
                const analysisContent = container.querySelector('.chapter-analysis');
                if (analysisContent) {
                    analysisContent.style.display = 'block';
                    analysisContent.textContent = chapter.analysis;
                }
this.updateChapterStatus(container, chapter.status || 'pending');
            }
        }
        
        if (this.chapters.length > 0) {
            this.enableButtons();
            this.updateProgress();
        }
    }

    saveToStorage() {
        try {
            const data = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                prompt: document.getElementById('book-splitter-prompt')?.value,
                chapters: this.chapters
            };
            localStorage.setItem(this.CONFIG.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            this.showStatus('保存数据失败', 'error');
            return false;
        }
    }

    bindEvents() {
        // 悬浮球和模态框交互
        const ball = document.getElementById('book-splitter-ball');
        const modal = document.getElementById('book-splitter-modal');

        ball?.addEventListener('click', () => {
            if (modal) {
                modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
            }
        });

        // 文件导入
        document.getElementById('book-splitter-import')?.addEventListener('click', () => {
            document.getElementById('book-splitter-file')?.click();
        });

        document.getElementById('book-splitter-file')?.addEventListener('change', async (e) => {
            const file = e.target?.files?.[0];
            if (!file) return;

            if (file.size > this.CONFIG.MAX_FILE_SIZE) {
                this.showStatus(`文件大小不能超过${this.CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`, 'error');
                return;
            }

            try {
                this.showStatus('正在读取文件...', 'info');
                const content = await this.tryReadFileWithEncodings(file);
                this.showStatus('文件读取成功，正在分析章节...', 'info');
                await this.splitBook(content);
            } catch (error) {
                this.showStatus(`文件读取失败: ${error.message}`, 'error');
                console.error('File reading error:', error);
            }
        });

        // 分割和分析按钮
        document.getElementById('book-splitter-split')?.addEventListener('click', async () => {
            if (this.chapters.length === 0) {
                this.showStatus('请先导入文本文件', 'error');
                return;
            }
            await this.splitBook(this.bookContent);
        });

        document.getElementById('book-splitter-analyze-all')?.addEventListener('click', async () => {
            if (this.chapters.length === 0) {
                this.showStatus('请先导入并分割文本', 'error');
                return;
            }
            await this.analyzeAllChapters();
        });

        // 导出和清除按钮
        document.getElementById('book-splitter-export')?.addEventListener('click', () => {
            if (this.chapters.length === 0) {
                this.showStatus('没有可导出的数据', 'error');
                return;
            }
            this.exportData();
        });

        document.getElementById('book-splitter-clear')?.addEventListener('click', () => {
            this.clearData();
        });

        // 提示词相关按钮
        document.getElementById('book-splitter-reset-prompt')?.addEventListener('click', () => {
            const promptElement = document.getElementById('book-splitter-prompt');
            if (promptElement) {
                promptElement.value = this.getDefaultPrompt();
                this.saveToStorage();
                this.showStatus('提示词已重置为默认值', 'success');
            }
        });

        document.getElementById('book-splitter-save-prompt')?.addEventListener('click', () => {
            if (this.saveToStorage()) {
                this.showStatus('提示词已保存', 'success');
            }
        });

        // 自动保存提示词更改
        document.getElementById('book-splitter-prompt')?.addEventListener('input', () => {
            this.saveToStorage();
        });

        // 关闭模态框
        window.addEventListener('click', (e) => {
            if (modal && e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // 防止意外关闭
        window.addEventListener('beforeunload', (e) => {
            if (this.chapters.length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 窗口大小变化时调整UI
        window.addEventListener('resize', () => {
            const ball = document.getElementById('book-splitter-ball');
            if (ball) {
                const maxX = window.innerWidth - ball.offsetWidth;
                const maxY = window.innerHeight - ball.offsetHeight;
                const currentX = parseInt(ball.style.left);
                const currentY = parseInt(ball.style.top);

                if (currentX > maxX) ball.style.left = `${maxX}px`;
                if (currentY > maxY) ball.style.top = `${maxY}px`;
            }
        });
    }
}

// 初始化拆书工具
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.bookSplitter = new BookSplitter();
    } catch (error) {
        console.error('BookSplitter initialization failed:', error);
        alert('初始化失败，请刷新页面重试');
    }
})
