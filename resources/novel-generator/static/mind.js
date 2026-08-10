/**
 * jsmind-writer.js - Part 1: 基础设置和样式
 */

// 核心配置类
class JsMindWriterConfig {
    static DEBUG = true;
    static STORAGE_PREFIX = 'jsmind_writer_';
    
    // 默认思维导图配置
    static DEFAULT_MIND_OPTIONS = {
        theme: 'primary',
        mode: 'side',
        direction: 'left',
        layout: {
            hspace: 30,
            vspace: 20,
            pspace: 13
        }
    };

    // 默认提示词模板
    static DEFAULT_PROMPTS = {
        outline: `作为资深小说策划，请基于以下思维导图结构：
\${mind_data}

背景设定：\${background}
人物设定：\${characters}
角色关系：\${relationships}

创建一个引人入胜的小说大纲，要求：
1. 提炼核心冲突，设计多重矛盾
2. 设计3-5个重大转折点
3. 人物塑造要立体，性格鲜明
4. 构建层层递进的剧情架构
5. 设置悬念和伏笔

输出格式：
1. 故事梗概（500字）
2. 主要情节脉络
3. 人物塑造重点
4. 转折点设计
5. 结局构思`,

        chapter: `作为专业小说家，请基于以下思维导图结构：
\${mind_data}

总体大纲：\${outline}
背景设定：\${background}
人物设定：\${characters}
角色关系：\${relationships}

为第\${chapter_number}章创建详细的章节大纲，要求：
1. 章节结构完整，起承转合明确
2. 情节连贯，与总体大纲呼应
3. 人物刻画深入，展现性格特点
4. 设置恰当的悬念和伏笔

输出格式：
1. 章节主题
2. 具体情节安排
3. 重点场景描写
4. 人物互动设计
5. 情感线发展
6. 与下章衔接`
    };

    // 样式定义
    static STYLES = `
        .jsmind-writer-btn {
            background: #4a90e2;
            color: white;
            border: none;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            transition: all 0.3s ease;
        }

        .jsmind-writer-btn:hover {
            background: #357abd;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .jsmind-writer-editor {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90vw;
            max-width: 1200px;
            height: 80vh;
            background: white;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        }

        .jsmind-writer-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
            animation: fadeIn 0.3s ease;
        }

        .editor-header {
            padding: 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
            border-radius: 8px 8px 0 0;
        }

        .editor-header h3 {
            margin: 0;
            color: #2c3e50;
            font-size: 1.2em;
        }

        .editor-body {
            flex: 1;
            display: flex;
            overflow: hidden;
            padding: 16px;
            gap: 16px;
        }

        .mind-container {
            flex: 3;
            border: 1px solid #eee;
            border-radius: 4px;
            overflow: auto;
            background: #fff;
            position: relative;
        }

        .control-panel {
            flex: 2;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-width: 300px;
        }

        .prompt-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .prompt-template {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
            font-family: monospace;
            line-height: 1.5;
            min-height: 300px;
            font-size: 14px;
        }

        .prompt-template:focus {
            border-color: #4a90e2;
            outline: none;
            box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
        }

        .button-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .editor-footer {
            padding: 16px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: #f8f9fa;
            border-radius: 0 0 8px 8px;
        }

        .action-btn {
            padding: 8px 16px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .primary-btn {
            background: #4a90e2;
            color: white;
        }

        .secondary-btn {
            background: #6c757d;
            color: white;
        }

        .danger-btn {
            background: #dc3545;
            color: white;
        }

        .action-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .loading-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 16px 24px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 4px;
            font-size: 14px;
            z-index: 1000;
        }

        .save-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            animation: fadeInOut 2s ease forwards;
            z-index: 1001;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(20px); }
            20% { opacity: 1; transform: translateY(0); }
            80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }

        .jsmind-inner {
            background: #f8f9fa !important;
        }

        /* 滚动条样式 */
        .prompt-template::-webkit-scrollbar {
            width: 8px;
        }

        .prompt-template::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
        }

        .prompt-template::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }

        .prompt-template::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
    `;

