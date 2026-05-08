// Classify the *intent* of a user message or scene description.
// Returns { level: 'sfw' | 'suggestive' | 'nsfw' | 'explicit', tags: string[] }
//
// `tags` are English Danbooru/booru tags pulled from the message that
// the prompt-builder should incorporate (so "给我看看你的小穴" actually
// produces `pussy, spread legs, close-up`, not a clothed full-body shot).

// Note: explicit/sexual terms here are present because the user
// specifically reported that NSFW intent was being missed and resulting
// in clothed images. Filtering must be accurate to fulfill the user's
// request.

const ZH_EXPLICIT = [
    // ── 女性器官（pussy & related）—— 都暗示裸露
    { zh: '小穴', en: 'pussy', tags: ['pussy', 'spread pussy', 'nude'] },
    { zh: '阴道', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '逼', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '阴蒂', en: 'clitoris', tags: ['clitoris', 'pussy', 'nude'] },
    { zh: '阴唇', en: 'pussy lips', tags: ['pussy', 'pussy lips', 'nude'] },
    { zh: '肉穴', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '蜜穴', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '骚穴', en: 'pussy', tags: ['pussy', 'wet pussy', 'nude'] },
    { zh: '骚逼', en: 'pussy', tags: ['pussy', 'wet pussy', 'nude'] },
    { zh: '小屄', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '屄', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '小妹妹', en: 'pussy', tags: ['pussy', 'nude'] },
    { zh: '下面', en: 'pussy', tags: ['pussy'] },
    // ── 肛门 / 屁股
    { zh: '后庭', en: 'anus', tags: ['anus', 'ass'] },
    { zh: '菊穴', en: 'anus', tags: ['anus', 'ass'] },
    { zh: '菊花', en: 'anus', tags: ['anus', 'ass'] },
    { zh: '屁眼', en: 'anus', tags: ['anus', 'ass', 'nude'] },
    { zh: '屁穴', en: 'anus', tags: ['anus', 'ass', 'nude'] },
    { zh: '屁洞', en: 'anus', tags: ['anus', 'ass', 'nude'] },
    { zh: '肛门', en: 'anus', tags: ['anus', 'ass'] },
    { zh: '肛交', en: 'anal sex', tags: ['anal', 'anus', 'sex'] },
    { zh: '爆菊', en: 'anal sex', tags: ['anal', 'anus', 'sex'] },
    { zh: '肛', en: 'anus', tags: ['anus', 'ass'] },
    { zh: '菊', en: 'anus', tags: ['anus', 'ass'] },
    // ── 男性器官
    { zh: '屌', en: 'penis', tags: ['penis', 'erection'] },
    { zh: '鸡巴', en: 'penis', tags: ['penis', 'erection'] },
    { zh: '鸡吧', en: 'penis', tags: ['penis', 'erection'] },
    { zh: '鸡儿', en: 'penis', tags: ['penis'] },
    { zh: '阴茎', en: 'penis', tags: ['penis', 'erection'] },
    { zh: '肉棒', en: 'penis', tags: ['penis', 'erection', 'huge penis'] },
    { zh: '肉茎', en: 'penis', tags: ['penis', 'erection'] },
    { zh: '男根', en: 'penis', tags: ['penis', 'erection', 'huge penis'] },
    { zh: '巨根', en: 'huge penis', tags: ['penis', 'erection', 'huge penis', 'large penis'] },
    { zh: '硬挺', en: 'erection', tags: ['penis', 'erection'] },
    { zh: '勃起', en: 'erection', tags: ['penis', 'erection'] },
    { zh: '龟头', en: 'glans', tags: ['penis', 'glans'] },
    { zh: '马眼', en: 'urethra', tags: ['penis', 'urethra'] },
    { zh: '睾丸', en: 'testicles', tags: ['testicles', 'penis'] },
    { zh: '蛋蛋', en: 'testicles', tags: ['testicles', 'penis'] },
    { zh: '卵蛋', en: 'testicles', tags: ['testicles', 'penis'] },
    { zh: '阴囊', en: 'scrotum', tags: ['testicles', 'scrotum'] },
    { zh: '卵子', en: 'sperm', tags: ['sperm', 'cum'] },
    { zh: '精子', en: 'sperm', tags: ['sperm', 'cum'] },
    { zh: '乳头', en: 'nipples', tags: ['nipples', 'breasts'] },
    { zh: '乳晕', en: 'areola', tags: ['nipples', 'areola', 'topless'] },
    { zh: '乳房', en: 'breasts', tags: ['breasts', 'large breasts'] },
    // Slang ("nai zi" / "mi mi") in chat almost always implies nude/exposed
    { zh: '咪咪', en: 'breasts', tags: ['breasts', 'nipples', 'topless'] },
    { zh: '奶子', en: 'breasts', tags: ['breasts', 'large breasts', 'nipples', 'topless', 'breasts out'] },
    { zh: '奶头', en: 'nipples', tags: ['nipples', 'topless', 'breasts out'] },
    { zh: '巨乳', en: 'large breasts', tags: ['large breasts', 'huge breasts'] },
    { zh: '咪咪头', en: 'nipples', tags: ['nipples', 'topless'] },
    { zh: '肉棒', en: 'penis', tags: ['penis'] },
    { zh: '鸡巴', en: 'penis', tags: ['penis'] },
    { zh: '阴茎', en: 'penis', tags: ['penis'] },
    { zh: '精液', en: 'cum', tags: ['cum'] },
    { zh: '射精', en: 'cum', tags: ['cum', 'cum on body'] },
    { zh: '射在', en: 'cum on', tags: ['cum'] },
    { zh: '内射', en: 'creampie', tags: ['cum in pussy', 'creampie'] },
    // acts
    { zh: '做爱', en: 'sex', tags: ['sex'] },
    { zh: '操', en: 'sex', tags: ['sex'] },
    { zh: '插入', en: 'penetration', tags: ['sex', 'vaginal'] },
    { zh: '抽插', en: 'sex', tags: ['sex'] },
    { zh: '口交', en: 'oral', tags: ['fellatio', 'oral'] },
    { zh: '舔', en: 'lick', tags: ['licking'] },
    { zh: '自慰', en: 'masturbation', tags: ['masturbation'] },
    { zh: '高潮', en: 'orgasm', tags: ['orgasm'] },
    { zh: '潮吹', en: 'squirt', tags: ['squirting'] },
    { zh: '爱液', en: 'pussy juice', tags: ['pussy juice'] },
    // poses + states
    { zh: '张开腿', en: 'spread legs', tags: ['spread legs'] },
    { zh: 'M字开腿', en: 'spread legs', tags: ['m legs', 'spread legs'] },
    { zh: '骑乘', en: 'cowgirl', tags: ['cowgirl position'] },
    { zh: '后入', en: 'doggy', tags: ['doggystyle'] },
    { zh: '裸体', en: 'nude', tags: ['nude', 'completely nude'] },
    { zh: '全裸', en: 'nude', tags: ['nude', 'completely nude'] },
    { zh: '没穿', en: 'nude', tags: ['nude'] },
    { zh: '脱光', en: 'nude', tags: ['nude'] },
    { zh: '裸', en: 'naked', tags: ['naked'] },
    // Action verbs implying exposure / undressing
    { zh: '掏出', en: 'exposed', tags: ['breasts out', 'topless', 'exposed breasts'] },
    { zh: '掏奶', en: 'exposed breasts', tags: ['breasts out', 'topless', 'nipples', 'exposed breasts'] },
    { zh: '露胸', en: 'topless', tags: ['topless', 'breasts out', 'cleavage'] },
    { zh: '露奶', en: 'topless', tags: ['topless', 'breasts out', 'nipples'] },
    { zh: '露出', en: 'exposed', tags: ['exposed', 'cleavage'] },
    { zh: '亮出', en: 'showing', tags: ['breasts out'] },
    { zh: '脱掉', en: 'undressed', tags: ['undressed', 'topless'] },
    { zh: '脱了', en: 'undressed', tags: ['undressed', 'topless'] },
    { zh: '脱开', en: 'undressed', tags: ['undressed'] },
    { zh: '解开', en: 'unbuttoned', tags: ['unbuttoned shirt', 'open clothes'] },
    { zh: '撩起', en: 'lifting clothes', tags: ['clothes lift', 'shirt lift'] },
    { zh: '掀起', en: 'lifting clothes', tags: ['clothes lift', 'shirt lift'] },
    { zh: '掀开', en: 'opening clothes', tags: ['clothes lift', 'open clothes'] },
    { zh: '扒开', en: 'spreading', tags: ['spread'] },
    { zh: '光着', en: 'bare', tags: ['nude', 'bare'] },
    { zh: '不穿', en: 'no clothes', tags: ['nude', 'no clothes'] },
    { zh: '袒胸', en: 'breasts exposed', tags: ['topless', 'breasts out', 'cleavage'] },
    { zh: '袒露', en: 'exposed', tags: ['topless', 'breasts out'] },
    { zh: '内裤', en: 'panties', tags: ['panties'] },
    { zh: '胖次', en: 'panties', tags: ['panties'] },
    { zh: '内衣', en: 'underwear', tags: ['underwear'] },
    { zh: '丁字裤', en: 'thong', tags: ['thong'] },
    { zh: '吊带袜', en: 'garter', tags: ['garter belt', 'thighhighs'] },
    { zh: '黑丝', en: 'pantyhose', tags: ['black pantyhose'] },
    { zh: '白丝', en: 'pantyhose', tags: ['white pantyhose'] },
    { zh: '袜带', en: 'garter', tags: ['garter belt'] },
    { zh: '走光', en: 'panty shot', tags: ['panty shot'] },
];

