// 核心配置对象
function createPreviewPanel() {
    const previewPanel = `
        <div id="preview-panel" class="preview-panel" style="display: none;">
            <div class="preview-header">
                <span class="preview-title">内容预览</span>
                <button class="preview-close-btn" title="关闭预览">×</button>
            </div>
            <div class="preview-content"></div>
            <div class="preview-footer">
                <span class="preview-info">字数：<span class="word-count">0</span></span>
            </div>
        </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .preview-panel {
            position: fixed;
            background: white;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1002;
            width: 400px;
            max-height: 500px;
            opacity: 0;
            transition: opacity ${optimizerConfig.ui.transitionDuration}ms ease-in-out,
                        transform ${optimizerConfig.ui.transitionDuration}ms ease-in-out;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
        }

        .preview-header {
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
            border-radius: 6px 6px 0 0;
        }

        .preview-title {
            font-size: 14px;
            font-weight: 500;
            color: #495057;
        }

        .preview-close-btn {
            background: none;
            border: none;
            font-size: 18px;
            color: #666;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
        }

        .preview-close-btn:hover {
            color: #333;
        }

        .preview-content {
            padding: 16px;
            overflow-y: auto;
            flex: 1;
            font-size: 14px;
            line-height: 1.6;
            color: #212529;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 400px;
        }

        .preview-footer {
            padding: 8px 16px;
            border-top: 1px solid #eee;
            background: #f8f9fa;
            border-radius: 0 0 6px 6px;
            font-size: 12px;
            color: #666;
        }

        .preview-info {
            display: flex;
            gap: 12px;
        }

        .preview-panel.show {
            opacity: 1;
            transform: translateY(0);
        }

        .preview-panel.hide {
            opacity: 0;
            transform: translateY(-10px);
            pointer-events: none;
        }

        /* 添加淡入淡出效果 */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-10px); }
        }

        /* 滚动条样式优化 */
        .preview-content::-webkit-scrollbar {
            width: 6px;
        }

        .preview-content::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }

        .preview-content::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
        }

        .preview-content::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* 优化显示位置的响应式处理 */
        @media (max-width: 768px) {
            .preview-panel {
                width: 90vw;
                max-height: 70vh;
                position: fixed;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%);
            }
        }
    `;

    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', previewPanel);
    uiState.previewPanel = document.getElementById('preview-panel');

    // 初始化预览面板事件
    initPreviewPanelEvents();
}

// 初始化预览面板事件处理
function initPreviewPanelEvents() {
    const panel = uiState.previewPanel;
    if (!panel) return;

    // 关闭按钮事件
    const closeBtn = panel.querySelector('.preview-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => hidePreview());
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (panel.style.display !== 'none' && !panel.contains(e.target)) {
            hidePreview();
        }
    });

    // 阻止预览面板内部点击事件冒泡
    panel.addEventListener('click', (e) => e.stopPropagation());

    // 添加键盘事件支持
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.style.display !== 'none') {
            hidePreview();
        }
    });

    // 添加内容滚动优化
    const content = panel.querySelector('.preview-content');
    if (content) {
        // 使用 Intersection Observer 优化滚动性能
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                    }
                });
            },
            { threshold: 0.1 }
        );

        observer.observe(content);
    }
}

// 显示预览面板
function showPreview(event) {
    const panel = uiState.previewPanel;
    if (!panel) return;

    const index = parseInt(event.currentTarget.getAttribute('data-index'));
    const segment = uiState.segments[index];
    const rect = event.currentTarget.getBoundingClientRect();

    // 计算最佳显示位置
    let left = rect.right + 10;
    let top = rect.top;

    // 检查是否超出视口
    if (left + 400 > window.innerWidth) {
        left = rect.left - 410;
    }
    if (top + panel.offsetHeight > window.innerHeight) {
        top = window.innerHeight - panel.offsetHeight - 10;
    }

    // 更新内容和位置
    panel.querySelector('.preview-content').textContent = segment;
    panel.querySelector('.word-count').textContent = segment.length;

    Object.assign(panel.style, {
        display: 'flex',
        top: Math.max(10, top) + 'px',
        left: Math.max(10, left) + 'px'
    });

    // 触发显示动画
    requestAnimationFrame(() => {
        panel.classList.remove('hide');
        panel.classList.add('show');
    });
}

// 隐藏预览面板
function hidePreview() {
    const panel = uiState.previewPanel;
    if (!panel) return;

    panel.classList.remove('show');
    panel.classList.add('hide');

    setTimeout(() => {
        panel.style.display = 'none';
    }, optimizerConfig.ui.transitionDuration);
}