    // 编辑器HTML模板
    static EDITOR_TEMPLATE = `
        <div class="editor-header">
            <h3>思维导图编辑器</h3>
            <button class="close-btn">&times;</button>
        </div>
        <div class="editor-body">
            <div class="mind-container"></div>
            <div class="control-panel">
                <div class="prompt-container">
                    <h4>提示词模板</h4>
                    <textarea class="prompt-template" placeholder="输入提示词模板..."></textarea>
                </div>
                <div class="button-group">
                    <button class="action-btn primary-btn add-node-btn">添加节点</button>
                    <button class="action-btn secondary-btn delete-node-btn">删除节点</button>
                </div>
            </div>
        </div>
        <div class="editor-footer">
            <button class="action-btn secondary-btn import-btn">导入</button>
            <button class="action-btn secondary-btn export-btn">导出</button>
            <button class="action-btn primary-btn save-btn">保存</button>
            <button class="action-btn primary-btn generate-btn">生成内容</button>
        </div>
    `;
}




/**
 * jsmind-writer.js - Part 2: 核心功能实现
 */

class JsMindWriter {
    constructor() {
        this.mindMap = null;
        this.currentChapter = null;
        this.currentElement = null;
        this.isEditorOpen = false;
        this.lastSavedData = null;

        this.init();
    }

    // 调试日志
    log(...args) {
        if (JsMindWriterConfig.DEBUG) {
            console.log('[JsMindWriter]', ...args);
        }
    }

    // 初始化
    init() {
        this.log('初始化');
        this.injectStyles();
        this.initButtons();
        this.loadPromptTemplates();
    }

    // 注入样式
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = JsMindWriterConfig.STYLES;
        document.head.appendChild(style);
    }

    // 初始化按钮
    initButtons() {
        this.log('初始化按钮');

        // 为大纲添加按钮
        const outlineElement = document.querySelector('#outline');
        if (outlineElement) {
            this.addButtonToElement('#outline', 'outline', '思维导图生成大纲');
        }

        // 为现有章节添加按钮
        this.addChapterButtons();

        // 监听章节变化
        const chaptersContainer = document.querySelector('#chapters');
        if (chaptersContainer) {
            const observer = new MutationObserver(() => {
                setTimeout(() => this.addChapterButtons(), 100);
            });

            observer.observe(chaptersContainer, {
                childList: true,
                subtree: true
            });
        }
    }

    // 为章节添加按钮
    addChapterButtons() {
        document.querySelectorAll('.chapter-outline').forEach(element => {
            if (!this.hasButton(element)) {
                this.addButtonToElement(element, 'chapter', '思维导图生成章节');
            }
        });
    }





getDefaultMindData(type) {
    const title = type === 'outline' ? '小说大纲' : `第${this.currentChapter}章`;
    return {
        format: 'node_tree',
        data: {
            id: 'root',
            topic: title,
            children: [
                {
                    id: 'plot',
                    topic: '情节结构',
                    children: [
                        { id: 'plot_1', topic: '开场' },
                        { id: 'plot_2', topic: '中间' },
                        { id: 'plot_3', topic: '结尾' }
                    ]
                }
            ]
        }
    };
}

    // 检查是否已有按钮
    hasButton(element) {
        const container = element.parentElement.querySelector('.chapter-buttons');
        return container && container.querySelector('.jsmind-writer-btn');
    }

    // 为元素添加按钮
    addButtonToElement(element, type, text) {
        try {
            const targetElement = typeof element === 'string' ?
                document.querySelector(element) : element;

            if (!targetElement) {
                this.log(`未找到目标元素: ${type}`);
                return;
            }

            let container = targetElement.parentElement.querySelector('.chapter-buttons');
            if (!container) {
                container = document.createElement('div');
                container.className = 'chapter-buttons';
                targetElement.parentElement.appendChild(container);
            }

            const button = document.createElement('button');
            button.className = 'jsmind-writer-btn';
            button.textContent = text;
            button.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openEditor(targetElement, type);
            };

            container.appendChild(button);
            this.log(`添加按钮到 ${type}`);

        } catch (error) {
            console.error('添加按钮失败:', error);
        }
    }

    // 初始化思维导图