const ZH_SUGGESTIVE = [
    { zh: '湿', en: 'wet', tags: ['wet'] },
    { zh: '害羞', en: 'embarrassed', tags: ['embarrassed', 'blush'] },
    { zh: '脸红', en: 'blush', tags: ['blush'] },
    { zh: '泳装', en: 'swimsuit', tags: ['swimsuit'] },
    { zh: '比基尼', en: 'bikini', tags: ['bikini'] },
    { zh: '旗袍', en: 'cheongsam', tags: ['cheongsam'] },
    { zh: '睡衣', en: 'pajamas', tags: ['pajamas'] },
    { zh: '丝袜', en: 'pantyhose', tags: ['pantyhose'] },
    { zh: '大腿', en: 'thighs', tags: ['thighs'] },
    { zh: '锁骨', en: 'collarbone', tags: ['collarbone'] },
    { zh: '事业线', en: 'cleavage', tags: ['cleavage'] },
    { zh: '乳沟', en: 'cleavage', tags: ['cleavage'] },
    { zh: '诱惑', en: 'seductive', tags: ['seductive smile'] },
    { zh: '撩', en: 'flirty', tags: ['seductive smile'] },
    { zh: '亲', en: 'kiss', tags: ['kiss'] },
    { zh: '吻', en: 'kiss', tags: ['kiss'] },
    { zh: '搂', en: 'hug', tags: ['hug'] },
    { zh: '抱', en: 'hug', tags: ['hug'] },
];

const ZH_VIEW_HINTS = [
    { zh: '看看', tags: ['close-up'] },
    { zh: '让我看', tags: ['close-up'] },
    { zh: '给我看', tags: ['close-up'] },
    { zh: '给你看', tags: [] },
    { zh: '特写', tags: ['close-up', 'detailed'] },
    { zh: '近距离', tags: ['close-up'] },
    { zh: '正面', tags: ['front view'] },
    { zh: '背面', tags: ['from behind'] },
    { zh: '侧面', tags: ['from side'] },
    { zh: '俯视', tags: ['from above'] },
    { zh: '仰视', tags: ['from below'] },
    { zh: '自拍', tags: ['selfie'] },
    { zh: '镜子', tags: ['mirror selfie'] },
    { zh: '镜中', tags: ['mirror selfie'] },
];

// ZH_BODY_FOCUS — when user message specifies WHICH body part to capture/show,
// add corresponding "X focus" booru tag + composition hints. The prompt-builder
// then triggers BODY_FOCUS_BOOSTS for sharper detail on that part.
//
// Order matters: more specific phrases ("拍小穴") should resolve before generic ("穴") to avoid double-trigger.
const ZH_BODY_FOCUS = [
    // 小穴 / 阴部
    { zh: '拍小穴', tags: ['pussy focus', 'spread legs', 'spread pussy', 'close-up', 'pov'] },
    { zh: '看小穴', tags: ['pussy focus', 'spread pussy', 'close-up'] },
    { zh: '给我看穴', tags: ['pussy focus', 'spread pussy', 'close-up'] },
    { zh: '看看穴', tags: ['pussy focus', 'spread pussy', 'close-up'] },
    { zh: '拍逼', tags: ['pussy focus', 'spread legs', 'close-up'] },
    { zh: '拍阴', tags: ['pussy focus', 'spread legs', 'close-up'] },
    // 屁股 / 后臀
    { zh: '拍屁股', tags: ['ass focus', 'huge ass', 'plump ass', 'from behind'] },
    { zh: '看屁股', tags: ['ass focus', 'plump ass', 'from behind'] },
    { zh: '翘屁股', tags: ['ass focus', 'plump ass', 'top-down bottom-up'] },
    { zh: '撅屁股', tags: ['ass focus', 'plump ass', 'top-down bottom-up', 'on knees'] },
    { zh: '拍翘臀', tags: ['ass focus', 'huge ass', 'from behind'] },
    { zh: '后入式', tags: ['ass focus', 'doggystyle', 'from behind'] },
    // 胸 / 奶
    { zh: '拍胸', tags: ['breast focus', 'cleavage focus', 'large breasts', 'cleavage', 'cowboy shot'] },
    { zh: '看胸', tags: ['breast focus', 'cleavage', 'large breasts'] },
    { zh: '秀奶', tags: ['breast focus', 'huge breasts', 'cleavage', 'topless'] },
    { zh: '挤奶', tags: ['breast focus', 'breast squeeze', 'cleavage'] },
    { zh: '露奶', tags: ['breast focus', 'breasts out', 'topless', 'nipples'] },
    { zh: '甩奶', tags: ['breast focus', 'breasts out', 'bouncing breasts'] },
    // 腿
    { zh: '拍腿', tags: ['legs focus', 'thigh focus', 'long legs', 'from below'] },
    { zh: '看腿', tags: ['legs focus', 'thigh focus', 'long legs'] },
    { zh: '秀腿', tags: ['legs focus', 'thigh focus', 'long legs', 'cowboy shot'] },
    { zh: '美腿', tags: ['legs focus', 'thigh focus', 'beautiful legs', 'long legs'] },
    { zh: '大腿根', tags: ['thigh focus', 'thigh gap', 'crotch focus'] },
    // 脚
    { zh: '拍脚', tags: ['feet focus', 'foot focus', 'barefoot'] },
    { zh: '看脚', tags: ['feet focus', 'barefoot'] },
    // 脸
    { zh: '拍脸', tags: ['face focus', 'portrait', 'close-up'] },
    { zh: '拍自拍', tags: ['selfie', 'face focus', 'portrait'] },
];

