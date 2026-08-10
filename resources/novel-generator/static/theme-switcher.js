// theme-switcher.js
class EnhancedStyleSwitcher {
    constructor() {
        this.themes = this.initializeThemes();
        this.layouts = this.initializeLayouts();
        this.currentTheme = 'elegant';
        this.currentLayout = 'grid';
        this.textAreas = [];
        this.menuOpen = false;
        this.activeTextArea = null;
        this.init();
    }

    init() {
        this.createSwitcher();
        this.initializeTextAreas();
        this.initializeResizeObserver();
        this.loadSavedSettings();
    }

    initializeThemes() {
        return {
            elegant: {
                vars: {
                    '--primary-color': '#2196F3',
                    '--secondary-color': '#1976D2',
                    '--accent-color': '#00BCD4',
                    '--bg-light': '#E3F2FD',
                    '--bg-dark': '#BBDEFB',
                    '--text-color': '#333',
                    '--text-secondary': '#666',
                    '--border-color': '#BBDEFB',
                    '--shadow': '0 4px 12px rgba(33, 150, 243, 0.1)',
                    '--shadow-hover': '0 8px 24px rgba(33, 150, 243, 0.2)',
                    '--transition': 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                },
                styles: {
                    borderRadius: '12px',
                    transformScale: '1.02',
                    textAreaPadding: '16px'
                }
            },
            dark: {
                vars: {
                    '--primary-color': '#455A64',
                    '--secondary-color': '#263238',
                    '--accent-color': '#607D8B',
                    '--bg-light': '#37474F',
                    '--bg-dark': '#263238',
                    '--text-color': '#ECEFF1',
                    '--text-secondary': '#B0BEC5',
                    '--border-color': '#546E7A',
                    '--shadow': '0 4px 12px rgba(0, 0, 0, 0.3)',
                    '--shadow-hover': '0 8px 24px rgba(0, 0, 0, 0.4)',
                    '--transition': 'all 0.3s ease'
                },
                styles: {
                    borderRadius: '8px',
                    transformScale: '1',
                    textAreaPadding: '14px'
                }
            },
            flat: {
                vars: {
                    '--primary-color': '#9E9E9E',
                    '--secondary-color': '#757575',
                    '--accent-color': '#616161',
                    '--bg-light': '#F5F5F5',
                    '--bg-dark': '#EEEEEE',
                    '--text-color': '#212121',
                    '--text-secondary': '#757575',
                    '--border-color': '#E0E0E0',
                    '--shadow': 'none',
                    '--shadow-hover': '0 2px 4px rgba(0, 0, 0, 0.1)',
                    '--transition': 'all 0.2s linear'
                },
                styles: {
                    borderRadius: '4px',
                    transformScale: '1',
                    textAreaPadding: '12px'
                }
            },
            nature: {
                vars: {
                    '--primary-color': '#4CAF50',
                    '--secondary-color': '#388E3C',
                    '--accent-color': '#8BC34A',
                    '--bg-light': '#E8F5E9',
                    '--bg-dark': '#C8E6C9',
                    '--text-color': '#1B5E20',
                    '--text-secondary': '#2E7D32',
                    '--border-color': '#A5D6A7',
                    '--shadow': '0 4px 12px rgba(76, 175, 80, 0.1)',
                    '--shadow-hover': '0 8px 24px rgba(76, 175, 80, 0.2)',
                    '--transition': 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                },
                styles: {
                    borderRadius: '16px',
                    transformScale: '1.03',
                    textAreaPadding: '18px'
                }
            },
            sunset: {
                vars: {
                    '--primary-color': '#FF9800',
                    '--secondary-color': '#F57C00',
                    '--accent-color': '#FFB74D',
                    '--bg-light': '#FFF3E0',
                    '--bg-dark': '#FFE0B2',
                    '--text-color': '#E65100',
                    '--text-secondary': '#EF6C00',
                    '--border-color': '#FFCC80',
                    '--shadow': '0 4px 12px rgba(255, 152, 0, 0.1)',
                    '--shadow-hover': '0 8px 24px rgba(255, 152, 0, 0.2)',
                    '--transition': 'all 0.3s ease-in-out'
                },
                styles: {
                    borderRadius: '20px',
                    transformScale: '1.02',
                    textAreaPadding: '16px'
                }
            }
        };
    }

