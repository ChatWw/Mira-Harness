// textarea-collapse.js

document.addEventListener('DOMContentLoaded', function() {
    // 为每个文本域创建折叠包装器
    function createCollapseWrapper(textarea) {
        // 获取原始textarea的属性
        const originalId = textarea.id;
        const originalClass = textarea.className;
        const label = textarea.previousElementSibling;
        const labelText = label ? label.textContent : originalId;
        
        // 创建包装器
        const wrapper = document.createElement('div');
        wrapper.className = 'textarea-collapse-wrapper';
        
        // 创建折叠按钮
        const collapseBtn = document.createElement('div');
        collapseBtn.className = 'textarea-collapse-btn';
        collapseBtn.innerHTML = `
            <span class="collapse-text">${labelText}</span>
            <span class="collapse-icon">▶</span>
        `;
        
        // 创建内容容器
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'textarea-content-wrapper collapsed'; // 默认添加collapsed类
        
        // 将textarea包装起来
        textarea.parentNode.insertBefore(wrapper, textarea);
        contentWrapper.appendChild(textarea);
        wrapper.appendChild(collapseBtn);
        wrapper.appendChild(contentWrapper);
        
        // 添加点击事件
        collapseBtn.addEventListener('click', function() {
            contentWrapper.classList.toggle('collapsed');
            collapseBtn.querySelector('.collapse-icon').textContent = 
                contentWrapper.classList.contains('collapsed') ? '▶' : '▼';
        });
        
        return wrapper;
    }
    
    // 添加必要的样式
    const style = document.createElement('style');
    style.textContent = `
        .textarea-collapse-wrapper {
            margin: 5px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .textarea-collapse-btn {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background-color: #f5f5f5;
            cursor: pointer;
            user-select: none;
        }
        
        .textarea-collapse-btn:hover {
            background-color: #e8e8e8;
        }
        
        .collapse-text {
            font-weight: bold;
            color: #333;
        }
        
        .textarea-content-wrapper {
            max-height: 1000px;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            padding: 0;
            margin: 0;
        }
        
        .textarea-content-wrapper.collapsed {
            max-height: 0;
            padding: 0;
            margin: 0;
        }
        
        .textarea-content-wrapper textarea {
            border-top: 1px solid #ddd;
            margin: 0;
            border-radius: 0 0 4px 4px;
        }
    `;
    document.head.appendChild(style);
    
    // 处理基础设置区域
    const basicSettings = [
        'background',
        'characters',
        'relationships',
        'plot',
        'style'
    ];
    
    // 处理提示词配置区域
    const promptSettings = [
        'outline-prompt',
        'chapter-prompt',
        'content-prompt'
    ];
    
    // 处理右键菜单配置区域
    const menuSettings = [
        'outline-menu-config',
        'chapter-menu-config',
        'content-menu-config'
    ];
    
    // 为所有目标文本域添加折叠功能
    [...basicSettings, ...promptSettings, ...menuSettings].forEach(id => {
        const textarea = document.getElementById(id);
        if (textarea) {
            createCollapseWrapper(textarea);
        }
    });
    
    // 保持原有的保存状态功能
    function updateSaveState() {
        if (typeof saveState === 'function') {
            saveState();
        }
    }
    
    // 监听折叠状态变化以更新保存状态
    document.querySelectorAll('.textarea-collapse-btn').forEach(btn => {
        btn.addEventListener('click', updateSaveState);
    });
});
