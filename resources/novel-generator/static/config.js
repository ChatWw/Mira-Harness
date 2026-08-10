const genreConfigs = {
    urbanReborn: {
        name: "都市重生",
        prompts: {
            outline: "作为资深小说策划，请基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作一个都市重生故事。要求：\n1.设定吸引人的重生契机\n2.规划3-5个事业转折点\n3.设计感情与事业双线发展\n4.突出商战与情感冲突\n5.体现重生者的成长蜕变",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.职场布局与人脉积累\n2.感情线索的推进方式\n3.具体商业机遇把握\n4.敌我力量对比变化\n5.个人成长的关键节点",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.商战细节要专业\n2.感情描写要细腻\n3.对话要凸显身份\n4.场景要突出格调\n5.节奏要张弛有度"
        },
        outlineMenu: [
            { name: "深化冲突", prompt: "基于背景：${background}\n人物：${characters}\n在保持合理性的前提下，将以下内容的冲突升级，制造更强的戏剧性：${selected_text}" },
            { name: "增加伏笔", prompt: "分析剧情：${plot}\n为以下内容设计巧妙的伏笔，为后续发展埋下种子：${selected_text}" },
            { name: "完善人物动机", prompt: "基于人物性格：${characters}\n关系：${relationships}\n补充和优化以下内容中人物的行动动机，使其更符合性格：${selected_text}" },
            { name: "强化感情线", prompt: "基于角色关系：${relationships}\n加强以下内容中的感情发展，让感情线更吸引人：${selected_text}" },
            { name: "优化节奏", prompt: "分析当前剧情走向，调整以下内容的节奏安排，确保张弛有度：${selected_text}" },
            { name: "扩充细节", prompt: "基于背景：${background}\n为以下内容补充更多细节，增强画面感和沉浸感：${selected_text}" },
            { name: "提升高潮", prompt: "在符合逻辑的前提下，将以下内容的高潮部分改写得更加震撼：${selected_text}" },
            { name: "商战升级", prompt: "在${selected_text}中加入一场高水平商业博弈，突出主角的商业才能" },
            { name: "危机应对", prompt: "为${selected_text}设置一个重大危机及其化解过程，展现主角的应变能力" },
            { name: "资源整合", prompt: "在${selected_text}中展现主角整合各方资源的手段与能力" }
        ]
    },
    brainHole: {
        name: "脑洞网文",
        prompts: {
            outline: "作为脑洞文策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作天马行空的故事。要求：\n1.设定独特世界观\n2.规划3-5个惊人梗点\n3.设计反转与逆转\n4.突出脑洞创意性\n5.体现故事魔幻感",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.创意点的展现\n2.逻辑的自洽性\n3.反转的设计感\n4.人物的特异性\n5.世界的新奇感",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.创意要出人意料\n2.逻辑要自圆其说\n3.画面要奇幻独特\n4.细节要异想天开\n5.节奏要跌宕起伏"
        },
        outlineMenu: [
            { name: "设定解密", prompt: "在${selected_text}中揭示一个惊人的世界设定" },
            { name: "逆天改命", prompt: "为${selected_text}设计一个打破常规的逆转" },
            { name: "脑洞升级", prompt: "在${selected_text}中加入更疯狂的脑洞元素" },
            { name: "身份反转", prompt: "为${selected_text}设计一个意想不到的身份揭露" },
            { name: "规则突破", prompt: "在${selected_text}中打破既有规则限制" },
            { name: "时空交错", prompt: "为${selected_text}增加时空穿梭的元素" },
            { name: "异能觉醒", prompt: "描写${selected_text}中诡异的能力觉醒" },
            { name: "终极真相", prompt: "在${selected_text}中埋下终极真相的线索" },
            { name: "维度跨越", prompt: "为${selected_text}添加维度穿越的情节" },
            { name: "崩坏重构", prompt: "在${selected_text}中展现世界秩序的崩坏重组" }
        ]
    },
    urbanCultivation: {
        name: "都市修仙",
        prompts: {
            outline: "作为修仙小说策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作都市修仙故事。要求：\n1.设定独特的修炼体系\n2.规划3-5个境界突破点\n3.设计修仙与都市双线\n4.突出正邪势力冲突\n5.体现主角的道心成长",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.修炼进境的关键\n2.仙凡矛盾的处理\n3.机缘造化的把握\n4.敌我实力的变化\n5.道心历练的体现",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.修炼描写要专业\n2.战斗场面要震撼\n3.仙凡转换要自然\n4.格调要玄妙雅致\n5.节奏要紧张有序"
        },
        outlineMenu: [
            { name: "深化修炼", prompt: "基于修炼体系：${background}\n在${selected_text}中加入一场关键的修炼突破" },
            { name: "仙凡冲突", prompt: "在${selected_text}中制造修仙与现实世界的矛盾冲突" },
            { name: "强化战斗", prompt: "基于角色实力：${characters}\n优化${selected_text}中的修仙斗法场景" },
            { name: "增添机缘", prompt: "在${selected_text}中安排修仙机缘际遇" },
            { name: "道心考验", prompt: "为${selected_text}设置一个考验主角道心的情节" },
            { name: "势力对抗", prompt: "在${selected_text}中展现正邪两道势力的较量" },
            { name: "法宝炼制", prompt: "加入${selected_text}中的法宝炼制或获得过程" },
            { name: "布局天机", prompt: "在${selected_text}中埋下修仙劫数的伏笔" },
            { name: "完善人物", prompt: "基于人物性格：${characters}\n关系：${relationships}\n深化${selected_text}中人物的心境变化" },
            { name: "强化感情", prompt: "在${selected_text}中展现修仙路上的情缘牵绊" }
        ]
    },
    urbanMartial: {
        name: "都市高武",
        prompts: {
            outline: "作为都市武侠策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作都市高武故事。要求：\n1.设定独特的武道体系\n2.规划3-5个实力进阶点\n3.设计武道与都市双线\n4.突出武者间的较量\n5.体现主角的武道成长",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.武学技巧展现\n2.实力等级划分\n3.格斗竞技安排\n4.武道资源获取\n5.江湖势力交织",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.武学描写要专业\n2.打斗场面要精彩\n3.武道元素要现代\n4.场景要动感震撼\n5.节奏要紧张刺激"
        },
        outlineMenu: [
            { name: "武道突破", prompt: "在${selected_text}中加入一场关键的武道突破" },
            { name: "格斗竞技", prompt: "为${selected_text}设计一场高水平的武道竞技" },
            { name: "势力冲突", prompt: "在${selected_text}中展现武道势力间的较量" },
            { name: "武学传承", prompt: "描写${selected_text}中获得武学传承的过程" },
            { name: "生死对决", prompt: "为${selected_text}安排一场生死决战" },
            { name: "武道资源", prompt: "在${selected_text}中展示武道资源的争夺" },
            { name: "暗劲交锋", prompt: "描写${selected_text}中的暗劲较量场景" },
            { name: "武道秘境", prompt: "为${selected_text}设计一处武道秘境探索" },
            { name: "武者集会", prompt: "在${selected_text}中展现武者间的集会交流" },
            { name: "武道考核", prompt: "描写${selected_text}中的武道等级考核" }
        ]
    },

    apocalypticSystem: {
        name: "末日系统",
        prompts: {
            outline: "作为末日文策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作末日系统故事。要求：\n1.设定独特的末日场景\n2.规划3-5个关键生存点\n3.设计系统与生存双线\n4.突出危机与进化\n5.体现主角的成长蜕变",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.系统任务完成\n2.生存资源获取\n3.危机处理方式\n4.进化路线选择\n5.团队合作发展",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.末日氛围要真实\n2.系统操作要合理\n3.生存细节要专业\n4.危机处理要智慧\n5.节奏要紧张刺激"
        },
        outlineMenu: [
            { name: "系统升级", prompt: "在${selected_text}中展现系统新功能开启" },
            { name: "危机降临", prompt: "为${selected_text}设计一场末日危机" },
            { name: "资源争夺", prompt: "描写${selected_text}中的生存资源争夺" },
            { name: "进化突破", prompt: "在${selected_text}中展示能力进化过程" },
            { name: "团队建设", prompt: "为${selected_text}增加生存团队的建设" },
            { name: "怪物狩猎", prompt: "在${selected_text}中描写狩猎变异生物" },
            { name: "庇护所建设", prompt: "描述${selected_text}中的庇护所建设" },
            { name: "势力冲突", prompt: "展现${selected_text}中的幸存者势力冲突" },
            { name: "特殊任务", prompt: "设计${selected_text}中的系统特殊任务" },
            { name: "末日探索", prompt: "描写${selected_text}中的废墟探索历程" }
        ]
    },

    fantasySystemCultivation: {
        name: "玄幻系统修仙",
        prompts: {
            outline: "作为系统修仙策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作玄幻系统修仙故事。要求：\n1.设定独特的系统修炼\n2.规划3-5个境界突破点\n3.设计系统与修真双线\n4.突出玄幻与仙道结合\n5.体现主角的修炼成长",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.系统辅助修炼\n2.玄幻世界探索\n3.修真资源获取\n4.势力关系处理\n5.修为境界提升",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.系统功能要新颖\n2.修炼描写要专业\n3.玄幻元素要独特\n4.场景要磅礴壮阔\n5.节奏要跌宕起伏"
        },
        outlineMenu: [
            { name: "系统突破", prompt: "在${selected_text}中展现系统辅助突破" },
            { name: "玄幻历练", prompt: "为${selected_text}设计玄幻世界历练" },
            { name: "仙道机缘", prompt: "描写${selected_text}中的仙道机缘获得" },
            { name: "法宝炼制", prompt: "在${selected_text}中展示系统辅助炼器" },
            { name: "势力建设", prompt: "为${selected_text}增加修真势力的建设" },
            { name: "秘境探索", prompt: "在${selected_text}中描写玄幻秘境探索" },
            { name: "系统任务", prompt: "设计${selected_text}中的特殊系统任务" },
            { name: "天劫应对", prompt: "展现${selected_text}中的天劫渡化过程" },
            { name: "玄幻战斗", prompt: "描写${selected_text}中的玄幻战斗场景" },
            { name: "道法融合", prompt: "在${selected_text}中展示道法系统的融合" }
        ]
    },

    dominantCEO: {
        name: "霸总",
        prompts: {
            outline: "作为霸总文策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作都市霸总故事。要求：\n1.设定强大的商业帝国\n2.规划3-5个关键商战\n3.设计权势与爱情双线\n4.突出豪门恩怨纠葛\n5.体现霸道总裁的成长",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.商业布局的关键\n2.感情纠葛的推进\n3.权力较量的升级\n4.家族势力的变化\n5.个人成长的体现",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.商战描写要霸气\n2.感情描写要强势\n3.对话要凸显身份\n4.场景要奢华精致\n5.节奏要紧凑有力"
        },
        outlineMenu: [
            { name: "商业布局", prompt: "在${selected_text}中展现一场惊心动魄的商业收购" },
            { name: "豪门对抗", prompt: "基于背景：${background}\n加入${selected_text}中的豪门势力较量" },
            { name: "霸道追爱", prompt: "基于角色关系：${relationships}\n深化${selected_text}中的霸道追求戏码" },
            { name: "家族纷争", prompt: "在${selected_text}中制造家族内部的权力争斗" },
            { name: "商战反转", prompt: "为${selected_text}设计一个商战局势的逆转" },
            { name: "感情危机", prompt: "在${selected_text}中制造感情信任的考验" },
            { name: "权力交锋", prompt: "加强${selected_text}中的权力博弈场面" },
            { name: "身世之谜", prompt: "在${selected_text}中埋下身世之谜的线索" },
            { name: "复仇布局", prompt: "展现${selected_text}中的商业复仇计划" },
            { name: "强化气场", prompt: "深化${selected_text}中霸总的强势魅力表现" }
        ]
    },

    regretFlow: {
        name: "后悔流",
        prompts: {
            outline: "作为后悔流策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作后悔文故事。要求：\n1.设定令人心痛的后悔点\n2.规划3-5个关键转折\n3.设计愧疚与弥补双线\n4.突出情感打动人心\n5.体现人物的救赎成长",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.情感创伤的根源\n2.愧疚心理的体现\n3.挽回行动的展开\n4.心理状态的变化\n5.救赎之路的探索",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.心理描写要细腻\n2.情感冲突要真挚\n3.对话要饱含深意\n4.场景要催人泪下\n5.节奏要缓急得当"
        },
        outlineMenu: [
            { name: "深化后悔", prompt: "在${selected_text}中展现更深层的后悔情感" },
            { name: "愧疚折磨", prompt: "描写${selected_text}中的内心煎熬" },
            { name: "挽回行动", prompt: "设计${selected_text}中的弥补努力" },
            { name: "情感爆发", prompt: "在${selected_text}中展现压抑情感的爆发" },
            { name: "心理转变", prompt: "描述${selected_text}中的心理变化过程" },
            { name: "记忆闪回", prompt: "在${selected_text}中插入关键往事回忆" },
            { name: "救赎时刻", prompt: "设计${selected_text}中的救赎关键点" },
            { name: "原谅契机", prompt: "为${selected_text}创造和解的可能" },
            { name: "情感修复", prompt: "描写${selected_text}中的关系修复过程" },
            { name: "成长蜕变", prompt: "展现${selected_text}中的心智成长" }
        ]
    },

    invincibleHero: {
        name: "无敌文",
        prompts: {
            outline: "作为无敌文策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作无敌流故事。要求：\n1.设定独特的强大体系\n2.规划3-5个实力暴涨点\n3.设计碾压与成长双线\n4.突出主角的无敌姿态\n5.体现霸绝天下的气概",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.实力提升方式\n2.碾压对手过程\n3.底牌释放时机\n4.强者之路展现\n5.无敌气质塑造",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.战斗描写要震撼\n2.实力展现要惊艳\n3.对话要霸气十足\n4.场景要磅礴大气\n5.节奏要快意恩仇"
        },
        outlineMenu: [
            { name: "实力暴涨", prompt: "在${selected_text}中展现实力暴涨过程" },
            { name: "强者碾压", prompt: "描写${selected_text}中的压倒性战斗" },
            { name: "底牌尽出", prompt: "设计${selected_text}中的底牌释放" },
            { name: "势力臣服", prompt: "在${selected_text}中展示敌对势力臣服" },
            { name: "境界突破", prompt: "描述${selected_text}中的境界突破" },
            { name: "装逼打脸", prompt: "在${selected_text}中安排装逼打脸情节" },
            { name: "霸道镇压", prompt: "设计${selected_text}中的强势镇压" },
            { name: "威压全场", prompt: "展现${selected_text}中的气势碾压" },
            { name: "无敌战斗", prompt: "描写${selected_text}中的无敌战斗" },
            { name: "称霸天下", prompt: "为${selected_text}设计称霸情节" }
        ]
    },

    alternateHistory: {
        name: "历史架空",
        prompts: {
            outline: "作为历史架空策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作架空历史故事。要求：\n1.设定合理的历史分歧点\n2.规划3-5个历史转折点\n3.设计权谋与变革双线\n4.突出历史事件改写\n5.体现时代变迁特色",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.历史背景还原\n2.政治博弈展开\n3.军事战略运用\n4.民生变革实施\n5.历史走向改变",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.历史细节要考究\n2.权谋描写要精妙\n3.对话要符合时代\n4.场景要还原历史\n5.节奏要波澜壮阔"
        },
        outlineMenu: [
            { name: "历史转折", prompt: "在${selected_text}中设计关键的历史转折点" },
            { name: "权谋博弈", prompt: "展现${selected_text}中的朝堂权谋斗争" },
            { name: "军事战略", prompt: "描写${selected_text}中的军事战略部署" },
            { name: "变法改革", prompt: "设计${selected_text}中的变法改革过程" },
            { name: "民生发展", prompt: "展示${selected_text}中的民生发展变化" },
            { name: "外交较量", prompt: "描述${selected_text}中的国际外交博弈" },
            { name: "科技革新", prompt: "在${selected_text}中加入科技发展线索" },
            { name: "文化演变", prompt: "体现${selected_text}中的文化发展变迁" },
            { name: "势力消长", prompt: "描写${selected_text}中各方势力的消长" },
            { name: "历史影响", prompt: "展现${selected_text}中的蝴蝶效应" }
        ]
    },

    urbanFarming: {
        name: "都市种田养成",
        prompts: {
            outline: "作为都市种田策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作都市种田故事。要求：\n1.设定特色农业体系\n2.规划3-5个发展阶段\n3.设计种植与经营双线\n4.突出田园生活情趣\n5.体现产业化发展",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.种植技术运用\n2.产业链打造\n3.市场运营拓展\n4.人际网络建设\n5.田园生活展现",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.农业知识要专业\n2.经营手法要新颖\n3.生活气息要浓厚\n4.场景要自然田园\n5.节奏要从容惬意"
        },
        outlineMenu: [
            { name: "技术创新", prompt: "在${selected_text}中展示农业技术创新" },
            { name: "产业升级", prompt: "描述${selected_text}中的产业升级过程" },
            { name: "市场营销", prompt: "设计${selected_text}中的市场营销策略" },
            { name: "品牌打造", prompt: "展现${selected_text}中的农产品品牌化" },
            { name: "生态建设", prompt: "描写${selected_text}中的生态农业建设" },
            { name: "人才培养", prompt: "设计${selected_text}中的技术人才培养" },
            { name: "休闲农业", prompt: "展示${selected_text}中的观光农业发展" },
            { name: "社区营造", prompt: "描述${selected_text}中的乡村社区建设" },
            { name: "资源整合", prompt: "展现${selected_text}中的资源整合过程" },
            { name: "产业链条", prompt: "设计${selected_text}中的全产业链布局" }
        ]
    },

    orientalFantasy: {
        name: "东方玄幻",
        prompts: {
            outline: "作为东方玄幻策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作东方玄幻故事。要求：\n1.设定独特的修炼体系\n2.规划3-5个大境界划分\n3.设计问道与争锋双线\n4.突出东方文化底蕴\n5.体现天道大势变化",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.修炼体系展现\n2.东方元素融入\n3.势力格局变化\n4.天地大道感悟\n5.仙凡格局演变",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.玄幻元素要东方\n2.战斗场景要磅礴\n3.文化底蕴要深厚\n4.场景要意境优美\n5.节奏要大气恢宏"
        },
        outlineMenu: [
            { name: "问道天地", prompt: "在${selected_text}中展现问道求索过程" },
            { name: "神通大战", prompt: "描写${selected_text}中的神通法术对决" },
            { name: "势力争锋", prompt: "展示${selected_text}中的势力间较量" },
            { name: "仙缘机遇", prompt: "设计${selected_text}中的仙缘际遇" },
            { name: "大道感悟", prompt: "描述${selected_text}中的大道感悟" },
            { name: "天劫考验", prompt: "展现${selected_text}中的天劫历程" },
            { name: "神器炼制", prompt: "描写${selected_text}中的神器炼制" },
            { name: "秘境探索", prompt: "设计${selected_text}中的秘境探索" },
            { name: "因果轮回", prompt: "展示${selected_text}中的因果报应" },
            { name: "天道变化", prompt: "描述${selected_text}中的天道演变" }
        ]
    },

    strategyManagement: {
        name: "策略经营",
        prompts: {
            outline: "作为策略经营策划，基于：背景${background}、人物${characters}、关系${relationships}、剧情${plot}，创作策略经营故事。要求：\n1.设定完整商业体系\n2.规划3-5个发展阶段\n3.设计经营与竞争双线\n4.突出策略性决策\n5.体现企业化发展",
            chapter: "一定要用分割符来做章节分割###fenge基于大纲${outline}，将以下章节细化：\n重点规划：\n1.经营策略制定\n2.资源调配优化\n3.市场竞争应对\n4.团队建设管理\n5.危机处理方案",
            content: "基于：背景${background}、人物${characters}、关系${relationships}、情节${plot}，展开本章节创作。要求：\n1.经营细节要专业\n2.策略运用要精妙\n3.决策过程要理性\n4.场景要商业化\n5.节奏要紧凑有序"
        },
        outlineMenu: [
            { name: "战略规划", prompt: "在${selected_text}中展现企业战略规划" },
            { name: "资源整合", prompt: "描述${selected_text}中的资源整合优化" },
            { name: "市场扩张", prompt: "设计${selected_text}中的市场扩张策略" },
            { name: "团队管理", prompt: "展示${selected_text}中的团队管理方案" },
            { name: "危机处理", prompt: "描写${selected_text}中的危机应对过程" },
            { name: "产品创新", prompt: "展现${selected_text}中的产品研发创新" },
            { name: "品牌建设", prompt: "设计${selected_text}中的品牌塑造过程" },
            { name: "资本运作", prompt: "描述${selected_text}中的资本运作手段" },
            { name: "并购重组", prompt: "展示${selected_text}中的并购重组计划" },
            { name: "商业模式", prompt: "设计${selected_text}中的商业模式创新" }
        ]
    }
};