function createResultPanel() {
    const resultPanel = `
        <div id="result-panel" class="result-panel" style="display: none;">
            <div class="panel-header">
                <h3>优化结果</h3>
                <button class="close-btn" title="关闭">×</button>
            </div>
            
            <div class="panel-body">
                <div class="result-content">
                    <div class="score-section">
                        <h4>综合评分</h4>
                        <div class="score-display">
                            <div class="score-circle">
                                <span class="score-value">0</span>
                            </div>
                            <div class="score-label">分</div>
                        </div>
                        <div class="score-reason"></div>
                    </div>

                    <div class="content-section">
                        <h4>优化内容</h4>
                        <div class="content-scroll-wrapper">
                            <div class="content-comparison"></div>
                        </div>
                    </div>

                    <div class="changes-section">
                        <h4>修改说明</h4>
                        <div class="changes-scroll-wrapper">
                            <div class="changes-value"></div>
                        </div>
                    </div>

                    <div class="iteration-info">
                        <span class="current-iteration">迭代次数: 0</span>
                        <span class="improvement-rate">提升幅度: 0%</span>
                    </div>
                </div>
            </div>

            <div class="panel-footer">
                <button class="reject-btn secondary-btn">重新生成</button>
                <button class="accept-btn primary-btn">接受更改</button>
            </div>
        </div>
    `;
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .result-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            z-index: 1001;
            width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            transition: opacity ${optimizerConfig.ui.transitionDuration}ms ease-in-out;
        }

        .result-panel .panel-body {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            padding: 0;
        }

        .result-content {
            height: 100%;
            padding: 24px;
            overflow-y: auto;
        }

        .content-scroll-wrapper,
        .changes-scroll-wrapper {
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid #eee;
            border-radius: 4px;
            padding: 12px;
            margin-top: 8px;
            background: #f8f9fa;
        }

        .content-comparison,
        .changes-value {
            white-space: pre-wrap;
            line-height: 1.6;
            color: #212529;
            font-size: 14px;
        }

        /* 优化滚动条样式 */
        .content-scroll-wrapper::-webkit-scrollbar,
        .changes-scroll-wrapper::-webkit-scrollbar {
            width: 6px;
        }

        .content-scroll-wrapper::-webkit-scrollbar-track,
        .changes-scroll-wrapper::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }

        .content-scroll-wrapper::-webkit-scrollbar-thumb,
        .changes-scroll-wrapper::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
        }

        .content-scroll-wrapper::-webkit-scrollbar-thumb:hover,
        .changes-scroll-wrapper::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
        /* 移动端适配 */
        @media (max-width: 768px) {
            .result-panel {
                width: 95vw !important;
                max-height: 95vh;
            }

            .score-circle {
                width: 60px;
                height: 60px;
                font-size: 20px;
            }

            .panel-body {
                padding: 16px;
            }

            .content-section, .changes-section {
                padding: 12px;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', resultPanel);
    uiState.resultPanel = document.getElementById('result-panel');

    // 添加结果面板的事件监听
    const panel = uiState.resultPanel;
    if (panel) {
        // 关闭按钮事件
        panel.querySelector('.close-btn').addEventListener('click', () => {
            panel.style.opacity = '0';
            setTimeout(() => {
                panel.style.display = 'none';
            }, optimizerConfig.ui.transitionDuration);
        });

        // ESC键关闭面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.style.display !== 'none') {
                panel.querySelector('.close-btn').click();
            }
        });

        // 防止点击面板内部时关闭
        panel.addEventListener('click', (e) => e.stopPropagation());
    }
}
function createOptimizerPanel() {
    const panel = `
        <div id="optimizer-panel" class="optimizer-panel" style="display: none; width: ${optimizerConfig.ui.width}px; height: ${optimizerConfig.ui.height}px;">
            <div class="panel-header">
                <h3>AI智能优化面板</h3>
                <div class="header-buttons">
                    <button id="save-config" class="secondary-btn">保存配置</button>
                    <button class="close-btn">×</button>
                </div>
            </div>

            <div class="panel-body">
                <div class="config-tabs">
                    <button class="tab-btn active" data-tab="split">分割设置</button>
                    <button class="tab-btn" data-tab="scoring">评分设置</button>
                    <button class="tab-btn" data-tab="context">上下文设置</button>
                </div>

                <div class="tab-content" id="split-tab">
                    <div class="config-section">
                        <h4>分割规则 <span class="help-icon" title="选择文本分割方式">?</span></h4>
                        <select id="split-mode">
                            <option value="sentence">按句子分割</option>
                            <option value="paragraph">按段落分割</option>
                            <option value="character">按字符分割</option>
                        </select>

                        <div id="sentence-config" class="split-config">
                            <label>句子数量：<input type="number" id="sentence-count" value="10"></label>
                            <label>最小长度：<input type="number" id="sentence-min" value="20"></label>
                            <label>最大长度：<input type="number" id="sentence-max" value="200"></label>
                            <label>智能缓冲：<input type="number" id="sentence-buffer" value="50"></label>
                        </div>

                        <div id="paragraph-config" class="split-config" style="display:none">
                            <label>段落数量：<input type="number" id="paragraph-count" value="3"></label>
                            <label>最小长度：<input type="number" id="paragraph-min" value="100"></label>
                            <label>最大长度：<input type="number" id="paragraph-max" value="1000"></label>
                            <label>智能缓冲：<input type="number" id="paragraph-buffer" value="200"></label>
                        </div>

                        <div id="character-config" class="split-config" style="display:none">
                            <label>字符数量：<input type="number" id="character-count" value="500"></label>
                            <label>缓冲区大小：<input type="number" id="character-buffer" value="50"></label>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="scoring-tab" style="display:none">
                    <div class="config-section">
                        <h4>评分设置 <span class="help-icon" title="设置优化评分规则">?</span></h4>
                        <label>最低接受分数：<input type="number" id="min-score" value="80"></label>
                        <label>最大迭代次数：<input type="number" id="max-iterations" value="3"></label>
                        <label>最小提升幅度：<input type="number" id="min-improvement" value="5"></label>

                        <h4>分数等级优化提示</h4>
                        <div class="score-rules">
                            <div class="score-rule">
                                <h5>60分以下</h5>
                                <textarea id="score-60-prompt" rows="3">${optimizerConfig.scoring.scoreRules[60].prompt}</textarea>
                            </div>
                            <div class="score-rule">
                                <h5>70分以下</h5>
                                <textarea id="score-70-prompt" rows="3">${optimizerConfig.scoring.scoreRules[70].prompt}</textarea>
                            </div>
                            <div class="score-rule">
                                <h5>80分以下</h5>
                                <textarea id="score-80-prompt" rows="3">${optimizerConfig.scoring.scoreRules[80].prompt}</textarea>
                            </div>
                            <div class="score-rule">
                                <h5>90分以下</h5>
                                <textarea id="score-90-prompt" rows="3">${optimizerConfig.scoring.scoreRules[90].prompt}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-content" id="context-tab" style="display:none">
                    <div class="config-section">
                        <h4>上下文设置 <span class="help-icon" title="设置优化时的上下文范围">?</span></h4>
                        <label>前文段数：<input type="number" id="prev-segments" value="2"></label>
                        <label>后文段数：<input type="number" id="next-segments" value="2"></label>
                        <label class="checkbox-label">
                            智能模式：<input type="checkbox" id="smart-mode" checked>
                            <span class="help-icon" title="自动调整上下文长度">?</span>
                        </label>
                        <label>最大上下文长度：<input type="number" id="max-context" value="1000"></label>
                    </div>
                </div>

                <div class="segments-container">
                    <h4>分段预览</h4>
                    <div id="segments-list" class="segments-list">
                        <div class="loading-indicator">加载中...</div>
                    </div>
                    
                    <div class="progress-section">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                        <div class="progress-text">0/0 段落已优化</div>
                    </div>
                </div>
            </div>

            <div class="panel-footer">
                <button id="batch-optimize" class="primary-btn">批量优化</button>
                <button id="start-optimize" class="primary-btn">开始优化</button>
                <button id="pause-optimize" class="secondary-btn" disabled>暂停</button>
                <button id="apply-changes" class="primary-btn" disabled>应用更改</button>
            </div>
        </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .optimizer-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            transition: opacity ${optimizerConfig.ui.transitionDuration}ms ease-in-out;
        }

        .panel-header {
            padding: 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .panel-body {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }

        .panel-footer {
            padding: 16px;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .config-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .tab-btn {
            padding: 8px 16px;
            border: none;
            background: none;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.3s ease;
        }

        .tab-btn.active {
            background: #007bff;
            color: white;
        }

        .config-section {
            margin-bottom: 24px;
        }

        .split-config {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 12px;
        }

        .help-icon {
            display: inline-block;
            width: 16px;
            height: 16px;
            line-height: 16px;
            text-align: center;
            border-radius: 50%;
            background: #f0f0f0;
            color: #666;
            font-size: 12px;
            cursor: help;
            margin-left: 4px;
        }

        .segments-list {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #eee;
            border-radius: 4px;
            margin-top: 12px;
        }

        .segment-item {
            padding: 12px;
            border-bottom: 1px solid #eee;
            transition: background-color 0.3s ease;
            cursor: pointer;
        }

        .segment-item:hover {
            background-color: #f8f9fa;
        }

        .segment-item:last-child {
            border-bottom: none;
        }

        .primary-btn, .secondary-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .primary-btn {
            background: #007bff;
            color: white;
        }

        .primary-btn:hover {
            background: #0056b3;
        }

        .secondary-btn {
            background: #e9ecef;
            color: #495057;
        }

        .secondary-btn:hover {
            background: #dee2e6;
        }

        .primary-btn:disabled, .secondary-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .close-btn {
            border: none;
            background: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
            padding: 0 8px;
        }

        .close-btn:hover {
            color: #333;
        }

        .loading-indicator {
            text-align: center;
            padding: 20px;
            color: #666;
        }
    `;

    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', panel);
    uiState.panel = document.getElementById('optimizer-panel');
}
const optimizerConfig = {
    ui: {
        width: 1000,
        height: 600,
        previewLength: 100,
        loadingDelay: 300, // 添加加载延迟配置
        transitionDuration: 200 // 添加过渡动画时长配置
    },
    
    // 默认分割规则
    splitRules: {
        mode: 'sentence',
        sentence: {
            count: 10,
            minLength: 20,
            maxLength: 200,
            smartBuffer: 50
        },
        paragraph: {
            count: 3,
            minLength: 100,
            maxLength: 1000,
            smartBuffer: 200
        },
        character: {
            count: 500,
            bufferSize: 50
        }
    },

    scoring: {
        minAcceptableScore: 80,
        maxIterations: 3,
        minImprovement: 5,
        scoreRules: {
            60: {
                focus: ' ',
                secondary: ' ',
                prompt: '重点关注基础语言表达，禁止无用的环境描写、心理活动或细节动作,确保剧情文字流畅自然，避免生硬和重复、以及大量的说教、总结'
            },
            70: {
                focus: ' ',
                secondary: ' ',
                prompt: '尽量减少环境描写，保持情节紧凑。重点加强情节发展的自然过渡，对话自然度、情节转场顺畅度，避免机械感,角色互动自然，无浮夸描写, 对话丰富且实在，避免冗余修辞。对话需要适度克制并以叙述性表达为主，避免对话频繁交错形成一问一答的结构，但是不可满篇没有对话'
            },
            80: {
                focus: ' ',
                secondary: ' ',
                prompt: '禁止无用的环境描写、心理活动或细节动作，避免冗余修辞，增加的内容应当紧扣主题且信息密度高,尽量减少环境描写，保持情节紧凑。 对话丰富且实在，避免冗余修辞。对话需要适度克制并以叙述性表达为主，避免对话频繁交错形成一问一答的结构，但是不可满篇没有对话'
            },
            90: {
                focus: ' ',
                secondary: ' ',
                prompt: '禁止无用的环境描写、心理活动或细节动作，避免冗余修辞，增加的内容应当紧扣主题且信息密度高,尽量减少环境描写，保持情节紧凑。 对话丰富且实在，避免冗余修辞。对话需要适度克制并以叙述性表达为主，避免对话频繁交错形成一问一答的结构，但是不可满篇没有对话'
            }
        }
    },

    context: {
        prevSegments: 2,
        nextSegments: 2,
        smartMode: true,
        maxContextLength: 1000
    }
};

// UI状态管理
const uiState = {
    panel: null,
    resultPanel: null,
    previewPanel: null,
    currentSegment: 0,
    segments: [],
    optimizationHistory: [],
    isPaused: false,
    isLoading: false
};

// 事件状态管理 
const eventState = {
    targetTextArea: null,
    optimizationType: null,
    batchMode: false,
    optimizationQueue: [],
    currentOptimization: null,
    lastUpdateTime: 0
};

// 添加加载效果
function showLoading(element) {
    uiState.isLoading = true;
    element.classList.add('loading');
    element.disabled = true;
}

