// bookinfo.js - 完整代码

// 添加顶部操作栏
const topBarHtml = `
<div class="top-bar" style="position: fixed; top: 0; left: 0; right: 0; background: white; padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1000; display: flex; gap: 10px;">
    <button onclick="showNovelGenConfig()">书名和简介提示词配置</button>
    <button onclick="showNovelGen()">书名和简介生成</button>
    <button onclick="showHistory()">历史记录</button>
</div>

<div id="novelGenModal" class="modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1001;">
    <div class="modal-content" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; width: 80%; max-width: 800px; max-height: 90vh; overflow-y: auto;">
        <span class="close" onclick="closeModal('novelGenModal')" style="position: absolute; right: 20px; top: 20px; cursor: pointer;">&times;</span>
        <div id="modalContent"></div>
    </div>
</div>
`;

// 配置面板HTML
const configHtml = `
<div class="config-panel">
    <h3>基础配置</h3>
    <div class="mb-4">
        <label>参考书名 (JSON格式)</label>
        <textarea id="refTitles" class="text-area" rows="4"></textarea>
    </div>
    
    <div class="mb-4">
        <label>参考简介 (JSON格式)</label>
        <textarea id="refSummaries" class="text-area" rows="6"></textarea>
    </div>
    
    <div class="mb-4">
        <label>小说类型 (JSON格式)</label>
        <textarea id="novelTypes" class="text-area" rows="4"></textarea>
    </div>
    
    <div class="mb-4">
        <label>类型关键词 (JSON格式)</label>
        <textarea id="typeKeywords" class="text-area" rows="4"></textarea>
    </div>

    <h3>提示词配置需要手动填入</h3>
    <div class="mb-4">
        <label>书名生成提示词</label>
        <textarea id="titlePrompt" class="text-area" rows="6"></textarea>
    </div>
    
    <div class="mb-4">
        <label>简介生成提示词</label>
        <textarea id="summaryPrompt" class="text-area" rows="8"></textarea>
    </div>

    <div class="button-group">
        <button onclick="saveConfig()">保存配置</button>
        <button onclick="resetConfig()">恢复默认</button>
    </div>
</div>
`;

// 生成面板HTML
const genHtml = `
<div class="gen-panel">
    <div class="mb-4">
        <label>主要类型</label>
        <select id="mainTypeSelector" class="text-area" onchange="updateSubTypeSelector()">
            <option value="urban">都市</option>
            <option value="xianxia">仙侠修真</option>
            <option value="fantasy">奇幻玄幻</option>
            <option value="game">游戏</option>
            <option value="history">历史</option>
            <option value="romance">言情</option>
            <option value="apocalypse">末世</option>
            <option value="fanfic">同人</option>
        </select>
    </div>

    <div class="mb-4">
        <label>细分类型</label>
        <select id="subTypeSelector" class="text-area"></select>
    </div>
    
    <div class="mb-4">
        <label>写作风格</label>
        <select id="styleSelector" class="text-area"></select>
    </div>

    <div class="mb-4">
        <label>剧情类型</label>
        <select id="plotTypeSelector" class="text-area"></select>
    </div>

    <div class="mb-4">
        <label>背景设定</label>
        <textarea id="storyBackground" class="text-area" rows="3" placeholder="请描述故事的背景设定、世界观等..."></textarea>
    </div>

    <div class="mb-4">
        <label>主角设定</label>
        <textarea id="protagonistSetting" class="text-area" rows="3" placeholder="请描述主角的性格、能力、身份等..."></textarea>
    </div>

    <div class="mb-4">
        <label>故事内容</label>
        <textarea id="storyContent" class="text-area" rows="4" placeholder="请简述故事的主要情节和发展方向..."></textarea>
    </div>
    
    <div class="button-group mb-4">
        <button onclick="generateTitle()">生成书名</button>
        <button onclick="generateSummary()">生成简介</button>
        <button onclick="regenerate()">重新生成</button>
        <button onclick="resetGen()">重置</button>
    </div>

    <div class="mb-4">
        <label>生成的书名</label>
        <textarea id="genTitleResult" class="text-area" rows="2" readonly></textarea>
    </div>
    
    <div class="mb-4">
        <label>生成的简介</label>
        <textarea id="genSummaryResult" class="text-area" rows="6" readonly></textarea>
    </div>
</div>
`;