async initJsMind(editor, data) {
    try {
        this.log('初始化思维导图');

        // 验证 jsMind 是否可用
        if (typeof jsMind !== 'function') {
            throw new Error('jsMind 未加载，请确保已引入 jsMind 库');
        }

        const container = editor.querySelector('.mind-container');
        if (!container) {
            throw new Error('找不到思维导图容器');
        }

        // 确保容器有唯一ID
        const containerId = 'jsmind_container_' + Date.now();
        container.id = containerId;

        // 清空容器
        container.innerHTML = '';

        // 设置容器样式
        container.style.height = '100%';
        container.style.width = '100%';
        container.style.minHeight = '500px';
        container.style.border = '1px solid #ccc';

        // 等待 DOM 更新
        await new Promise(resolve => setTimeout(resolve, 100));

        // 确保数据格式正确
        let mindData = {
            meta: {
                name: 'jsMind',
                author: 'jsMind',
                version: '0.2'
            },
            format: 'node_tree',
            data: {
                id: 'root',
                topic: '主题',
                children: []
            }
        };

        // 合并输入数据
        if (data && data.data) {
            mindData.data = data.data;
        }

        // jsMind配置 - 使用 SVG 渲染模式
        const options = {
            container: containerId,
            theme: 'primary',
            editable: true,
            mode: 'side',
            view: {
                engine: 'svg',  // 改用 svg 渲染
                draggable: true,
                hide_scrollbars_when_draggable: false
            },
            layout: {
                hspace: 30,
                vspace: 20,
                pspace: 13
            },
            format: 'node_tree',
            support_html: true, // 启用 HTML 支持
            shortcut: {
                enable: true,   // 启用快捷键支持
                handles: {},    
                mapping: {
                    addChild: 9,    // Tab
                    addBrother: 13, // Enter
                    editNode: 113,  // F2
                    delNode: 46,    // Delete
                    toggle: 32,     // Space
                    left: 37,       // Left
                    up: 38,         // Up
                    right: 39,      // Right
                    down: 40,       // Down
                }
            }
        };

        // 确保在创建新实例前销毁旧实例
        if (this.mindMap) {
            try {
                if (typeof this.mindMap.destroy === 'function') {
                    this.mindMap.destroy();
                }
            } catch (e) {
                console.warn('销毁旧实例失败:', e);
            }
            this.mindMap = null;
        }

        // 创建新实例
        try {
            // 打印调试信息
            console.log('Container:', container);
            console.log('Options:', JSON.stringify(options, null, 2));

            this.mindMap = new jsMind(options);
            
            // 等待实例初始化
            await new Promise(resolve => setTimeout(resolve, 200));

            // 验证实例
            if (!this.mindMap) {
                throw new Error('思维导图实例创建失败');
            }

            // 尝试渲染数据
            this.mindMap.show(mindData);

            // 绑定双击事件处理器
            this.initNodeEventHandlers(container);

            // 再次等待渲染完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 尝试获取根节点
            const rootNode = this.mindMap.get_node('root');
            if (!rootNode) {
                throw new Error('无法获取根节点');
            }

            // 选中根节点
            this.mindMap.select_node('root');
            
            this.log('思维导图初始化成功');
            return true;

        } catch (error) {
            console.error('创建思维导图实例失败:', error);
            // 打印更多调试信息
            console.log('MindMap instance:', this.mindMap);
            console.log('Container state:', container.innerHTML);
            throw error;
        }

    } catch (error) {
        console.error('思维导图初始化失败:', error);
        throw new Error(`jsMind初始化失败: ${error.message}`);
    }
}



