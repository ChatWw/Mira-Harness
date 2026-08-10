// 定义默认配置
const DEFAULT_SHORTCUTS = [
    // 功法体系
    "九转玄元功??基础功法+三品+化气归元+温和性功法",
    "太乙凝真诀??高阶功法+一品+凝练真元+霸道性功法",
    "万象吞天诀??顶级功法+特殊品阶+吞噬天地元气+极致霸道",
    
    // 修真境界
    "练气境??1-9层+凡人踏入修行第一步+感应天地灵气",
    "筑基境??初期/中期/后期/大圆满+体内构筑灵力根基",
    "金丹境??初期/中期/后期/大圆满+凝结金丹+羽化登仙之基",
    "元婴境??初期/中期/后期/大圆满+元婴出窍+法力无边",
    "化神境??初期/中期/后期/大圆满+化虚为实+超凡入圣",
    
    // 丹药系统
    "聚气丹??练气期+增进修为+辅助修炼+常见丹药",
    "固本培元丹??筑基期+稳固根基+增强体质+珍贵丹药",
    "金元造化丹??金丹期+辅助结丹+增进修为+稀有丹药",
    
    // 法器描写
    "下品法器??一阶法器+增幅灵力+常见材质+适合低阶修士",
    "中品法器??三阶法器+增幅显著+稀有材质+适合筑基修士",
    "上品法器??六阶法器+威力强大+珍贵材质+适合金丹真人",
    
    // 秘境描述
    "荒古遗迹??上古修士留存+蕴含机缘+危险与机遇并存",
    "灵药园??天材地宝+药龄千年+守护兽物+隐秘之地",
    "洞天福地??灵气充沛+时间流速不同+与世隔绝",
    
    // 斗法描写
    "法术对决??真元对抗+法术相克+虚实变换+胜负难料",
    "神通较量??神通显化+天地异象+威能盖世+惊天动地",
    
    // 修真宗门
    "太玄门??正道大宗+底蕴深厚+传承久远+门规严谨",
    "万法宗??旁门大派+百家争鸣+兼收并蓄+包容开放",
    "魔道宗??左道旁门+手段激进+追求极致+不拘一格",
    
    // 灵兽描述
    "五阶灵兽??化形在即+通灵具智+掌握神通+忠心护主",
    "妖兽描写??凶性难驯+实力强横+天赋异禀+潜力无穷"
];

// 注入CSS样式
const styles = `
    /* 悬浮球样式 */
    #floating-button {
        position: fixed;
        left: 20px;
        bottom: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: #4CAF50;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        transition: all 0.3s ease;
    }

    #floating-button:hover {
        transform: scale(1.1);
        background: #45a049;
    }

    /* 悬浮菜单样式 */
    #floating-menu {
        position: fixed;
        left: 80px;
        bottom: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 10px;
        display: none;
        z-index: 999;
        min-width: 200px;
    }

    .menu-item {
        display: block;
        width: 100%;
        padding: 8px 15px;
        border: none;
        background: none;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.3s;
    }

    .menu-item:hover {
        background-color: #f5f5f5;
    }

    /* 模式切换样式 */
    .mode-switch-container {
        display: flex;
        align-items: center;
        padding: 8px 15px;
        border-bottom: 1px solid #eee;
        margin-bottom: 8px;
    }

    .mode-switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 20px;
        margin: 0 10px;
    }

    .mode-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .mode-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
        border-radius: 20px;
    }

    .mode-slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }

    input:checked + .mode-slider {
        background-color: #4CAF50;
    }

    input:checked + .mode-slider:before {
        transform: translateX(20px);
    }

    /* 管理窗口通用样式 */
    .management-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1100;
        width: 80%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        display: none;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 5px;
        color: #666;
    }

    .close-button:hover {
        color: #333;
    }

    /* 搜索框样式 */
    .search-input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 10px;
    }

    /* 快捷短语下拉框样式 */
    #shortcuts-dropdown {
        position: absolute;
        z-index: 1100;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 10px;
        min-width: 300px;
        max-height: 400px;
        overflow-y: auto;
        display: none;
    }

    /* 导入导出样式 */
    .import-export-buttons {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
    }

    .export-content {
        width: 100%;
        height: 200px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-top: 10px;
        font-family: monospace;
    }

    .list-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        border-bottom: 1px solid #eee;
        transition: background-color 0.3s;
        cursor: pointer;
    }

    .list-item:hover {
        background-color: #f5f5f5;
    }

    .hide-in-simple {
        display: none !important;
    }

    .show-in-simple {
        display: block !important;
    }
`;

// 注入样式到页面
function injectStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
}