// 历史记录HTML
const historyHtml = `
<div class="history-panel">
    <h3>生成历史</h3>
    <div id="historyList" style="max-height: 70vh; overflow-y: auto;"></div>
    <div class="button-group mt-4">
        <button onclick="clearHistory()">清空历史</button>
    </div>
</div>
`;

// 默认配置
const DEFAULT_CONFIG = {
    titles: {
        urban: [
            "都市超级医仙",
            "开局继承一家集团",
            "退伍后在都市修仙那些年",
            "从小区保安开始修炼"
        ],
        xianxia: [
            "九天踏神路",
            "万古仙穹",
            "修真从种灵药开始",
            "仙途求道"
        ],
        fantasy: [
            "诸天万界之主",
            "开局获得神级天赋",
            "从御兽开始横扫诸天",
            "斗破之至尊归来"
        ],
        game: [
            "网游之最强神话",
            "全球神级游戏",
            "重生之游戏帝王",
            "电竞之王者归来"
        ],
        history: [
            "大明小地主",
            "寒门医女",
            "穿越之庶女逆袭",
            "穿越成皇后"
        ],
        romance: [
            "豪门第一甜婚",
            "影帝的娱乐圈日常",
            "重生之影后归来",
            "霸总前夫太难缠"
        ],
        apocalypse: [
            "末世之最强进化",
            "丧尸危机之求生",
            "末世之全能王者",
            "末日进化从种田开始"
        ],
        fanfic: [
            "综漫：开局融合系统",
            "神话世界：我能吞噬技能",
            "洪荒：从炼气开始",
            "漫威：开局获得无限手套"
        ]
    },
    summaries: [
        "你是否想过，在霓虹璀璨的都市之下，潜藏着来自古老神话的怪物？你是否想过，在那高悬于世人头顶的月亮之上，伫立着守望人间的神明？",
        "陆鼎大一暑假，本想趁着这个时间去实习一下，顺带赚点生活费，谁知道实习的工地挖出了一颗会流血的石头。",
        "在这个魔法与科技并存的世界，主角意外获得了一个可以升级的系统，从此走上了一条与众不同的道路。",
        "末世降临，全球迎来剧变，主角在危机中崛起，带领幸存者们开启了一段传奇般的冒险。"
    ],
    subtypes: {
        urban: {
            'business': '商战职场',
            'cultivation': '都市修仙',
            'farm': '都市种田',
            'boss': '都市霸总',
            'regression': '都市重生',
            'medical': '都市医武',
            'harem': '都市后宫'
        },
        xianxia: {
            'traditional': '传统修真',
            'modern': '现代修真',
            'immortal': '仙侠长生',
            'sect': '门派争锋',
            'farm': '修真种田',
            'harem': '仙门后宫',
            'return': '重生修真'
        },
        fantasy: {
            'eastern': '东方玄幻',
            'western': '西方奇幻',
            'system': '系统流',
            'beast': '妖兽流',
            'harem': '玄幻后宫',
            'return': '重生玄幻',
            'artifact': '神器流'
        },
        game: {
            'vrmmo': '虚拟网游',
            'esport': '电竞竞技',
            'evolution': '游戏进化',
            'godmode': '无敌流',
            'strategy': '策略经营',
            'return': '重生网游',
            'harem': '游戏后宫'
        },
        history: {
            'farming': '历史种田',
            'merchant': '历史经商',
            'politics': '历史权谋',
            'military': '历史军事',
            'crossover': '历史穿越',
            'harem': '历史后宫',
            'medical': '历史医术'
        },
        romance: {
            'sweet': '甜宠言情',
            'showbiz': '娱乐圈文',
            'campus': '校园青春',
            'career': '职场言情',
            'ancient': '古言穿越',
            'modern': '现代言情',
            'revenge': '复仇虐渣'
        },
        apocalypse: {
            'evolution': '进化流',
            'survival': '生存流',
            'farm': '末世种田',
            'system': '系统流',
            'return': '重生流',
            'base': '基地流',
            'zombie': '丧尸流'
        },
        fanfic: {
            'anime': '动漫同人',
            'game': '游戏同人',
            'novel': '小说同人',
            'movie': '影视同人',
            'crossover': '穿越同人',
            'marvel': '漫威同人',
            'cultivation': '修仙同人'
        }
    },
    writingStyles: {
        'normal': '传统正剧',
        'humor': '轻松搞笑',
        'dark': '黑暗残酷',
        'sweet': '温馨治愈',
        'horror': '惊悚恐怖',
        'serious': '严肃正经',
        'literary': '文艺古风'
    },
    plotTypes: {
        'rise': '奋斗流',
        'return': '重生流',
        'system': '系统流',
        'revenge': '复仇流',
        'miracle': '奇遇流',
        'harem': '后宫流',
        'farming': '种田流'
    },
    prompts: {
        title: `请基于以下要求生成一个引人入胜的小说书名：
主要类型：{mainType}
细分类型：{subType}
写作风格：{style}
剧情类型：{plotType}
背景设定：{background}
主角设定：{protagonist}
故事内容：{storyContent}

要求：
1. 书名要突出特色，朗朗上口
2. 符合类型和市场定位
3. 体现核心卖点和爽点
4. 具有新意和记忆点
5. 要能引起读者好奇
6. 突出主角特点或故事特色
7. 符合当下网文市场趋势
8. 避免过于俗套的表达

参考同类书名：{refTitles}`,

        summary: `请基于以下信息生成一个吸引读者的小说简介：
书名：{title}
主要类型：{mainType}
细分类型：{subType}
写作风格：{style}
剧情类型：{plotType}
背景设定：{background}
主角设定：{protagonist}
故事内容：{storyContent}

要求：
1. 开篇要有冲击力
2. 清晰展现故事主线
3. 突出主角特点
4. 设置悬念和期待
5. 体现独特卖点
6. 符合类型特征
7. 控制篇幅精炼
8. 突出爽点
9. 展现世界观特色
10. 埋下阅读引子

参考同类简介：{refSummary}`
    }
};

