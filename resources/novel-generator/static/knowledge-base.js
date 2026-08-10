// novel-knowledge-base.js

class NovelKnowledgeBase {
    constructor() {
        this.data = {
            characters: [], // 人物档案
            worldSettings: [], // 世界观
            timeline: [], // 时间线
            plotLines: [], // 剧情线索
            locations: [] // 地点空间
        };
        this.currentEditingItem = null;
        this.init();
    }

    init() {
        this.createStyles();
        this.createFloatingBall();
        this.createKnowledgePanel();
        this.loadData();
        this.initEditorTemplate();
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .knowledge-floating-ball {
                position: fixed;
                right: 20%;
                top: 20px;
                width: 60px;
                height: 60px;
                background: linear-gradient(145deg, #6a11cb, #2575fc);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                z-index: 9999;
                font-size: 14px;
                transition: all 0.3s ease;
            }

            .knowledge-panel {
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 1200px;
                height: 85%;
                background: #fff;
                border-radius: 20px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                display: none;
                z-index: 9998;
                overflow: hidden;
            }

            .knowledge-header {
                padding: 20px 30px;
                background: #f8f9fa;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .knowledge-search {
                position: relative;
                width: 300px;
            }

            .knowledge-search input {
                width: 100%;
                padding: 10px 15px;
                padding-left: 40px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                font-size: 14px;
                transition: all 0.3s;
            }

            .knowledge-search input:focus {
                border-color: #2575fc;
                box-shadow: 0 0 0 3px rgba(37, 117, 252, 0.1);
                outline: none;
            }

            .knowledge-search::before {
                content: '[搜索]';
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 16px;
            }

            .knowledge-content {
                display: grid;
                grid-template-columns: 250px 1fr;
                height: calc(100% - 81px);
            }

            .knowledge-nav {
                background: #f8f9fa;
                padding: 20px;
                border-right: 1px solid #eee;
            }

            .nav-item {
                padding: 12px 20px;
                margin: 5px 0;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s;
                color: #555;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .nav-item:hover {
                background: #e9ecef;
                color: #2575fc;
            }

            .nav-item.active {
                background: #e7f1ff;
                color: #2575fc;
                font-weight: 500;
            }

            .knowledge-detail {
                padding: 30px;
                overflow-y: auto;
            }

            .item-card {
                background: white;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                transition: all 0.3s;
            }

            .item-card:hover {
                box-shadow: 0 4px 20px rgba(0,0,0,0.12);
                transform: translateY(-2px);
            }

            .editor-modal {
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 800px;
                background: white;
                border-radius: 15px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 10000;
                display: none;
            }

            .editor-header {
                padding: 20px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .editor-content {
                padding: 20px;
            }

            .input-group {
                margin-bottom: 20px;
            }

            .input-group label {
                display: block;
                margin-bottom: 8px;
                color: #555;
                font-weight: 500;
            }

            .input-group input,
            .input-group textarea {
                width: 100%;
                padding: 12px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                font-size: 14px;
                transition: all 0.3s;
                resize: vertical;
            }

            .input-group input:focus,
            .input-group textarea:focus {
                border-color: #2575fc;
                box-shadow: 0 0 0 3px rgba(37, 117, 252, 0.1);
                outline: none;
            }

            .tags-input {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                min-height: 45px;
            }

            .tag {
                background: #e7f1ff;
                color: #2575fc;
                padding: 4px 10px;
                border-radius: 15px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .tag-remove {
                cursor: pointer;
                color: #2575fc;
                font-weight: bold;
            }

            .tag-input {
                border: none;
                outline: none;
                padding: 4px;
                flex: 1;
                min-width: 60px;
            }

            .btn {
                padding: 8px 16px;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.3s;
            }

            .btn-primary {
                background: #2575fc;
                color: white;
            }

            .btn-primary:hover {
                background: #1b5fd9;
            }

            .btn-secondary {
                background: #e9ecef;
                color: #555;
            }

            .btn-secondary:hover {
                background: #dee2e6;
            }

            .btn-danger {
                background: #dc3545;
                color: white;
            }

            .btn-danger:hover {
                background: #c82333;
            }

            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    initEditorTemplate() {
        const editorTemplate = `
            <div class="editor-header">
                <h3 style="margin: 0;">编辑条目</h3>
                <button class="btn btn-secondary" onclick="knowledgeBase.closeEditor()">关闭</button>
            </div>
            <div class="editor-content">
                <div class="input-group">
                    <label>名称</label>
                    <input type="text" id="editor-name" placeholder="输入名称...">
                </div>
                <div class="input-group">
                    <label>描述</label>
                    <textarea id="editor-description" rows="6" placeholder="输入详细描述..."></textarea>
                </div>
                <div class="input-group">
                    <label>标签</label>
                    <div class="tags-input" id="editor-tags">
                        <input type="text" class="tag-input" placeholder="输入标签后按回车...">
                    </div>
                </div>
                <div class="input-group" id="editor-custom-fields">
                    <!-- 动态添加的自定义字段 -->
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-secondary" onclick="knowledgeBase.closeEditor()">取消</button>
                    <button class="btn btn-primary" onclick="knowledgeBase.saveCurrentEdit()">保存</button>
                </div>
            </div>
        `;

        const modal = document.createElement('div');
        modal.className = 'editor-modal';
        modal.innerHTML = editorTemplate;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        document.body.appendChild(modal);
        document.body.appendChild(overlay);

        this.editorModal = modal;
        this.modalOverlay = overlay;

        // 绑定标签输入事件
        const tagInput = modal.querySelector('.tag-input');
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                e.preventDefault();
                this.addTag(e.target.value.trim());
                e.target.value = '';
            }
        });
    }

    addTag(tagText) {
        const tagsContainer = document.getElementById('editor-tags');
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.innerHTML = `
            ${tagText}
            <span class="tag-remove" onclick="this.parentElement.remove()">×</span>
        `;
        tagsContainer.insertBefore(tag, tagsContainer.lastElementChild);
    }

    openEditor(type, item = null) {
        this.currentEditingItem = item ? {...item} : { type, tags: [] };
        this.editorModal.style.display = 'block';
        this.modalOverlay.style.display = 'block';

        // 填充表单
        document.getElementById('editor-name').value = item ? item.name : '';
        document.getElementById('editor-description').value = item ? item.description : '';
        
        // 清除并重新添加标签
        const tagsContainer = document.getElementById('editor-tags');
        Array.from(tagsContainer.getElementsByClassName('tag')).forEach(tag => tag.remove());
        if (item && item.tags) {
            item.tags.forEach(tag => this.addTag(tag));
        }

        // 添加类型特定的字段
        this.addCustomFields(type, item);
    }

    addCustomFields(type, item) {
        const container = document.getElementById('editor-custom-fields');
        container.innerHTML = '';

        const fields = this.getCustomFields(type);
        fields.forEach(field => {
            const div = document.createElement('div');
            div.className = 'input-group';
            div.innerHTML = `
                <label>${field.label}</label>
                ${field.type === 'textarea' 
                    ? `<textarea id="custom-${field.name}" rows="4" placeholder="${field.placeholder || ''}">${item && item[field.name] || ''}</textarea>`
                    : `<input type="${field.type}" id="custom-${field.name}" placeholder="${field.placeholder || ''}" value="${item && item[field.name] || ''}">`
                }
            `;
            container.appendChild(div);
        });
    }

    getCustomFields(type) {
        const fields = {
            characters: [
                { name: 'age', label: '年龄', type: 'number' },
                { name: 'role', label: '角色定位', type: 'text' },
                { name: 'personality', label: '性格特征', type: 'textarea' }
            ],
            worldSettings: [
                { name: 'rules', label: '规则体系', type: 'textarea' },
                { name: 'background', label: '背景设定', type: 'textarea' }
            ],
            timeline: [
                { name: 'date', label: '时间点', type: 'text' },
                { name: 'importance', label: '重要程度', type: 'number' }
            ],
            locations: [
                { name: 'coordinates', label: '位置坐标', type: 'text' },
                { name: 'features', label: '特征描述', type: 'textarea' }
            ],
            plotLines: [
                { name: 'mainPlot', label: '主要情节', type: 'textarea' },
                { name: 'subPlots', label: '支线情节', type: 'textarea' }
            ]
        };
        return fields[type] || [];
    }

    closeEditor() {
        this.editorModal.style.display = 'none';
        this.modalOverlay.style.display = 'none';
        this.currentEditingItem = null;
    }

    saveCurrentEdit() {
        const item = this.currentEditingItem;
        item.name = document.getElementById('editor-name').value;
        item.description = document.getElementById('editor-description').value;
        
        // 收集标签
        item.tags = Array.from(document.getElementById('editor-tags').getElementsByClassName('tag'))
            .map(tag => tag.textContent.trim().replace('×', ''));

        // 收集自定义字段
        const fields = this.getCustomFields(item.type);
        fields.forEach(field => {
            item[field.name] = document.getElementById(`custom-${field.name}`).value;
        });

        // 更新或添加到数据中
        const index = this.data[item.type].findIndex(x => x === this.currentEditingItem);
        if (index >= 0) {
            this.data[item.type][index] = item;
        } else {
            this.data[item.type].push(item);
        }

        this.saveData();
        this.switchTab(item.type);
// 续上文 saveCurrentEdit() 函数后继续补充代码
        this.closeEditor();
        this.updatePlotTextArea();
    }

    createFloatingBall() {
        const ball = document.createElement('div');
        ball.className = 'knowledge-floating-ball';
        ball.innerHTML = `<span>知识库</span>`;
        ball.onclick = () => this.togglePanel();
        document.body.appendChild(ball);
    }

    createKnowledgePanel() {
        const panel = document.createElement('div');
        panel.className = 'knowledge-panel';
        panel.innerHTML = `
            <div class="knowledge-header">
                <h2 style="margin: 0; color: #333;">小说知识库管理</h2>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div class="knowledge-search">
                        <input type="text" placeholder="搜索知识库...">
                    </div>
                    <button class="btn btn-primary" onclick="knowledgeBase.exportData()">导出数据</button>
                    <button class="btn btn-secondary" onclick="knowledgeBase.togglePanel()">关闭</button>
                </div>
            </div>
            <div class="knowledge-content">
                <div class="knowledge-nav">
                    ${this.generateNavItems()}
                </div>
                <div class="knowledge-detail" id="knowledgeDetail">
                    <!-- 内容区域 -->
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        this.bindEvents();
    }

    generateNavItems() {
        const items = [
            { id: 'characters', icon: '[人物]', name: '人物档案' },
            { id: 'worldSettings', icon: '[世界]', name: '世界观' },
            { id: 'timeline', icon: '[时间]', name: '时间线' },
            { id: 'plotLines', icon: '[剧情]', name: '剧情线索' },
            { id: 'locations', icon: '[地图]️', name: '地点空间' }
        ];

        return items.map(item => `
            <div class="nav-item" data-type="${item.id}" onclick="knowledgeBase.switchTab('${item.id}')">
                <span>${item.icon}</span>
                <span>${item.name}</span>
            </div>
        `).join('');
    }

    bindEvents() {
        // 搜索功能
        const searchInput = this.panel.querySelector('.knowledge-search input');
        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // 导航项点击效果
        this.panel.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.panel.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // ESC键关闭面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeEditor();
                if (this.panel.style.display === 'block') {
                    this.togglePanel();
                }
            }
        });
    }

    togglePanel() {
        this.panel.style.display = this.panel.style.display === 'block' ? 'none' : 'block';
        if (this.panel.style.display === 'block') {
            this.switchTab('characters'); // 默认显示人物档案
        }
    }

    switchTab(type) {
        const detail = this.panel.querySelector('#knowledgeDetail');
        detail.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3 style="margin: 0;">${this.getTypeTitle(type)}</h3>
                <button class="btn btn-primary" onclick="knowledgeBase.openEditor('${type}')">
                    + 添加${this.getTypeTitle(type)}
                </button>
            </div>
            <div class="items-container">
                ${this.generateItemsList(type)}
            </div>
        `;

        // 更新导航active状态
        this.panel.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.type === type);
        });
    }

    generateItemsList(type) {
        return this.data[type].map((item, index) => `
            <div class="item-card">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h3 style="margin: 0 0 10px 0;">${item.name}</h3>
                        <p style="margin: 0; color: #666;">${item.description}</p>
                        ${this.generateCustomFieldsDisplay(type, item)}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary" onclick="knowledgeBase.openEditor('${type}', knowledgeBase.data.${type}[${index}])">
                            编辑
                        </button>
                        <button class="btn btn-danger" onclick="knowledgeBase.deleteItem('${type}', ${index})">
                            删除
                        </button>
                    </div>
                </div>
                ${this.generateTagsDisplay(item.tags)}
            </div>
        `).join('') || '<div style="text-align: center; color: #666;">暂无数据</div>';
    }

    generateCustomFieldsDisplay(type, item) {
        const fields = this.getCustomFields(type);
        return fields.map(field => {
            if (item[field.name]) {
                return `
                    <div style="margin-top: 8px;">
                        <strong>${field.label}:</strong> 
                        <span>${item[field.name]}</span>
                    </div>
                `;
            }
            return '';
        }).join('');
    }

    generateTagsDisplay(tags) {
        if (!tags || !tags.length) return '';
        return `
            <div style="margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap;">
                ${tags.map(tag => `
                    <span class="tag">${tag}</span>
                `).join('')}
            </div>
        `;
    }

    getTypeTitle(type) {
        const titles = {
            characters: '人物档案',
            worldSettings: '世界观',
            timeline: '时间线',
            plotLines: '剧情线索',
            locations: '地点空间'
        };
        return titles[type] || type;
    }

    handleSearch(keyword) {
        if (!keyword.trim()) {
            this.switchTab('characters');
            return;
        }

        const results = [];
        Object.entries(this.data).forEach(([type, items]) => {
            items.forEach((item, index) => {
                if (this.itemMatchesSearch(item, keyword)) {
                    results.push({ ...item, type, index });
                }
            });
        });

        this.showSearchResults(results, keyword);
    }

    itemMatchesSearch(item, keyword) {
        keyword = keyword.toLowerCase();
        return (
            item.name?.toLowerCase().includes(keyword) ||
            item.description?.toLowerCase().includes(keyword) ||
            item.tags?.some(tag => tag.toLowerCase().includes(keyword)) ||
            Object.values(item).some(value => 
                typeof value === 'string' && 
                value.toLowerCase().includes(keyword)
            )
        );
    }

    showSearchResults(results, keyword) {
        const detail = this.panel.querySelector('#knowledgeDetail');
        detail.innerHTML = `
            <h3>搜索结果: "${keyword}"</h3>
            <div class="items-container">
                ${results.map(item => `
                    <div class="item-card">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div>
                                <span style="color: #666; font-size: 12px;">
                                    ${this.getTypeTitle(item.type)}
                                </span>
                                <h3 style="margin: 5px 0;">${item.name}</h3>
                                <p style="margin: 0; color: #666;">${item.description}</p>
                                ${this.generateCustomFieldsDisplay(item.type, item)}
                            </div>
                            <button class="btn btn-secondary" onclick="knowledgeBase.openEditor('${item.type}', knowledgeBase.data.${item.type}[${item.index}])">
                                编辑
                            </button>
                        </div>
                        ${this.generateTagsDisplay(item.tags)}
                    </div>
                `).join('') || '<div style="text-align: center; color: #666;">未找到匹配结果</div>'}
            </div>
        `;
    }

    deleteItem(type, index) {
        if (confirm('确定要删除这个条目吗？此操作无法撤销。')) {
            this.data[type].splice(index, 1);
            this.saveData();
            this.switchTab(type);
            this.updatePlotTextArea();
        }
    }

    saveData() {
        localStorage.setItem('novelKnowledgeBase', JSON.stringify(this.data));
    }

    loadData() {
        const saved = localStorage.getItem('novelKnowledgeBase');
        if (saved) {
            try {
                this.data = JSON.parse(saved);
            } catch (e) {
                console.error('加载数据失败:', e);
                alert('加载保存的数据时出错，将使用空数据开始');
            }
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novel-knowledge-base-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    updatePlotTextArea() {
        const plotTextArea = document.getElementById('plot');
        if (plotTextArea) {
            plotTextArea.value = JSON.stringify(this.data, null, 2);
            // 触发change事件以确保其他系统能感知到更改
            const event = new Event('change', { bubbles: true });
            plotTextArea.dispatchEvent(event);
        }
    }
}

// 初始化知识库系统
window.knowledgeBase = new NovelKnowledgeBase();