// 初始化页面元素
function initializeElements() {
    // 添加悬浮球和菜单
    $('body').append(`
        <div id="floating-button">☰</div>
        <div id="floating-menu">
            <div class="mode-switch-container">
                <span>编辑模式：</span>
                <label class="mode-switch">
                    <input type="checkbox" id="mode-toggle">
                    <span class="mode-slider"></span>
                </label>
                <span id="mode-text">专业模式</span>
            </div>
            <button class="menu-item" onclick="toggleShortcutsModal()">快捷词条管理</button>
            <button class="menu-item" onclick="toggleImportExportModal()">导入导出设置</button>
        </div>

        <!-- 快捷短语管理窗口 -->
        <div class="management-modal" id="shortcuts-modal">
            <div class="modal-header">
                <h3>快捷短语管理</h3>
                <button class="close-button" onclick="closeModal('shortcuts-modal')">&times;</button>
            </div>
            <input type="text" class="search-input" id="shortcuts-search" placeholder="搜索词条卡...">
            <div id="shortcuts-list"></div>
            <div class="add-item-group">
                <input type="text" class="add-item-input" id="new-shortcut" placeholder="输入新的词条">
                <button class="add-button" onclick="addShortcut()">添加</button>
            </div>
        </div>

        <!-- 导入导出窗口 -->
        <div class="management-modal" id="import-export-modal">
            <div class="modal-header">
                <h3>导入导出设置</h3>
                <button class="close-button" onclick="closeModal('import-export-modal')">&times;</button>
            </div>
            <div class="import-export-buttons">
                <button class="add-button" onclick="exportSettings()">导出设置</button>
                <input type="file" id="import-file" style="display: none" onChange="importSettings(event)">
                <button class="add-button" onclick="document.getElementById('import-file').click()">导入设置</button>
            </div>
            <textarea class="export-content" id="export-content" readonly></textarea>
        </div>

        <!-- 快捷短语下拉框 -->
        <div id="shortcuts-dropdown">
            <div class="modal-header">
                <h3>快捷词条</h3>
                <button class="close-button" onclick="$('#shortcuts-dropdown').hide()">&times;</button>
            </div>
            <input type="text" class="search-input" id="dropdown-search" placeholder="搜索词条...">
            <div id="dropdown-list"></div>
        </div>
    `);
}

// 初始化事件监听
function initializeEvents() {
    // 悬浮球点击事件
    $('#floating-button').click(function(e) {
        e.stopPropagation();
        $('#floating-menu').toggle();
    });

    // 点击其他地方关闭菜单
    $(document).click(function(e) {
        if (!$(e.target).closest('#floating-menu, .management-modal, #shortcuts-dropdown').length) {
            $('#floating-menu, .management-modal, #shortcuts-dropdown').hide();
        }
    });

    // 模式切换事件
    $('#mode-toggle').on('change', function() {
        updateUIMode(this.checked);
    });

    // 快捷短语搜索
    $('#shortcuts-search, #dropdown-search').on('input', function() {
        const id = $(this).attr('id');
        const listId = id === 'shortcuts-search' ? 'shortcuts-list' : 'dropdown-list';
        updateShortcutsList($(this).val(), listId);
    });

    // ESC键关闭所有弹窗
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') {
            $('.management-modal, #floating-menu, #shortcuts-dropdown').hide();
        }
    });

    // Shift+L 快捷键处理
    let shiftLPressed = false;
    $(document).on('keydown', function(e) {
        if (e.shiftKey && e.key.toLowerCase() === 'l' && !shiftLPressed) {
            shiftLPressed = true;
            const activeElement = document.activeElement;
            
            if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
                e.preventDefault();
                const selection = {
                    start: activeElement.selectionStart,
                    end: activeElement.selectionEnd
                };
                
                // 获取光标位置
                const caretPos = getCursorPosition(activeElement);
                showShortcutsDropdown(activeElement, caretPos);
            }
        }
    });

    $(document).on('keyup', function(e) {
        if (e.key.toLowerCase() === 'l') {
            shiftLPressed = false;
        }
    });

    // 初始化模式
    const savedMode = localStorage.getItem('editorMode') || 'professional';
    $('#mode-toggle').prop('checked', savedMode === 'simple');
    updateUIMode(savedMode === 'simple');
}

// 获取光标位置
function getCursorPosition(element) {
    const rect = element.getBoundingClientRect();
    const caretPosition = element.selectionStart;
    const lines = element.value.substr(0, caretPosition).split('\n');
    const lineHeight = parseInt(window.getComputedStyle(element).lineHeight);
    
    const currentLineNumber = lines.length - 1;
    const top = rect.top + window.scrollY + (currentLineNumber * lineHeight);
    const left = rect.left + window.scrollX;
    
    return { top, left };
}