function hideLoading(element) {
    setTimeout(() => {
        uiState.isLoading = false;
        element.classList.remove('loading');
        element.disabled = false;
    }, optimizerConfig.ui.loadingDelay);
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 优化UI更新函数
const debouncedUpdateUI = debounce(() => {
    if (Date.now() - eventState.lastUpdateTime > 100) {
        updateSegmentsList();
        eventState.lastUpdateTime = Date.now();
    }
}, 100);

// 从UI更新配置
function updateConfigFromUI() {
    const mode = document.getElementById('split-mode').value;
    optimizerConfig.splitRules.mode = mode;

    try {
        // 更新分割规则
        const updateRules = (ruleType, prefix) => {
            optimizerConfig.splitRules[ruleType] = {
                count: parseInt(document.getElementById(`${prefix}-count`)?.value) || optimizerConfig.splitRules[ruleType].count,
                minLength: parseInt(document.getElementById(`${prefix}-min`)?.value) || optimizerConfig.splitRules[ruleType].minLength,
                maxLength: parseInt(document.getElementById(`${prefix}-max`)?.value) || optimizerConfig.splitRules[ruleType].maxLength,
                smartBuffer: parseInt(document.getElementById(`${prefix}-buffer`)?.value) || optimizerConfig.splitRules[ruleType].smartBuffer
            };
        };

        switch (mode) {
            case 'sentence':
                updateRules('sentence', 'sentence');
                break;
            case 'paragraph':
                updateRules('paragraph', 'paragraph');
                break;
            case 'character':
                optimizerConfig.splitRules.character = {
                    count: parseInt(document.getElementById('character-count')?.value) || optimizerConfig.splitRules.character.count,
                    bufferSize: parseInt(document.getElementById('character-buffer')?.value) || optimizerConfig.splitRules.character.bufferSize
                };
                break;
        }

        // 更新评分设置
        Object.assign(optimizerConfig.scoring, {
            minAcceptableScore: parseInt(document.getElementById('min-score')?.value) || optimizerConfig.scoring.minAcceptableScore,
            maxIterations: parseInt(document.getElementById('max-iterations')?.value) || optimizerConfig.scoring.maxIterations,
            minImprovement: parseInt(document.getElementById('min-improvement')?.value) || optimizerConfig.scoring.minImprovement
        });

        // 安全地更新评分规则提示词
if (!optimizerConfig.scoring.scoreRules) {
    optimizerConfig.scoring.scoreRules = {};
}

// 然后安全地更新评分规则提示词
[60, 70, 80, 90].forEach(score => {
    const promptElement = document.getElementById(`score-${score}-prompt`);
    if (promptElement) {
        // 如果规则不存在，先创建一个基本对象
        if (!optimizerConfig.scoring.scoreRules[score]) {
            optimizerConfig.scoring.scoreRules[score] = {
                focus: '',
                secondary: '',
                prompt: ''
            };
        }
        // 更新提示词
        optimizerConfig.scoring.scoreRules[score].prompt = promptElement.value;
    }
});
        // 更新上下文设置
        optimizerConfig.context = {
            prevSegments: parseInt(document.getElementById('prev-segments')?.value) || optimizerConfig.context.prevSegments,
            nextSegments: parseInt(document.getElementById('next-segments')?.value) || optimizerConfig.context.nextSegments,
            smartMode: document.getElementById('smart-mode')?.checked ?? optimizerConfig.context.smartMode,
            maxContextLength: parseInt(document.getElementById('max-context')?.value) || optimizerConfig.context.maxContextLength
        };

        // 如果有当前文本，重新分割并更新UI
        if (eventState.targetTextArea) {
            uiState.segments = splitText(eventState.targetTextArea.value, mode);
            debouncedUpdateUI();
        }
    } catch (error) {
        console.error('配置更新错误:', error);
        showError('配置更新失败，请检查输入值是否正确');
    }
}

// 显示错误提示

function showError(message) {
    if (!document || !document.body) {
        console.error('DOM未准备好:', message);
        return;
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    setTimeout(() => {
        if (document.body.contains(errorDiv)) {
            errorDiv.remove();
        }
    }, 30000);
}


// 优化预览面板显示逻辑
function showPreview(event) {
    const index = parseInt(event.currentTarget.getAttribute('data-index'));
    const segment = uiState.segments[index];
    const rect = event.currentTarget.getBoundingClientRect();
    
    // 计算最佳显示位置
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = rect.right + 10;
    let top = rect.top;
    
    // 检查右侧空间
    if (left + 300 > viewportWidth) {
        left = rect.left - 310;
    }
    
    // 检查底部空间
    if (top + uiState.previewPanel.offsetHeight > viewportHeight) {
        top = viewportHeight - uiState.previewPanel.offsetHeight - 10;
    }
    
    // 应用位置和显示预览
    Object.assign(uiState.previewPanel.style, {
        display: 'block',
        top: `${Math.max(10, top)}px`,
        left: `${Math.max(10, left)}px`,
        opacity: '0'
    });
    
    requestAnimationFrame(() => {
        uiState.previewPanel.style.opacity = '1';
        uiState.previewPanel.querySelector('.preview-content').textContent = segment;
    });
}



// 文本分割函数
function splitText(text, mode) {
    const rules = optimizerConfig.splitRules[mode];
    let segments = [];
    
    switch(mode) {
        case 'sentence':
            segments = splitBySentence(text, rules);
            break;
        case 'paragraph':
            segments = splitByParagraph(text, rules);
            break;
        case 'character':
            segments = splitByCharacter(text, rules);
            break;
    }
    
    return segments;
}

// 按句子分割
function splitBySentence(text, rules) {
    const sentences = text.match(/[^。！？.!?]+[。！？.!?]/g) || [];
    return smartSplit(sentences, rules);
}

// 按段落分割
function splitByParagraph(text, rules) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    return smartSplit(paragraphs, rules);
}

// 按字符分割
function splitByCharacter(text, rules) {
    const segments = [];
    let start = 0;
    
    while (start < text.length) {
        let end = start + rules.count;
        
        // 寻找自然断点
        while (
            end < text.length && 
            end - start < rules.count + rules.bufferSize && 
            !/[。！？.!?\n]/.test(text[end])
        ) {
            end++;
        }
        
        segments.push(text.substring(start, end));
        start = end;
    }
    
    return segments;
}

// 智能分割
function smartSplit(items, rules) {
    const segments = [];
    let current = [];
    let currentLength = 0;
    
    for (const item of items) {
        const length = item.length;
        
        if (length >= rules.minLength && length <= rules.maxLength) {
            current.push(item);
            currentLength += length;
            
            if (current.length >= rules.count || currentLength >= rules.maxLength) {
                segments.push(current.join(rules.mode === 'paragraph' ? '\n\n' : ''));
                current = [];
                currentLength = 0;
            }
        }
    }
    
    if (current.length > 0) {
        segments.push(current.join(rules.mode === 'paragraph' ? '\n\n' : ''));
    }
    
    return segments;
}

// 获取优化上下文
function getContext(segments, currentIndex) {
    const { prevSegments, nextSegments, smartMode, maxContextLength } = optimizerConfig.context;
    let prevText = '', nextText = '';

    if (smartMode) {
        // 智能模式：基于内容长度调整上下文
        let currentLength = 0;
        let i = currentIndex - 1;
        
        while (i >= 0 && currentLength < maxContextLength) {
            prevText = segments[i] + '\n' + prevText;
            currentLength += segments[i].length;
            i--;
        }

        currentLength = 0;
        i = currentIndex + 1;
        
        while (i < segments.length && currentLength < maxContextLength) {
            nextText += segments[i] + '\n';
            currentLength += segments[i].length;
            i++;
        }
    } else {
        // 固定模式：使用配置的段落数
        const prevList = segments.slice(
            Math.max(0, currentIndex - prevSegments),
            currentIndex
        );
        const nextList = segments.slice(
            currentIndex + 1,
            currentIndex + 1 + nextSegments
        );
        
        prevText = prevList.join('\n');
        nextText = nextList.join('\n');
    }

    return { prevText, nextText };
}

// 构建AI提示词
function buildPrompt(data, iteration, optimizationHistory) {
    const basePrompt = `
基于如下信息对小说内容进行优化：
如果你识别为是小说章节纲要，那么就往章节纲要方面去优化
如果你识别为是小说正文片段，那么就往正文片段方面去优化
两个千万不能混杂！！！
如果出现大量机械性AI语句、冗余修辞、大量的环境环境直接扣40分。
背景信息：${data.background || ''}
角色设定：${data.characters || ''}

上文内容：
${data.prevText}

需要优化内容：
${data.currentText}

下文内容：
${data.nextText}

优化要求：
0. 只对需要优化内容的文本进行优化，切勿对上文内容或者下文内容进行优化
1. 确保与上下文的流畅连接
2. 维持一致性
重点：${data.style || ''}

请按照以下格式返回结果：
【**评分**】对当前内容的综合评分(0-100)
【**评分说明**】具体评分理由
【**优化开始**】优化后的内容【**优化结束**】
【**优化说明**】修改要点说明`;

    if (iteration > 0 && optimizationHistory.length > 0) {
        const lastResult = optimizationHistory[optimizationHistory.length - 1];
        const scoreLevel = getScoreLevel(lastResult.score);
        
        return `${basePrompt}

上次优化结果：
评分：${lastResult.score}
内容：${lastResult.content}

请特别注意改进：
${optimizerConfig.scoring.scoreRules[scoreLevel].focus}
${optimizerConfig.scoring.scoreRules[scoreLevel].secondary}
${optimizerConfig.scoring.scoreRules[scoreLevel].prompt}`;
    }

    return basePrompt;
}

// 获取评分等级
function getScoreLevel(score) {
    const levels = [90, 80, 70, 60];
    return levels.find(level => score >= level) || 60;
}

// 调用AI接口
async function callAI(prompt) {
    try {
        const response = await fetch('gen2', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt})
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';

        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            result += decoder.decode(value, {stream: true});
        }

        return result;
    } catch (error) {
        throw new Error(`AI API错误: ${error.message}`);
    }
}

// 解析AI响应
function parseAIResponse(response) {
    try {
        const scoreMatch = response.match(/【\*\*评分\*\*】(\d+)/);
        const contentMatch = response.match(/【\*\*优化开始\*\*】([\s\S]*?)【\*\*优化结束\*\*】/);
        const reasonMatch = response.match(/【\*\*评分说明\*\*】([\s\S]*?)【\*\*优化开始\*\*】/);
        const changeMatch = response.match(/【\*\*优化说明\*\*】([\s\S]*?)$/);

        if (!scoreMatch || !contentMatch) {
            throw new Error('无效的AI响应格式');
        }

        return {
            score: parseInt(scoreMatch[1]),
            content: contentMatch[1].trim(),
            reason: reasonMatch ? reasonMatch[1].trim() : '',
            changes: changeMatch ? changeMatch[1].trim() : ''
        };
    } catch (error) {
        throw new Error(`解析AI响应失败: ${error.message}`);
    }
}