// 保存思维导图数据
    saveMindMapData(type, chapter, data) {
        const key = `${JsMindWriterConfig.STORAGE_PREFIX}mind_${type}_${chapter || 'outline'}`;
        try {
            localStorage.setItem(key, JSON.stringify(data));
            this.lastSavedData = JSON.stringify(data);
            this.log(`保存思维导图数据: ${key}`);
            return true;
        } catch (error) {
            console.error('保存思维导图数据失败:', error);
            return false;
        }
    }

    // 加载思维导图数据
    loadMindMapData(type, chapter) {
        const key = `${JsMindWriterConfig.STORAGE_PREFIX}mind_${type}_${chapter || 'outline'}`;
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('加载思维导图数据失败:', error);
            return null;
        }
    }

    // 保存提示词模板
    savePromptTemplate(type, template) {
        const key = `${JsMindWriterConfig.STORAGE_PREFIX}prompt_${type}`;
        try {
            localStorage.setItem(key, template);
            this.log(`保存提示词模板: ${key}`);
            return true;
        } catch (error) {
            console.error('保存提示词模板失败:', error);
            return false;
        }
    }

    // 加载提示词模板
    loadPromptTemplate(type) {
        const key = `${JsMindWriterConfig.STORAGE_PREFIX}prompt_${type}`;
        return localStorage.getItem(key);
    }

    // 加载所有提示词模板
    loadPromptTemplates() {
        Object.keys(JsMindWriterConfig.DEFAULT_PROMPTS).forEach(type => {
            const template = this.loadPromptTemplate(type);
            if (!template) {
                this.savePromptTemplate(type, JsMindWriterConfig.DEFAULT_PROMPTS[type]);
            }
        });
    }

    // 检查是否有未保存的更改
    hasUnsavedChanges() {
        if (!this.mindMap) return false;
        const currentData = JSON.stringify(this.mindMap.get_data());
        return currentData !== this.lastSavedData;
    }

    // 显示保存指示器
    showSaveIndicator(message = '已保存') {
        const indicator = document.createElement('div');
        indicator.className = 'save-indicator';
        indicator.textContent = message;
        document.body.appendChild(indicator);

        setTimeout(() => {
            indicator.remove();
        }, 2000);
    }

    // 获取章节号
    getChapterNumber(element) {
        if (typeof element === 'string' || element.id === 'outline') {
            return null;
        }

        const container = element.closest('.chapter-container');
        const header = container.querySelector('.chapter-header span:first-child');
        const match = header.textContent.match(/章节 (\d+)/);
        return match ? parseInt(match[1]) : null;
    }
// 新增方法：初始化节点事件处理器
initNodeEventHandlers(container) {
    // 使用事件委托
    container.addEventListener('dblclick', (e) => {
        // 查找触发事件的节点元素
        let targetNode = e.target;
        while (targetNode && targetNode !== container) {
            if (targetNode.tagName === 'tspan' || targetNode.tagName === 'text' || 
                targetNode.classList.contains('jmnode')) {
                // 向上查找到具有 nodeid 的元素
                let currentElement = targetNode;
                while (currentElement && !currentElement.getAttribute('nodeid')) {
                    currentElement = currentElement.parentElement;
                }
                
                if (currentElement) {
                    const nodeId = currentElement.getAttribute('nodeid');
                    if (nodeId) {
                        const node = this.mindMap.get_node(nodeId);
                        if (node) {
                            // 阻止事件继续传播
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // 编辑节点
                            const newTopic = prompt('编辑节点内容:', node.topic || '');
                            if (newTopic !== null && newTopic.trim() !== '') {
                                this.mindMap.update_node(nodeId, newTopic.trim());
                                // 确保视图更新
                                this.mindMap.refresh();
                            }
                        }
                    }
                }
                break;
            }
            targetNode = targetNode.parentElement;
        }
    }, true);  // 使用捕获阶段
}
}