// ZH_POSE_HINTS — explicit poses user may command. Add full pose tag arsenal.
const ZH_POSE_HINTS = [
    { zh: 'M字开腿', tags: ['m legs', 'spread legs', 'wide spread legs'] },
    { zh: '张开腿', tags: ['spread legs', 'wide spread legs'] },
    { zh: '张腿', tags: ['spread legs'] },
    { zh: '盘腿', tags: ['indian style', 'crossed legs'] },
    { zh: '跪着', tags: ['on knees', 'kneeling'] },
    { zh: '跪下', tags: ['on knees', 'kneeling'] },
    { zh: '趴着', tags: ['on stomach', 'lying'] },
    { zh: '趴下', tags: ['on stomach', 'face down'] },
    { zh: '躺着', tags: ['lying on back', 'lying'] },
    { zh: '坐着', tags: ['sitting'] },
    { zh: '骑乘', tags: ['cowgirl position', 'straddling'] },
    { zh: '反向骑乘', tags: ['reverse cowgirl position'] },
    { zh: '正坐', tags: ['seiza', 'kneeling'] },
    { zh: '半跪', tags: ['kneeling on one knee'] },
    { zh: '抬腿', tags: ['leg lift', 'leg up'] },
    { zh: '抬手', tags: ['arms up', 'hands up'] },
    { zh: '叉腰', tags: ['hands on hips'] },
    { zh: '回头', tags: ['looking back', 'looking at viewer over shoulder'] },
    { zh: '撩裙', tags: ['skirt lift', 'lifting skirt', 'clothes lift'] },
    { zh: '掀裙', tags: ['skirt lift', 'lifting skirt'] },
    { zh: '掀衣', tags: ['shirt lift', 'lifting shirt'] },
    { zh: '解扣', tags: ['unbuttoned', 'open clothes'] },
];

const ZH_SETTING_HINTS = [
    // 室内基础
    { zh: '床上', tags: ['on bed', 'bedroom'] },
    { zh: '卧室', tags: ['bedroom'] },
    { zh: '浴室', tags: ['bathroom'] },
    { zh: '浴缸', tags: ['bathtub'] },
    { zh: '沐浴', tags: ['shower'] },
    { zh: '淋浴', tags: ['shower'] },
    { zh: '厨房', tags: ['kitchen'] },
    { zh: '客厅', tags: ['living room'] },
    { zh: '阳台', tags: ['balcony'] },
    { zh: '车里', tags: ['in car'] },
    { zh: '办公室', tags: ['office'] },
    { zh: '教室', tags: ['classroom'] },
    { zh: '更衣室', tags: ['changing room'] },
    { zh: '酒店', tags: ['hotel room'] },
    // 公共场所 (NSFW 户外/围观场景必备)
    { zh: '街头', tags: ['street', 'urban'] },
    { zh: '街上', tags: ['street', 'urban'] },
    { zh: '街角', tags: ['street corner', 'urban'] },
    { zh: '巷子', tags: ['back alley', 'alleyway'] },
    { zh: '后街', tags: ['back alley', 'dirty alley'] },
    { zh: '桥洞', tags: ['underpass', 'dirty alley'] },
    { zh: '小巷', tags: ['back alley', 'alleyway'] },
    { zh: '公园', tags: ['park', 'outdoor'] },
    { zh: '长椅', tags: ['bench', 'park'] },
    { zh: '商场', tags: ['shopping mall', 'public'] },
    { zh: '地铁', tags: ['subway', 'public transport'] },
    { zh: '公交', tags: ['bus', 'public transport'] },
    { zh: '电梯', tags: ['elevator'] },
    { zh: '野外', tags: ['outdoor', 'forest'] },
    { zh: '山林', tags: ['forest', 'mountain'] },
    { zh: '海滩', tags: ['beach', 'outdoor'] },
    // 古风 / 奇幻
    { zh: '朝堂', tags: ['imperial court', 'palace hall'] },
    { zh: '殿前', tags: ['palace hall', 'throne room'] },
    { zh: '宫殿', tags: ['palace', 'throne room'] },
    { zh: '宴会厅', tags: ['ballroom', 'banquet hall'] },
    { zh: '议事厅', tags: ['meeting hall'] },
    { zh: '祭坛', tags: ['altar', 'shrine'] },
    // 校园 NSFW
    { zh: '空教室', tags: ['empty classroom', 'classroom', 'after school'] },
    { zh: '放学后', tags: ['after school', 'classroom'] },
    { zh: '社团室', tags: ['clubroom', 'club room'] },
    { zh: '学生会', tags: ['student council room', 'clubroom'] },
];

// ZH_NUM_PEOPLE — 多人识别（user 描述里出现多角色 → 必须出 2girls/3girls/threesome 等 tag）
// 顺序：先扫双女组合 / 三人组合 → 再扫"她们/一群" → 最后兜底
const ZH_NUM_PEOPLE = [
    // 双女组合（妈妈+姐姐 / 主仆 / 闺蜜双飞 等公爵卡常见模式）
    { zh: '妈妈和姐姐', tags: ['2girls', 'mature female', 'age difference'] },
    { zh: '姐姐和妹妹', tags: ['2girls', 'siblings'] },
    { zh: '妻子和女儿', tags: ['2girls', 'mother and daughter', 'age difference'] },
    { zh: '女儿和妻子', tags: ['2girls', 'mother and daughter', 'age difference'] },
    { zh: '主仆', tags: ['2girls', 'mistress and maid'] },
    { zh: '闺蜜双飞', tags: ['2girls', '1boy', 'ffm threesome', 'group sex'] },
    { zh: '双飞', tags: ['2girls', '1boy', 'ffm threesome', 'group sex'] },
    { zh: '一起来', tags: ['multiple girls'] }, // 只有当上下文有多人才命中
    { zh: '两个一起', tags: ['2girls'] },
    { zh: '两人一起', tags: ['2girls'] },
    // 三人组合
    { zh: '三人行', tags: ['threesome', 'group sex'] },
    { zh: '三个女', tags: ['3girls', 'multiple girls'] },
    { zh: '三个一起', tags: ['multiple girls'] },
    // 多男组合
    { zh: '一群男', tags: ['multiple boys', 'gangbang'] },
    { zh: '一群人', tags: ['multiple boys', 'crowd', 'surrounded'] },
    { zh: '几个男人', tags: ['multiple boys'] },
    { zh: '前后夹击', tags: ['2boys', '1girl', 'mmf threesome', 'spitroast', 'double penetration'] },
    { zh: '前后夹', tags: ['2boys', '1girl', 'spitroast'] },
    { zh: '轮奸', tags: ['multiple boys', 'gangbang', 'group sex', 'train'] },
    { zh: '轮流', tags: ['multiple boys', 'gangbang'] },
    { zh: '群P', tags: ['multiple boys', 'gangbang', 'group sex'] },
    { zh: '群交', tags: ['gangbang', 'group sex'] },
    // 公爵卡当众淫妻 — 工具人池
    { zh: '工具人', tags: ['multiple boys', 'crowd'] },
    { zh: '兵卒', tags: ['multiple boys', 'soldiers'] },
    { zh: '众目', tags: ['multiple boys', 'crowd', 'surrounded'] },
    { zh: '围观', tags: ['multiple boys', 'crowd', 'watching', 'voyeurism'] },
    { zh: '围着', tags: ['surrounded', 'crowd'] },
];