// 优化单个段落
// 修改优化过程以支持流式输出
// 改进的解析响应函数
function parseAIResponse(response) {
    try {
        // 确保响应不为空
        if (!response || typeof response !== 'string') {
            throw new Error('无效的响应格式');
        }

        // 使用更严格的正则表达式来匹配内容
        const scoreMatch = response.match(/【\*\*评分\*\*】\s*(\d+)/);
        const contentMatch = response.match(/【\*\*优化开始\*\*】\s*([\s\S]*?)\s*【\*\*优化结束\*\*】/);
        const reasonMatch = response.match(/【\*\*评分说明\*\*】\s*([\s\S]*?)\s*(?=【\*\*优化开始\*\*】)/);
        const changeMatch = response.match(/【\*\*优化说明\*\*】\s*([\s\S]*?)\s*(?=$|【\*\*)/);

        // 检查必要的字段
        if (!scoreMatch || !contentMatch) {
            console.error('解析失败的响应:', response);
            throw new Error('响应格式不完整，缺少必要的评分或内容字段');
        }

        const score = parseInt(scoreMatch[1]);
        if (isNaN(score) || score < 0 || score > 100) {
            throw new Error('无效的评分值');
        }

        return {
            score: score,
            content: contentMatch[1].trim(),
            reason: reasonMatch ? reasonMatch[1].trim() : '无评分说明',
            changes: changeMatch ? changeMatch[1].trim() : '无修改说明'
        };
    } catch (error) {
        console.error('解析AI响应时出错:', error);
        console.error('原始响应:', response);
        throw new Error(`解析响应失败: ${error.message}`);
    }
}

// 修改后的optimizeSegment函数中的相关部分
async function optimizeSegment(index) {
    try {
        showLoading(document.querySelector(`[data-index="${index}"]`));
        updateSegmentStatus(index, 'optimizing');
        eventState.currentOptimization = { index, iterations: 0 };

        const resultPanel = uiState.resultPanel;
        resultPanel.style.display = 'flex';
        resultPanel.style.opacity = '1';
        
        // 初始化流式输出区域
        const contentArea = resultPanel.querySelector('.content-comparison');
        const scoreArea = resultPanel.querySelector('.score-value');
        const reasonArea = resultPanel.querySelector('.score-reason');
        const changesArea = resultPanel.querySelector('.changes-value');
        const iterationInfo = resultPanel.querySelector('.current-iteration');
        
        let currentContent = uiState.segments[index];
        let iteration = 0;
        const maxIterations = optimizerConfig.scoring.maxIterations;
        const minScore = optimizerConfig.scoring.minAcceptableScore;
        
        while (iteration < maxIterations) {
            iteration++;
            if (iterationInfo) {
                iterationInfo.textContent = `迭代次数: ${iteration}`;
            }
            
            contentArea.textContent = '正在生成优化内容...';
            scoreArea.textContent = '--';
            reasonArea.textContent = '分析中...';
            changesArea.textContent = '等待中...';

            const context = getContext(uiState.segments, index);
            const prompt = buildPrompt({
                currentText: currentContent,
                ...context,
                background: $('#background').val(),
                characters: $('#characters').val(),
                style: $('#style').val()
            }, iteration - 1, uiState.optimizationHistory);

            try {
                const response = await fetch('gen2', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({prompt})
                });

                if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let completeResponse = '';
                let buffer = '';
                let currentSection = '';
                let tempContent = '';
                let tempScore = '';
                let tempReason = '';
                let tempChanges = '';
                
                while (true) {
                    const {value, done} = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, {stream: true});
                    completeResponse += chunk;
                    buffer += chunk;
                    
                    // 处理流式输出
                    while (buffer.includes('【**')) {
                        const startIndex = buffer.indexOf('【**');
                        const endIndex = buffer.indexOf('**】', startIndex);
                        
                        if (endIndex === -1) break;
                        
                        const marker = buffer.substring(startIndex + 3, endIndex);
                        const nextStart = buffer.indexOf('【**', endIndex);
                        const content = buffer.substring(endIndex + 3, nextStart === -1 ? buffer.length : nextStart);
                        
                        // 临时存储所有内容
                        switch (marker) {
                            case '评分':
                                tempScore = content;
                                scoreArea.textContent = content + '（评估中）';
                                break;
                            case '评分说明':
                                tempReason = content;
                                reasonArea.textContent = content;
                                break;
                            case '优化开始':
                                contentArea.textContent = '';
                                currentSection = '优化内容';
                                break;
                            case '优化结束':
                                tempContent = content;
                                contentArea.textContent = content;
                                break;
                            case '优化说明':
                                tempChanges = content;
                                changesArea.textContent = content;
                                break;
                        }
                        
                        buffer = buffer.substring(nextStart === -1 ? buffer.length : nextStart);
                    }
                    
                    if (currentSection === '优化内容' && buffer.length > 0) {
                        contentArea.textContent += buffer;
                        buffer = '';
                    }
                }

                // 完整响应接收完毕后，解析最终结果
                const result = parseAIResponse(completeResponse);
                
                // 更新最终显示
                scoreArea.textContent = result.score;
                reasonArea.textContent = result.reason;
                contentArea.textContent = result.content;
                changesArea.textContent = result.changes;
                
                // 更新当前内容为优化后的内容
                currentContent = result.content;

                // 打印最终结果到控制台
                console.log(`\n========== 段落 ${index + 1} 第 ${iteration} 次迭代结果 ==========`);
		console.log(`提示词:${prompt}`);
	        console.log(`最终评分: ${result.score}`);
                console.log('最终内容:');
                console.log(result.content);
                console.log('评分说明:', result.reason);
                console.log('修改说明:', result.changes);
                console.log('===============================================\n');

                // 保存优化历史
                uiState.optimizationHistory.push({
                    segmentIndex: index,
                    iteration: iteration,
                    ...result
                });

                // 检查是否达到目标分数
                if (result.score >= minScore) {
                    console.log(`\n✅ 段落 ${index + 1} 已达到目标分数 ${minScore}，停止迭代`);
                    return result;
                }

                // 如果是最后一次迭代，也返回结果
                if (iteration === maxIterations) {
                    console.log(`\n⚠️ 段落 ${index + 1} 达到最大迭代次数 ${maxIterations}，停止迭代`);
                    return result;
                }

            } catch (error) {
                throw new Error(`AI API错误: ${error.message}`);
            }
        }

    } catch (error) {
        console.error(`段落 ${index + 1} 优化失败:`, error);
        updateSegmentStatus(index, 'error');
        hideLoading(document.querySelector(`[data-index="${index}"]`));
        showError(`段落 ${index + 1} 优化失败: ${error.message}`);
        throw error;
    } finally {
        hideLoading(document.querySelector(`[data-index="${index}"]`));
        updateSegmentStatus(index, 'optimized');
    }
}

// 更新段落状态
function updateSegmentStatus(index, status) {
    const segmentElements = document.querySelectorAll('.segment-item');
    if (segmentElements[index]) {
        const statusElement = segmentElements[index].querySelector('.segment-status');
        const statusMap = {
            optimizing: '优化中...',
            optimized: '已优化',
            error: '优化失败'
        };
        
        segmentElements[index].className = `segment-item ${status}`;
        if (statusElement) {
            statusElement.textContent = statusMap[status] || status;
        }
    }
}

// 显示优化结果
// 显示优化结果
function showResult(result) {
    if (!result || !uiState.resultPanel) return;
    
    const panel = uiState.resultPanel;
    
    // 确保面板可见
    panel.style.display = 'flex';
    
    // 立即更新内容
    requestAnimationFrame(() => {
        const scoreElement = panel.querySelector('.score-value');
        const reasonElement = panel.querySelector('.score-reason');
        const contentElement = panel.querySelector('.content-comparison');
        const changesElement = panel.querySelector('.changes-value');
        
        if (scoreElement) scoreElement.textContent = result.score || '0';
        if (reasonElement) reasonElement.textContent = result.reason || '';
        if (contentElement) contentElement.textContent = result.content || '';
        if (changesElement) changesElement.textContent = result.changes || '';
        
        // 更新迭代信息
        updateIterationInfo(result.score);
        
        // 设置面板可见
        panel.style.opacity = '1';
    });
}

// 显示最终结果预览
function showFinalPreview(text) {
    if (!text) return;
    
    const previewWindow = window.open('', '_blank', `width=${optimizerConfig.ui.width}px,height=${optimizerConfig.ui.height}px`);
    previewWindow.document.write(`
        <html>
            <head>
                <title>优化结果预览</title>
                <style>
                    body {
                        padding: 20px;
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                    }
                    .preview-text {
                        white-space: pre-wrap;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    .success-message {
                        color: #28a745;
                        text-align: center;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="success-message">优化完成！</div>
                <div class="preview-text">${text}</div>
            </body>
        </html>
    `);
}