/**
 * jsmind-writer.js - Part 3: 事件处理和UI交互
 * 为 JsMindWriter 类添加方法
 */

// 编辑器相关方法
async function openEditor(element, type) {
    if (this.isEditorOpen) return;

    try {
        // 验证jsMind是否已加载
        if (typeof jsMind !== 'function') {
            throw new Error('jsMind库未加载，请检查脚本引入是否正确');
        }

        this.isEditorOpen = true;
        this.currentElement = element;
        this.currentChapter = this.getChapterNumber(element);

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'jsmind-writer-overlay';
        document.body.appendChild(overlay);

        // 创建编辑器
        const editor = document.createElement('div');
        editor.className = 'jsmind-writer-editor';
        editor.innerHTML = JsMindWriterConfig.EDITOR_TEMPLATE;
        document.body.appendChild(editor);

        // 添加加载指示器
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.textContent = '正在加载思维导图...';
        editor.querySelector('.mind-container').appendChild(loadingIndicator);

        try {
            // 加载数据并初始化
            const savedData = this.loadMindMapData(type, this.currentChapter);
            const mindData = savedData || this.getDefaultMindData(type);
            
            // 确保数据格式正确
            if (!mindData.format || !mindData.data) {
                throw new Error('思维导图数据格式不正确');
            }

            await this.initJsMind(editor, mindData);
            loadingIndicator.remove();
            
            // 绑定事件
            this.bindEditorEvents(editor, element, type);

            // 加载提示词模板
            const promptTemplate = editor.querySelector('.prompt-template');
            promptTemplate.value = this.loadPromptTemplate(type) || 
                                 JsMindWriterConfig.DEFAULT_PROMPTS[type];

        } catch (error) {
            console.error('打开编辑器失败:', error);
            this.closeEditor();
            alert(`初始化思维导图失败: ${error.message}\n请确保已正确加载jsMind库`);
        }
    } catch (error) {
        console.error('创建编辑器失败:', error);
        this.isEditorOpen = false;
        alert(`创建编辑器失败: ${error.message}`);
    }
}

// 关闭编辑器
function closeEditor() {
    const editor = document.querySelector('.jsmind-writer-editor');
    const overlay = document.querySelector('.jsmind-writer-overlay');

    if (editor) {
        editor.remove();
    }
    if (overlay) {
        overlay.remove();
    }

    this.isEditorOpen = false;
    this.mindMap = null;
    this.currentElement = null;
}

// 绑定编辑器事件