// ZH_EXPRESSION — 女角色表情 (高潮脸 / 享受 / 哭等)
const ZH_EXPRESSION = [
    { zh: '翻白眼', tags: ['rolling eyes', 'half-closed eyes'] },
    { zh: '阿嘿颜', tags: ['ahegao', 'fucked silly', 'tongue out', 'rolling eyes', 'drooling'] },
    { zh: '阿嘿', tags: ['ahegao', 'fucked silly'] },
    { zh: '高潮脸', tags: ['ahegao', 'orgasm', 'fucked silly'] },
    { zh: '操坏', tags: ['fucked silly', 'broken'] },
    { zh: '操傻', tags: ['fucked silly', 'ahegao'] },
    { zh: '吐舌', tags: ['tongue out'] },
    { zh: '伸舌', tags: ['tongue out'] },
    { zh: '流口水', tags: ['drooling', 'saliva', 'saliva trail'] },
    { zh: '口水', tags: ['drooling', 'saliva'] },
    { zh: '唾液', tags: ['saliva', 'saliva trail'] },
    { zh: '流泪', tags: ['tears', 'crying'] },
    { zh: '眼泪', tags: ['tears', 'teary eyes'] },
    { zh: '哭着', tags: ['tears', 'crying', 'teary eyes'] },
    { zh: '红脸', tags: ['blush', 'embarrassed'] },
    { zh: '脸通红', tags: ['blush', 'embarrassed'] },
    { zh: '害羞', tags: ['blush', 'embarrassed'] },
    { zh: '娇羞', tags: ['blush', 'embarrassed'] },
    { zh: '享受', tags: ['pleasure', 'lewd', 'enjoying'] },
    { zh: '沉溺', tags: ['lewd', 'pleasure'] },
    { zh: '期待', tags: ['lustful', 'half-closed eyes', 'looking at viewer'] },
    { zh: '渴望', tags: ['lustful', 'half-closed eyes'] },
    { zh: '喘息', tags: ['heavy breathing', 'panting'] },
    { zh: '大口喘', tags: ['panting', 'open mouth'] },
    { zh: '叫', tags: ['open mouth'] },
    { zh: '尖叫', tags: ['open mouth', 'screaming', 'shouting'] },
    { zh: '比耶', tags: ['double v', 'peace sign'] },
    { zh: '比OK', tags: ['ok sign'] },
    { zh: '闭眼', tags: ['eyes closed', 'closed eyes'] },
    { zh: '半闭眼', tags: ['half-closed eyes'] },
    { zh: '迷离', tags: ['half-closed eyes', 'lustful'] },
    { zh: '陶醉', tags: ['half-closed eyes', 'pleasure'] },
];

// ZH_FLUIDS — 体液 / 事后状态
const ZH_FLUIDS = [
    { zh: '内射', tags: ['cum in pussy', 'creampie'] },
    { zh: '中出', tags: ['cum in pussy', 'creampie'] },
    { zh: '射进去', tags: ['cum in pussy', 'creampie'] },
    { zh: '颜射', tags: ['facial', 'cum on face', 'cum string'] },
    { zh: '射脸', tags: ['facial', 'cum on face'] },
    { zh: '射在脸', tags: ['facial', 'cum on face', 'cum string'] },
    { zh: '口爆', tags: ['cum in mouth', 'oral creampie'] },
    { zh: '射嘴', tags: ['cum in mouth', 'oral creampie'] },
    { zh: '吞精', tags: ['cum in mouth', 'cum swallowing'] },
    { zh: '胸射', tags: ['cum on breasts'] },
    { zh: '射奶', tags: ['cum on breasts'] },
    { zh: '全身浴', tags: ['covered in cum', 'cum on body', 'bukkake'] },
    { zh: '精液浴', tags: ['covered in cum', 'cum on body', 'bukkake'] },
    { zh: '满身精', tags: ['covered in cum', 'cum on body'] },
    { zh: '射满', tags: ['cum overflow', 'excessive cum'] },
    { zh: '溢出', tags: ['cum overflow', 'cum dripping', 'cumdrip'] },
    { zh: '滴下来', tags: ['cum dripping', 'cumdrip'] },
    { zh: '大量精液', tags: ['excessive cum', 'large amount of cum'] },
    { zh: '潮吹', tags: ['squirting', 'female ejaculation'] },
    { zh: '喷', tags: ['squirting', 'pussy juice'] },
    { zh: '湿透', tags: ['wet pussy', 'pussy juice', 'dripping pussy'] },
    { zh: '汗', tags: ['sweat', 'sweating', 'sweaty'] },
    { zh: '满身汗', tags: ['sweat', 'sweating'] },
    { zh: '事后', tags: ['after sex', 'aftermath', 'afterglow'] },
    { zh: '完事', tags: ['after sex', 'aftermath'] },
];

// ZH_CLOTHES_STATE — 服装状态（全裸 / 半脱 / 隔着衣服 / 撕破）
const ZH_CLOTHES_STATE = [
    { zh: '撕破衣服', tags: ['torn clothes'] },
    { zh: '撕烂', tags: ['torn clothes'] },
    { zh: '撕碎', tags: ['torn clothes'] },
    { zh: '撕破丝袜', tags: ['torn pantyhose'] },
    { zh: '丝袜破', tags: ['torn pantyhose'] },
    { zh: '内裤拉到一边', tags: ['panties aside', 'panties pulled aside'] },
    { zh: '内裤一边', tags: ['panties aside'] },
    { zh: '隔着衣服', tags: ['sex through clothes', 'clothed sex', 'fucked through clothes'] },
    { zh: '隔着丝袜', tags: ['sex through clothes', 'pantyhose', 'fucked through clothes'] },
    { zh: '不脱', tags: ['clothed sex', 'fully clothed'] },
    { zh: '穿着衣服', tags: ['clothed sex'] },
    { zh: '穿着校服', tags: ['clothed sex', 'school uniform'] },
    { zh: '穿着旗袍', tags: ['clothed sex', 'cheongsam'] },
    { zh: '衣冠不整', tags: ['disheveled', 'undressed'] },
    { zh: '凌乱', tags: ['disheveled'] },
    { zh: '衣服扯下', tags: ['clothes pulled down', 'breasts out'] },
    { zh: '半脱', tags: ['clothes pulled down', 'partially nude'] },
    { zh: '湿透了', tags: ['wet clothes', 'see-through'] },
    { zh: '内裤湿', tags: ['wet panties'] },
];

