// 添加导入导出按钮到页面
$(document).ready(function() {
    const buttonContainer = $(`
        <div id="config-buttons" style="position:fixed;top:20px;right:20px;z-index:1000">
            <button id="exportBtn" class="primary-button" style="margin-right:10px">
                导出配置
            </button>
            <input type="file" id="importFile" accept=".txt" style="display:none">
            <button id="importBtn" class="secondary-button">
                导入配置
            </button>
        </div>
    `).appendTo('body');

    // 导出配置
    $('#exportBtn').click(function() {
        $(this).addClass('loading').prop('disabled', true);
        
        const configData = {
            timestamp: new Date().toISOString(),
            note: prompt('请输入导出配置的备注信息：'),
            settings: {
                background: $('#background').val(),
                characters: $('#characters').val(),
                relationships: $('#relationships').val(),
                plot: $('#plot').val(),
                style: $('#style').val()
            },
            prompts: {
                outlinePrompt: $('#outline-prompt').val(),
                chapterPrompt: $('#chapter-prompt').val(),
                contentPrompt: $('#content-prompt').val()
            },
            content: {
                outline: $('#outline').val(),
                chapters: []
            },
            menus: {
                outlineMenu: $('#outline-menu-config').val(),
                chapterMenu: $('#chapter-menu-config').val(),
                contentMenu: $('#content-menu-config').val()
            }
        };

        // 收集所有章节数据
        $('.chapter-container').each(function() {
            configData.content.chapters.push({
                outline: $(this).find('.chapter-outline').val(),
                content: $(this).find('.chapter-content-text').val()
            });
        });

        // 创建文本内容
        const textContent = [
            '=== 小说创作助手配置文件 ===',
            `导出时间: ${new Date().toLocaleString()}`,
            `配置备注: ${configData.note || '无'}`,
            '---',
            JSON.stringify(configData, null, 2)
        ].join('\n');

        // 创建并下载文件
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `novel-config-${new Date().toISOString().slice(0,10)}.txt`;
        
        // 添加动画效果
        $('body').append('<div id="export-animation" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;z-index:9999"><div style="background:white;padding:20px;border-radius:10px">正在导出配置...</div></div>');
        
        setTimeout(() => {
            link.click();
            URL.revokeObjectURL(link.href);
            $('#export-animation').fadeOut(() => {
                $('#export-animation').remove();
                $('#exportBtn').removeClass('loading').prop('disabled', false);
            });
        }, 1000);
    });

    // 导入配置
    $('#importBtn').click(() => $('#importFile').click());
    
    $('#importFile').change(function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        $('#importBtn').addClass('loading').prop('disabled', true);
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const jsonStr = content.substring(content.indexOf('{'));
                const config = JSON.parse(jsonStr);
                
                // 验证必要的配置项
                const requiredKeys = ['settings', 'prompts', 'content', 'menus'];
                const missingKeys = requiredKeys.filter(key => !config[key]);
                
                if (missingKeys.length > 0) {
                    throw new Error(`配置文件缺少必要的配置项: ${missingKeys.join(', ')}`);
                }
                
                // 添加导入动画
                $('body').append('<div id="import-animation" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);display:flex;justify-content:center;align-items:center;z-index:9999"><div style="background:white;padding:20px;border-radius:10px">正在导入配置...</div></div>');
                
                setTimeout(() => {
                    // 导入设置
                    $('#background').val(config.settings.background);
                    $('#characters').val(config.settings.characters);
                    $('#relationships').val(config.settings.relationships);
                    $('#plot').val(config.settings.plot);
                    $('#style').val(config.settings.style);
                    
                    // 导入提示词
                    $('#outline-prompt').val(config.prompts.outlinePrompt);
                    $('#chapter-prompt').val(config.prompts.chapterPrompt);
                    $('#content-prompt').val(config.prompts.contentPrompt);
                    
                    // 导入大纲
                    $('#outline').val(config.content.outline);
                    
                    // 导入菜单配置
                    $('#outline-menu-config').val(config.menus.outlineMenu);
                    $('#chapter-menu-config').val(config.menus.chapterMenu);
                    $('#content-menu-config').val(config.menus.contentMenu);
                    
                    // 导入章节
                    $('#chapters').empty();
                    config.content.chapters.forEach(chapter => {
                        addChapterWithContent(chapter.outline, chapter.content);
                    });
                    
                    // 更新localStorage
                    saveState();
                    
                    $('#import-animation').fadeOut(() => {
                        $('#import-animation').remove();
                        $('#importBtn').removeClass('loading').prop('disabled', false);
                        alert('配置导入成功！');
                    });
                }, 1500);
                
            } catch (err) {
                $('#importBtn').removeClass('loading').prop('disabled', false);
                alert('导入失败：' + err.message);
            }
        };
        
        reader.readAsText(file);
    });

    // 添加加载动画样式
    $('<style>')
        .text(`
            .loading {
                position: relative;
                cursor: wait;
            }
            .loading:after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 16px;
                height: 16px;
                margin: -8px 0 0 -8px;
                border: 2px solid #fff;
                border-right-color: transparent;
                border-radius: 50%;
                animation: loading 0.75s linear infinite;
            }
            @keyframes loading {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `)
        .appendTo('head');
});