// 显示/隐藏模态框
function showModal(id, content) {
    $('#modalContent').html(content);
    $(`#${id}`).show();
}

function closeModal(id) {
    $(`#${id}`).hide();
}

// 显示配置面板
function showNovelGenConfig() {
    showModal('novelGenModal', configHtml);
    const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
    
    $('#refTitles').val(JSON.stringify(config.titles, null, 2));













	    $('#refSummaries').val(JSON.stringify(config.summaries, null, 2));
    $('#novelTypes').val(JSON.stringify(config.subtypes, null, 2));
    $('#typeKeywords').val(JSON.stringify(config.plotTypes, null, 2));
    $('#titlePrompt').val(config.prompts.title);
    $('#summaryPrompt').val(config.prompts.summary);
}

// 显示生成面板
function showNovelGen() {
    showModal('novelGenModal', genHtml);
    updateSubTypeSelector();
    updateStyleSelector();
    updatePlotTypeSelector();
}

// 显示历史记录
function showHistory() {
    showModal('novelGenModal', historyHtml);
    displayHistory();
}

// 更新选择器函数
function updateSubTypeSelector() {
    const mainType = $('#mainTypeSelector').val();
    const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
    const subTypes = config.subtypes[mainType];

    const select = $('#subTypeSelector');
    select.empty();

    Object.entries(subTypes).forEach(([key, value]) => {
        select.append(`<option value="${key}">${value}</option>`);
    });
}

function updateStyleSelector() {
    const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
    const select = $('#styleSelector');
    select.empty();
    Object.entries(config.writingStyles).forEach(([key, value]) => {
        select.append(`<option value="${key}">${value}</option>`);
    });
}