// ZH_NPC_TYPE — NPC 身份模板（围观者特征化，对应公爵卡 A/B/C 三类）
const ZH_NPC_TYPE = [
    // B 类 · 陌生人（最常用）
    { zh: '乞丐', tags: ['1boy', 'beggar', 'homeless man', 'dirty old man', 'scruffy', 'ragged clothes', 'unkempt', 'aged man', 'poor'] },
    { zh: '流浪汉', tags: ['1boy', 'homeless man', 'beggar', 'scruffy', 'ragged clothes'] },
    { zh: '街头老头', tags: ['1boy', 'aged man', 'old man', 'dirty old man'] },
    { zh: '老乞丐', tags: ['1boy', 'beggar', 'homeless man', 'aged man', 'scruffy'] },
    { zh: '工人', tags: ['1boy', 'construction worker', 'dirty clothes', 'working class'] },
    { zh: '民工', tags: ['1boy', 'construction worker', 'manual laborer', 'working class'] },
    { zh: '装修工', tags: ['1boy', 'construction worker', 'dirty clothes'] },
    { zh: '外卖员', tags: ['1boy', 'delivery man', 'uniform', 'helmet'] },
    { zh: '快递员', tags: ['1boy', 'delivery man', 'uniform'] },
    { zh: '保安', tags: ['1boy', 'security guard', 'uniform'] },
    { zh: '清洁工', tags: ['1boy', 'cleaner', 'uniform'] },
    { zh: '保洁', tags: ['1boy', 'cleaner', 'uniform'] },
    { zh: '服务生', tags: ['1boy', 'waiter', 'uniform'] },
    { zh: '老男人', tags: ['1boy', 'aged man', 'mature male', 'middle-aged man'] },
    { zh: '大叔', tags: ['1boy', 'mature male', 'middle-aged man'] },
    { zh: '丑男', tags: ['1boy', 'ugly bastard', 'mature male'] },
    // A 类 · 暗恋苦主
    { zh: '暗恋者', tags: ['1boy', 'young man', 'sad face', 'painful expression'] },
    { zh: '舔狗', tags: ['1boy', 'young man', 'sad face', 'jealous expression'] },
    { zh: '前男友', tags: ['1boy', 'young man', 'jealous expression'] },
    // 古风 / 奇幻
    { zh: '太监', tags: ['1boy', 'eunuch', 'servant', 'robes'] },
    { zh: '内侍', tags: ['1boy', 'servant', 'robes'] },
    { zh: '王爷', tags: ['1boy', 'nobleman', 'formal wear', 'mature male'] },
    { zh: '老爷', tags: ['1boy', 'nobleman', 'mature male', 'well-dressed'] },
    { zh: '兵卒', tags: ['multiple boys', 'soldiers', 'armor'] },
    { zh: '侍卫', tags: ['multiple boys', 'guards', 'armor'] },
    { zh: '妖族', tags: ['monster', 'demon', 'beast'] },
    { zh: '兽人', tags: ['orc', 'monster', 'muscular'] },
];

// ZH_NPC_REACTION — 旁观 NPC 反应表情（区别于女角色表情）
const ZH_NPC_REACTION = [
    { zh: '盯着看', tags: ['staring', 'wide eyes'] },
    { zh: '瞪眼', tags: ['staring', 'wide eyes'] },
    { zh: '目不转睛', tags: ['staring'] },
    { zh: '看呆', tags: ['gaping mouth', 'stunned', 'staring'] },
    { zh: '张嘴', tags: ['gaping mouth', 'mouth open'] },
    { zh: '色眯眯', tags: ['lustful gaze', 'leering', 'lecherous look'] },
    { zh: '色眼', tags: ['lustful gaze', 'leering'] },
    { zh: '贪婪', tags: ['lustful gaze', 'leering'] },
    { zh: '恶狼', tags: ['leering', 'lustful gaze'] },
    { zh: '撸管', tags: ['1boy', 'male masturbation', 'jerking off'] },
    { zh: '当场撸', tags: ['male masturbation', 'jerking off'] },
    { zh: '掏出鸡巴', tags: ['penis', 'erection', 'male masturbation'] },
    { zh: '硬了', tags: ['erection', 'penis'] },
    { zh: '勃起', tags: ['erection'] },
    { zh: '偷拍', tags: ['holding cell phone', 'taking photo', 'recording'] },
    { zh: '录像', tags: ['recording', 'taking photo', 'holding cell phone'] },
];

// ZH_RELATION — 露出 / 围观 / 公开 / NTR 关系类（核心维度，原版完全没覆盖）
const ZH_RELATION = [
    { zh: '露出', tags: ['exhibitionism', 'public exposure', 'public indecency'] },
    { zh: '公开', tags: ['exhibitionism', 'public', 'public indecency'] },
    { zh: '当众', tags: ['in public', 'public sex', 'surrounded'] },
    { zh: '人前', tags: ['in public', 'public'] },
    { zh: '众目', tags: ['surrounded', 'public', 'spotlight'] },
    { zh: '示众', tags: ['public exposure', 'exhibitionism', 'spotlight'] },
    { zh: '展示', tags: ['presenting', 'showing off', 'exhibitionism'] },
    { zh: '掰开给', tags: ['presenting pussy', 'spread pussy', 'exhibitionism'] },
    { zh: '给他看', tags: ['presenting', 'looking at another', 'exhibitionism'] },
    { zh: '给他们看', tags: ['presenting', 'exhibitionism', 'public exposure'] },
    { zh: '让他看', tags: ['presenting', 'exhibitionism'] },
    { zh: '看着我操', tags: ['voyeurism', 'watching', 'cuckold'] },
    { zh: '偷窥', tags: ['voyeurism', 'peeping', 'spying'] },
    { zh: '围观', tags: ['surrounded', 'crowd', 'watching', 'voyeurism'] },
    { zh: 'NTR', tags: ['netorare', 'ntr', 'cuckold'] },
    { zh: '绿', tags: ['netorare', 'ntr', 'cuckold'] },
    { zh: '调教', tags: ['bdsm', 'training'] },
    { zh: '土下座', tags: ['dogeza', 'kneeling', 'prostration'] },
    { zh: '跪谢', tags: ['dogeza', 'kneeling'] },
];

// ZH_PHOTO_META — 照片 / 拍摄元描述（"发照片给我"专用，让模型知道这是照片不是插画）
const ZH_PHOTO_META = [
    { zh: '拍照', tags: ['taking photo', 'holding cell phone', 'amateur photo'] },
    { zh: '照片', tags: ['amateur photo', 'snapshot'] },
    { zh: '发图', tags: ['amateur photo', 'snapshot'] },
    { zh: '发照片', tags: ['amateur photo', 'snapshot'] },
    { zh: '发给我', tags: ['amateur photo', 'snapshot'] },
    { zh: '录视频', tags: ['recording', 'holding cell phone'] },
    { zh: '直播', tags: ['live stream', 'screen', 'watermark'] },
    { zh: '监控', tags: ['security camera', 'cctv view', 'surveillance'] },
];