// 绑定编辑器事件
// 绑定编辑器事件
function bindEditorEvents(editor, element, type) {
    this.log('开始绑定编辑器事件');

    try {
        // 关闭按钮事件
        editor.querySelector('.close-btn').onclick = () => {
            if (this.hasUnsavedChanges()) {
                if (confirm('有未保存的更改，确定要关闭吗？')) {
                    this.closeEditor();
                }
            } else {
                this.closeEditor();
            }
        };

        // 保存按钮事件
        editor.querySelector('.save-btn').onclick = () => {
            const data = this.mindMap.get_data();
            const template = editor.querySelector('.prompt-template').value;

            if (this.saveMindMapData(type, this.currentChapter, data) &&
                this.savePromptTemplate(type, template)) {
                this.showSaveIndicator('思维导图已保存');
            } else {
                alert('保存失败，请重试');
            }
        };

        // 添加修改节点按钮
        const editButton = document.createElement('button');
        editButton.className = 'action-btn secondary-btn edit-node-btn';
        editButton.textContent = '修改节点';
        editor.querySelector('.button-group').appendChild(editButton);

        // 修改节点按钮事件
        editButton.onclick = () => {
            const selected = this.mindMap.get_selected_node();
            if (selected) {
                const newTopic = prompt('编辑节点内容:', selected.topic);
                if (newTopic !== null && newTopic.trim() !== '') {
                    this.mindMap.update_node(selected.id, newTopic.trim());
                }
            } else {
                alert('请先选择要修改的节点');
            }
        };

        // 生成内容按钮事件
        editor.querySelector('.generate-btn').onclick = async () => {
            try {
                if (!confirm('是否要使用当前思维导图生成内容？这将覆盖现有内容。')) {
                    return;
                }

                const btn = editor.querySelector('.generate-btn');
                btn.disabled = true;
                btn.textContent = '生成中...';

                await this.generateContent(element, type);

                btn.disabled = false;
                btn.textContent = '生成内容';

            } catch (error) {
                console.error('生成内容失败:', error);
                alert('生成内容时出错，请重试');
                editor.querySelector('.generate-btn').disabled = false;
                editor.querySelector('.generate-btn').textContent = '生成内容';
            }
        };

        // 导出按钮事件
        editor.querySelector('.export-btn').onclick = () => {
            try {
                const data = {
                    mindMap: this.mindMap.get_data(),
                    prompt: editor.querySelector('.prompt-template').value,
                    meta: {
                        type: type,
                        chapter: this.currentChapter,
                        timestamp: new Date().toISOString()
                    }
                };

                const blob = new Blob([JSON.stringify(data, null, 2)],
                    { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const filename = `mindmap_${type}_${this.currentChapter || 'outline'}_${new Date().getTime()}.json`;
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                this.showSaveIndicator('导出成功');
            } catch (error) {
                console.error('导出失败:', error);
                alert('导出失败，请重试');
            }
        };

        // 导入按钮事件
        editor.querySelector('.import-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                try {
                    const file = e.target.files[0];
                    const text = await file.text();
                    const data = JSON.parse(text);

                    if (data.mindMap && data.prompt) {
                        this.mindMap.show(data.mindMap);
                        editor.querySelector('.prompt-template').value = data.prompt;
                        this.showSaveIndicator('导入成功');
                    } else {
                        // 兼容旧格式
                        this.mindMap.show(data);
                    }
                } catch (error) {
                    console.error('导入失败:', error);
                    alert('导入失败，请确保文件格式正确');
                }
            };
            input.click();
        };

        // 添加节点按钮事件
        editor.querySelector('.add-node-btn').onclick = () => {
            const selected = this.mindMap.get_selected_node();
            if (selected) {
                const nodeId = 'node_' + Date.now();
                try {
                    const newNode = this.mindMap.add_node(selected, nodeId, '新节点');
                    if (newNode) {
                        setTimeout(() => {
                            const newTopic = prompt('输入节点内容:', '新节点');
                            if (newTopic !== null && newTopic.trim() !== '') {
                                this.mindMap.update_node(nodeId, newTopic.trim());
                            }
                        }, 100);
                    }
                } catch (e) {
                    console.error('添加节点失败:', e);
                    // 尝试替代方法
                    this.mindMap.add_node(selected.id, nodeId, '新节点');
                }
            } else {
                // 如果没有选中节点，默认选中根节点
                const rootNode = this.mindMap.get_node('root');
                if (rootNode) {
                    this.mindMap.select_node('root');
                    setTimeout(() => {
                        editor.querySelector('.add-node-btn').click();
                    }, 100);
                } else {
                    alert('无法添加节点，请先选择一个节点');
                }
            }
        };

        // 删除节点按钮事件
        editor.querySelector('.delete-node-btn').onclick = () => {
            const selected = this.mindMap.get_selected_node();
            if (selected) {
                if (selected.id === 'root') {
                    alert('根节点不能删除');
                    return;
                }
                if (confirm('确定要删除选中的节点吗？其子节点也会被删除。')) {
                    try {
                        this.mindMap.remove_node(selected);
                    } catch (e) {
                        console.error('删除节点失败:', e);
                        // 尝试替代方法
                        this.mindMap.remove_node(selected.id);
                    }
                }
            } else {
                alert('请先选择要删除的节点');
            }
        };

        // 为节点添加双击编辑功能
        const mindContainer = editor.querySelector('.mind-container');
        mindContainer.addEventListener('dblclick', (e) => {
            const nodeElement = e.target.closest('.jsmind-node');
            if (nodeElement) {
                const nodeId = nodeElement.id.replace('jmnode_', '');
                const node = this.mindMap.get_node(nodeId);
                if (node) {
                    const newTopic = prompt('编辑节点内容:', node.topic);
                    if (newTopic !== null && newTopic.trim() !== '') {
                        this.mindMap.update_node(nodeId, newTopic.trim());
                    }
                }
            }
        });

        // 添加提示信息
        const helpText = document.createElement('div');
        helpText.style.padding = '10px';
        helpText.style.color = '#666';
        helpText.style.fontSize = '14px';
        helpText.innerHTML = '提示: 双击节点可以编辑内容，拖拽节点可以调整位置';
        editor.querySelector('.control-panel').insertBefore(helpText, editor.querySelector('.button-group'));

        // 初始化拖拽功能
        if (this.mindMap.jm) {
            this.mindMap.jm.enable_drag();
        }

        // 思维导图事件监听
        if (this.mindMap.jm) {
            this.mindMap.jm.add_event_listener((type, data) => {
                if (type === 'drag') {
                    // 触发自动保存
                    const mindData = this.mindMap.get_data();
                    const template = editor.querySelector('.prompt-template').value;
                    this.saveMindMapData(type, this.currentChapter, mindData);
                    this.savePromptTemplate(type, template);
                }
            });
        }

        // 键盘快捷键支持
        editor.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('prompt-template')) {
                return; // 如果在提示词模板中，不处理快捷键
            }

            const selected = this.mindMap.get_selected_node();
            
            switch(e.key) {
                case 'Delete':
                    if (selected && selected.id !== 'root') {
                        if (confirm('确定要删除选中的节点吗？')) {
                            this.mindMap.remove_node(selected);
                        }
                    }
                    break;

                case 'Enter':
                    if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd + Enter: 编辑当前节点
                        if (selected) {
                            const newTopic = prompt('编辑节点内容:', selected.topic);
                            if (newTopic !== null && newTopic.trim() !== '') {
                                this.mindMap.update_node(selected.id, newTopic.trim());
                            }
                        }
                    } else {
                        // Enter: 在同级添加节点
                        if (selected && selected.id !== 'root') {
                            e.preventDefault();
                            const nodeId = 'node_' + Date.now();
                            const parent = this.mindMap.get_node(selected.parent);
                            if (parent) {
                                const newNode = this.mindMap.add_node(parent, nodeId, '新节点');
                                if (newNode) {
                                    setTimeout(() => {
                                        const newTopic = prompt('输入节点内容:', '新节点');
                                        if (newTopic !== null && newTopic.trim() !== '') {
                                            this.mindMap.update_node(nodeId, newTopic.trim());
                                        }
                                    }, 100);
                                }
                            }
                        }
                    }
                    break;

                case 'Tab':
                    // Tab: 添加子节点
                    if (selected) {
                        e.preventDefault();
                        const nodeId = 'node_' + Date.now();
                        const newNode = this.mindMap.add_node(selected, nodeId, '新节点');
                        if (newNode) {
                            setTimeout(() => {
                                const newTopic = prompt('输入节点内容:', '新节点');
                                if (newTopic !== null && newTopic.trim() !== '') {
                                    this.mindMap.update_node(nodeId, newTopic.trim());
                                }
                            }, 100);
                        }
                    }
                    break;
            }
        });

        // 自动保存
        let autoSaveTimeout;
        const autoSave = () => {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                const data = this.mindMap.get_data();
                const template = editor.querySelector('.prompt-template').value;
                if (this.saveMindMapData(type, this.currentChapter, data) &&
                    this.savePromptTemplate(type, template)) {
                    this.showSaveIndicator('已自动保存');
                }
            }, 3000); // 30秒自动保存
        };

        // 监听思维导图变化
        this.mindMap.add_event_listener(() => autoSave());

        // 监听提示词模板变化
        editor.querySelector('.prompt-template').addEventListener('input', () => autoSave());

        this.log('编辑器事件绑定完成');

    } catch (error) {
        console.error('绑定编辑器事件失败:', error);
        alert('初始化编辑器失败，请刷新页面重试');
    }
}