function updatePlotTypeSelector() {
    const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
    const select = $('#plotTypeSelector');
    select.empty();
    Object.entries(config.plotTypes).forEach(([key, value]) => {
        select.append(`<option value="${key}">${value}</option>`);
    });
}

// 保存配置
function saveConfig() {
    try {
        const config = {
            titles: JSON.parse($('#refTitles').val()),
            summaries: JSON.parse($('#refSummaries').val()),
            subtypes: JSON.parse($('#novelTypes').val()),
            plotTypes: JSON.parse($('#typeKeywords').val()),
            writingStyles: DEFAULT_CONFIG.writingStyles,
            prompts: {
                title: $('#titlePrompt').val(),
                summary: $('#summaryPrompt').val()
            }
        };

        localStorage.setItem('novelGenConfig', JSON.stringify(config));
        alert('配置已保存');
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

// 重置配置
function resetConfig() {
    if (confirm('确定要恢复默认配置吗？')) {
        localStorage.setItem('novelGenConfig', JSON.stringify(DEFAULT_CONFIG));
        showNovelGenConfig();
    }
}

// 生成相关函数
async function generateTitle() {
    try {
        const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
        const settings = getGenerationSettings();

        const prompt = buildTitlePrompt(config, settings);
        const response = await fetch('gen', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt})
        });

        const result = await handleStreamResponse(response, $('#genTitleResult')[0]);
        saveHistory(result, '', settings);
        return result;
    } catch (error) {
        alert('生成失败: ' + error.message);
        return null;
    }
}

async function generateSummary() {
    const title = $('#genTitleResult').val();
    if (!title) {
        alert('请先生成书名！');
        return;
    }

    try {
        const config = JSON.parse(localStorage.getItem('novelGenConfig') || JSON.stringify(DEFAULT_CONFIG));
        const settings = getGenerationSettings();

        const prompt = buildSummaryPrompt(config, settings, title);
        const response = await fetch('gen', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt})
        });

        const result = await handleStreamResponse(response, $('#genSummaryResult')[0]);
        updateHistory(title, result);
        return result;
    } catch (error) {
        alert('生成失败: ' + error.message);
        return null;
    }
}

function getGenerationSettings() {
    return {
        mainType: $('#mainTypeSelector').val(),
        subType: $('#subTypeSelector').val(),
        style: $('#styleSelector').val(),
        plotType: $('#plotTypeSelector').val(),
        background: $('#storyBackground').val(),
        protagonist: $('#protagonistSetting').val(),
        storyContent: $('#storyContent').val()
    };
}

function buildTitlePrompt(config, settings) {
    const mainType = settings.mainType;
    const refTitles = config.titles[mainType].join('、');

    return config.prompts.title
        .replace('{mainType}', config.subtypes[mainType][settings.subType])
        .replace('{subType}', config.subtypes[mainType][settings.subType])
        .replace('{style}', config.writingStyles[settings.style])
        .replace('{plotType}', config.plotTypes[settings.plotType])
        .replace('{background}', settings.background || '无特殊背景设定')
        .replace('{protagonist}', settings.protagonist || '无特殊主角设定')
        .replace('{storyContent}', settings.storyContent || '无具体情节设定')
        .replace('{refTitles}', refTitles);
}

function buildSummaryPrompt(config, settings, title) {
    return config.prompts.summary
        .replace('{title}', title)
        .replace('{mainType}', config.subtypes[settings.mainType][settings.subType])
        .replace('{subType}', config.subtypes[settings.mainType][settings.subType])
        .replace('{style}', config.writingStyles[settings.style])
        .replace('{plotType}', config.plotTypes[settings.plotType])
        .replace('{background}', settings.background || '无特殊背景设定')
        .replace('{protagonist}', settings.protagonist || '无特殊主角设定')
        .replace('{storyContent}', settings.storyContent || '无具体情节设定')
        .replace('{refSummary}', config.summaries[0]);
}