// ZH_TIME_LIGHT — 时间 / 光线（让模型知道是白天/黄昏/夜晚 + 灯光氛围）
// 解决"暗巷被画成阳光明亮街景"问题
const ZH_TIME_LIGHT = [
    { zh: '黄昏', tags: ['evening', 'sunset', 'golden hour'] },
    { zh: '傍晚', tags: ['evening', 'sunset'] },
    { zh: '夜晚', tags: ['night', 'dark'] },
    { zh: '半夜', tags: ['night', 'dark', 'midnight'] },
    { zh: '深夜', tags: ['night', 'dark', 'midnight'] },
    { zh: '凌晨', tags: ['dawn', 'soft light'] },
    { zh: '清晨', tags: ['morning', 'soft sunlight'] },
    { zh: '早上', tags: ['morning', 'sunlight'] },
    { zh: '中午', tags: ['noon', 'bright daylight'] },
    { zh: '下午', tags: ['afternoon', 'soft sunlight'] },
    { zh: '阴天', tags: ['cloudy', 'overcast'] },
    { zh: '雨天', tags: ['rainy', 'wet ground'] },
    { zh: '昏暗', tags: ['dim lighting', 'shadow', 'dark'] },
    { zh: '暗', tags: ['dim lighting', 'shadow'] },
    { zh: '灯光', tags: ['indoor lighting'] },
    { zh: '路灯', tags: ['street light', 'warm light', 'night'] },
    { zh: '月光', tags: ['moonlight', 'night'] },
    { zh: '烛光', tags: ['candle light', 'warm light'] },
    { zh: '阳光', tags: ['sunlight', 'sunny', 'daylight'] },
    { zh: '聚光灯', tags: ['spotlight', 'dramatic lighting'] },
    { zh: '室内', tags: ['indoor', 'inside'] },
    { zh: '室外', tags: ['outdoor'] },
];

// ZH_CAMERA_ANGLE — 镜头视角 (距离 + 角度 + 视点)
// 解决"姿势对了但镜头机位混乱"问题
const ZH_CAMERA_ANGLE = [
    // 距离 / 景别
    { zh: '远景', tags: ['wide shot'] },
    { zh: '近景', tags: ['close-up'] },
    { zh: '特写', tags: ['close-up', 'detailed'] },
    { zh: '全身', tags: ['full body'] },
    { zh: '半身', tags: ['cowboy shot', 'upper body'] },
    { zh: '半身照', tags: ['cowboy shot'] },
    { zh: '上半身', tags: ['upper body'] },
    { zh: '下半身', tags: ['lower body'] },
    { zh: '中景', tags: ['medium shot'] },
    // 角度
    { zh: '正面', tags: ['from front'] },
    { zh: '正面拍', tags: ['from front'] },
    { zh: '背面拍', tags: ['from behind'] },
    { zh: '侧面拍', tags: ['from side'] },
    { zh: '俯拍', tags: ['from above'] },
    { zh: '仰拍', tags: ['from below'] },
    { zh: '从下', tags: ['from below'] },
    { zh: '从上', tags: ['from above'] },
    { zh: '从下往上', tags: ['from below'] },
    { zh: '从上往下', tags: ['from above'] },
    { zh: '倾斜', tags: ['dutch angle'] },
    // 视点
    { zh: '我视角', tags: ['pov', 'first-person view'] },
    { zh: '我看', tags: ['pov', 'first-person view'] },
    { zh: '主观', tags: ['pov', 'first-person view'] },
    { zh: '对方视角', tags: ['pov'] },
    { zh: '从他角度', tags: ['pov'] },
    { zh: '看着我', tags: ['looking at viewer'] },
    { zh: '看着他', tags: ['looking at another'] },
    { zh: '抬头看', tags: ['looking up at viewer', 'looking up'] },
    { zh: '俯视', tags: ['looking down at viewer', 'from above'] },
];

// ZH_AMBIANCE — 场景氛围细节（脏乱/破旧/亚洲风等）
// 解决"街头被画成欧美风/缺乞丐巷子脏乱细节"问题
const ZH_AMBIANCE = [
    { zh: '脏乱', tags: ['dirty', 'messy', 'urban decay'] },
    { zh: '脏', tags: ['dirty', 'grimy'] },
    { zh: '破旧', tags: ['shabby', 'worn', 'old building'] },
    { zh: '破败', tags: ['shabby', 'worn', 'urban decay'] },
    { zh: '废墟', tags: ['ruins', 'abandoned'] },
    { zh: '垃圾', tags: ['trash', 'litter'] },
    { zh: '涂鸦', tags: ['graffiti'] },
    { zh: '湿漉漉', tags: ['wet ground', 'puddle'] },
    { zh: '雨后', tags: ['wet ground', 'puddle', 'after rain'] },
    { zh: '日式', tags: ['japanese style'] },
    { zh: '和式', tags: ['japanese style', 'tatami'] },
    { zh: '亚洲风', tags: ['asian style'] },
    { zh: '中式', tags: ['chinese style'] },
    { zh: '现代', tags: ['modern', 'contemporary'] },
    { zh: '都市', tags: ['urban', 'modern city'] },
    { zh: '古风', tags: ['ancient', 'chinese ancient'] },
    { zh: '欧式', tags: ['western style', 'european'] },
    { zh: '复古', tags: ['retro', 'vintage'] },
    { zh: '繁华', tags: ['busy street', 'crowded'] },
    { zh: '冷清', tags: ['empty', 'desolate'] },
];

// ZH_POSE_BASE — 主体姿势词典（强化"必须明确指定 P1 主体姿势"原则）
// 配合 protocol 里的姿势组合一致性铁律
const ZH_POSE_BASE = [
    { zh: '站着', tags: ['standing'] },
    { zh: '站立', tags: ['standing'] },
    { zh: '立着', tags: ['standing'] },
    { zh: '靠墙', tags: ['standing', 'against wall'] },
    { zh: '靠着', tags: ['leaning'] },
    { zh: '蹲着', tags: ['squatting'] },
    { zh: '蹲下', tags: ['squatting'] },
    { zh: '半蹲', tags: ['squatting'] },
    { zh: '坐在', tags: ['sitting'] },
    { zh: '坐着', tags: ['sitting'] },
    { zh: '床上躺', tags: ['lying on back', 'on bed'] },
    { zh: '仰躺', tags: ['lying on back'] },
    { zh: '仰卧', tags: ['lying on back'] },
    { zh: '侧躺', tags: ['lying on side'] },
    { zh: '俯卧', tags: ['on stomach', 'lying'] },
    { zh: '弯腰', tags: ['bent over', 'leaning forward'] },
    { zh: '撅着', tags: ['bent over', 'top-down bottom-up'] },
    { zh: '被抱起', tags: ['carried', 'princess carry'] },
    { zh: '骑在', tags: ['straddling'] },
    { zh: '跨坐', tags: ['straddling', 'sitting on'] },
];