// 内容生成相关方法

async function generateContent(element, type) {
    try {
        // 在发送请求前获取所需数据
        const mindData = this.mindMap.get_data();
        const promptTemplate = document.querySelector('.prompt-template').value;
        const prompt = this.buildPrompt(promptTemplate, mindData, type);

        // 先处理UI：隐藏思维导图窗口并滚动到目标位置
        const editor = document.querySelector('.jsmind-writer-editor');
        const overlay = document.querySelector('.jsmind-writer-overlay');
        if (editor) {
            editor.style.display = 'none';
            // 注意：不要调用 closeEditor()，因为它会销毁 mindMap 实例
        }
        if (overlay) {
            overlay.style.display = 'none';
        }

        // 滚动到目标元素
        const targetElement = typeof element === 'string' ? 
            document.querySelector(element) : element;
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.focus();
        }

        // 发送生成请求
        const response = await fetch('gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            throw new Error('生成内容请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let content = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            content += decoder.decode(value, { stream: true });
            this.updateTargetContent(element, content);
        }

        this.log('内容生成完成');
        this.showSaveIndicator('内容生成完成');

        // 生成完成后再完全关闭编辑器
        this.closeEditor();
        
    } catch (error) {
        // 发生错误时恢复UI显示
        const editor = document.querySelector('.jsmind-writer-editor');
        const overlay = document.querySelector('.jsmind-writer-overlay');
        if (editor) {
            editor.style.display = '';
        }
        if (overlay) {
            overlay.style.display = '';
        }
        
        console.error('生成内容失败:', error);
        throw error;
    }
}