    initializeLayouts() {
        return {
            grid: {
                containerStyle: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '20px',
                    padding: '20px'
                },
                textAreaStyle: {
                    height: 'auto',
                    minHeight: '100px',
                    maxHeight: '250px'
                }
            },
            flex: {
                containerStyle: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '20px',
                    padding: '20px'
                },
                textAreaStyle: {
                    flex: '1 1 300px',
                    height: '150px'
                }
            },
            masonry: {
                containerStyle: {
                    columnCount: 3,
                    columnGap: '20px',
                    padding: '20px'
                },
                textAreaStyle: {
                    breakInside: 'avoid',
                    marginBottom: '20px'
                }
            },
            centered: {
                containerStyle: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px',
                    padding: '20px'
                },
                textAreaStyle: {
                    width: '80%',
                    maxWidth: '800px',
                    height: 'auto'
                }
            }
        };
    }

    createSwitcher() {
        const switcher = document.createElement('div');
        switcher.className = 'enhanced-theme-switcher';
        
        const switcherHTML = `
            <div class="theme-ball">
                <div class="theme-text">主题切换,可拖拽</div>
                <div class="theme-menu">
                    <div class="menu-section">
                        <h3>主题风格</h3>
                        <button class="theme-btn elegant-theme" data-theme="elegant">优雅蓝</button>
                        <button class="theme-btn dark-theme" data-theme="dark">冷峻黑</button>
                        <button class="theme-btn flat-theme" data-theme="flat">简约白</button>
                        <button class="theme-btn nature-theme" data-theme="nature">自然绿</button>
                        <button class="theme-btn sunset-theme" data-theme="sunset">夕阳橙</button>
                    </div>
                    <div class="menu-section">
                        <h3>布局方式</h3>
                        <button class="layout-btn" data-layout="grid">网格</button>
                        <button class="layout-btn" data-layout="flex">弹性</button>
                        <button class="layout-btn" data-layout="masonry">瀑布</button>
                        <button class="layout-btn" data-layout="centered">居中</button>
                    </div>
                    <div class="menu-section">
                        <h3>编辑模式</h3>
                        <button class="edit-btn" id="toggleFocus">专注模式</button>
                        <button class="edit-btn" id="toggleAutoCenter">自动居中</button>
                    </div>
                    <div class="menu-section">
                        <h3>其他设置</h3>
                        <button class="settings-btn" id="resetData">清除所有数据</button>
                        <button class="settings-btn" id="toggleAnimations">动画开关</button>
                    </div>
                </div>
            </div>
        `;

        switcher.innerHTML = switcherHTML;
        this.addSwitcherStyles();
        document.body.appendChild(switcher);
        
        this.initializeButtons(switcher);
        this.initializeDragging(switcher);
        this.initializeMenuBehavior(switcher);
    }