// 历史记录相关函数
function saveHistory(title, summary, settings) {
    let history = JSON.parse(localStorage.getItem('novelGenHistory') || '[]');
    history.unshift({
        title,
        summary,
        settings,
        timestamp: new Date().toISOString()
    });

    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('novelGenHistory', JSON.stringify(history));

    if ($('#historyList').length) {
        displayHistory();
    }
}

function updateHistory(title, summary) {
    let history = JSON.parse(localStorage.getItem('novelGenHistory') || '[]');
    const index = history.findIndex(item => item.title === title);
    if (index !== -1) {
        history[index].summary = summary;
        localStorage.setItem('novelGenHistory', JSON.stringify(history));
        if ($('#historyList').length) {
            displayHistory();
        }
    }
}

function displayHistory() {
    const history = JSON.parse(localStorage.getItem('novelGenHistory') || '[]');
    const historyHtml = history.map((item, index) => `
        <div class="history-item" style="margin: 10px 0; padding: 10px; border: 1px solid #eee; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong>${item.title || '未生成标题'}</strong>
                <small>${new Date(item.timestamp).toLocaleString()}</small>
            </div>
            ${item.summary ? `<p style="margin: 5px 0;">${item.summary}</p>` : ''}
            <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                <strong>设置:</strong>
                ${item.settings ? `
                    主类型: ${item.settings.mainType},
                    细分: ${item.settings.subType},
                    风格: ${item.settings.style},
                    剧情: ${item.settings.plotType}
                ` : '无设置信息'}
            </div>
            <div class="button-group mt-2">
                <button onclick="loadHistory(${index})">加载此设置</button>
                <button onclick="deleteHistory(${index})">删除</button>
            </div>
        </div>
    `).join('');

    $('#historyList').html(historyHtml || '<p>暂无历史记录</p>');
}

function loadHistory(index) {
    const history = JSON.parse(localStorage.getItem('novelGenHistory') || '[]');
    const item = history[index];
    if (item && item.settings) {
        showNovelGen();
        setTimeout(() => {
            $('#mainTypeSelector').val(item.settings.mainType);
            updateSubTypeSelector();
            $('#subTypeSelector').val(item.settings.subType);
            $('#styleSelector').val(item.settings.style);
            $('#plotTypeSelector').val(item.settings.plotType);
            $('#storyBackground').val(item.settings.background || '');
            $('#protagonistSetting').val(item.settings.protagonist || '');
            $('#storyContent').val(item.settings.storyContent || '');
            $('#genTitleResult').val(item.title || '');
            $('#genSummaryResult').val(item.summary || '');
        }, 100);
    }
}

function deleteHistory(index) {
    if (confirm('确定要删除这条历史记录吗？')) {
        let history = JSON.parse(localStorage.getItem('novelGenHistory') || '[]');
        history.splice(index, 1);
        localStorage.setItem('novelGenHistory', JSON.stringify(history));
        displayHistory();
    }
}

function clearHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        localStorage.setItem('novelGenHistory', '[]');
        displayHistory();
    }
}

// 处理流式响应
async function handleStreamResponse(response, element) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
        const {value, done} = await reader.read();
        if (done) break;

        result += decoder.decode(value, {stream: true});
        element.value = result;
        element.scrollTop = element.scrollHeight;
    }

    return result;
}

// 其他功能函数
function regenerate() {
    generateTitle();
}

function resetGen() {
    $('#genTitleResult').val('');
    $('#genSummaryResult').val('');
    $('#storyBackground').val('');
    $('#protagonistSetting').val('');
    $('#storyContent').val('');
}

// 初始化
// 初始化
$(document).ready(function() {
    $('body').prepend(topBarHtml);
    loadConfig();
    // 调整页面顶部边距
    $('.container').css('margin-top', '60px');
});
function loadConfig() {
    if (!localStorage.getItem('novelGenConfig')) {
        localStorage.setItem('novelGenConfig', JSON.stringify(DEFAULT_CONFIG));
    }
}
