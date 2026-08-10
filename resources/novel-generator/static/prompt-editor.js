// enhanced-prompt-editor.js

class PromptEditor {
    // 静态属性
    static currentTarget = null;
    static currentOperation = null;
    static selectedText = '';
    static modal = null;
    static initialized = false;

    static editorHtml = `
        <div id="prompt-editor-modal" class="prompt-editor-modal">
            <div class="prompt-editor-content">
                <div class="prompt-editor-header">
                    <h3>编辑提示词</h3>
                    <button class="close-button" onclick="PromptEditor.close()">&times;</button>
                </div>
                <div class="prompt-editor-body">
                    <div class="editor-section">
                        <label>操作类型:</label>
                        <div id="operation-type" class="readonly-text"></div>
                    </div>
                    <div id="selected-text-section" class="editor-section" style="display: none;">
                        <label>选中的文本:</label>
                        <div id="original-text" class="readonly-text"></div>
                    </div>
                    <div class="editor-section">
                        <label>提示词模板:</label>
                        <div id="prompt-template" class="readonly-text"></div>
                    </div>
                    <div class="editor-section">
                        <label>最终提示词:</label>
                        <textarea id="final-prompt" class="editable-prompt"></textarea>
                    </div>
                </div>
                <div class="prompt-editor-footer">
                    <button onclick="PromptEditor.sendToGen()" class="submit-button">发送到AI</button>
                    <button onclick="PromptEditor.close()" class="cancel-button">取消</button>
                </div>
            </div>
        </div>`;

    static editorStyles = `
        <style>
            .prompt-editor-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
            }

            .prompt-editor-content {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                width: 80%;
                max-width: 800px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }

            .prompt-editor-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .close-button {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                margin: 0;
            }

            .editor-section {
                margin-bottom: 20px;
            }

            .editor-section label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #333;
            }

            .readonly-text {
                padding: 10px;
                background-color: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 4px;
                min-height: 60px;
                max-height: 120px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-family: monospace;
            }

            .editable-prompt {
                width: 100%;
                min-height: 200px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                resize: vertical;
                font-family: monospace;
                line-height: 1.4;
            }

            .prompt-editor-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }

            .prompt-editor-footer button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
            }

            .submit-button {
                background-color: #4CAF50;
                color: white;
            }

            .submit-button:hover {
                background-color: #45a049;
            }

            .cancel-button {
                background-color: #f44336;
                color: white;
            }

            .cancel-button:hover {
                background-color: #da190b;
            }

            #operation-type {
                font-weight: bold;
                color: #2196F3;
                background-color: #e3f2fd;
            }
        </style>`;

    // 初始化方法
    static init() {
        if (this.initialized) return;
        
        // 添加HTML和样式到文档
        document.body.insertAdjacentHTML('beforeend', this.editorHtml);
        document.head.insertAdjacentHTML('beforeend', this.editorStyles);

        // 保存modal引用
        this.modal = document.getElementById('prompt-editor-modal');

        // 绑定事件处理器
        this.bindEventHandlers();

        // 绑定文本域的右键菜单
        this.bindTextAreaContextMenu();

        this.initialized = true;
    }