addSwitcherStyles() {
        const styles = document.createElement('style');
        styles.textContent = `
            .enhanced-theme-switcher {
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
                position: fixed !important;
                right: 20vw !important;
                bottom: 20vh !important;
                z-index: 9999;
            }

            .theme-ball {
                width: 80px;
                height: 80px;
                background: var(--primary-color);
                border-radius: 50%;
                cursor: pointer;
                box-shadow: var(--shadow);
                transition: var(--transition);
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .theme-text {
                color: white;
                font-size: 14px;
                font-weight: 500;
                text-align: center;
                pointer-events: none;
            }

            .theme-ball:hover {
                transform: scale(1.1);
                box-shadow: var(--shadow-hover);
            }

            .theme-menu {
                position: absolute;
                bottom: 100%;
                right: 0;
                background: white;
                border-radius: 16px;
                padding: 15px;
                margin-bottom: 15px;
                box-shadow: var(--shadow);
                display: none;
                flex-direction: column;
                gap: 10px;
                min-width: 200px;
                max-width: 280px;
                backdrop-filter: blur(10px);
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid var(--border-color);
            }

            .menu-section {
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 15px;
            }

            .menu-section:last-child {
                border-bottom: none;
                padding-bottom: 0;
            }

            .menu-section h3 {
                color: var(--text-secondary);
                font-size: 14px;
                margin-bottom: 10px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .menu-section h3::before {
                content: '';
                width: 4px;
                height: 14px;
                background: var(--primary-color);
                border-radius: 2px;
            }

            .theme-btn, .layout-btn, .settings-btn, .edit-btn {
                width: 100%;
                padding: 8px;
                margin: 3px 0;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: var(--transition);
                font-weight: 500;
                background: var(--bg-light);
                color: var(--text-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
                overflow: hidden;
            }

            .theme-btn::after, .layout-btn::after, .settings-btn::after, .edit-btn::after {
                content: '';
                position: absolute;
                width: 5px;
                height: 5px;
                background: var(--primary-color);
                border-radius: 50%;
                right: 10px;
                opacity: 0;
                transition: var(--transition);
            }

            .theme-btn:hover::after, .layout-btn:hover::after, 
            .settings-btn:hover::after, .edit-btn:hover::after {
                opacity: 1;
            }

            .theme-btn:hover, .layout-btn:hover, 
            .settings-btn:hover, .edit-btn:hover {
                transform: translateX(-5px);
                background: var(--bg-dark);
            }

            .active-mode {
                background: var(--primary-color) !important;
                color: white !important;
            }

            /* 专注模式样式 */
            .focus-mode .text-area:not(:focus) {
                opacity: 0.5;
            }

            .focus-mode .text-area:focus {
    min-height: 150px;
    max-height: 400px;
    overflow-y: auto;
    min-height: 150px;
    max-height: 400px;
    overflow-y: auto;
                position: fixed !important;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 80%;
                max-width: 700px;
                height: 60vh; max-height: 400px;
                z-index: 1000;
                background: var(--bg-light);
                box-shadow: var(--shadow-hover);
            }

            /* 遮罩层 */
            .overlay {
                display: none;
                position: fixed !important;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999;
                backdrop-filter: blur(3px);
            }

            .focus-mode .overlay.active {
                display: block;
            }

            /* 自动居中模式 */
.auto-center .text-area:focus {
    position: relative;
    top: 50%;
    transform: translateY(-50%);
    margin: 20px auto;
    width: 80%;
    max-width: 700px;
    min-height: 150px;
    max-height: 350px;
    overflow-y: auto;
    position: relative;
    top: 50%;
    transform: translateY(-50%);
    margin: 20px auto;
    width: 80%;
    max-width: 700px;
    min-height: 150px;
    max-height: 350px;
    overflow-y: auto;
                position: relative;
                top: 50%;
                transform: translateY(-50%);
                margin: 20px auto;
                width: 80%;
                max-width: 700px;
            }

            /* 响应式设计 */
            @media (max-width: 768px) {
    .text-area {
        min-height: 60px;
        max-height: 300px;
    }
                .theme-menu {
                    position: fixed !important;
                    bottom: 100px;
                    right: 10px;
                    width: calc(100% - 20px);
                    max-width: none;
                }

                .focus-mode .text-area:focus {
    min-height: 150px;
    max-height: 400px;
    overflow-y: auto;
    min-height: 150px;
    max-height: 400px;
    overflow-y: auto;
                    width: 95%;
                    height: 70vh;
                }
            }

            /* 动画效果 */
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .theme-menu.show {
                animation: slideIn 0.3s ease;
            }

            /* 预览效果 */
            .theme-preview {
                position: absolute;
                right: calc(100% + 10px);
                top: 50%;
                transform: translateY(-50%);
                width: 150px;
                height: 100px;
                border-radius: 8px;
                box-shadow: var(--shadow);
                pointer-events: none;
                opacity: 0;
                transition: var(--transition);
            }

            .theme-btn:hover .theme-preview {
                opacity: 1;
            }
        `;
        document.head.appendChild(styles);
    }

    initializeMenuBehavior(switcher) {
        const themeBall = switcher.querySelector('.theme-ball');
        const themeMenu = switcher.querySelector('.theme-menu');
        
        // 点击切换菜单显示状态
        themeBall.addEventListener('click', (e) => {
            if (e.target.closest('.theme-menu')) return;
            this.menuOpen = !this.menuOpen;
            themeMenu.style.display = this.menuOpen ? 'flex' : 'none';
            if (this.menuOpen) {
                themeMenu.classList.add('show');
            }
        });

        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.enhanced-theme-switcher')) {
                this.menuOpen = false;
                themeMenu.style.display = 'none';
            }
        });
    }

    initializeButtons(switcher) {
        // 主题按钮
        switcher.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.target.dataset.theme;
                this.applyTheme(theme);
            });
        });

        // 布局按钮
        switcher.querySelectorAll('.layout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layout = e.target.dataset.layout;
                this.applyLayout(layout);
                this.updateActiveButtons('layout-btn', layout);
            });
        });

        // 编辑模式按钮
        const focusBtn = switcher.querySelector('#toggleFocus');
        const autoCenterBtn = switcher.querySelector('#toggleAutoCenter');
        
        focusBtn.addEventListener('click', () => this.toggleFocusMode());
        autoCenterBtn.addEventListener('click', () => this.toggleAutoCenter());

        // 设置按钮
        const resetBtn = switcher.querySelector('#resetData');
        const animationsBtn = switcher.querySelector('#toggleAnimations');

        resetBtn.addEventListener('click', () => this.resetAllData());
        animationsBtn.addEventListener('click', () => this.toggleAnimations());
    }