// ZH_POSE_NSFW — 性行为体位扩展（补充现有 ZH_POSE_HINTS 里没的）
const ZH_POSE_NSFW = [
    { zh: '传教士', tags: ['missionary', 'on back'] },
    { zh: '正常位', tags: ['missionary', 'on back'] },
    { zh: '立位', tags: ['standing sex', 'leg up'] },
    { zh: '站着操', tags: ['standing sex', 'standing', 'leg up'] },
    { zh: '侧位', tags: ['spooning', 'lying on side'] },
    { zh: '侧躺', tags: ['spooning', 'lying on side'] },
    { zh: '屈曲位', tags: ['mating press', 'full nelson'] },
    { zh: '折叠位', tags: ['mating press'] },
    { zh: '种付', tags: ['mating press'] },
    { zh: '倒立位', tags: ['piledriver position'] },
    { zh: '双龙', tags: ['spitroast', 'double penetration'] },
    { zh: '一前一后', tags: ['spitroast', 'double penetration'] },
    { zh: '69式', tags: ['69', 'sixty-nine position'] },
    { zh: '颜面骑乘', tags: ['facesitting', 'smother'] },
    { zh: '坐脸', tags: ['facesitting'] },
    { zh: '深喉', tags: ['deepthroat', 'irrumatio', 'throat bulge'] },
    { zh: '顶喉', tags: ['deepthroat', 'irrumatio'] },
    { zh: '吹箫', tags: ['fellatio', 'oral'] },
    { zh: '吹', tags: ['fellatio', 'oral'] },
    { zh: '舔小穴', tags: ['cunnilingus', 'oral', 'pussy licking'] },
    { zh: '舔阴', tags: ['cunnilingus', 'oral'] },
    { zh: '肛交', tags: ['anal', 'anal sex'] },
    { zh: '爆菊', tags: ['anal', 'anal sex'] },
    { zh: '多孔', tags: ['triple penetration', 'multiple penetration'] },
    { zh: '子宫脱', tags: ['prolapse', 'womb prolapse'] },
];

// classifyMessage — 主入口。
// v0.8.3: messageText 可以是单字符串或最近多条消息拼接（多消息上下文支持复合 NSFW 场景）。
// 调用方负责拼接 (用 \n 分隔即可，包含分隔符不影响 .includes 扫描)。
export function classifyMessage(messageText) {
    const text = messageText || '';
    const tags = new Set();
    let level = 'sfw';

    for (const item of ZH_EXPLICIT) {
        if (text.includes(item.zh)) {
            level = 'explicit';
            for (const t of item.tags) tags.add(t);
        }
    }
    if (level !== 'explicit') {
        for (const item of ZH_SUGGESTIVE) {
            if (text.includes(item.zh)) {
                if (level === 'sfw') level = 'suggestive';
                for (const t of item.tags) tags.add(t);
            }
        }
    }

    for (const item of ZH_VIEW_HINTS) {
        if (text.includes(item.zh)) for (const t of item.tags) tags.add(t);
    }
    for (const item of ZH_SETTING_HINTS) {
        if (text.includes(item.zh)) for (const t of item.tags) tags.add(t);
    }

    // Body-part focus & explicit poses (Issue #3 — pose fidelity + body-part focus)
    for (const item of ZH_BODY_FOCUS) {
        if (text.includes(item.zh)) for (const t of item.tags) tags.add(t);
    }
    for (const item of ZH_POSE_HINTS) {
        if (text.includes(item.zh)) for (const t of item.tags) tags.add(t);
    }

    // v0.8.3 新增 8 个维度 (覆盖人数/表情/体液/服装/NPC身份/NPC反应/关系/拍摄元/性行为体位扩展)
    // 任一新维度命中且尚未升级到 explicit 级别时，level 升到 suggestive — 防止 NSFW 维度被 SFW 守门掐掉
    const NSFW_DICTS = [ZH_NUM_PEOPLE, ZH_EXPRESSION, ZH_FLUIDS, ZH_CLOTHES_STATE, ZH_NPC_TYPE, ZH_NPC_REACTION, ZH_RELATION, ZH_PHOTO_META, ZH_POSE_NSFW];
    for (const dict of NSFW_DICTS) {
        for (const item of dict) {
            if (text.includes(item.zh)) {
                for (const t of item.tags) tags.add(t);
                // ZH_PHOTO_META 不算 NSFW 触发（"拍照" 本身可以 SFW）
                if (dict !== ZH_PHOTO_META && level === 'sfw') level = 'suggestive';
            }
        }
    }

    // v0.8.4 新增 4 个 SFW-neutral 词典（解决场景构图 + 姿势组合崩坏）
    // 这些词典纯补 booru tag，不升级 level（光线/视角/氛围/主体姿势本身不算 NSFW）
    const NEUTRAL_DICTS = [ZH_TIME_LIGHT, ZH_CAMERA_ANGLE, ZH_AMBIANCE, ZH_POSE_BASE];
    for (const dict of NEUTRAL_DICTS) {
        for (const item of dict) {
            if (text.includes(item.zh)) for (const t of item.tags) tags.add(t);
        }
    }

    return { level, tags: [...tags] };
}

// "nsfw" intent for prompt building purposes.
// suggestive treated as sfw — only explicit becomes nsfw.
export function isNSFW(level) {
    return level === 'explicit';
}

// English NSFW tokens that the AI may sneak into <pic prompt="..."> even when
// the user's message is benign. When intent is SFW, these get stripped from
// the AI prompt so the model doesn't paint nude unsolicited.
const NSFW_TOKENS = [
    // nudity / state
    'nude', 'naked', 'topless', 'bottomless', 'undressed', 'bare', 'exposed',
    'no clothes', 'no bra', 'no panties', 'fully nude', 'completely nude',
    'partially nude', 'undress', 'undressing', 'stripping', 'nakedness',
    'breasts out', 'breast out', 'breasts exposed', 'breast exposed',
    'pussy out', 'tits out', 'no shirt', 'no pants', 'no underwear',
    // explicit body parts
    'nipples', 'nipple', 'areola', 'areolae',
    'pussy', 'vagina', 'vulva', 'clitoris', 'pussy lips', 'pussy juice',
    'spread pussy', 'anus', 'asshole',
    'penis', 'cock', 'dick', 'erection', 'erect',
    // sexual acts / fluids
    'sex', 'sexual', 'sexual intercourse', 'penetration', 'vaginal', 'anal',
    'fellatio', 'oral sex', 'cunnilingus', 'masturbation', 'orgasm',
    'cum', 'semen', 'ejaculation', 'cum on body', 'cum in pussy', 'creampie',
    'squirting', 'doggystyle', 'cowgirl position', 'm legs',
    // explicit poses / framing common in NSFW
    'spread legs', 'legs spread', 'pussy peek', 'panty pull',
];

// Strip NSFW tokens from an AI-generated prompt. Case-insensitive, whole-tag-match.
// Splits on commas, removes any tag containing an NSFW token, rejoins.
export function stripNsfwTokens(prompt) {
    if (!prompt) return '';
    const lowerTokens = NSFW_TOKENS.map((t) => t.toLowerCase());
    const parts = prompt.split(',').map((p) => p.trim()).filter(Boolean);
    const safe = parts.filter((tag) => {
        const low = tag.toLowerCase();
        return !lowerTokens.some((tok) => low === tok || low.includes(tok));
    });
    return safe.join(', ');
}

// Stronger SFW negative tags — appended when intent is sfw to prevent
// the model from painting nude even if AI prompt was benign but model
// is biased toward NSFW (e.g., NoobAI on certain LoRAs).
// v0.7.12 加权 anti-topless：v0.7.11 anti-pasty (pasties:1.5) 强压后模型从"打贴"推到"全裸露乳头"，
//         必须配套加权 (topless:1.5) (exposed breasts:1.5) (no shirt:1.4) (breasts out:1.4) 把模型推回穿衣。
export const STRONG_SFW_NEGATIVE = 'nsfw, nude, naked, (topless:1.5), (exposed breasts:1.5), (exposed nipples:1.5), (no shirt:1.4), (breasts out:1.4), nipples, areola, pussy, vagina, vulva, clitoris, anus, penis, cock, cum, semen, sex, sexual, bottomless, no clothes, no bra, no panties, undressed';