    // 绑定文本域的右键菜单
    static bindTextAreaContextMenu() {
        // 为所有相关的文本域添加右键菜单处理
        const bindContextMenu = (textarea, menuConfigId) => {
            textarea.addEventListener('contextmenu', function(e) {
                // 获取选中的文本
                const selectedText = this.value.substring(this.selectionStart, this.selectionEnd);
                if (!selectedText) return;

                e.preventDefault();
                PromptEditor.selectedText = selectedText;
                const menuConfig = document.getElementById(menuConfigId).value;
                showContextMenu(e, menuConfig, this);
            });
        };

        // 绑定大纲文本域
        const outlineTextarea = document.getElementById('outline');
        if (outlineTextarea) {
            bindContextMenu(outlineTextarea, 'outline-menu-config');
        }

        // 监听动态添加的章节文本域
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // 元素节点
                        // 为新添加的章节细纲绑定右键菜单
                        const chapterOutlines = node.getElementsByClassName('chapter-outline');
                        Array.from(chapterOutlines).forEach(textarea => {
                            bindContextMenu(textarea, 'chapter-menu-config');
                        });

                        // 为新添加的章节内容绑定右键菜单
                        const chapterContents = node.getElementsByClassName('chapter-content-text');
                        Array.from(chapterContents).forEach(textarea => {
                            bindContextMenu(textarea, 'content-menu-config');
                        });
                    }
                });
            });
        });

        observer.observe(document.getElementById('chapters'), {
            childList: true,
            subtree: true
        });
    }

    // 绑定事件处理器
    static bindEventHandlers() {
        // 重写右键菜单处理函数
        window.handleContextMenuAction = (item) => {
            $('#context-menu').hide();
            const prompt = item.prompt.replace('${selected_text}', this.selectedText);
            this.show('右键菜单操作 - ' + item.name, prompt, true);
        };

        // 重写生成大纲函数
        window.generateOutline = () => {
            this.currentOperation = 'outline';
            const prompt = $('#outline-prompt').val();
            this.show('生成大纲', prompt, false);
        };

        // 重写重新生成大纲函数
        window.regenerateOutline = () => {
            this.currentOperation = 'outline';
            const prompt = $('#outline-prompt').val();
            this.show('重写大纲', prompt, false);
        };

        // 重写生成章节函数
        window.generateChaptersFromOutline = () => {
            this.currentOperation = 'chapters';
            const prompt = $('#chapter-prompt').val();
            this.show('根据大纲生成章节', prompt, false);
        };

        // 重写生成正文函数
        window.generateContent = (button) => {
            this.currentOperation = 'content';
            this.currentTarget = $(button).closest('.chapter-container');
            const chapterOutline = this.currentTarget.find('.chapter-outline').val();
            const prompt = $('#content-prompt').val().replace('${chapter_outline}', chapterOutline);
            this.show('生成正文', prompt, false);
        };

        // 重写重新生成正文函数
        window.regenerateContent = (button) => {
            this.currentOperation = 'content';
            this.currentTarget = $(button).closest('.chapter-container');
            const chapterOutline = this.currentTarget.find('.chapter-outline').val();
            const prompt = $('#content-prompt').val().replace('${chapter_outline}', chapterOutline);
            this.show('重写正文', prompt, false);
        };
    }

    // 获取变量值
    static getVariableValues() {
        return {
            '${background}': $('#background').val(),
            '${characters}': $('#characters').val(),
            '${relationships}': $('#relationships').val(),
            '${plot}': $('#plot').val(),
            '${style}': $('#style').val(),
            '${outline}': $('#outline').val(),
            '${selected_text}': this.selectedText
        };
    }

    // 显示编辑器
    static show(operationType, promptTemplate, hasSelectedText = false) {
        document.getElementById('operation-type').textContent = operationType;
        document.getElementById('prompt-template').textContent = promptTemplate;
        
        // 显示/隐藏选中文本区域
        const selectedTextSection = document.getElementById('selected-text-section');
        if (hasSelectedText) {
            selectedTextSection.style.display = 'block';
            document.getElementById('original-text').textContent = this.selectedText;
        } else {
            selectedTextSection.style.display = 'none';
        }
        
        // 替换变量生成最终提示词
        let finalPrompt = promptTemplate;
        const variables = this.getVariableValues();
        for (const [key, value] of Object.entries(variables)) {
            if (value) { // 只替换非空值
                finalPrompt = finalPrompt.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
            }
        }
        
        document.getElementById('final-prompt').value = finalPrompt;
        this.modal.style.display = 'block';
    }

    // 发送到生成
    static async sendToGen() {
        const finalPrompt = document.getElementById('final-prompt').value;
        
        try {
            // 关闭编辑器窗口
            this.modal.style.display = 'none';

            // 发送请求到后端
            const response = await fetch('gen', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ prompt: finalPrompt })
            });

            // 处理响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let target;
            switch (this.currentOperation) {
                case 'outline':
                    target = document.getElementById('outline');
                    break;
                case 'chapters':
                    showTempContainer();
                    target = document.getElementById('chapter-temp-content');
                    break;
                case 'content':
                    target = this.currentTarget.find('.chapter-content-text')[0];
                    break;
                default:
                    // 右键菜单操作
                    $('#preview-content').text('正在生成内容...');
                    $('#preview-modal').css('display', 'block');
                    target = document.getElementById('preview-content');
            }

            let buffer = '';
            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, {stream: true});
                if (target.tagName === 'TEXTAREA') {
                    target.value = buffer;
                    target.scrollTop = target.scrollHeight;
                } else {
                    target.textContent = buffer;
                }
            }

            // 保存状态
            saveState();
            
        } catch (error) {
            alert('生成内容时出错：' + error.message);
        }
    }

    // 关闭编辑器
    static close() {
        this.modal.style.display = 'none';
    }
}

// 页面加载完成后初始化编辑器
document.addEventListener('DOMContentLoaded', () => PromptEditor.init());

// 导出PromptEditor类
window.PromptEditor = PromptEditor;