initializeDragging(element) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;

        const dragStart = (e) => {
            if (e.target.closest('.theme-menu')) return;
            
            isDragging = true;
            
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - element.offsetLeft;
                initialY = e.touches[0].clientY - element.offsetTop;
            } else {
                initialX = e.clientX - element.offsetLeft;
                initialY = e.clientY - element.offsetTop;
            }
        };

        const dragMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            let clientX, clientY;
            if (e.type === "touchmove") {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            currentX = clientX - initialX;
            currentY = clientY - initialY;

            // 边界检查
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;

            currentX = Math.min(Math.max(0, currentX), maxX);
            currentY = Math.min(Math.max(0, currentY), maxY);

            element.style.left = `${currentX}px`;
            element.style.top = `${currentY}px`;
        };

        const dragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            this.saveSwitcherPosition(element);
        };

        // 鼠标事件
        element.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        // 触摸事件
        element.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    initializeTextAreas() {
        this.textAreas = Array.from(document.querySelectorAll('.text-area'));
        this.textAreas.forEach(textArea => {
            this.setupTextArea(textArea);
        });

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        document.body.appendChild(overlay);
    }

    setupTextArea(textArea) {
        // 设置基础样式
        this.applyTextAreaStyles(textArea);

        // 自动调整高度
        textArea.addEventListener('input', () => {
            this.autoResizeTextArea(textArea);
        });

        // 焦点事件处理
        textArea.addEventListener('focus', () => {
            this.handleTextAreaFocus(textArea);
        });

        textArea.addEventListener('blur', () => {
            this.handleTextAreaBlur(textArea);
        });

        // 保存内容变化
        textArea.addEventListener('change', () => {
            this.saveTextAreaContent(textArea);
        });

        // 初始化内容
        this.loadTextAreaContent(textArea);
    }

    autoResizeTextArea(textArea) {
        textArea.style.height = 'auto';
        textArea.style.height = textArea.scrollHeight + 'px';
    }

    handleTextAreaFocus(textArea) {
        this.activeTextArea = textArea;
        textArea.style.borderColor = 'var(--primary-color)';
        textArea.style.boxShadow = 'var(--shadow-hover)';

        if (document.body.classList.contains('focus-mode')) {
            document.querySelector('.overlay').classList.add('active');
        }
    }

    handleTextAreaBlur(textArea) {
        this.activeTextArea = null;
        textArea.style.borderColor = 'var(--border-color)';
        textArea.style.boxShadow = 'var(--shadow)';

        if (document.body.classList.contains('focus-mode')) {
            document.querySelector('.overlay').classList.remove('active');
        }
    }

    toggleFocusMode() {
        const focusBtn = document.querySelector('#toggleFocus');
        const isFocusMode = document.body.classList.toggle('focus-mode');
        
        focusBtn.classList.toggle('active-mode');
        this.showNotification(`专注模式已${isFocusMode ? '开启' : '关闭'}`, 'info');
        this.saveSettings();
    }

    toggleAutoCenter() {
        const autoCenterBtn = document.querySelector('#toggleAutoCenter');
        const isAutoCenter = document.body.classList.toggle('auto-center');
        
        autoCenterBtn.classList.toggle('active-mode');
        this.showNotification(`自动居中已${isAutoCenter ? '开启' : '关闭'}`, 'info');
        this.saveSettings();
    }

    applyTextAreaStyles(textArea) {
        const theme = this.themes[this.currentTheme];
        const baseStyles = {
            width: '100%',
            minHeight: '80px',
            padding: theme.styles.textAreaPadding,
            borderRadius: theme.styles.borderRadius,
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-light)',
            color: 'var(--text-color)',
            transition: 'var(--transition)',
            boxShadow: 'var(--shadow)',
            fontFamily: 'inherit',
            fontSize: '16px',
            lineHeight: '1.6',
            resize: 'vertical',
            outline: 'none'
        };

        Object.assign(textArea.style, baseStyles);
    }

    initializeResizeObserver() {
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.target.classList.contains('text-area')) {
                    this.adjustTextAreaSize(entry.target);
                }
            }
        });

        this.textAreas.forEach(textArea => {
            resizeObserver.observe(textArea);
        });
    }

    adjustTextAreaSize(textArea) {
        if (document.body.classList.contains('auto-center') && textArea === this.activeTextArea) {
            const viewportHeight = window.innerHeight;
            const textAreaHeight = textArea.offsetHeight;
            textArea.style.marginTop = `${(viewportHeight - textAreaHeight) / 2}px`;
        }
    }