// Appearance descriptors AI may sneak into <pic prompt> that conflict with
// the locked character anchor. Stripped when a contact is locked so the
// anchor's full prompt dominates. Keeps scene/action/pose/expression words.
//
// Note: situational outfit words (bikini, swimsuit, pajamas, lingerie, school uniform
// when worn for a school scene) are NOT in this list — those are intentional scene
// changes that should override the anchor.
const APPEARANCE_TOKENS = [
    // hair
    'hair', 'long hair', 'short hair', 'medium hair', 'very long hair',
    'black hair', 'brown hair', 'blonde hair', 'blond hair', 'red hair',
    'white hair', 'silver hair', 'pink hair', 'purple hair', 'blue hair',
    'green hair', 'orange hair', 'gray hair', 'grey hair', 'lavender hair',
    'violet hair', 'dark hair', 'light hair', 'platinum hair',
    'wavy hair', 'straight hair', 'curly hair', 'updo', 'high bun', 'low bun',
    'ponytail', 'twintails', 'braid', 'braids', 'pigtails', 'side ponytail',
    // eyes
    'eyes', 'blue eyes', 'green eyes', 'brown eyes', 'red eyes', 'purple eyes',
    'violet eyes', 'amber eyes', 'gray eyes', 'grey eyes', 'pink eyes',
    'yellow eyes', 'gold eyes', 'silver eyes', 'black eyes', 'heterochromia',
    // skin
    'fair skin', 'pale skin', 'white skin', 'tan skin', 'dark skin', 'brown skin',
    'porcelain skin', 'light skin',
    // face / body — only when AI conflicts; keep generic scene words
    'small breasts', 'medium breasts', 'flat chest', 'flat',
    // age / type
    'loli', 'shota', 'child', 'kid', 'elderly', 'old woman', 'old man',
    // default outfit AI tends to randomly invent — let anchor control character's daily wear
    // (situational outfits like bikini/pajamas/swimsuit are intentionally NOT here)
    'robe', 'robes', 'gown', 'dress', 'long dress', 'flowing dress',
    'silk robe', 'silk robes', 'embroidered robe', 'embroidered robes', 'layered robes',
    'hanfu', 'chinese clothes', 'traditional chinese clothes', 'kimono', 'cheongsam', 'qipao',
    'ornate clothing', 'embroidered pattern', 'gold embroidery', 'wide sleeves', 'long sleeves',
    // common hair ornaments AI flips between
    'hair ornament', 'hair ornaments', 'hairpin', 'hair stick', 'hair accessories',
    'jeweled hair ornament', 'ornate hair ornament', 'tassel hair ornament',
    'crown', 'tiara', 'headdress', 'golden hairpin', 'jade hairpin',
];

export function stripAppearanceTokens(prompt) {
    if (!prompt) return '';
    const lowerTokens = APPEARANCE_TOKENS.map((t) => t.toLowerCase());
    const parts = prompt.split(',').map((p) => p.trim()).filter(Boolean);
    const safe = parts.filter((tag) => {
        const low = tag.toLowerCase().replace(/[()]/g, '').replace(/:[\d.]+/g, '');
        return !lowerTokens.some((tok) => low === tok || low.endsWith(' ' + tok) || low === tok);
    });
    return safe.join(', ');
}

// Outfit / clothing tokens to strip from a locked character's sdPrompt when
// intent is NSFW. Without this, the anchor's "hanfu / school uniform / blazer"
// etc. CONFLICT with intent's "nude / breasts out / spread legs" — model gets
// contradictory instructions and produces ugly half-clothed artifact images.
//
// Strips OUTER clothing: tops, bottoms, dresses, suits, uniforms, traditional robes,
// modifiers (sleeves, sash), footwear, accessories that go on outer clothing.
// KEEPS: lingerie/stockings/garter (intentional NSFW), jewelry, hair ornaments,
// body/face/hair tags (define the character).
const OUTFIT_TOKENS = [
    // tops
    'shirt', 'blouse', 't-shirt', 'tshirt', 'tank top', 'crop top', 'sweater', 'jumper',
    'cardigan', 'hoodie', 'jacket', 'blazer', 'coat', 'vest', 'pullover',
    'white shirt', 'white blouse', 'collared shirt', 'button-up shirt', 'button up',
    // dresses + skirts
    'dress', 'sundress', 'evening dress', 'cocktail dress', 'long dress', 'flowing dress',
    'gown', 'ball gown', 'wedding dress',
    'skirt', 'pleated skirt', 'plaid skirt', 'pencil skirt', 'mini skirt', 'long skirt',
    'short skirt', 'school skirt', 'tennis skirt',
    // pants
    'jeans', 'pants', 'trousers', 'shorts', 'leggings', 'tights',
    'gym shorts', 'denim shorts', 'cargo pants',
    // suits / uniforms
    'suit', 'business suit', 'business casual',
    'uniform', 'school uniform', 'sailor uniform', 'japanese school uniform',
    'maid outfit', 'maid uniform', 'nurse uniform', 'office lady',
    'cosplay', 'costume',
    // Asian traditional
    'hanfu', 'kimono', 'cheongsam', 'qipao', 'yukata', 'kimono dress',
    'robe', 'robes', 'silk robe', 'silk robes', 'embroidered robe', 'embroidered robes',
    'cultivator robes', 'taoist robes', 'monk robes', 'priest robes',
    'chinese clothes', 'traditional chinese clothes', 'traditional clothes',
    'layered robes', 'wide robes',
    // sleeves / collars / sashes (clothing modifiers — strip with the garment)
    'wide sleeves', 'long sleeves', 'sleeveless', 'short sleeves', 'puffy sleeves',
    'sash', 'obi', 'belt', 'wide belt',
    'collar', 'high collar', 'sailor collar', 'turtleneck',
    'neckerchief', 'ribbon tie', 'tie', 'bowtie', 'necktie',
    // pattern/material modifiers
    'embroidered pattern', 'gold embroidery', 'brocade', 'silk', 'cotton', 'lace clothing',
    'plaid', 'striped', 'checkered', 'floral pattern',
    'ornate clothing', 'casual clothes', 'formal clothes', 'fancy clothes',
    // footwear (strip — usually conflicts with nude/spread poses)
    'shoes', 'sneakers', 'high heels', 'heels', 'boots', 'sandals', 'flats', 'pumps',
    'school shoes', 'mary janes', 'loafers',
    'knee-high socks', 'over-knee socks', 'thigh-high socks', 'white socks', 'socks',
    // headwear that goes ON clothing (NOT hair ornaments)
    'hat', 'cap', 'beanie', 'baseball cap', 'sun hat',
    // other
    'apron', 'cloak', 'cape', 'scarf', 'gloves',
];

export function stripOutfitTokens(prompt) {
    if (!prompt) return '';
    const lowerTokens = OUTFIT_TOKENS.map((t) => t.toLowerCase());
    const parts = prompt.split(',').map((p) => p.trim()).filter(Boolean);
    const safe = parts.filter((tag) => {
        // unwrap (tag:weight) and trim parens
        const low = tag.toLowerCase().replace(/[()]/g, '').replace(/:[\d.]+/g, '').trim();
        // strip if exact match OR ends with the keyword (e.g. "white blouse" → matches " blouse")
        return !lowerTokens.some((k) => low === k || low.endsWith(' ' + k));
    });
    return safe.join(', ');
}