// 通用的菜单配置生成函数
function generateMenuConfig(menuItems) {
    return JSON.stringify({
        menu: menuItems
    });
}

// 初始化页面元素
function initializeGenreSelector() {
    const selectorContainer = $('<div>', {
        class: 'genre-selector-container',
        css: {
            padding: '15px',
            marginBottom: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
    });

    const label = $('<label>', {
        text: '选择小说类型：',
        css: {
            marginRight: '10px',
            fontWeight: 'bold'
        }
    });

    const selector = $('<select>', {
        id: 'genre-selector',
        css: {
            padding: '8px 15px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            fontSize: '14px',
            cursor: 'pointer'
        }
    });

    Object.entries(genreConfigs).forEach(([key, config]) => {
        selector.append($('<option>', {
            value: key,
            text: config.name
        }));
    });

    selectorContainer.append(label).append(selector);
    $('.container').prepend(selectorContainer);

    selector.on('change', updateGenreConfigs);
    loadMenuConfigs();
}

// 更新配置函数
function updateGenreConfigs() {
    const selectedGenre = $('#genre-selector').val();
    const config = genreConfigs[selectedGenre];

    if (!config) return;

    // 更新所有提示词
    updatePromptsAndMenus(config);
    saveMenuConfigs();
}

function updatePromptsAndMenus(config) {
    // 更新基础设置
    $('#background').val(config.prompts.outline.split('\n')[0]);
    $('#characters').val(config.prompts.outline.split('\n')[1]);
    $('#relationships').val(config.prompts.outline.split('\n')[2]);
    $('#plot').val(config.prompts.outline.split('\n')[3]);
    $('#style').val(config.prompts.content);

    // 更新提示词配置
    $('#outline-prompt').val(config.prompts.outline);
    $('#chapter-prompt').val(config.prompts.chapter);
    $('#content-prompt').val(config.prompts.content);

    // 更新右键菜单配置
    $('#outline-menu-config').val(generateMenuConfig(config.outlineMenu));
    $('#chapter-menu-config').val(generateMenuConfig(config.outlineMenu));
    $('#content-menu-config').val(generateMenuConfig(config.outlineMenu));
}

// 保存菜单配置到localStorage
function saveMenuConfigs() {
    const menuConfigs = {
        selectedGenre: $('#genre-selector').val(),
        outlineMenu: $('#outline-menu-config').val(),
        chapterMenu: $('#chapter-menu-config').val(),
        contentMenu: $('#content-menu-config').val()
    };
    localStorage.setItem('menuConfigs', JSON.stringify(menuConfigs));
}

// 从localStorage加载菜单配置
function loadMenuConfigs() {
    const savedConfigs = localStorage.getItem('menuConfigs');
    if (savedConfigs) {
        const configs = JSON.parse(savedConfigs);
        $('#genre-selector').val(configs.selectedGenre);
        $('#outline-menu-config').val(configs.outlineMenu);
        $('#chapter-menu-config').val(configs.chapterMenu);
        $('#content-menu-config').val(configs.contentMenu);
        
        // 如果有选中的类型，更新配置
        if (configs.selectedGenre) {
            updateGenreConfigs();
        }
    }
}

// 修改现有的saveState函数
const originalSaveState = saveState;
function saveState() {
    originalSaveState();
    saveMenuConfigs();
}

// 页面加载完成后初始化
$(document).ready(function() {
    initializeGenreSelector();
    
    // 添加菜单配置变化监听
    $('#outline-menu-config, #chapter-menu-config, #content-menu-config').on('input', saveMenuConfigs);

    // 添加样式
    const style = $('<style>').text(`
        .genre-selector-container select:hover {
            border-color: #4CAF50;
        }
        .genre-selector-container select:focus {
            border-color: #4CAF50;
            box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
            outline: none;
        }
    `);
    $('head').append(style);
});