applyTheme(themeName) {
        if (!this.themes[themeName]) return;

        const theme = this.themes[themeName];
        const root = document.documentElement;

        // 应用CSS变量
        Object.entries(theme.vars).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });

        // 应用主题特定样式
        this.textAreas.forEach(textArea => {
            this.applyTextAreaStyles(textArea);
        });

        // 更新当前主题并保存设置
        this.currentTheme = themeName;
        this.updateActiveButtons('theme-btn', themeName);
        this.saveSettings();

        // 应用主题特定动画
        this.showNotification(`主题已切换到: ${themeName}`, 'success');
    }

    applyLayout(layoutName) {
        if (!this.layouts[layoutName]) return;

        const layout = this.layouts[layoutName];
        const containers = document.querySelectorAll('.container');

        containers.forEach(container => {
            Object.assign(container.style, layout.containerStyle);
            
            const textAreas = container.querySelectorAll('.text-area');
            textAreas.forEach(textArea => {
                Object.assign(textArea.style, layout.textAreaStyle);
                this.autoResizeTextArea(textArea);
            });
        });

        this.currentLayout = layoutName;
        this.saveSettings();
        this.showNotification(`布局已切换到: ${layoutName}`, 'success');
    }

    updateActiveButtons(className, activeValue) {
        document.querySelectorAll(`.${className}`).forEach(btn => {
            btn.classList.remove('active-mode');
            if (btn.dataset.theme === activeValue || btn.dataset.layout === activeValue) {
                btn.classList.add('active-mode');
            }
        });
    }

    saveSettings() {
        const settings = {
            theme: this.currentTheme,
            layout: this.currentLayout,
            position: this.getSwitcherPosition(),
            focusMode: document.body.classList.contains('focus-mode'),
            autoCenter: document.body.classList.contains('auto-center'),
            animations: this.animationsEnabled
        };
        localStorage.setItem('theme-switcher-settings', JSON.stringify(settings));
    }

    loadSavedSettings() {
        const savedSettings = localStorage.getItem('theme-switcher-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            
            // 应用主题和布局
            this.applyTheme(settings.theme);
            this.applyLayout(settings.layout);
            
            // 恢复位置
            this.restoreSwitcherPosition(settings.position);
            
            // 恢复模式设置
            if (settings.focusMode) document.body.classList.add('focus-mode');
            if (settings.autoCenter) document.body.classList.add('auto-center');
            
            // 恢复动画设置
            this.animationsEnabled = settings.animations ?? true;
            if (!this.animationsEnabled) {
                document.documentElement.style.setProperty('--transition', 'none');
            }

            // 更新按钮状态
            this.updateActiveButtons('theme-btn', settings.theme);
            this.updateActiveButtons('layout-btn', settings.layout);
        }
    }

    getSwitcherPosition() {
        const switcher = document.querySelector('.enhanced-theme-switcher');
        return {
            left: switcher.style.left || '20px',
            top: switcher.style.top || '20px'
        };
    }

    saveSwitcherPosition(element) {
        const position = {
            left: element.style.left,
            top: element.style.top
        };
        this.saveSettings();
    }

    restoreSwitcherPosition(position) {
        const switcher = document.querySelector('.enhanced-theme-switcher');
        if (switcher && position) {
            switcher.style.left = position.left;
            switcher.style.top = position.top;
        }
    }

    saveTextAreaContent(textArea) {
        const id = textArea.id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
        if (!textArea.id) textArea.id = id;
        localStorage.setItem(`textarea-content-${id}`, textArea.value);
    }

    loadTextAreaContent(textArea) {
        const id = textArea.id;
        if (id) {
            const savedContent = localStorage.getItem(`textarea-content-${id}`);
            if (savedContent) {
                textArea.value = savedContent;
                this.autoResizeTextArea(textArea);
            }
        }
    }

    resetAllData() {
        if (confirm('确定要清除所有本地存储的数据吗？此操作不可撤销。')) {
            localStorage.clear();
            this.showNotification('所有数据已清除，页面将在3秒后刷新...', 'success');
            setTimeout(() => window.location.reload(), 3000);
        }
    }

    toggleAnimations() {
        this.animationsEnabled = !this.animationsEnabled;
        document.documentElement.style.setProperty('--transition', 
            this.animationsEnabled ? this.themes[this.currentTheme].vars['--transition'] : 'none');
        
        this.saveSettings();
        this.showNotification(`动画效果已${this.animationsEnabled ? '开启' : '关闭'}`, 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✓' : 'ℹ'}</span>
                <span class="notification-message">${message}</span>
            </div>
        `;

        if (!document.querySelector('.notification-container')) {
            const container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        const container = document.querySelector('.notification-container');
        container.appendChild(notification);

        // 添加通知样式
        if (!document.querySelector('#notification-styles')) {
            const notificationStyles = document.createElement('style');
            notificationStyles.id = 'notification-styles';
            notificationStyles.textContent = `
                .notification-container {
                    position: fixed !important;
                    top: 20px;
                    right: 20vw !important;
                    z-index: 10000;
                }

                .notification {
                    background: white;
                    border-radius: 8px;
                    box-shadow: var(--shadow);
                    margin-bottom: 10px;
                    transform-origin: top right;
                    animation: notificationSlide 0.3s ease, notificationFade 0.3s ease 2.7s;
                }

                .notification-content {
                    display: flex;
                    align-items: center;
                    padding: 12px 20px;
                    gap: 10px;
                }

                .notification-icon {
                    color: var(--primary-color);
                    font-weight: bold;
                }

                .notification-message {
                    color: var(--text-color);
                }

                @keyframes notificationSlide {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                @keyframes notificationFade {
                    to { opacity: 0; transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(notificationStyles);
        }

        setTimeout(() => notification.remove(), 3000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const styleSwitcher = new EnhancedStyleSwitcher();
});