// 构建提示词
// 更新提示词构建方法
function buildPrompt(template, mindData, type) {
    // 获取各文本域内容的辅助函数
    const getTextAreaContent = (id) => {
        const element = document.querySelector(`#${id}`);
        return element ? (element.value || '未设置') : '未设置';
    };

    // 替换模板中的变量
    const replacements = {
        '${mind_data}': JSON.stringify(mindData, null, 2),
        '${background}': getTextAreaContent('background'),
        '${characters}': getTextAreaContent('characters'),
        '${relationships}': getTextAreaContent('relationships'),
        '${plot}': getTextAreaContent('plot'),
        '${style}': getTextAreaContent('style'),
        '${outline}': getTextAreaContent('outline'),
        '${chapter_number}': this.currentChapter || '1'
    };

    let processedTemplate = template;
    
    // 遍历替换所有变量
    Object.entries(replacements).forEach(([key, value]) => {
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        processedTemplate = processedTemplate.replace(regex, value);
    });

    return processedTemplate;
}

// 更新目标内容
function updateTargetContent(element, content) {
    const target = typeof element === 'string' ?
        document.querySelector(element) : element;
    if (target) {
        target.value = content;
        target.scrollTop = target.scrollHeight;
    }
}

// 将所有方法添加到 JsMindWriter 类的原型
Object.assign(JsMindWriter.prototype, {
    openEditor,
    closeEditor,
    bindEditorEvents,
    generateContent,
    buildPrompt,
    updateTargetContent
});

// 初始化实例
document.addEventListener('DOMContentLoaded', () => {
    window.jsMindWriter = new JsMindWriter();
});