// 为文本区域添加优化按钮
function addOptimizerButtons() {
    // 为大纲添加按钮
    const outlineElement = document.querySelector('#outline');
    if (outlineElement) {
        addButtonToElement('#outline', 'outline', 'AI智能优化大纲');
    }

    // 为章节添加按钮
    document.querySelectorAll('.chapter-outline, .chapter-content-text').forEach(element => {
        const type = element.classList.contains('chapter-outline') ? 'chapter' : 'content';
        addButtonToElement(element, type, `AI智能优化${type === 'chapter' ? '大纲' : '正文'}`);
    });
}

// 为元素添加优化按钮
function addButtonToElement(element, type, buttonText) {
    const $element = $(element);
    if (!$element.next('.optimizer-buttons').length) {
        const buttonHtml = `
            <div class="optimizer-buttons">
                <button onclick="showOptimizer(this, '${type}')" class="ai-optimize-btn">
                    ${buttonText}
                </button>
            </div>
        `;
        $element.after(buttonHtml);
    }
}

// 设置类型特定的配置
function setTypeSpecificConfig(type) {
    const configs = {
        outline: {
            splitRules: {
                mode: 'paragraph',
                paragraph: {
                    count: 2,
                    minLength: 100,
                    maxLength: 500,
                    smartBuffer: 100
                }
            },
            scoring: {
                minAcceptableScore: 85
            }
        },
        chapter: {
            splitRules: {
                mode: 'paragraph',
                paragraph: {
                    count: 3,
                    minLength: 150,
                    maxLength: 800,
                    smartBuffer: 200
                }
            },
            scoring: {
                minAcceptableScore: 80
            }
        },
        content: {
            splitRules: {
                mode: 'sentence',
                sentence: {
                    count: 15,
                    minLength: 20,
                    maxLength: 200,
                    smartBuffer: 50
                }
            },
            scoring: {
                minAcceptableScore: 85
            }
        }
    };

    Object.assign(optimizerConfig, configs[type]);
    updateUIFromConfig();
}


// 从配置更新UI（继续）
function updateUIFromConfig() {
    const mode = optimizerConfig.splitRules.mode;
    const modeSelect = document.getElementById('split-mode');
    if (modeSelect) modeSelect.value = mode;

    // 更新分割规则输入
    const updateInputs = (prefix, rules) => {
        Object.entries(rules).forEach(([key, value]) => {
            const input = document.getElementById(`${prefix}-${key}`);
            if (input) input.value = value;
        });
    };

    // 更新各模式的配置
    const configs = {
        sentence: document.getElementById('sentence-config'),
        paragraph: document.getElementById('paragraph-config'),
        character: document.getElementById('character-config')
    };

    // 隐藏所有配置面板
    Object.values(configs).forEach(config => {
        if (config) config.style.display = 'none';
    });

    // 显示当前模式的配置
    if (configs[mode]) {
        configs[mode].style.display = 'block';
        updateInputs(mode, optimizerConfig.splitRules[mode]);
    }

    // 更新评分设置
    const scoreInputs = {
        'min-score': optimizerConfig.scoring.minAcceptableScore,
        'max-iterations': optimizerConfig.scoring.maxIterations,
        'min-improvement': optimizerConfig.scoring.minImprovement
    };

    Object.entries(scoreInputs).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    });

    // 更新上下文设置
    const contextInputs = {
        'prev-segments': optimizerConfig.context.prevSegments,
        'next-segments': optimizerConfig.context.nextSegments,
        'smart-mode': optimizerConfig.context.smartMode,
        'max-context': optimizerConfig.context.maxContextLength
    };

    Object.entries(contextInputs).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = value;
            } else {
                input.value = value;
            }
        }
    });
}

// 初始化事件监听
function initEventListeners() {
    // 配置面板事件
    const splitModeSelect = document.getElementById('split-mode');
    if (splitModeSelect) {
        splitModeSelect.addEventListener('change', handleModeChange);
    }

    const saveConfigBtn = document.getElementById('save-config');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', handleSaveConfig);
    }

    // 标签页切换事件
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', handleTabChange);
    });

    // 优化控制按钮事件
    const controlButtons = {
        'batch-optimize': startBatchOptimization,
        'start-optimize': startOptimization,
        'pause-optimize': pauseOptimization,
        'apply-changes': applyChanges
    };

    Object.entries(controlButtons).forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', handler);
        }
    });

    // 结果面板按钮事件
    const resultPanel = document.querySelector('#result-panel');
    if (resultPanel) {
        resultPanel.querySelector('.accept-btn')?.addEventListener('click', acceptOptimization);
        resultPanel.querySelector('.reject-btn')?.addEventListener('click', rejectOptimization);
    }

    // 关闭按钮事件
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const panel = e.target.closest('.optimizer-panel, .result-panel');
            if (panel) {
                panel.style.opacity = '0';
                setTimeout(() => {
                    panel.style.display = 'none';
                }, optimizerConfig.ui.transitionDuration);
            }
        });
    });

    // 配置输入事件
    document.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('change', debounce(updateConfigFromUI, 300));
    });

    // 添加键盘快捷键
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// 处理键盘快捷键
function handleKeyboardShortcuts(e) {
    // Esc键关闭面板
    if (e.key === 'Escape') {
        const panels = document.querySelectorAll('.optimizer-panel, .result-panel');
        panels.forEach(panel => {
            if (panel.style.display !== 'none') {
                panel.style.opacity = '0';
                setTimeout(() => {
                    panel.style.display = 'none';
                }, optimizerConfig.ui.transitionDuration);
            }
        });
    }
    
    // Ctrl + S 保存配置
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveConfig();
    }
}