// 显示快捷短语下拉框
function showShortcutsDropdown(textarea, caretPos) {
    const dropdown = $('#shortcuts-dropdown');
    window.currentTextarea = textarea;
    window.currentSelectionStart = textarea.selectionStart;
    window.currentSelectionEnd = textarea.selectionEnd;

    dropdown.css({
        top: (caretPos.top + 20) + 'px',
        left: caretPos.left + 'px',
        display: 'block'
    });

    $('#dropdown-search').val('').focus();
    updateShortcutsList('', 'dropdown-list');
}

// 模式切换功能
function updateUIMode(isSimpleMode) {
    if (isSimpleMode) {
        $('body').addClass('simple-mode');
        $('#mode-text').text('简易模式');
        
        // 检查并创建默认章节
        if ($('.chapter-container').length === 0) {
            addChapterWithContent('新章节细纲', '', false);
        }
        
        // 隐藏非必要元素
        $('.settings-panel, #outline, #chapter-temp-container').addClass('hide-in-simple');
        $('.chapter-buttons button')
            .not(':contains("生成正文"), :contains("切换"), .score-button')
            .addClass('hide-in-simple');
            
        // 显示必要元素
        $('.chapter-header, .chapter-outline, .chapter-content-text').addClass('show-in-simple');
    } else {
        $('body').removeClass('simple-mode');
        $('#mode-text').text('专业模式');
        $('.hide-in-simple, .show-in-simple').removeClass('hide-in-simple show-in-simple');
        $('.settings-panel, #outline, #chapter-temp-container').show();
        $('.chapter-buttons button').show();
    }
    
    localStorage.setItem('editorMode', isSimpleMode ? 'simple' : 'professional');
}

// 快捷短语相关功能
function updateShortcutsList(searchTerm = '', targetId = 'shortcuts-list') {
    const shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
    const list = $(`#${targetId}`);
    list.empty();

    const filteredShortcuts = shortcuts.filter(shortcut =>
        shortcut.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (targetId === 'shortcuts-list') {
        filteredShortcuts.forEach((shortcut, index) => {
            list.append(`
                <div class="list-item">
                    <span class="item-content">${shortcut}</span>
                    <button class="delete-button" onclick="deleteShortcut(${index})">删除</button>
                </div>
            `);
        });
    } else {
        filteredShortcuts.forEach((shortcut) => {
            list.append(`
                <div class="list-item" onclick="insertShortcut('${shortcut.replace(/'/g, "\\'")}')">
                    <span class="item-content">${shortcut}</span>
                </div>`);
        });
    }
}

function addShortcut() {
    const newShortcut = $('#new-shortcut').val().trim();
    if (!newShortcut) return;

    const shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
    if (!shortcuts.includes(newShortcut)) {
        shortcuts.push(newShortcut);
        localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
        $('#new-shortcut').val('');
        updateShortcutsList();
    }
}

function deleteShortcut(index) {
    if (!confirm('确定要删除这个词条吗？')) return;

    const shortcuts = JSON.parse(localStorage.getItem('shortcuts') || '[]');
    shortcuts.splice(index, 1);
    localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
    updateShortcutsList();
}

function insertShortcut(shortcut) {
    if (!window.currentTextarea) return;

    const textarea = window.currentTextarea;
    const start = window.currentSelectionStart;
    const end = window.currentSelectionEnd;
    const text = textarea.value;

    textarea.value = text.substring(0, start) + shortcut + text.substring(end);
    textarea.selectionStart = start + shortcut.length;
    textarea.selectionEnd = start + shortcut.length;
    $(textarea).trigger('input');
    textarea.focus();

    $('#shortcuts-dropdown').hide();
}

// 导入导出功能
function exportSettings() {
    const settings = {
        shortcuts: JSON.parse(localStorage.getItem('shortcuts') || '[]'),
        editorMode: localStorage.getItem('editorMode') || 'professional'
    };

    const exportContent = JSON.stringify(settings, null, 2);
    $('#export-content').val(exportContent);

    // 创建下载文件
    const blob = new Blob([exportContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'editor-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const settings = JSON.parse(e.target.result);
            
            // 验证并保存设置
            if (settings.shortcuts && Array.isArray(settings.shortcuts)) {
                localStorage.setItem('shortcuts', JSON.stringify(settings.shortcuts));
            }
            if (settings.editorMode) {
                localStorage.setItem('editorMode', settings.editorMode);
            }

            alert('设置导入成功！页面将刷新以应用新设置。');
            location.reload();
        } catch (error) {
            alert('导入失败：无效的设置文件');
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
}

// 模态框控制
function toggleShortcutsModal() {
    $('#shortcuts-modal').show();
    $('#floating-menu').hide();
    updateShortcutsList();
}

function toggleImportExportModal() {
    $('#import-export-modal').show();
    $('#floating-menu').hide();
}

function closeModal(modalId) {
    $(`#${modalId}`).hide();
}

// 页面初始化
$(document).ready(function() {
    injectStyles();
    initializeElements();
    initializeEvents();
});