// 批量优化处理
let batchProcessing = false;
async function startBatchOptimization() {
    if (batchProcessing || !document) return;
    
    const batchButton = document.getElementById('batch-optimize');
    const pauseButton = document.getElementById('pause-optimize');
    
    if (!batchButton || !pauseButton) {
        showError('找不到必要的UI元素，请刷新页面重试');
        return;
    }
    
    try {
        batchProcessing = true;
        showLoading(batchButton);
        batchButton.disabled = true;
        pauseButton.disabled = false;

        eventState.batchMode = true;
        // 确保segments存在且有效
        if (!Array.isArray(uiState.segments) || uiState.segments.length === 0) {
            throw new Error('没有可优化的内容段落');
        }
        
        eventState.optimizationQueue = Array.from(
            { length: uiState.segments.length }, 
            (_, i) => i
        );
        
        // 创建进度跟踪
        const totalSegments = eventState.optimizationQueue.length;
        let completedSegments = 0;

        while (eventState.optimizationQueue.length > 0 && !uiState.isPaused) {
            const index = eventState.optimizationQueue.shift();
            try {
                // 进行单段优化
                await optimizeSegment(index);
                completedSegments++;
                
                // 安全地更新进度
                const progressElement = document.querySelector('.progress-fill');
                const progressText = document.querySelector('.progress-text');
                
                if (progressElement) {
                    const percentage = (completedSegments / totalSegments) * 100;
                    progressElement.style.width = `${percentage}%`;
                }
                
                if (progressText) {
                    progressText.textContent = `${completedSegments}/${totalSegments} 段落已优化`;
                }

            } catch (error) {
                console.error(`处理段落 ${index} 时出错:`, error);
                showError(`段落 ${index + 1} 优化失败，继续处理下一段`);
                
                // 更新段落状态为错误
                const segmentElement = document.querySelector(`[data-index="${index}"]`);
                if (segmentElement) {
                    segmentElement.classList.add('error');
                    const statusElement = segmentElement.querySelector('.segment-status');
                    if (statusElement) {
                        statusElement.textContent = '优化失败';
                    }
                }
                
                continue;
            }

            // 添加延迟以避免API限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 完成处理
        if (!uiState.isPaused) {
            const applyButton = document.getElementById('apply-changes');
            if (applyButton) {
                applyButton.disabled = false;
            }
            showSuccess('批量优化完成！');
        }

    } catch (error) {
        console.error('批量优化过程中出错:', error);
        showError(error.message);
    } finally {
        batchProcessing = false;
        if (batchButton && pauseButton) {
            hideLoading(batchButton);
            batchButton.disabled = false;
            pauseButton.disabled = true;
        }
    }
}



// 优化队列处理
async function processOptimizationQueue() {
    const totalSegments = eventState.optimizationQueue.length;
    let completedSegments = 0;

    while (eventState.optimizationQueue.length > 0 && !uiState.isPaused) {
        const index = eventState.optimizationQueue.shift();
        try {
            await optimizeSegment(index);
            completedSegments++;
            updateProgress(completedSegments, totalSegments);
        } catch (error) {
            console.error(`处理段落 ${index} 时出错:`, error);
            showError(`段落 ${index + 1} 优化失败，跳过继续处理`);
            continue;
        }

        // 添加延迟以避免API限制
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (eventState.optimizationQueue.length === 0) {
        finishOptimization();
    }
}

// 完成优化
function finishOptimization() {
    document.getElementById('batch-optimize').disabled = false;
    document.getElementById('pause-optimize').disabled = true;
    document.getElementById('apply-changes').disabled = false;
    uiState.isPaused = false;

    if (eventState.batchMode) {
        showFinalPreview(uiState.segments.join('\n\n'));
        showSuccess('批量优化完成！');
    }
}

// 显示成功提示
function showSuccess(message) {
    if (!document || !document.body) {
        console.error('DOM未准备好:', message);
        return;
    }

    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);

    setTimeout(() => {
        if (document.body.contains(successDiv)) {
            successDiv.remove();
        }
    }, 3000);
}



// 更新进度条
function updateProgress(completed, total) {
    const percentage = (completed / total) * 100;
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${completed}/${total} 段落已优化`;
    }
}

// 添加样式
function addStyles() {
    const styles = `
        .success-message {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 9999;
            transition: opacity 0.5s ease;
        }
        
        .progress-bar {
            height: 4px;
            background: #eee;
            border-radius: 2px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: #007bff;
            transition: width 0.3s ease;
        }
        
        .optimized {
            background: #e8f5e9;
        }
        
        .optimizing {
            background: #fff3e0;
        }
        
        .error {
            background: #ffebee;
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

// 监听DOM变化，动态添加优化按钮
function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && 
                        (node.classList.contains('chapter-outline') || 
                         node.classList.contains('chapter-content-text'))) {
                        const type = node.classList.contains('chapter-outline') ? 'chapter' : 'content';
                        addButtonToElement(node, type, `AI智能优化${type === 'chapter' ? '大纲' : '正文'}`);
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 处理模式切换
function handleModeChange(e) {
    const configs = document.querySelectorAll('.split-config');
    configs.forEach(config => config.style.display = 'none');
    document.getElementById(`${e.target.value}-config`).style.display = 'block';
    updateConfigFromUI();
    debouncedUpdateUI();  // 添加即时更新UI
}

// 处理标签页切换
function handleTabChange(e) {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => tab.classList.remove('active'));
    e.target.classList.add('active');

    contents.forEach(content => content.style.display = 'none');
    document.getElementById(`${e.target.dataset.tab}-tab`).style.display = 'block';
}

// 保存配置
function saveConfig() {
    try {
        // 创建一个用于保存的配置副本
        const configToSave = {
            ui: { ...optimizerConfig.ui },
            splitRules: { ...optimizerConfig.splitRules },
            scoring: {
                minAcceptableScore: optimizerConfig.scoring.minAcceptableScore,
                maxIterations: optimizerConfig.scoring.maxIterations,
                minImprovement: optimizerConfig.scoring.minImprovement,
                scoreRules: {}
            },
            context: { ...optimizerConfig.context }
        };

        // 复制评分规则
        Object.keys(optimizerConfig.scoring.scoreRules).forEach(score => {
            configToSave.scoring.scoreRules[score] = {
                focus: optimizerConfig.scoring.scoreRules[score].focus || '',
                secondary: optimizerConfig.scoring.scoreRules[score].secondary || '',
                prompt: optimizerConfig.scoring.scoreRules[score].prompt || ''
            };
        });

        // 保存到 localStorage
        localStorage.setItem('optimizerConfig', JSON.stringify(configToSave));
        return true;
    } catch (error) {
        console.error('保存配置失败:', error);
        showError('保存配置失败：' + error.message);
        return false;
    }
}
// 添加handleSaveConfig函数定义
function handleSaveConfig() {
    try {
        // 首先更新配置
        updateConfigFromUI();
        
        // 保存配置
        if (saveConfig()) {
            // 如果保存成功，显示成功提示
            showSuccess('配置已成功保存');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        showError('保存配置失败：' + error.message);
    }
}
function loadConfig() {
    try {
        const savedConfig = localStorage.getItem('optimizerConfig');
        if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            Object.assign(optimizerConfig, parsed);
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showError('加载配置失败：' + error.message);
    }
}
// 暂停优化
function pauseOptimization() {
    uiState.isPaused = true;
    document.getElementById('pause-optimize').disabled = true;
    document.getElementById('start-optimize').disabled = false;

    if (eventState.batchMode) {
        document.getElementById('batch-optimize').disabled = false;
    }
    
    showSuccess('优化已暂停');
}

// 接受优化结果
function acceptOptimization() {
    const { index } = eventState.currentOptimization;
    const result = uiState.optimizationHistory[uiState.optimizationHistory.length - 1];

    uiState.segments[index] = result.content;
    updateSegmentsList();
    
    uiState.resultPanel.style.opacity = '0';
    setTimeout(() => {
        uiState.resultPanel.style.display = 'none';
    }, optimizerConfig.ui.transitionDuration);

    if (eventState.batchMode) {
        processOptimizationQueue();
    } else {
        document.getElementById('apply-changes').disabled = false;
    }
    
    showSuccess('已接受优化结果');
}

// 拒绝优化结果并重新生成
async function rejectOptimization() {
    const { index } = eventState.currentOptimization;
    
    try {
        // 显示加载状态
        showLoading(document.querySelector(`[data-index="${index}"]`));
        updateSegmentStatus(index, 'optimizing');

        // 清空当前段落的优化历史
        uiState.optimizationHistory = uiState.optimizationHistory.filter(
            h => h.segmentIndex !== index
        );

        if (eventState.batchMode) {
            eventState.optimizationQueue.unshift(index);
            // 在批量模式下，将当前段落重新加入队列
            uiState.resultPanel.style.opacity = '0';
            setTimeout(() => {
                uiState.resultPanel.style.display = 'none';
                processOptimizationQueue();
            }, optimizerConfig.ui.transitionDuration);
        } else {
            // 在单段落模式下，直接重新优化
            try {
                const result = await optimizeSegment(index);
                
                // 确保结果面板可见
                const resultPanel = uiState.resultPanel;
                resultPanel.style.display = 'flex';
                resultPanel.style.opacity = '1';

                // 立即更新结果面板内容
                const scoreElement = resultPanel.querySelector('.score-value');
                const reasonElement = resultPanel.querySelector('.score-reason');
                const contentElement = resultPanel.querySelector('.content-comparison');
                const changesElement = resultPanel.querySelector('.changes-value');

                if (scoreElement) scoreElement.textContent = result.score || '0';
                if (reasonElement) reasonElement.textContent = result.reason || '';
                if (contentElement) contentElement.textContent = result.content || '';
                if (changesElement) changesElement.textContent = result.changes || '';

                // 更新迭代信息
                updateIterationInfo(result.score);
                
                // 更新段落状态
                updateSegmentStatus(index, 'optimized');
            } catch (error) {
                console.error('重新优化失败:', error);
                showError(`重新优化失败: ${error.message}`);
                updateSegmentStatus(index, 'error');
            }
        }
    } catch (error) {
        console.error('重新优化过程出错:', error);
        showError('重新优化失败，请重试');
        updateSegmentStatus(index, 'error');
    } finally {
        hideLoading(document.querySelector(`[data-index="${index}"]`));
    }
}


// 更新迭代信息
function updateIterationInfo(newScore) {
    const panel = uiState.resultPanel;
    if (!panel) return;

    const iterationElement = panel.querySelector('.current-iteration');
    const improvementElement = panel.querySelector('.improvement-rate');
    
    if (iterationElement) {
        const currentIteration = uiState.optimizationHistory.length;
        iterationElement.textContent = `迭代次数: ${currentIteration}`;
    }
    
    if (improvementElement && uiState.optimizationHistory.length > 1) {
        const previousScore = uiState.optimizationHistory[uiState.optimizationHistory.length - 2].score;
        const improvement = ((newScore - previousScore) / previousScore * 100).toFixed(1);
        improvementElement.textContent = `提升幅度: ${improvement}%`;
    }
}
// 应用更改
function applyChanges() {
    if (!eventState.targetTextArea) {
        showError('未找到目标文本区域');
        return;
    }

    eventState.targetTextArea.value = uiState.segments.join('\n\n');
    showFinalPreview(eventState.targetTextArea.value);

    uiState.panel.style.opacity = '0';
    setTimeout(() => {
        uiState.panel.style.display = 'none';
    }, optimizerConfig.ui.transitionDuration);

    resetOptimizationState();
    showSuccess('更改已应用');
}

function resetOptimizationState() {
    // 重置事件状态
    eventState.batchMode = false;
    eventState.optimizationQueue = [];
    eventState.currentOptimization = null;
    eventState.lastUpdateTime = Date.now();

    // 重置UI状态
    uiState.isPaused = false;
    uiState.isLoading = false;
    uiState.optimizationHistory = [];

    // 重置按钮状态
    const buttons = {
        'batch-optimize': false,
        'start-optimize': false,
        'pause-optimize': true,
        'apply-changes': true
    };

    Object.entries(buttons).forEach(([id, disabled]) => {
        const button = document.getElementById(id);
        if (button) {
            button.disabled = disabled;
        }
    });

    // 重置进度显示
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill) {
        progressFill.style.width = '0%';
    }
    if (progressText) {
        progressText.textContent = `0/${uiState.segments.length} 段落已优化`;
    }

    // 重置段落状态显示
    document.querySelectorAll('.segment-item').forEach(segment => {
        segment.classList.remove('optimizing', 'optimized', 'error');
        const statusElement = segment.querySelector('.segment-status');
        if (statusElement) {
            statusElement.textContent = '待优化';
        }
    });

    // 清除任何可能存在的错误提示
    const errorMessages = document.querySelectorAll('.error-message');
    errorMessages.forEach(message => message.remove());

    // 关闭结果面板（如果打开）
    if (uiState.resultPanel && uiState.resultPanel.style.display !== 'none') {
        uiState.resultPanel.style.opacity = '0';
        setTimeout(() => {
            uiState.resultPanel.style.display = 'none';
        }, optimizerConfig.ui.transitionDuration);
    }
}

// 更新分段列表
function updateSegmentsList() {
    const container = document.getElementById('segments-list');
    if (!container) return;

    container.innerHTML = '';

    uiState.segments.forEach((segment, index) => {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.setAttribute('data-index', index);

        // 获取预览文本
        const preview = segment.length > optimizerConfig.ui.previewLength
            ? segment.substring(0, optimizerConfig.ui.previewLength) + '...'
            : segment;

        // 构建段落状态显示
        const status = getSegmentStatus(index);

        div.innerHTML = `
            <div class="segment-header">
                <span class="segment-number">段落 ${index + 1}</span>
                <span class="segment-status ${status.className}">${status.text}</span>
            </div>
            <div class="segment-content">${preview}</div>
            <div class="segment-controls">
                <button class="optimize-btn" ${status.buttonDisabled ? 'disabled' : ''}>
                    优化此段
                </button>
            </div>
        `;

        // 添加鼠标悬停预览事件
        div.addEventListener('mouseenter', showPreview);
        div.addEventListener('mouseleave', hidePreview);

        // 添加段落点击选择事件
        div.addEventListener('click', (e) => {
            if (!e.target.matches('button')) {
                selectSegment(index);
            }
        });

        // 添加优化按钮事件
        const optimizeBtn = div.querySelector('.optimize-btn');
        if (optimizeBtn) {
            optimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startOptimization(index);
            });
        }

        container.appendChild(div);
    });

    // 更新整体进度
    updateProgress(getOptimizedCount(), uiState.segments.length);
}

// 获取段落状态
function getSegmentStatus(index) {
    const history = uiState.optimizationHistory;
    const lastOptimization = history.findLast(h => h.segmentIndex === index);

    if (eventState.currentOptimization?.index === index) {
        return {
            className: 'status-optimizing',
            text: '优化中...',
            buttonDisabled: true
        };
    }

    if (lastOptimization) {
        return {
            className: 'status-optimized',
            text: `已优化 (${lastOptimization.score}分)`,
            buttonDisabled: false
        };
    }

    return {
        className: 'status-pending',
        text: '待优化',
        buttonDisabled: false
    };
}

// 获取已优化段落数量
function getOptimizedCount() {
    const optimizedIndices = new Set(
        uiState.optimizationHistory.map(h => h.segmentIndex)
    );
    return optimizedIndices.size;
}

// 选择段落
function selectSegment(index) {
    document.querySelectorAll('.segment-item').forEach(item => {
        item.classList.remove('selected');
    });

    const selectedItem = document.querySelector(`[data-index="${index}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 添加相关的CSS样式
const segmentStyles = `
    .segment-item {
        padding: 10px;
        margin: 5px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .segment-item:hover {
        background-color: #f8f9fa;
        transform: translateX(2px);
    }

    .segment-item.selected {
        border-color: #007bff;
        background-color: #f0f7ff;
    }

    .segment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
    }

    .segment-status {
        font-size: 0.9em;
        padding: 2px 8px;
        border-radius: 12px;
    }

    .status-optimizing {
        background-color: #fff3cd;
        color: #856404;
    }

    .status-optimized {
        background-color: #d4edda;
        color: #155724;
    }

    .status-pending {
        background-color: #e9ecef;
        color: #6c757d;
    }

    .segment-content {
        font-size: 0.95em;
        color: #495057;
        margin: 5px 0;
        line-height: 1.5;
    }

    .segment-controls {
        display: flex;
        justify-content: flex-end;
        margin-top: 5px;
    }

    .optimize-btn {
        padding: 4px 12px;
        font-size: 0.9em;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .optimize-btn:hover:not(:disabled) {
        background-color: #0056b3;
    }

    .optimize-btn:disabled {
        background-color: #6c757d;
        cursor: not-allowed;
    }
`;

// 将样式添加到文档中
function addSegmentStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = segmentStyles;
    document.head.appendChild(styleSheet);
}

// 在初始化时调用添加样式
document.addEventListener('DOMContentLoaded', addSegmentStyles);

// 保存优化器状态
function saveOptimizerState() {
    const state = {
        config: optimizerConfig,
        history: uiState.optimizationHistory
    };
    localStorage.setItem('optimizerState', JSON.stringify(state));
}

// 加载优化器状态
function loadOptimizerState() {
    try {
        const saved = localStorage.getItem('optimizerState');
        if (saved) {
            const state = JSON.parse(saved);
            Object.assign(optimizerConfig, state.config);
            uiState.optimizationHistory = state.history || [];
            updateUIFromConfig();
        }
    } catch (error) {
        console.error('加载状态失败:', error);
        showError('加载历史状态失败');
    }
}

async function startOptimization() {
    try {
        // 检查是否正在进行优化
        if (uiState.isLoading) {
            showError('已有优化任务正在进行中');
            return;
        }

        // 检查基本条件
        if (!eventState.targetTextArea) {
            showError('未找到目标文本区域');
            return;
        }

        if (uiState.segments.length === 0) {
            showError('没有可优化的内容段落');
            return;
        }

        // 初始化优化状态
        eventState.batchMode = false;
        document.getElementById('start-optimize').disabled = true;
        document.getElementById('pause-optimize').disabled = false;
        document.getElementById('batch-optimize').disabled = true;

        // 获取选中的段落索引
        const selectedIndex = getSelectedSegmentIndex();
        if (selectedIndex === -1) {
            showError('请先选择要优化的段落');
            resetOptimizationButtons();
            return;
        }

        // 显示加载状态
        showLoading(document.querySelector(`[data-index="${selectedIndex}"]`));
        
        // 更新UI状态
        updateSegmentStatus(selectedIndex, 'optimizing');
        
        try {
            // 执行优化
            const result = await optimizeSegment(selectedIndex);
            
            // 显示优化结果
            showResult(result);
            
            // 更新统计信息
            updateOptimizationStats(selectedIndex, result);
            
            // 检查是否需要自动保存
            if (optimizerConfig.autoSave) {
                saveOptimizerState();
            }
        } catch (error) {
            console.error('优化过程出错:', error);
            showError(`优化失败: ${error.message}`);
            updateSegmentStatus(selectedIndex, 'error');
        } finally {
            // 恢复按钮状态
            hideLoading(document.querySelector(`[data-index="${selectedIndex}"]`));
            resetOptimizationButtons();
        }

    } catch (error) {
        console.error('启动优化过程失败:', error);
        showError('启动优化失败，请重试');
        resetOptimizationButtons();
    }
}

// 辅助函数：重置按钮状态
function resetOptimizationButtons() {
    document.getElementById('start-optimize').disabled = false;
    document.getElementById('pause-optimize').disabled = true;
    document.getElementById('batch-optimize').disabled = false;
}

// 辅助函数：更新优化统计信息
function updateOptimizationStats(index, result) {
    const stats = {
        totalOptimizations: (uiState.stats?.totalOptimizations || 0) + 1,
        averageScore: calculateAverageScore(result.score),
        lastOptimizedIndex: index,
        lastOptimizationTime: new Date().toISOString()
    };

    uiState.stats = stats;
    
    // 更新UI显示（如果有统计面板的话）
    updateStatsDisplay(stats);
}

// 辅助函数：计算平均分数
function calculateAverageScore(newScore) {
    const currentStats = uiState.stats || { totalOptimizations: 0, averageScore: 0 };
    const totalOptimizations = currentStats.totalOptimizations;
    const currentAverage = currentStats.averageScore || 0;
    
    return (currentAverage * totalOptimizations + newScore) / (totalOptimizations + 1);
}

// 辅助函数：更新统计显示
function updateStatsDisplay(stats) {
    const statsElements = {
        totalOptimizations: document.querySelector('.total-optimizations'),
        averageScore: document.querySelector('.average-score'),
        lastOptimizationTime: document.querySelector('.last-optimization-time')
    };

    // 如果存在相应的显示元素，则更新显示
    if (statsElements.totalOptimizations) {
        statsElements.totalOptimizations.textContent = stats.totalOptimizations;
    }
    if (statsElements.averageScore) {
        statsElements.averageScore.textContent = stats.averageScore.toFixed(1);
    }
    if (statsElements.lastOptimizationTime) {
        const timeString = new Date(stats.lastOptimizationTime).toLocaleString();
        statsElements.lastOptimizationTime.textContent = timeString;
    }
}

// 获取选中段落的索引
function getSelectedSegmentIndex() {
    const selectedSegment = document.querySelector('.segment-item.selected');
    return selectedSegment ? parseInt(selectedSegment.getAttribute('data-index')) : -1;
}



// 章节监听器初始化
function initChapterListener() {
    // 保存原有的添加章节函数
    const originalAddChapter = window.addChapterWithContent;
    
    // 重写添加章节函数
    window.addChapterWithContent = function(outline, content, isCollapsed) {
        // 首先调用原有的添加章节功能
        originalAddChapter(outline, content, isCollapsed);
        
        // 延迟执行以确保DOM已更新
        setTimeout(() => {
            // 为新添加的章节添加优化按钮
            addOptimizerButtons();
            
            // 初始化新章节的编辑器事件
            initNewChapterEditors();
            
            // 更新章节计数
            updateChapterCount();
            
            // 触发章节更新事件
            triggerChapterUpdateEvent();
        }, 100);
    };

    // 监听章节删除事件
    document.addEventListener('chapter-deleted', handleChapterDeletion);
    
    // 监听章节编辑事件
    document.addEventListener('chapter-edited', handleChapterEdit);
    
    // 初始化章节排序观察器
    initChapterSortObserver();
}

// 初始化新章节的编辑器
function initNewChapterEditors() {
    const editors = document.querySelectorAll('.chapter-outline, .chapter-content-text');
    editors.forEach(editor => {
        if (!editor.hasAttribute('data-optimizer-initialized')) {
            // 添加编辑器事件监听
            editor.addEventListener('input', debounce(handleEditorInput, 500));
            editor.addEventListener('focus', handleEditorFocus);
            editor.addEventListener('blur', handleEditorBlur);
            
            // 标记已初始化
            editor.setAttribute('data-optimizer-initialized', 'true');
        }
    });
}

// 处理编辑器输入
function handleEditorInput(event) {
    const editor = event.target;
    const chapterId = editor.closest('.chapter-container')?.getAttribute('data-chapter-id');
    
    if (chapterId) {
        // 保存当前编辑状态
        saveEditorState(chapterId, editor.value);
        
        // 更新优化状态
        updateOptimizationStatus(chapterId);
    }
}

// 处理编辑器焦点
function handleEditorFocus(event) {
    const editor = event.target;
    editor.classList.add('active-editor');
    
    // 显示相关的优化按钮
    const optimizerButtons = editor.nextElementSibling?.querySelector('.optimizer-buttons');
    if (optimizerButtons) {
        optimizerButtons.classList.add('visible');
    }
}

// 处理编辑器失焦
function handleEditorBlur(event) {
    const editor = event.target;
    editor.classList.remove('active-editor');
    
    // 延迟隐藏优化按钮，避免点击按钮时按钮已消失
    setTimeout(() => {
        const optimizerButtons = editor.nextElementSibling?.querySelector('.optimizer-buttons');
        if (optimizerButtons && !optimizerButtons.matches(':hover')) {
            optimizerButtons.classList.remove('visible');
        }
    }, 200);
}

// 处理章节删除
function handleChapterDeletion(event) {
    const chapterId = event.detail.chapterId;
    
    // 清理相关的优化历史
    clearOptimizationHistory(chapterId);
    
    // 更新章节计数
    updateChapterCount();
    
    // 触发更新事件
    triggerChapterUpdateEvent();
}

// 处理章节编辑
function handleChapterEdit(event) {
    const { chapterId, content } = event.detail;
    
    // 更新优化状态
    updateOptimizationStatus(chapterId);
    
    // 保存编辑状态
    saveEditorState(chapterId, content);
}

// 初始化章节排序观察器
function initChapterSortObserver() {
    const chaptersContainer = document.querySelector('.chapters-container');
    if (!chaptersContainer) return;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                // 重新初始化所有章节的优化按钮
                addOptimizerButtons();
                
                // 更新章节顺序
                updateChapterOrder();
            }
        });
    });

    observer.observe(chaptersContainer, {
        childList: true,
        subtree: false
    });
}

// 更新章节顺序
function updateChapterOrder() {
    const chapters = document.querySelectorAll('.chapter-container');
    chapters.forEach((chapter, index) => {
        chapter.setAttribute('data-chapter-order', index + 1);
        updateChapterLabel(chapter, index + 1);
    });
}

// 更新章节标签
function updateChapterLabel(chapter, order) {
    const label = chapter.querySelector('.chapter-label');
    if (label) {
        label.textContent = `第${order}章`;
    }
}


function updateChapterCount() {
    try {
        // 使用更具体的选择器统计章节数量
        const chapters = document.querySelectorAll('.novel-chapters .chapter-container');
        const count = chapters.length;
        
        // 查找或创建计数显示元素
        let countDisplay = document.querySelector('.chapter-statistics .chapter-count');
        if (!countDisplay) {
            const statisticsContainer = document.querySelector('.chapter-statistics');
            if (statisticsContainer) {
                countDisplay = document.createElement('span');
                countDisplay.className = 'chapter-count';
                statisticsContainer.appendChild(countDisplay);
            }
        }
        
        // 更新显示
        if (countDisplay) {
            countDisplay.textContent = count;
            // 可选：添加描述文本
            countDisplay.title = `当前共有 ${count} 个章节`;
        }
        
        // 更新相关状态
        if (window.novelState) {
            window.novelState.chapterCount = count;
        }
        
        return count;
    } catch (error) {
        console.error('更新章节计数时出错:', error);
        return 0;
    }
}

// 触发章节更新事件
function triggerChapterUpdateEvent() {
    document.dispatchEvent(new CustomEvent('chapters-updated', {
        detail: {
            count: document.querySelectorAll('.chapter-container').length,
            timestamp: new Date().toISOString()
        }
    }));
}

// 清理优化历史
function clearOptimizationHistory(chapterId) {
    if (uiState.optimizationHistory) {
        uiState.optimizationHistory = uiState.optimizationHistory.filter(
            history => history.chapterId !== chapterId
        );
    }
}

// 更新优化状态
function updateOptimizationStatus(chapterId) {
    const chapter = document.querySelector(`[data-chapter-id="${chapterId}"]`);
    if (!chapter) return;

    const optimizeButton = chapter.querySelector('.ai-optimize-btn');
    if (optimizeButton) {
        optimizeButton.classList.add('needs-optimization');
        optimizeButton.title = '内容已更改，建议重新优化';
    }
}

// 保存编辑器状态
function saveEditorState(chapterId, content) {
    const editorStates = JSON.parse(localStorage.getItem('editorStates') || '{}');
    editorStates[chapterId] = {
        content,
        lastModified: new Date().toISOString()
    };
    localStorage.setItem('editorStates', JSON.stringify(editorStates));
}


function showOptimizer(button, type) {
    try {
        // 获取目标文本区域
        const textArea = button.parentElement.previousElementSibling;
        if (!textArea || !(textArea instanceof HTMLTextAreaElement)) {
            throw new Error('未找到有效的文本编辑区域');
        }

        // 初始化状态
        eventState.targetTextArea = textArea;
        eventState.optimizationType = type;
        resetOptimizationState();

        // 设置类型特定的配置
        setTypeSpecificConfig(type);

        // 分割文本并更新UI
        uiState.segments = splitText(textArea.value, optimizerConfig.splitRules.mode);
        
        // 显示面板前的准备
        const panel = document.getElementById('optimizer-panel');
        if (!panel) {
            throw new Error('优化器面板未正确初始化');
        }

        // 更新面板标题
        const typeNames = {
            outline: '大纲',
            chapter: '章节大纲',
            content: '正文内容'
        };
        const panelTitle = panel.querySelector('.panel-header h3');
        if (panelTitle) {
            panelTitle.textContent = `AI智能优化${typeNames[type] || ''}`;
        }

        // 重置按钮状态
        document.getElementById('batch-optimize')?.removeAttribute('disabled');
        document.getElementById('start-optimize')?.removeAttribute('disabled');
        document.getElementById('pause-optimize')?.setAttribute('disabled', 'true');
        document.getElementById('apply-changes')?.setAttribute('disabled', 'true');

        // 显示面板
        panel.style.opacity = '0';
        panel.style.display = 'flex';
        
        // 触发重排后显示动画
        requestAnimationFrame(() => {
            panel.style.opacity = '1';
            
            // 更新分段列表
            updateSegmentsList();
            
            // 重置进度显示
            updateProgress(0, uiState.segments.length);
        });

        // 更新配置UI
        updateUIFromConfig();
        
        // 添加激活状态到当前按钮
        const allButtons = document.querySelectorAll('.ai-optimize-btn');
        allButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // 显示工具提示
        showTooltip('选择要优化的段落后，点击"开始优化"或"批量优化"按钮开始优化过程');

    } catch (error) {
        console.error('显示优化器时出错:', error);
        showError(error.message);
        return false;
    }
}

// 显示工具提示
function showTooltip(message) {
    const tooltip = document.createElement('div');
    tooltip.className = 'optimizer-tooltip';
    tooltip.textContent = message;
    
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
        tooltip.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.remove(), 300);
    }, 3000);
}

// 添加相关样式
const tooltipStyle = document.createElement('style');
tooltipStyle.textContent = `
    .optimizer-tooltip {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1100;
    }

    .optimizer-tooltip.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
    }

    .ai-optimize-btn.active {
        background-color: #007bff;
        color: white;
    }
`;
document.head.appendChild(tooltipStyle);

function initNovelOptimizer() {
    loadConfig();
    createOptimizerPanel();
    createResultPanel();
    createPreviewPanel();
    initEventListeners();
    addOptimizerButtons();
    
    // 添加初始化成功提示
    console.log('小说优化器初始化完成');
}

// 为所有面板添加淡入淡出效果的CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .optimizer-panel, .result-panel, .preview-panel {
        transition: opacity ${optimizerConfig.ui.transitionDuration}ms ease-in-out;
    }
    
    .loading {
        position: relative;
        pointer-events: none;
    }
    
    .loading::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 20px;
        height: 20px;
        margin: -10px 0 0 -10px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-message {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 9999;
        animation: fadeInOut 3s ease-in-out;
    }
    
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-20px); }
        10% { opacity: 1; transform: translateY(0); }
        90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(styleSheet);

// 初始化入口
$(document).ready(() => {
    initNovelOptimizer();
    initChapterListener();

    // 添加状态保存到原有系统
    const originalSaveState = window.saveState;
    window.saveState = function() {
        originalSaveState();
        saveOptimizerState();
    };

    // 添加状态加载到原有系统
    const originalLoadState = window.loadState;
    window.loadState = function() {
        originalLoadState();
        loadOptimizerState();
    };
});
