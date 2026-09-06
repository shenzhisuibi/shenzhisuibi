// ============================================================
// 神之随笔 - PersonalOS
// ============================================================

const STORAGE_KEY = 'lauv_workspace_data';

// ===== Utility Functions =====
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function tomorrowStr() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  return dateStr(d);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function stripHtml(html) {
  if (!html) return '';
  var div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

function formatDate(ds) {
  if (!ds) return '';
  const parts = ds.split('-');
  return parts[1] + '月' + parts[2] + '日';
}

function formatMonth(ds) {
  const parts = ds.split('-');
  return parts[1] + '月';
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ===== Toast =====
let toastTimer;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
}

// ===== Data Store =====
const Store = {
  get() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  init() {
    let data = this.get();
    if (!data) {
      data = {
        firstRun: true,
        dailyTodos: [],
        inbox: [],
        workTasks: [],
        study: { wordReview: [], dailySentence: {}, warStrategy: {}, lifeSkill: {}, customTasks: [] },
        lifeRecords: [],
        emotionRecords: [],
        hotspots: [],
        autoNews: [],
        lastNewsSync: null,
        team: { members: [], records: [], lastSync: null, docUrl: '', dailyTarget: 50 },
        mailboxMessages: [],
        sidebarItems: [
          { id: 'study', name: '学习', icon: 'study', removable: false },
          { id: 'work', name: '工作', icon: 'work', removable: false },
          { id: 'team', name: '数据看板', icon: 'team', removable: false },
          { id: 'life', name: '生活', icon: 'life', removable: false },
          { id: 'emotion', name: '情绪', icon: 'emotion', removable: false },
          { id: 'hotspot', name: '热点', icon: 'hotspot', removable: false }
        ],
        customSidebar: []
      };
    }

    // Seed mailbox if empty
    this.ensureMailData(data);

    // Ensure team data structure (for users upgrading from older versions)
    this.ensureTeamData(data);

    // Ensure work module structures (dashboard / checklist / timeline / backup)
    this.ensureWorkData(data);

    // Ensure today's study data
    this.ensureStudyData(data);

    this.save(data);
    return data;
  },

  // Fetch latest news from news.json and merge into localStorage
  // Called on every page load — news.json is updated daily by automation
  loadNewsFromJson() {
    var self = this;
    fetch('news.json?_=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.news) return;
        var data = self.get();
        if (!data) data = {};
        if (!data.autoNews) data.autoNews = [];
        var today = todayStr();

        // Remove old today entries, then merge fresh ones
        data.autoNews = data.autoNews.filter(function (n) { return n.date !== today; });

        for (var i = 0; i < json.news.length; i++) {
          var n = json.news[i];
          data.autoNews.push({
            id: n.id || uid(),
            title: n.title,
            summary: n.summary,
            category: n.category,
            categoryLabel: n.categoryLabel,
            date: n.date || today
          });
        }
        data.lastNewsSync = json.lastUpdated ? new Date(json.lastUpdated).getTime() : Date.now();
        self.save(data);
        // Re-render hotspot if visible
        if (currentView === 'hotspot') renderHotspot();
      })
      .catch(function () {
        // If offline or fetch fails, use cached localStorage data silently
      });
  },

  // Ensure team data structure exists
  ensureTeamData(data) {
    if (!data.team) data.team = { members: [], records: [], lastSync: null, docUrl: '', dailyTarget: 50 };
    if (!data.team.members) data.team.members = [];
    if (!data.team.records) data.team.records = [];
    if (!data.team.dailyTarget) data.team.dailyTarget = 50;
    if (!data.team.campaigns) data.team.campaigns = defaultCampaigns();
    if (!data.team.mgmtChecks) data.team.mgmtChecks = {};
  },

  // Fetch team data from team.json (synced from Tencent Docs by Buddy)
  // Same pattern as news.json — doc updates flow into team.json, then into the app
  loadTeamFromJson(silent) {
    var self = this;
    fetch('team.json?_=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        var data = self.get();
        if (!data) return;
        self.ensureTeamData(data);
        var incoming = new Date(json.lastUpdated || 0).getTime() || 0;
        var stored = data.team.lastSync || 0;
        if (incoming > stored || !silent) {
          data.team.members = json.members || [];
          data.team.records = json.records || [];
          data.team.docUrl = json.docUrl || '';
          data.team.dailyTarget = json.dailyTarget || 50;
          if (json.campaigns && json.campaigns.length) data.team.campaigns = json.campaigns;
          data.team.lastSync = incoming || Date.now();
          self.save(data);
          if (currentView === 'team') renderTeam();
          if (!silent) showToast('数据看板已同步');
        }
      })
      .catch(function () {
        if (!silent) showToast('暂无法连接数据源，已显示缓存数据');
      });
  },

  // Ensure work-module data structures exist
  ensureWorkData(data) {
    if (!data.workChecklist || !data.workChecklist.length) data.workChecklist = defaultWorkChecklist();
    if (!data.timelineProjects) data.timelineProjects = defaultTimelineProjects();
    if (!data.weekly) data.weekly = { rows: [], lastSync: null, source: 'FY27-周数据' };
    if (!data.xueqingRecords) data.xueqingRecords = [];
    if (!data.backup) data.backup = { lastBackup: null, lastHash: '' };
  },

  // Fetch FY27 weekly data from weekly.json (synced from Tencent Docs by Buddy)
  loadWeeklyFromJson(silent) {
    var self = this;
    fetch('weekly.json?_=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        var data = self.get();
        if (!data) return;
        self.ensureWorkData(data);
        var incoming = new Date(json.lastUpdated || 0).getTime() || 0;
        if (incoming >= (data.weekly.lastSync || 0)) {
          data.weekly.rows = json.rows || [];
          data.weekly.summary = json.summary || null;
          data.weekly.lastSync = incoming || Date.now();
          data.weekly.source = json.source || 'FY27-周数据';
          self.save(data);
          if (currentView === 'work') renderWork();
          if (!silent) showToast('周数据已同步');
        }
      })
      .catch(function () {
        if (!silent) showToast('周数据暂无法连接，显示缓存');
      });
  },

  ensureStudyData(data) {
    var today = todayStr();

    // Word review
    if (!data.study.wordReview || data.study.wordReview.length === 0 || data.study.wordReview[0].date !== today) {
      data.study.wordReview = [];
      for (var i = 0; i < wordBank.length; i++) {
        data.study.wordReview.push({
          id: uid(),
          word: wordBank[i].word,
          phonetic: wordBank[i].phonetic || '',
          meaning: wordBank[i].meaning,
          sentence: wordBank[i].sentence,
          scenario: wordBank[i].scenario,
          reviewed: false,
          reviewText: '',
          date: today
        });
      }
    }

    // Daily sentence
    if (!data.study.dailySentence || !data.study.dailySentence.date || data.study.dailySentence.date !== today) {
      var dayIdx = new Date().getDate() % sentenceBank.length;
      data.study.dailySentence = {
        content: sentenceBank[dayIdx].content,
        author: sentenceBank[dayIdx].author,
        reviewText: '',
        date: today
      };
    }

    // War Strategy of the day
    if (!data.study.warStrategy || !data.study.warStrategy.date || data.study.warStrategy.date !== today) {
      var warIdx = new Date().getDate() % warStrategyBank.length;
      data.study.warStrategy = {
        text: warStrategyBank[warIdx].text,
        source: warStrategyBank[warIdx].source,
        interpretation: warStrategyBank[warIdx].interpretation,
        reviewText: '',
        date: today
      };
    }

    // Life Skill of the day
    if (!data.study.lifeSkill || !data.study.lifeSkill.date || data.study.lifeSkill.date !== today) {
      var skillIdx = new Date().getDate() % lifeSkillBank.length;
      data.study.lifeSkill = {
        title: lifeSkillBank[skillIdx].title,
        content: lifeSkillBank[skillIdx].content,
        reviewText: '',
        date: today
      };
    }

    // Clean up old paperTip field if exists
    if (data.study.paperTip) delete data.study.paperTip;

    // Custom tasks - reset date for today
    if (data.study.customTasks) {
      data.study.customTasks.forEach(function (t) { if (t.date !== today) t.date = today; });
    }
  },

  ensureMailData(data) {
    if (!data.mailboxMessages) data.mailboxMessages = [];
    if (data.mailboxMessages.length === 0) {
      data.mailboxMessages = [{
        id: 'msg_kl0H53n4VpEo4nLp5o8fLnwLH0nUBOJH_D0-7qpxUSQvBA',
        from_name: 'Agent Mail 团队',
        from_email: 'admin@agent.qq.com',
        subject: 'Agent Mail 接入成功',
        snippet: '已为 WorkBuddy 接入 Agent Mail，现在可以在 WorkBuddy 中收发邮件了。邮箱地址：ptss4184@agent.qq.com',
        body: '<div style="font-size:14px;line-height:1.8;color:#4A453F;"><p><strong>Agent Mail 接入成功</strong></p><p>已为 WorkBuddy 接入 Agent Mail，现在可以在 WorkBuddy 中收发邮件了。</p><p style="padding:12px;background:#f5f1ec;border-radius:8px;">邮箱地址：<strong>ptss4184@agent.qq.com</strong></p><p>无需记忆任何命令，直接在 WorkBuddy 中用自然语言说出你的邮件需求即可。</p></div>',
        created_at: '2026-07-28T06:21:14Z',
        is_read: false
      }];
    }
  }
};

// ===== Sample Data =====
var wordBank = [
  { word: 'implement', phonetic: '/ˈɪm.plɪ.ment/', meaning: '实施，执行', sentence: 'We need to implement the new strategy by next quarter to stay competitive.', scenario: '职场中讨论项目执行计划时使用' },
  { word: 'leverage', phonetic: '/ˈlev.ər.ɪdʒ/', meaning: '利用，杠杆作用', sentence: 'She leveraged her extensive network to secure funding for the startup.', scenario: '描述如何利用现有资源达成目标' },
  { word: 'streamline', phonetic: '/ˈstriːm.laɪn/', meaning: '精简，优化流程', sentence: 'The new system will streamline our workflow and reduce processing time by 30%.', scenario: '讨论流程优化和提高效率' },
  { word: 'paradigm', phonetic: '/ˈpær.ə.daɪm/', meaning: '范式，典范', sentence: 'This discovery represents a paradigm shift in how we understand cellular mechanisms.', scenario: '学术论文中描述理论框架的转变' },
  { word: 'empirical', phonetic: '/ɪmˈpɪr.ɪ.kəl/', meaning: '经验的，实证的', sentence: 'The conclusions are based on empirical data collected over three years of field research.', scenario: '学术研究中强调数据支撑' },
  { word: 'robust', phonetic: '/rəʊˈbʌst/', meaning: '健壮的，鲁棒的', sentence: 'The algorithm proved robust even when tested with noisy and incomplete datasets.', scenario: '描述系统或方法的可靠性' },
  { word: 'consensus', phonetic: '/kənˈsen.səs/', meaning: '共识，一致意见', sentence: 'After hours of debate, the committee finally reached a consensus on the budget allocation.', scenario: '团队决策中描述达成一致' },
  { word: 'ambiguous', phonetic: '/æmˈbɪɡ.ju.əs/', meaning: '模糊的，有歧义的', sentence: 'The results were ambiguous, requiring further investigation to draw definitive conclusions.', scenario: '描述不明确的研究结果' },
  { word: 'prerequisite', phonetic: '/ˌpriːˈrek.wɪ.zɪt/', meaning: '先决条件，前提', sentence: 'A solid foundation in statistics is a prerequisite for this advanced course.', scenario: '描述学习或工作的前提要求' },
  { word: 'heuristic', phonetic: '/hjuˈrɪs.tɪk/', meaning: '启发式的，探索的', sentence: 'We used a heuristic approach to solve the optimization problem when exact methods were too slow.', scenario: '描述问题解决方法' },
  { word: 'quantitative', phonetic: '/ˈkwɒn.tɪ.tə.tɪv/', meaning: '定量的', sentence: 'The study combines quantitative analysis of survey data with qualitative interviews.', scenario: '研究方法中描述数据类型' },
  { word: 'qualitative', phonetic: '/ˈkwɒl.ɪ.tə.tɪv/', meaning: '定性的', sentence: 'Qualitative feedback from users revealed issues that metrics alone could not capture.', scenario: '研究方法中描述非数值型分析' },
  { word: 'iterative', phonetic: '/ˈɪt.ər.ə.tɪv/', meaning: '迭代的，反复的', sentence: 'We adopted an iterative design process, refining the product through multiple rounds of testing.', scenario: '描述渐进式的开发方法' },
  { word: 'scalable', phonetic: '/ˈskeɪ.lə.bəl/', meaning: '可扩展的', sentence: 'The architecture must be scalable to handle millions of concurrent users.', scenario: '技术方案中描述系统扩展能力' },
  { word: 'bottleneck', phonetic: '/ˈbɒt.əl.nek/', meaning: '瓶颈', sentence: 'Data processing became the bottleneck that limited the system overall throughput.', scenario: '分析系统性能问题时使用' }
];

var sentenceBank = [
  { content: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子《劝学》' },
  { content: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游《冬夜读书示子聿》' },
  { content: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈《进学解》' },
  { content: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { content: '千里之行，始于足下。', author: '《道德经》' },
  { content: '天行健，君子以自强不息。', author: '《周易》' },
  { content: '路漫漫其修远兮，吾将上下而求索。', author: '屈原《离骚》' }
];

var warStrategyBank = [
  { text: '兵者，国之大事，死生之地，存亡之道，不可不察也。', source: '《始计篇》', interpretation: '战争是国家头等大事，关系生死存亡，必须认真研究。放在今天看，任何重大决策——跳槽、创业、投资——都应像用兵一样审慎评估，不打无准备之仗。' },
  { text: '故经之以五事，校之以计，而索其情：一曰道，二曰天，三曰地，四曰将，五曰法。', source: '《始计篇》', interpretation: '从五个维度评估胜负：道（使命认同）、天（时机趋势）、地（环境条件）、将（领导能力）、法（制度流程）。做项目或创业前，用这个框架做个自检清单，能避免90%的盲目行动。' },
  { text: '兵者，诡道也。故能而示之不能，用而示之不用。', source: '《始计篇》', interpretation: '用兵要善于伪装：能打装作不能打，要用装作不用。在商业竞争中，适当的战略模糊能让对手难以预判你的真正意图，但注意不要违背诚信底线。' },
  { text: '攻其无备，出其不意。', source: '《始计篇》', interpretation: '在对方没有准备的时候出击，在对方意想不到的地方出现。职场中想脱颖而出，找到别人忽视的领域深耕，做出差异化，往往比在拥挤赛道内卷更有效。' },
  { text: '夫未战而庙算胜者，得算多也；未战而庙算不胜者，得算少也。', source: '《始计篇》', interpretation: '开战前就预判能赢的，是因为充分计算了胜算。大事之前先做风险评估和预案，把最坏情况想清楚再做决定，这是成熟的做事方式。' },
  { text: '故兵贵胜，不贵久。', source: '《作战篇》', interpretation: '用兵贵在速胜，不宜久拖。做事追求效率而非完美主义——交付80分的版本先上线迭代，比花三个月打磨一个100分但市场已经变了的方案要明智得多。' },
  { text: '故知兵之将，生民之司命，国家安危之主也。', source: '《作战篇》', interpretation: '懂军事的将领掌握着百姓的生命和国家的安危。团队里真正懂行的人是最珍贵的资产，选对领头人比选对方案更重要。' },
  { text: '是故百战百胜，非善之善者也；不战而屈人之兵，善之善者也。', source: '《谋攻篇》', interpretation: '百战百胜不算最高明，不战而让敌人屈服才是最高境界。最高级的竞争是不进入竞争——通过构建独特优势让对手无法追赶，或用合作取代对抗。' },
  { text: '故上兵伐谋，其次伐交，其次伐兵，其下攻城。', source: '《谋攻篇》', interpretation: '最好的策略是挫败对手的计谋，其次是瓦解敌方的外交联盟，再次是野战，最差是攻城。解决问题也按这个优先级：从根源入手 > 寻求协作 > 正面解决 > 硬碰硬。' },
  { text: '故用兵之法，十则围之，五则攻之，倍则分之。', source: '《谋攻篇》', interpretation: '兵力十倍于敌就包围，五倍就进攻，两倍就要设法分散敌人。做事情要集中优势资源打歼灭战，分散精力同时启动多个项目往往是最大的效率杀手。' },
  { text: '知彼知己，百战不殆；不知彼而知己，一胜一负；不知彼不知己，每战必殆。', source: '《谋攻篇》', interpretation: '了解对手也了解自己，百战不败。这句话我们耳熟能详，但真正做到很难——既要有外部情报网的持续输入，也要定期做自我复盘和优势劣势分析。' },
  { text: '昔之善战者，先为不可胜，以待敌之可胜。', source: '《军形篇》', interpretation: '善于打仗的人，先让自己立于不败之地，再等待战胜敌人的机会。投资理财同理：先做好风险控制和资产保全，再去追求收益。防守是进攻的基础。' },
  { text: '故善战者，立于不败之地，而不失敌之败也。', source: '《军形篇》', interpretation: '善于打仗的人先保证自己不被打败，然后绝不放过打败敌人的机会。把基本功做扎实，把错误率降到最低，剩下的就是耐心等待对手犯错——许多行业头部公司的优势就是这样逐步积累的。' },
  { text: '凡战者，以正合，以奇胜。', source: '《兵势篇》', interpretation: '以常规力量正面交战，以奇兵出奇制胜。日常工作中按流程按规矩办事是"正"，但在关键时刻用创意和创新解法突围才是"奇"，二者缺一不可。' },
  { text: '故善出奇者，无穷如天地，不竭如江河。', source: '《兵势篇》', interpretation: '善于出奇制胜的人，计策像天地一样无穷无尽。持续学习、跨界思考、保持好奇心是创意的燃料——让思维不枯竭，才能在关键时刻拿出惊艳方案。' },
  { text: '故善战者，求之于势，不责于人。', source: '《兵势篇》', interpretation: '善于打仗的人追求创造有利态势，而不是苛责下属。作为管理者，与其责怪员工不给力，不如反思：我给的条件、资源、方向是不是出了问题？造"势"比管"人"更高效。' },
  { text: '故善战者，致人而不致于人。', source: '《虚实篇》', interpretation: '善于打仗的人调动敌人而不被敌人调动。做人做事要掌握主动权——不要总是被动响应邮件和消息，而是主动规划每天最重要的三件事，你掌控时间而不是被时间掌控。' },
  { text: '故形人而我无形，则我专而敌分。', source: '《虚实篇》', interpretation: '使敌人暴露而我方隐蔽，我方就能集中兵力而敌方被迫分散。信息时代你的注意力就是兵力——减少无意义的信息暴露（关掉推送、减少刷手机），把精力集中在最重要的一两件事上。' },
  { text: '夫兵形象水，水之形，避高而趋下；兵之形，避实而击虚。', source: '《虚实篇》', interpretation: '用兵的规律像水一样，避开高处流向低处，避开坚实攻击虚弱。在市场中找对手的薄弱环节集中发力，在个人发展中扬长避短而非拼命补短板。' },
  { text: '故兵无常势，水无常形，能因敌变化而取胜者，谓之神。', source: '《虚实篇》', interpretation: '用兵没有固定不变的态势，能根据敌情变化而取胜就是神妙。不要固守一种方法或经验——市场在变，技术在变，保持灵活和快速学习能力才是真正的竞争力。' },
  { text: '军争之难者，以迂为直，以患为利。', source: '《军争篇》', interpretation: '军争中最难的是把弯路走成直路，把劣势转化为优势。遇到挫折时想想这句话——被拒绝的客户可能是帮你认清产品缺陷，走弯路的经历可能成为你独特的认知壁垒。' },
  { text: '故其疾如风，其徐如林，侵掠如火，不动如山。', source: '《军争篇》', interpretation: '行动快如风，静止如森林般沉稳，进攻如烈火，防守如山岳不动。做事要有节奏感——该冲刺时全速推进（疾如风），该沉淀时稳稳扎根（徐如林），该果断时不犹豫（侵略如火），该坚守时不受干扰（不动如山）。' },
  { text: '故用兵之法，无恃其不来，恃吾有以待也。', source: '《九变篇》', interpretation: '不寄希望于敌人不来，而要依靠自己做好准备。不存侥幸心理——不指望市场永远上涨、不期待老板一定赏识你、不假设客户必然续约。把安全边际建在自己手上。' },
  { text: '故将有五危：必死可杀也，必生可虏也，忿速可侮也，廉洁可辱也，爱民可烦也。', source: '《九变篇》', interpretation: '将领有五种致命弱点：不怕死可能被诱杀，贪生怕死可能被俘虏，急躁易怒可能被激怒中计，过分爱惜名声可能受辱而冲动，过分爱护百姓可能被骚扰拖垮。管理者切忌：逞英雄、畏首畏尾、情绪化、面子比里子重要、过度微观管理。' },
  { text: '视卒如婴儿，故可与之赴深溪；视卒如爱子，故可与之俱死。', source: '《地形篇》', interpretation: '像对待婴儿一样爱护士兵，士兵就会跟你共赴深渊。好的领导力不是权力和威严，是真心关怀——了解团队成员的生活状态、职业规划，他们才会在关键时刻跟你一起扛。' },
  { text: '故进不求名，退不避罪，唯人是保，而利合于主，国之宝也。', source: '《地形篇》', interpretation: '进不贪图功名，退不逃避责任，一切以守护人民和符合国家利益为准。真正的职业精神：不是做给别人看的表演式勤奋，而是对结果负责、对团队负责，打胜仗比打名气重要。' },
  { text: '知彼知己，胜乃不殆；知天知地，胜乃不穷。', source: '《地形篇》', interpretation: '了解对手也了解自己，胜利就没有危险；了解天时也了解地利，胜利就无穷无尽。除了自身和对手，还要看清大环境和趋势——宏观判断力是高级决策者的必修课。' },
  { text: '投之亡地然后存，陷之死地然后生。', source: '《九地篇》', interpretation: '把军队投入绝境反而能存活，陷入死地反而能求生。人被逼到绝境时爆发的潜力远超想象——有时候你需要给自己设定一个不可能完成但必须完成的截止日期，来激发最大的潜能。' },
  { text: '故善用兵者，譬如率然。率然者，常山之蛇也。', source: '《九地篇》', interpretation: '善于用兵的人像常山之蛇一样——打它的头，尾巴来救；打它的尾，头来救；打中间，头尾都来救。打造一个有凝聚力的团队，不需要每人都全能，但需要彼此补位、协同作战的默契。' },
  { text: '始如处女，敌人开户；后如脱兔，敌不及拒。', source: '《九地篇》', interpretation: '开始时像处女一样安静让敌人放松警惕，行动时像逃脱的兔子一样快让敌人来不及抵抗。谈判和竞争中：前期低调观察、积蓄力量，抓住时机后全力以赴、一击必中。' },
  { text: '故主不可以怒而兴师，将不可以愠而致战。', source: '《火攻篇》', interpretation: '国君不可因愤怒发动战争，将领不可因怨恨挑起战斗。任何时候不要在情绪激动时做重大决定——愤怒时写的邮件先存草稿，冲动时的投资先等24小时，情绪平复后的判断往往更准确。' }
];

var lifeSkillBank = [
  { title: '心肺复苏（CPR）基础步骤', content: '确认环境安全→拍肩呼叫判断意识→指定旁人拨打120→双手叠扣胸骨中下段→用力按压每分钟100-120次→深度5-6厘米→每30次按压配合2次人工呼吸（如果不会人工呼吸则持续按压也可以）。关键时刻这能救命。' },
  { title: '火灾逃生黄金法则', content: '弯腰低姿前进（浓烟在上层），用湿毛巾捂口鼻，绝不乘坐电梯。如果门外有火，先摸门把手温度——烫手说明门外有大火，此时应堵住门缝等待救援而非冲出去。提前熟悉家中和工作场所的逃生通道。' },
  { title: '海姆立克急救法（气道异物梗阻）', content: '施救者站在患者背后，一手握拳放在肚脐上方两横指处，另一手包住拳头，向内上方快速冲击腹部，直到异物排出。独自一人时可用椅背顶住上腹部自我施救。吃饭时被噎住真的要争分夺秒。' },
  { title: '西红柿炒鸡蛋的升级版', content: '热锅冷油，鸡蛋打散加少许料酒和盐（料酒去腥增香），中火滑散七成熟盛出。不洗锅再加少许油爆香葱白，下切好的番茄块炒出汁，加一勺番茄酱和一勺白糖提鲜。倒回鸡蛋翻炒30秒，撒葱花出锅。关键是番茄要炒到出沙，鸡蛋不要炒老。' },
  { title: '剁肉馅的正确方法', content: '不要只用瘦肉——7瘦3肥的比例口感最好。先切片再切丝最后切丁，两把刀交替剁更高效。加一小勺生姜水（姜末泡水）去腥，一个方向搅打上劲。肉糜微微发黏拉丝就说明上劲了，这样做出来的饺子馅紧实多汁。' },
  { title: '衣物去渍万能公式', content: '油渍用洗洁精原液涂抹5分钟后搓洗；血渍用冷盐水浸泡（千万不能用热水，蛋白质遇热凝固更难洗）；红酒渍撒盐吸收后再用牛奶浸泡；汗渍发黄用白醋+小苏打泡30分钟。所有方法都先在不起眼处测试色牢度。' },
  { title: '冰箱科学收纳法', content: '上层放熟食和剩菜，中层放乳制品和鸡蛋，下层放生肉（用密封盒防止串味），抽屉放蔬果。冰箱门温度波动最大只放调味品。遵循"先进先出"原则，所有容器贴标签写上日期。每月清空一次检查过期食品。' },
  { title: '旅行打包折叠法', content: '卷叠法比平铺省40%空间：T恤平铺→下摆翻折→两侧向中间折→从领口卷到下摆→用翻折的下摆包住。内裤袜子塞进鞋子里，易碎品用毛巾包裹。提前列出打包清单按"必须/可带/不用带"分类，避免塞一堆用不上的东西。' },
  { title: '个人财务50/30/20法则', content: '到手收入50%用于必要开支（房租、伙食、交通），30%用于提升生活质量（娱乐、学习、旅行），20%强制储蓄和投资。先存后花而不是花剩再存——工资到账先转20%到另一个账户，剩下的才是可支配的。' },
  { title: '制作紧急备用金计划', content: '存够3-6个月生活费的紧急备用金，放在流动性好的货币基金里（随时可取）。不要动这笔钱，除非是真正的"紧急"——失业、重病、重大修理。不是用来买新款手机或冲动旅行的。安全感是生活稳定的基石。' },
  { title: '失眠改善的五感放松法', content: '关掉所有屏幕30分钟前（蓝光抑制褪黑素），泡脚15分钟让身体升温再自然降温有助于入睡。配合478呼吸法（吸气4秒→屏息7秒→慢呼8秒），如果想事情停不下来，拿笔写下来"交给明天的自己"。连续一周固定时间上床起床，生物钟就会调整过来。' },
  { title: '化解冲突的"我陈述"话术', content: '不要说"你总是迟到"（你陈述带有攻击性），改成"当会议推迟开始时，我感到有些焦虑，因为我们有重要的议题要讨论"（我陈述表达的是感受和影响）。对方防御心理降低70%，解决效率提高50%。任何关系中的沟通都可以用这个技巧。' },
  { title: '租房签合同前必查的5个细节', content: '1.核对房东身份证和房产证是否一致（防二房东）；2.所有家电试一遍并拍照存证；3.合同写明水电气物业费谁交、每月哪天交租；4.退租条款看清楚——押金扣减条件、提前解约违约金；5.要求添加一句"房东出售房屋需提前30天通知并配合解决后续租住问题"。' },
  { title: '快速给房间做深度清洁', content: '顺序永远是从上到下、从内到外：先擦灯具和柜顶→清洁墙壁和窗户→擦拭家具→扫地→最后拖地。准备三块抹布分区使用（厨房/卫生间/其他），避免交叉污染。小苏打+白醋能搞定80%的清洁任务，不伤手还环保。' },
  { title: '手机照片整理三步法', content: '第一步：截屏和重复照片全选删除（用手机自带"重复项"功能）。第二步：按场景建文件夹（家人的、工作的、旅行的、票据的），每次拍照当天归类。第三步：每月备份到云端+电脑双份。照片越多找回越难，定期清理是最好的节省时间方式。' },
  { title: '防止久坐伤害的办公室拉伸', content: '每坐45分钟站起来：头部写"粪"字（缓解颈椎）、双手交叉向上推掌心朝天停留10秒（拉伸肩背）、坐姿体前屈摸脚尖保持15秒（拉伸腰部）、单腿站立另一只脚后跟踢臀部各10次（活动膝关节）。不需要离开工位，2分钟就能完成一套。' },
  { title: '学会说"不"的渐进式拒绝法', content: '不要硬邦邦地拒绝，分三步：1."我理解这件事对你很重要"（共情）；2."我目前手上有X和Y两个死线，如果接这个都会受影响"（呈现客观约束，不是主观不愿意）；3."我可以帮你推荐XX，或者等我两周后有空再聊"（提供替代方案）。拒绝不是得罪人，是管理预期。' },
  { title: '泡一壶好茶的基础指南', content: '绿茶75-85°C（烧开后晾2分钟），红茶90-95°C，乌龙茶100°C沸水。绿茶用玻璃杯可观形色，红茶用白瓷赏汤色，乌龙用紫砂聚香气。第一泡醒茶快速倒掉，第二泡开始品——好茶能从第二泡喝到第五泡。投茶量：茶水比约1:50（3g茶叶150ml水）。' },
  { title: '挑选新鲜蔬果的技巧', content: '闻气味——新鲜蔬菜有清香味，不新鲜的有酸腐味。看颜色——颜色鲜亮饱满、不发黄不萎蔫。掂重量——同样大小选重的，说明水分足。摸手感——硬挺有弹性的新鲜，软塌塌的放了很久。西瓜挑瓜蒂翠绿、纹路清晰、拍起来声音清脆的。' },
  { title: 'DIY小伤口正确处理', content: '剪刀擦伤先用清水冲洗干净→碘伏棉签从伤口中心向外画圈消毒（不要来回涂）→小伤口透气创可贴，大面积用无菌纱布包扎。不要用酒精直接涂开放伤口（剧痛且破坏新生细胞），不要用嘴吸伤口（口腔细菌多）。破伤风风险：生锈金属、泥土、动物咬伤要就医打针。' },
  { title: '制作一盆绿植的养护入门', content: '选对植物等于成功一半：新手推荐绿萝/虎皮兰/龟背竹（耐阴耐旱生命力强）。浇水原则：手指插入土中2厘米干了再浇，一次性浇透直到水从盆底流出。不要每天浇一点点（烂根的主要原因）。放在散射光处，避免暴晒和暖气直吹。叶片发黄先检查是否浇水过多。' },
  { title: '如何看懂药品说明书', content: '关注三个关键信息：1.适应症（这个药治什么）、2.用法用量（每次多少、一天几次、饭前还是饭后）、3.禁忌和不良反应（什么情况不能用，有哪些可能副作用）。"慎用"是小心用但要观察，"忌用"是尽量避免，"禁用"是绝对不能吃。服药期间留意说明书中提到的"药物相互作用"，特别是同时吃多种药时。' },
  { title: '高效记笔记的康奈尔法', content: '把一页纸分三区：右上是主笔记区（记录内容要点），左边是提示栏（提炼关键词或问题），底部是总结区（用一两句话概括这页内容）。复习时盖住右边主笔记，看左边关键词复述，效率比单纯重读高3倍。工作和学习都能用。' },
  { title: '挑选合适的运动鞋', content: '跑步鞋分缓震型（适合正常足弓）和支撑型（适合扁平足）。下午试鞋因为脚会轻微肿胀，穿运动袜试。脚尖到鞋头留一个拇指宽度，脚后跟应该贴合不滑动。每跑500-800公里要换新鞋，鞋底花纹磨平了缓冲能力会大幅下降。跑鞋买大不买小。' },
  { title: '提高睡眠质量的卧室改造', content: '遮光窗帘遮掉99%的光（褪黑素分泌必要条件），室温保持18-22°C最佳，隔音耳塞处理外部噪音。床上只做睡觉和亲密两件事——不要在床上工作或刷手机，让大脑建立"床=睡觉"的条件反射。枕头高度以侧卧时头颈与脊柱成一条直线为准。' },
  { title: '用电安全自查清单', content: '插座不要超负荷（一个排插总功率不超过2500W），大功率电器（空调、热水器、电磁炉）必须单独插座回路。电线的绝缘层破损立即更换，不要用胶带缠绕凑合。手湿不碰电器，雷雨天拔掉贵重电器的插头。每月按一次漏电保护开关的测试按钮确保能跳闸。' },
  { title: '建立个人知识管理系统', content: '用"收集→整理→内化→输出"四步循环：看到好内容先扔进一个收件箱（收藏夹/笔记软件），每周花30分钟分类归档删掉不重要的，选3-5条真正重要的用自己的话写一遍（内化），再找机会讲给别人听或写成文章（输出）。知识不经过输出等于没学到。' },
  { title: '换季衣物收纳', content: '收起来前先全部洗一遍（残留汗渍油脂会让衣服发黄长霉），彻底晾干后再收纳。羽绒服不要用真空压缩袋（会破坏蓬松度影响保暖），用透气防尘袋悬挂。毛衣叠放不要挂（会变形），放几块樟木或干燥剂防虫。换季收起来的同时扔掉或捐掉一年没穿过的——你真的不会再穿了。' },
  { title: '番茄工作法的正确用法', content: '25分钟专注工作→5分钟休息，每4个番茄钟后休息15-30分钟。关键要点：一个番茄钟内不可中断（消息、电话都等计时结束），如果被打断就废弃这个番茄钟重新开始。把大任务拆成多个番茄钟的小块，目标是完成番茄钟的数量而不是一次完成整个任务。第一个番茄钟用来做最难的事。' },
  { title: '识别电信诈骗的关键信号', content: '凡是自称公检法要求转账的、凡是通知中奖要你先交钱的、凡是索要银行卡号和验证码的、凡是让你点陌生链接的——99.99%是诈骗。记住：真正的公检法不会电话办案和要钱，银行不会短信发链接让你点，客服不会索要你的验证码。不确定时先挂断，主动打官方电话核实。' },
  { title: '外卖点到健康餐的筛选方法', content: '避雷：炸的、红烧的、糖醋的、勾芡的（高油高糖）。优选：清蒸、白灼、凉拌、炖煮。主食选杂粮饭不选白米饭。备注"少油少盐"大部分商家会配合。如果一餐外卖必然是重口味，搭配一杯绿茶和一份水果中和。每周外卖控制在5顿以内，周末学做2-3道简单的家常菜。' }
];

var emotionTips = [
  '深呼吸法：吸气4秒，屏息7秒，呼气8秒，重复3-5次，激活副交感神经，快速平复情绪。',
  '出门散步15分钟，接触自然光，有助于调节血清素水平，改善心情。',
  '写下三件今天感恩的事，哪怕很小——感恩练习能重塑大脑的关注倾向。',
  '听一首喜欢的歌，闭上眼睛纯粹享受，给情绪一个缓冲带。',
  '泡一杯温热的茶，感受温度从手心传到身体，用感官锚定当下。',
  '给好朋友发一条消息，社交连接是情绪的稳定器。',
  '整理一个角落——外在秩序能带来内在安定感，降低皮质醇水平。',
  '做一组拉伸运动，释放肌肉中储存的压力激素，身体放松带动心理放松。',
  '写下当前最困扰你的事，然后问自己：这件事一周后还重要吗？一个月呢？',
  '看一段搞笑视频，笑能释放内啡肽，是天然的情绪调节剂。'
];

// ===== View Management =====
var currentView = 'home';

function switchView(viewName) {
  currentView = viewName;

  // Update views
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) {
    views[i].classList.remove('active');
  }

  var targetView;
  if (['study', 'work', 'team', 'life', 'emotion', 'hotspot', 'inbox', 'home', 'timeline'].indexOf(viewName) >= 0) {
    targetView = document.getElementById('view-' + viewName);
  } else {
    targetView = document.getElementById('view-custom');
    document.getElementById('custom-view-title').textContent = viewName;
    document.getElementById('custom-section-title').textContent = viewName + '项目';
    renderCustomSection(viewName);
  }

  if (targetView) targetView.classList.add('active');

  // Update sidebar active
  var sidebarItems = document.querySelectorAll('#sidebar .sidebar-item[data-view]');
  for (var j = 0; j < sidebarItems.length; j++) {
    sidebarItems[j].classList.remove('active');
  }
  var sidebarActive = document.querySelector('#sidebar .sidebar-item[data-view="' + viewName + '"]');
  if (sidebarActive) sidebarActive.classList.add('active');

  // Update bottom nav active
  var navItems = document.querySelectorAll('#bottom-nav .nav-item[data-view]');
  for (var k = 0; k < navItems.length; k++) {
    navItems[k].classList.remove('active');
  }
  var navActive = document.querySelector('#bottom-nav .nav-item[data-view="' + viewName + '"]');
  if (navActive) navActive.classList.add('active');

  // Render view content
  if (viewName === 'home') renderHome();
  else if (viewName === 'study') renderStudy();
  else if (viewName === 'work') renderWork();
  else if (viewName === 'timeline') renderTimeline();
  else if (viewName === 'team') renderTeam();
  else if (viewName === 'life') renderLife();
  else if (viewName === 'emotion') renderEmotion();
  else if (viewName === 'hotspot') renderHotspot();
  else if (viewName === 'inbox') { switchInboxTab(currentInboxTab); }

  // Scroll to top
  document.getElementById('views').scrollTop = 0;
}

// ===== Home View =====
function renderHome() {
  var data = Store.get();
  if (!data) return;

  // Date header
  var now = new Date();
  var weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  var el = document.getElementById('hs-weekday');
  var dt = document.getElementById('hs-date-text');
  if (el) el.textContent = weekdays[now.getDay()];
  if (dt) dt.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日';

  // 顺延：把过去未完成的事项搬到今天，并置顶标记「昨日未完」
  var today = todayStr();
  var carryover = 0;
  var changed = false;
  for (var i = 0; i < (data.dailyTodos || []).length; i++) {
    var t = data.dailyTodos[i];
    if (t.date < today && !t.done) {
      t.originalDate = t.originalDate || t.date;
      t.date = today;
      t.carriedDate = today;   // 只在这一天显示「昨日未完」
      t.carriedOver = true;
      carryover++;
      changed = true;
    } else if (t.date < today && t.done) {
      t._delete = true;        // 清理更早之前已完成的事项
      changed = true;
    } else if (t.carriedDate && t.carriedDate !== today) {
      t.carriedOver = false;   // 隔夜之后不再标记
      changed = true;
    }
  }
  if (changed) {
    data.dailyTodos = data.dailyTodos.filter(function (x) { return !x._delete; });
    Store.save(data);
  }

  var todayTodos = (data.dailyTodos || []).filter(function (t) { return t.date === today; });
  var addedToday = todayTodos.filter(function (t) { return t.carriedDate !== today; }).length;
  var doneToday = todayTodos.filter(function (t) { return t.done; }).length;

  var cEl = document.getElementById('hs-carryover'); if (cEl) cEl.textContent = carryover;
  var aEl = document.getElementById('hs-today'); if (aEl) aEl.textContent = addedToday;
  var dEl = document.getElementById('hs-done'); if (dEl) dEl.textContent = doneToday;

  // Today list
  var listEl = document.getElementById('home-today-list');
  if (todayTodos.length === 0) {
    listEl.innerHTML = '<div class="empty-state">今天还没安排，点 + 加一个</div>';
  } else {
    // 排序：昨日未完置顶 → 未完成在前 → 已完成沉底
    var sorted = todayTodos.slice().sort(function (a, b) {
      var ac = (a.carriedDate === today && !a.done) ? 1 : 0;
      var bc = (b.carriedDate === today && !b.done) ? 1 : 0;
      if (ac !== bc) return bc - ac;
      if (a.done !== b.done) return a.done ? 1 : -1;
      return 0;
    });
    listEl.innerHTML = sorted.map(function (t) {
      var isCarry = t.carriedDate === today && !t.done;
      return '<div class="todo-item' + (t.done ? ' done' : '') + (isCarry ? ' carryover' : '') + '">' +
        '<div class="todo-check' + (t.done ? ' done' : '') + '" onclick="toggleDailyTodo(\'' + t.id + '\')">' +
        (t.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') +
        '</div>' +
        '<span class="todo-text' + (t.done ? ' done' : '') + '">' + escapeHtml(t.text) +
        (isCarry ? '<span class="todo-tag">昨日未完</span>' : '') + '</span>' +
        '<button class="todo-delete" onclick="deleteDailyTodo(\'' + t.id + '\')">✕</button>' +
      '</div>';
    }).join('');
  }

  // 明日预告：日期为明天的待办
  var tmr = tomorrowStr();
  var tomorrowTodos = (data.dailyTodos || []).filter(function (t) { return t.date === tmr; });
  var tEl = document.getElementById('home-tomorrow-count');
  if (tEl) tEl.textContent = tomorrowTodos.length + ' 项';
  var tmEl = document.getElementById('home-tomorrow-list');
  if (tomorrowTodos.length === 0) {
    tmEl.innerHTML = '<div class="empty-state">明天还没排，点下面按钮提前安排</div>';
  } else {
    tmEl.innerHTML = tomorrowTodos.map(function (t) {
      return '<div class="todo-item preview">' +
        '<span class="todo-text">' + escapeHtml(t.text) + '</span>' +
        '<button class="todo-delete" onclick="deleteDailyTodo(\'' + t.id + '\')">✕</button>' +
      '</div>';
    }).join('');
  }
  var addTmr = document.getElementById('home-tomorrow-add');
  if (addTmr) addTmr.style.display = '';
}

function addHomeTodo(presetDate) {
  var body = '<input class="modal-input" id="new-todo-input" placeholder="输入待办事项...">' +
    '<label class="modal-label">安排到</label>' +
    '<select class="modal-input" id="new-todo-date">' +
    '<option value="' + todayStr() + '">今天（' + formatDate(todayStr()) + '）</option>' +
    '<option value="' + tomorrowStr() + '"' + (presetDate === 'tomorrow' ? ' selected' : '') + '>明天（' + formatDate(tomorrowStr()) + '）</option>' +
    '</select>';
  showModal('新增待办', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'addDailyTodo()' }
  ]);
  setTimeout(function () {
    var inp = document.getElementById('new-todo-input');
    if (inp) inp.focus();
  }, 100);
}

function toggleDailyTodo(id) {
  var data = Store.get();
  if (!data) return;
  for (var i = 0; i < data.dailyTodos.length; i++) {
    if (data.dailyTodos[i].id === id) {
      data.dailyTodos[i].done = !data.dailyTodos[i].done;
      break;
    }
  }
  Store.save(data);
  renderHome();
}

function deleteDailyTodo(id) {
  var data = Store.get();
  if (!data) return;
  data.dailyTodos = data.dailyTodos.filter(function (t) { return t.id !== id; });
  Store.save(data);
  renderHome();
}

function showAddDailyTodoModal() {
  showModal('添加当日待办', '<input class="modal-input" id="new-todo-input" placeholder="输入待办事项...">', [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'addDailyTodo()' }
  ]);
  setTimeout(function () {
    var inp = document.getElementById('new-todo-input');
    if (inp) inp.focus();
  }, 100);
}

function addDailyTodo() {
  var input = document.getElementById('new-todo-input');
  if (!input || !input.value.trim()) return;
  var dateSel = document.getElementById('new-todo-date');
  var date = dateSel && dateSel.value ? dateSel.value : todayStr();
  var data = Store.get();
  if (!data) return;
  if (!data.dailyTodos) data.dailyTodos = [];
  data.dailyTodos.push({ id: uid(), text: input.value.trim(), done: false, date: date });
  Store.save(data);
  hideModal();
  renderHome();
  showToast(date === todayStr() ? '已加入今天' : '已加入明天');
}

function renderInboxPreview() {
  var data = Store.get();
  if (!data) return;
  var inbox = data.inbox || [];
  var container = document.getElementById('inbox-list');
  if (!container) return;

  if (inbox.length === 0) {
    container.innerHTML = '<div class="empty-state">收件箱为空，点击右下角 + 快速记录</div>';
    return;
  }

  // Show last 3
  var items = inbox.slice(-3).reverse();
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    html += '<div class="inbox-item">' +
      '<div class="inbox-item-dot"></div>' +
      '<span class="inbox-item-text">' + escapeHtml(item.text) + '</span>' +
      '<span class="inbox-item-date">' + formatDate(item.date) + '</span>' +
      '</div>';
  }
  if (inbox.length > 3) {
    html += '<div style="text-align:center;font-size:12px;color:var(--text-light);padding:4px 0;">共 ' + inbox.length + ' 条，点击侧边栏收件箱查看全部</div>';
  }
  container.innerHTML = html;
}

function renderInboxView() {
  var data = Store.get();
  if (!data) return;
  var inbox = data.inbox || [];
  var container = document.getElementById('inbox-full-list');
  var countEl = document.getElementById('inbox-view-count');

  if (container) {
    if (inbox.length === 0) {
      container.innerHTML = '<div class="empty-state">收件箱为空</div>';
    } else {
      var items = inbox.slice().reverse();
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        html += '<div class="inbox-item">' +
          '<div class="inbox-item-dot"></div>' +
          '<span class="inbox-item-text">' + escapeHtml(item.text) + '</span>' +
          '<span class="inbox-item-date">' + formatDate(item.date) + '</span>' +
          '<div class="inbox-item-actions">' +
          '<button class="inbox-action" onclick="moveInboxToTodo(\'' + item.id + '\')">→待办</button>' +
          '<button class="inbox-action del" onclick="deleteInboxItem(\'' + item.id + '\')">删除</button>' +
          '</div>' +
          '</div>';
      }
      container.innerHTML = html;
    }
  }

  // Show note count or mail unread count
  var unreadMail = (data.mailboxMessages || []).filter(function (m) { return !m.is_read; }).length;
  if (countEl) countEl.textContent = unreadMail > 0 ? unreadMail : inbox.length;

  updateInboxBadges();
}

function moveInboxToTodo(id) {
  var data = Store.get();
  if (!data) return;
  var item = data.inbox.find(function (i) { return i.id === id; });
  if (item) {
    if (!data.dailyTodos) data.dailyTodos = [];
    data.dailyTodos.push({ id: uid(), text: item.text, done: false, date: todayStr() });
    data.inbox = data.inbox.filter(function (i) { return i.id !== id; });
    Store.save(data);
    renderInboxView();
    renderHome();
    showToast('已移至待办');
  }
}

function deleteInboxItem(id) {
  var data = Store.get();
  if (!data) return;
  data.inbox = data.inbox.filter(function (i) { return i.id !== id; });
  Store.save(data);
  renderInboxView();
  renderHome();
  updateInboxBadges();
  showToast('已删除');
}

function updateInboxBadges() {
  var data = Store.get();
  if (!data) return;
  var noteCount = (data.inbox || []).length;
  var mailUnread = (data.mailboxMessages || []).filter(function (m) { return !m.is_read; }).length;
  var totalCount = noteCount + mailUnread;

  var el1 = document.getElementById('sidebar-inbox-count');
  var el2 = document.getElementById('home-inbox-count');
  var el3 = document.getElementById('inbox-view-count');

  if (el1) { el1.textContent = totalCount; el1.style.display = totalCount > 0 ? 'flex' : 'none'; el1.style.background = mailUnread > 0 ? '#D4847A' : ''; el1.style.color = mailUnread > 0 ? '#fff' : ''; }
  if (el2) {
    el2.textContent = totalCount;
    el2.style.background = mailUnread > 0 ? '#D4847A' : '';
  }
  if (el3) el3.textContent = mailUnread > 0 ? mailUnread : noteCount;
}

// ===== Mailbox Integration =====
var currentInboxTab = 'notes';
var currentMailId = null;

function switchInboxTab(tab) {
  currentInboxTab = tab;
  var tabs = document.querySelectorAll('#inbox-tabs .inbox-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var activeTab = document.querySelector('#inbox-tabs .inbox-tab[data-tab="' + tab + '"]');
  if (activeTab) activeTab.classList.add('active');

  var panels = document.querySelectorAll('#view-inbox .inbox-panel');
  for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
  var activePanel = document.getElementById('inbox-panel-' + tab);
  if (activePanel) activePanel.classList.add('active');

  if (tab === 'mail') renderMailList();
  else renderInboxView();
}

function formatMailTime(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return diffMin + '分钟前';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + '小时前';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return diffDay + '天前';
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm;
}

function renderMailList() {
  var data = Store.get();
  if (!data) return;
  var messages = data.mailboxMessages || [];
  var container = document.getElementById('mail-list');
  var unreadEl = document.getElementById('mail-unread-dot');
  var viewCount = document.getElementById('inbox-view-count');

  var unreadCount = messages.filter(function (m) { return !m.is_read; }).length;
  if (unreadEl) unreadEl.style.display = unreadCount > 0 ? 'block' : 'none';
  if (viewCount) viewCount.textContent = unreadCount > 0 ? unreadCount : (data.inbox || []).length;

  if (messages.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无邮件</div>';
    return;
  }

  var items = messages.slice().reverse();
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var m = items[i];
    html += '<div class="mail-item' + (m.is_read ? '' : ' unread') + '" onclick="viewMail(\'' + m.id + '\')">' +
      '<div class="mail-item-dot"></div>' +
      '<div class="mail-item-body">' +
        '<div class="mail-item-sender">' + escapeHtml(m.from_name || m.from_email) + '</div>' +
        '<div class="mail-item-subject">' + escapeHtml(m.subject) + '</div>' +
        '<div class="mail-item-snippet">' + escapeHtml(m.snippet || '') + '</div>' +
      '</div>' +
      '<div class="mail-item-time">' + formatMailTime(m.created_at) + '</div>' +
      '</div>';
  }
  container.innerHTML = html;
}

function viewMail(id) {
  var data = Store.get();
  if (!data) return;
  var msg = (data.mailboxMessages || []).find(function (m) { return m.id === id; });
  if (!msg) return;

  currentMailId = id;

  // Mark as read
  msg.is_read = true;
  Store.save(data);

  document.getElementById('mail-detail-from').textContent = msg.from_name + ' <' + msg.from_email + '>';
  document.getElementById('mail-detail-subject').textContent = msg.subject;
  document.getElementById('mail-detail-to').textContent = '收件人：ptss4184@agent.qq.com';
  document.getElementById('mail-detail-date').textContent = new Date(msg.created_at).toLocaleString('zh-CN');
  document.getElementById('mail-detail-body').innerHTML = msg.body || '<p style="color:var(--text-light)">（无正文内容）</p>';
  document.getElementById('mail-detail-overlay').classList.add('active');

  renderMailList();
  updateInboxBadges();
}

function hideMailDetail() {
  document.getElementById('mail-detail-overlay').classList.remove('active');
  currentMailId = null;
}

function mailToTodo() {
  if (!currentMailId) return;
  var data = Store.get();
  if (!data) return;
  var msg = (data.mailboxMessages || []).find(function (m) { return m.id === currentMailId; });
  if (!msg) return;

  if (!data.dailyTodos) data.dailyTodos = [];
  data.dailyTodos.push({
    id: uid(),
    text: '[邮件] ' + msg.subject + ' — ' + msg.from_name,
    done: false,
    date: todayStr()
  });
  Store.save(data);
  hideMailDetail();
  showToast('已转为待办');
  renderHome();
}

function requestMailSync() {
  document.getElementById('mail-sync-overlay').classList.add('active');
}

function hideMailSyncHint() {
  document.getElementById('mail-sync-overlay').classList.remove('active');
}

// ===== Quick Record =====
function showQuickRecordModal() {
  document.getElementById('quick-record-overlay').classList.add('active');
  setTimeout(function () {
    var inp = document.getElementById('quick-record-input');
    if (inp) inp.focus();
  }, 100);
}

function hideQuickRecordModal() {
  document.getElementById('quick-record-overlay').classList.remove('active');
  document.getElementById('quick-record-input').value = '';
}

function quickAdd(target) {
  var input = document.getElementById('quick-record-input');
  var text = input.value.trim();
  if (!text) return;
  var data = Store.get();
  if (!data) return;

  if (target === 'inbox') {
    if (!data.inbox) data.inbox = [];
    data.inbox.push({ id: uid(), text: text, date: todayStr() });
    showToast('已添加到收件箱');
  } else if (target === 'todo') {
    if (!data.dailyTodos) data.dailyTodos = [];
    data.dailyTodos.push({ id: uid(), text: text, done: false, date: todayStr() });
    showToast('已添加到待办');
  } else if (target === 'emotion') {
    document.getElementById('quick-record-overlay').classList.remove('active');
    input.value = '';
    switchView('emotion');
    setTimeout(function () {
      var note = document.getElementById('emotion-note');
      if (note) { note.value = text; note.focus(); }
    }, 300);
    return;
  }

  Store.save(data);
  hideQuickRecordModal();
  input.value = '';
  renderHome();
  updateInboxBadges();
}

// ===== Study View =====
function renderStudy() {
  var data = Store.get();
  if (!data) return;

  renderWordReview(data);
  renderDailySentence(data);
  renderWarStrategy(data);
  renderLifeSkill(data);
  renderCustomStudyTasks(data);
}

function renderWordReview(data) {
  var words = data.study.wordReview || [];
  var container = document.getElementById('word-review-list');
  var html = '';

  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    html += '<div class="word-card">' +
      '<div class="word-header">' +
      '<span class="word-text">' + escapeHtml(w.word) + '</span>' +
      '<span class="word-phonetic">' + escapeHtml(w.phonetic || '') + '</span>' +
      '<button class="word-speak" onclick="speakWord(\'' + escapeAttr(w.word) + '\')" title="点击发音">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>' +
      '</button>' +
      '<span class="word-meaning">' + escapeHtml(w.meaning) + '</span>' +
      '<button class="word-check' + (w.reviewed ? ' reviewed' : '') + '" onclick="toggleWordReviewed(\'' + w.id + '\')">' + (w.reviewed ? '✓ 已复习' : '标记已复习') + '</button>' +
      '<button class="btn-icon" onclick="editWord(\'' + w.id + '\')" style="font-size:11px;">✎</button>' +
      '</div>' +
      '<div class="word-sentence">"' + escapeHtml(w.sentence) + '"</div>' +
      '<div class="word-scenario">' + escapeHtml(w.scenario) + '</div>' +
      '<textarea class="review-input" placeholder="复盘：造句或笔记..." onchange="saveWordReview(\'' + w.id + '\', this.value)">' + escapeHtml(w.reviewText || '') + '</textarea>' +
      '</div>';
  }

  container.innerHTML = html;
}

function toggleWordReviewed(id) {
  var data = Store.get();
  if (!data) return;
  var words = data.study.wordReview || [];
  for (var i = 0; i < words.length; i++) {
    if (words[i].id === id) { words[i].reviewed = !words[i].reviewed; break; }
  }
  Store.save(data);
  renderWordReview(data);
}

function saveWordReview(id, text) {
  var data = Store.get();
  if (!data) return;
  var words = data.study.wordReview || [];
  for (var i = 0; i < words.length; i++) {
    if (words[i].id === id) { words[i].reviewText = text; break; }
  }
  Store.save(data);
}

function editWord(id) {
  var data = Store.get();
  if (!data) return;
  var w = data.study.wordReview.find(function (word) { return word.id === id; });
  if (!w) return;

  var body = '<label style="font-size:11px;color:var(--text-sub);">单词</label><input class="modal-input" id="edit-word" value="' + escapeAttr(w.word) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">音标</label><input class="modal-input" id="edit-phonetic" value="' + escapeAttr(w.phonetic || '') + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">释义</label><input class="modal-input" id="edit-meaning" value="' + escapeAttr(w.meaning) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">例句</label><input class="modal-input" id="edit-sentence" value="' + escapeAttr(w.sentence) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">使用场景</label><input class="modal-input" id="edit-scenario" value="' + escapeAttr(w.scenario) + '">';

  showModal('编辑单词', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveWordEdit(\'' + id + '\')' }
  ]);
}

function saveWordEdit(id) {
  var data = Store.get();
  if (!data) return;
  var w = data.study.wordReview.find(function (word) { return word.id === id; });
  if (!w) return;

  w.word = document.getElementById('edit-word').value || w.word;
  w.phonetic = document.getElementById('edit-phonetic').value;
  w.meaning = document.getElementById('edit-meaning').value || w.meaning;
  w.sentence = document.getElementById('edit-sentence').value || w.sentence;
  w.scenario = document.getElementById('edit-scenario').value || w.scenario;

  Store.save(data);
  hideModal();
  renderWordReview(data);
  showToast('单词已更新');
}

function speakWord(word) {
  if (!window.speechSynthesis) { showToast('浏览器不支持语音朗读'); return; }
  window.speechSynthesis.cancel();
  var utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function renderDailySentence(data) {
  var s = data.study.dailySentence || {};
  var html = '<div class="sentence-card">' +
    '<div class="sentence-text">"' + escapeHtml(s.content || '') + '"</div>' +
    '<div class="sentence-author">—— ' + escapeHtml(s.author || '') + '</div>' +
    '</div>';
  document.getElementById('daily-sentence-content').innerHTML = html;
  document.getElementById('sentence-review').value = s.reviewText || '';
}

function saveSentenceReview() {
  var data = Store.get();
  if (!data) return;
  data.study.dailySentence.reviewText = document.getElementById('sentence-review').value;
  Store.save(data);
  showToast('已保存');
}

function editDailySentence() {
  var data = Store.get();
  if (!data) return;
  var s = data.study.dailySentence;
  var body = '<label style="font-size:11px;color:var(--text-sub);">好句内容</label><textarea class="modal-textarea" id="edit-sentence-content" rows="2">' + escapeHtml(s.content || '') + '</textarea>' +
    '<label style="font-size:11px;color:var(--text-sub);">出处</label><input class="modal-input" id="edit-sentence-author" value="' + escapeAttr(s.author || '') + '">';
  showModal('编辑每日好句', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveSentenceEdit()' }
  ]);
}

function saveSentenceEdit() {
  var data = Store.get();
  if (!data) return;
  data.study.dailySentence.content = document.getElementById('edit-sentence-content').value;
  data.study.dailySentence.author = document.getElementById('edit-sentence-author').value;
  Store.save(data);
  hideModal();
  renderDailySentence(data);
  showToast('已更新');
}

function renderWarStrategy(data) {
  var t = data.study.warStrategy || {};
  var html = '<div class="tip-card war-strategy-card">' +
    '<div class="war-strategy-text">' + escapeHtml(t.text || '') + '</div>' +
    '<div class="war-strategy-source">——' + escapeHtml(t.source || '') + '</div>' +
    '<div class="war-strategy-interp"><span class="war-interp-label">现代解读</span>' + escapeHtml(t.interpretation || '') + '</div>' +
    '</div>';
  document.getElementById('war-strategy-content').innerHTML = html;
  document.getElementById('war-strategy-review').value = t.reviewText || '';
}

function saveWarStrategyReview() {
  var data = Store.get();
  if (!data) return;
  data.study.warStrategy.reviewText = document.getElementById('war-strategy-review').value;
  Store.save(data);
  showToast('已保存');
}

function editWarStrategy() {
  var data = Store.get();
  if (!data) return;
  var t = data.study.warStrategy;
  var body = '<label style="font-size:11px;color:var(--text-sub);">原文</label><textarea class="modal-textarea" id="edit-war-text" rows="2">' + escapeHtml(t.text || '') + '</textarea>' +
    '<label style="font-size:11px;color:var(--text-sub);">出处</label><input class="modal-input" id="edit-war-source" value="' + escapeAttr(t.source || '') + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">现代解读</label><textarea class="modal-textarea" id="edit-war-interp" rows="4">' + escapeHtml(t.interpretation || '') + '</textarea>';
  showModal('编辑孙子兵法每日一句', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveWarStrategyEdit()' }
  ]);
}

function saveWarStrategyEdit() {
  var data = Store.get();
  if (!data) return;
  data.study.warStrategy.text = document.getElementById('edit-war-text').value;
  data.study.warStrategy.source = document.getElementById('edit-war-source').value;
  data.study.warStrategy.interpretation = document.getElementById('edit-war-interp').value;
  Store.save(data);
  hideModal();
  renderWarStrategy(data);
  showToast('已更新');
}

function renderLifeSkill(data) {
  var t = data.study.lifeSkill || {};
  var html = '<div class="tip-card life-skill-card">' +
    '<div class="life-skill-title">' + escapeHtml(t.title || '') + '</div>' +
    '<div class="life-skill-content">' + escapeHtml(t.content || '').replace(/\n/g, '<br>') + '</div>' +
    '</div>';
  document.getElementById('life-skill-content').innerHTML = html;
  document.getElementById('life-skill-review').value = t.reviewText || '';
}

function saveLifeSkillReview() {
  var data = Store.get();
  if (!data) return;
  data.study.lifeSkill.reviewText = document.getElementById('life-skill-review').value;
  Store.save(data);
  showToast('已保存');
}

function editLifeSkill() {
  var data = Store.get();
  if (!data) return;
  var t = data.study.lifeSkill;
  var body = '<label style="font-size:11px;color:var(--text-sub);">标题</label><input class="modal-input" id="edit-skill-title" value="' + escapeAttr(t.title || '') + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">内容</label><textarea class="modal-textarea" id="edit-skill-content" rows="6">' + escapeHtml(t.content || '') + '</textarea>';
  showModal('编辑生活技能', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveLifeSkillEdit()' }
  ]);
}

function saveLifeSkillEdit() {
  var data = Store.get();
  if (!data) return;
  data.study.lifeSkill.title = document.getElementById('edit-skill-title').value;
  data.study.lifeSkill.content = document.getElementById('edit-skill-content').value;
  Store.save(data);
  hideModal();
  renderLifeSkill(data);
  showToast('已更新');
}

function renderCustomStudyTasks(data) {
  var tasks = data.study.customTasks || [];
  var container = document.getElementById('custom-study-tasks');
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无自定义任务，点击 + 添加</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    html += '<div class="custom-task-card">' +
      '<div class="custom-task-header">' +
      '<span class="custom-task-title">' + escapeHtml(t.title) + '</span>' +
      '<span style="display:flex;gap:4px;">' +
      '<button class="btn-icon" onclick="editCustomStudyTask(\'' + t.id + '\')">✎</button>' +
      '<button class="btn-icon" onclick="deleteCustomStudyTask(\'' + t.id + '\')" style="color:#D4A5A5;">✕</button>' +
      '</span>' +
      '</div>' +
      '<div class="custom-task-content">' + escapeHtml(t.content || '') + '</div>' +
      '<textarea class="review-input" placeholder="复盘..." onchange="saveCustomStudyReview(\'' + t.id + '\', this.value)">' + escapeHtml(t.reviewText || '') + '</textarea>' +
      '</div>';
  }
  container.innerHTML = html;
}

function addCustomStudyTask() {
  var body = '<label style="font-size:11px;color:var(--text-sub);">任务名称</label><input class="modal-input" id="custom-task-title" placeholder="输入任务名称...">' +
    '<label style="font-size:11px;color:var(--text-sub);">任务内容</label><textarea class="modal-textarea" id="custom-task-content" placeholder="输入任务详情..." rows="2"></textarea>';
  showModal('添加学习任务', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveCustomStudyTask()' }
  ]);
}

function saveCustomStudyTask() {
  var title = document.getElementById('custom-task-title').value.trim();
  var content = document.getElementById('custom-task-content').value.trim();
  if (!title) return;
  var data = Store.get();
  if (!data) return;
  if (!data.study.customTasks) data.study.customTasks = [];
  data.study.customTasks.push({ id: uid(), title: title, content: content, reviewText: '', date: todayStr() });
  Store.save(data);
  hideModal();
  renderCustomStudyTasks(data);
  showToast('任务已添加');
}

function editCustomStudyTask(id) {
  var data = Store.get();
  if (!data) return;
  var t = data.study.customTasks.find(function (task) { return task.id === id; });
  if (!t) return;
  var body = '<label style="font-size:11px;color:var(--text-sub);">任务名称</label><input class="modal-input" id="edit-ct-title" value="' + escapeAttr(t.title) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">任务内容</label><textarea class="modal-textarea" id="edit-ct-content" rows="2">' + escapeHtml(t.content || '') + '</textarea>';
  showModal('编辑学习任务', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'updateCustomStudyTask(\'' + id + '\')' }
  ]);
}

function updateCustomStudyTask(id) {
  var data = Store.get();
  if (!data) return;
  var t = data.study.customTasks.find(function (task) { return task.id === id; });
  if (!t) return;
  t.title = document.getElementById('edit-ct-title').value.trim();
  t.content = document.getElementById('edit-ct-content').value.trim();
  Store.save(data);
  hideModal();
  renderCustomStudyTasks(data);
  showToast('任务已更新');
}

function deleteCustomStudyTask(id) {
  var data = Store.get();
  if (!data) return;
  data.study.customTasks = data.study.customTasks.filter(function (t) { return t.id !== id; });
  Store.save(data);
  renderCustomStudyTasks(data);
  showToast('已删除');
}

function saveCustomStudyReview(id, text) {
  var data = Store.get();
  if (!data) return;
  var t = data.study.customTasks.find(function (task) { return task.id === id; });
  if (t) { t.reviewText = text; Store.save(data); }
}

// ===== Work View（关于工作：数据看板 / 进度完成 / 日常检查 / 学情分析） =====

// 地区 ↔ 人员映射（含虚拟人号）
var REGION_MAP = [
  { region: '广丰', people: [{ name: '张强', alias: '张老师' }, { name: '蔡思毅', alias: '蔡老师' }] },
  { region: '玉山弋阳', people: [{ name: '陆浩', alias: '沈老师' }, { name: '廖超', alias: '廖老师' }, { name: '王夙诺', alias: '吴老师' }] },
  { region: '婺源德兴', people: [{ name: '王越', alias: '王老师' }] },
  { region: '鄱阳', people: [{ name: '孙潇', alias: '楚老师' }, { name: '刘佳', alias: '盛老师' }] },
  { region: '余干万年', people: [{ name: '季宸锋', alias: '于老师' }, { name: '陈晨阳', alias: '天天老师' }] },
  { region: '信州广信', people: [] }
];

// 三个主指标：流量 / 活动参与 / 见面
var DASH_METRICS = [
  { key: 'flow', label: '流量数据', field: 'contacts', color: '#7E9BA8' },
  { key: 'activity', label: '活动参与', field: 'community', color: '#A88C7D' },
  { key: 'meet', label: '见面人数', field: 'realname', color: '#8FA48D' }
];

// 月度目标（沙盘口径，可在设置中改）
var DASH_TARGETS = { flow: 3000, activity: 1200, meet: 900 };

var currentDashTab = 'team';
var currentDashMetric = 'flow';
var currentProgTab = 'ground';
var openedSubs = { 'sub-dashboard': true, 'sub-progress': false, 'sub-checklist': false, 'sub-xueqing': false };

function defaultWorkChecklist() {
  return [
    { id: uid(), text: '早会：确认今日每人目标与路线', done: false },
    { id: uid(), text: '检查各地区昨日数据是否录入', done: false },
    { id: uid(), text: '跟进添加率低于 70% 的伙伴', done: false },
    { id: uid(), text: '确认本周见面会场地与名单', done: false },
    { id: uid(), text: '复盘：今日完成 vs 目标差距', done: false }
  ];
}

function defaultTimelineProjects() {
  var y = new Date().getFullYear();
  var m = new Date().getMonth();
  function d(day) { return new Date(y, m, day).toISOString().slice(0, 10); }
  return [
    { id: uid(), name: '三一裂变', start: d(1), end: d(20), progress: 40, color: '#7E9BA8' },
    { id: uid(), name: '地推实名', start: d(5), end: d(28), progress: 25, color: '#A88C7D' },
    { id: uid(), name: '见面会', start: d(12), end: d(26), progress: 10, color: '#8FA48D' },
    { id: uid(), name: '线上讲座', start: d(15), end: d(30), progress: 0, color: '#9B8AA6' }
  ];
}

function toggleSub(subId) {
  var body = document.getElementById(subId.replace('sub-', 'body-'));
  var arrow = document.getElementById(subId + '-arrow');
  if (!body) return;
  openedSubs[subId] = !openedSubs[subId];
  body.style.display = openedSubs[subId] ? 'block' : 'none';
  if (arrow) arrow.textContent = openedSubs[subId] ? '▾' : '▸';
}

function applySubState() {
  Object.keys(openedSubs).forEach(function (subId) {
    var body = document.getElementById(subId.replace('sub-', 'body-'));
    var arrow = document.getElementById(subId + '-arrow');
    if (body) body.style.display = openedSubs[subId] ? 'block' : 'none';
    if (arrow) arrow.textContent = openedSubs[subId] ? '▾' : '▸';
  });
}

function renderWork() {
  var data = Store.get();
  if (!data) return;
  Store.ensureWorkData(data);
  Store.save(data);
  applySubState();
  renderDashboard();
  renderProgress();
  renderWorkChecklist();
}

// ---------- 1. 数据看板 ----------
function switchDashTab(tab) {
  currentDashTab = tab;
  syncTabActive('body-dashboard', tab);
  renderDashboard();
}

// tab 高亮：不依赖全局 event，避免个别浏览器取不到
function syncTabActive(bodyId, tab) {
  var body = document.getElementById(bodyId);
  if (!body) return;
  var btns = body.querySelectorAll('.dash-tab');
  for (var i = 0; i < btns.length; i++) {
    var b = btns[i];
    var on = b.textContent.trim() === tab || b.getAttribute('data-tab') === tab;
    b.classList.toggle('active', on);
  }
}

function switchDashMetric(key) {
  currentDashMetric = key;
  renderDashboard();
}

function getWeeklyRows() {
  var data = Store.get();
  return (data && data.weekly && data.weekly.rows) ? data.weekly.rows : [];
}

function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function renderDashboard() {
  var rows = getWeeklyRows();
  var cardsEl = document.getElementById('dash-summary-cards');
  var tableEl = document.getElementById('dash-table');
  var srcEl = document.getElementById('dash-source-label');
  var data = Store.get();
  if (srcEl) {
    var t = data.weekly.lastSync ? new Date(data.weekly.lastSync) : null;
    srcEl.textContent = '数据源：' + (data.weekly.source || 'FY27-周数据') +
      (t ? '（更新 ' + (t.getMonth() + 1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + '）' : '（未同步）');
  }

  if (!rows.length) {
    cardsEl.innerHTML = '<div class="empty-state">还没有周数据，点「↻ 同步周数据」拉取 FY27-周数据</div>';
    tableEl.innerHTML = '';
    drawDashChart([], []);
    return;
  }

  // 汇总
  var total = { contacts: 0, friends: 0, realname: 0, community: 0 };
  rows.forEach(function (r) {
    total.contacts += num(r.contacts);
    total.friends += num(r.friends);
    total.realname += num(r.realname);
    total.community += num(r.community);
  });

  // 指标卡片
  var html = '<div class="dash-metric-chips">';
  DASH_METRICS.forEach(function (m) {
    html += '<button class="metric-chip' + (currentDashMetric === m.key ? ' active' : '') + '" onclick="switchDashMetric(\'' + m.key + '\')">' + m.label + '</button>';
  });
  html += '</div><div class="dash-cards">';
  DASH_METRICS.forEach(function (m) {
    var val = total[m.field] || 0;
    var tgt = DASH_TARGETS[m.key] || 0;
    var pct = tgt ? Math.round(val / tgt * 100) : 0;
    html += '<div class="dash-card" style="border-left-color:' + m.color + '">' +
      '<span class="dc-label">' + m.label + '</span>' +
      '<span class="dc-value">' + val + '</span>' +
      '<div class="dc-bar"><div class="dc-bar-fill" style="width:' + Math.min(pct, 100) + '%;background:' + m.color + '"></div></div>' +
      '<span class="dc-sub">目标 ' + tgt + ' · ' + pct + '%</span>' +
      '</div>';
  });
  html += '</div>';
  cardsEl.innerHTML = html;

  // 维度聚合
  var groups = [];
  if (currentDashTab === 'team') {
    groups = [{ key: '团队总合计', rows: rows }];
  } else if (currentDashTab === 'region') {
    var map = {};
    rows.forEach(function (r) {
      var k = r.region || '未标注';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    groups = Object.keys(map).map(function (k) { return { key: k, rows: map[k] }; });
  } else {
    var pmap = {};
    rows.forEach(function (r) {
      var k = r.owner || r.virtualPerson || '未标注';
      if (!pmap[k]) pmap[k] = [];
      pmap[k].push(r);
    });
    groups = Object.keys(pmap).map(function (k) { return { key: k, rows: pmap[k] }; });
  }

  function sum(arr, f) { var s = 0; arr.forEach(function (r) { s += num(r[f]); }); return s; }

  groups.sort(function (a, b) { return sum(b.rows, 'contacts') - sum(a.rows, 'contacts'); });

  var labels = [], vals = [];
  var thtml = '<div class="dash-table-wrap"><table class="dash-table"><thead><tr>' +
    '<th>' + (currentDashTab === 'person' ? '负责人' : currentDashTab === 'region' ? '地区' : '维度') + '</th>' +
    '<th>流量</th><th>好友</th><th>实名</th><th>社群</th><th>完成</th></tr></thead><tbody>';
  groups.forEach(function (g) {
    var c = sum(g.rows, 'contacts'), f = sum(g.rows, 'friends'), rn = sum(g.rows, 'realname'), cm = sum(g.rows, 'community');
    var metricVal = currentDashMetric === 'flow' ? c : currentDashMetric === 'activity' ? cm : rn;
    var tgt = DASH_TARGETS[currentDashMetric] || 1;
    var pct = Math.round(metricVal / tgt * 100);
    labels.push(g.key);
    vals.push(metricVal);
    thtml += '<tr><td class="dt-name">' + escapeHtml(g.key) + '</td>' +
      '<td>' + c + '</td><td>' + f + '</td><td>' + rn + '</td><td>' + cm + '</td>' +
      '<td><span class="dt-pct' + (pct >= 100 ? ' ok' : pct >= 60 ? ' mid' : ' low') + '">' + pct + '%</span></td></tr>';
  });
  thtml += '</tbody></table></div>';
  tableEl.innerHTML = thtml;

  drawDashChart(labels, vals);
}

function drawDashChart(labels, values) {
  var canvas = document.getElementById('dash-chart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.parentNode.clientWidth || 340;
  var h = 180;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!labels.length) {
    ctx.fillStyle = '#9c9891';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w / 2, h / 2);
    return;
  }

  var metric = DASH_METRICS.filter(function (m) { return m.key === currentDashMetric; })[0] || DASH_METRICS[0];
  var padL = 34, padR = 10, padT = 16, padB = 34;
  var cw = w - padL - padR, ch = h - padT - padB;
  var max = Math.max.apply(null, values);
  if (max <= 0) max = 1;
  max = Math.ceil(max * 1.15);

  // grid
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.fillStyle = '#a9a49c';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (var i = 0; i <= 4; i++) {
    var y = padT + ch - (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(Math.round(max / 4 * i), padL - 5, y + 3);
  }

  var bw = cw / labels.length;
  var barW = Math.min(bw * 0.55, 34);
  for (var j = 0; j < labels.length; j++) {
    var v = values[j];
    var bh = (v / max) * ch;
    var x = padL + bw * j + (bw - barW) / 2;
    var y2 = padT + ch - bh;
    var grd = ctx.createLinearGradient(0, y2, 0, padT + ch);
    grd.addColorStop(0, metric.color);
    grd.addColorStop(1, metric.color + '66');
    ctx.fillStyle = grd;
    roundRect(ctx, x, y2, barW, bh, 4);
    ctx.fill();
    ctx.fillStyle = '#6b6760';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(v), x + barW / 2, y2 - 4);
    var lb = labels[j].length > 5 ? labels[j].slice(0, 5) : labels[j];
    ctx.fillStyle = '#9c9891';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillText(lb, x + barW / 2, padT + ch + 13);
  }
}

function syncWeeklyData() {
  showToast('正在同步 FY27-周数据…');
  Store.loadWeeklyFromJson(false);
  setTimeout(function () { renderWork(); }, 600);
}

// ---------- 2. 进度完成 ----------
function switchProgTab(tab) {
  currentProgTab = tab;
  syncTabActive('body-progress', tab);
  renderProgress();
}

function renderProgress() {
  var data = Store.get();
  if (!data) return;
  var el = document.getElementById('progress-content');
  if (!el) return;

  if (currentProgTab === 'ground' || currentProgTab === 'meetup') {
    var campaigns = (data.team && data.team.campaigns) ? data.team.campaigns : [];
    var keyword = currentProgTab === 'ground' ? '地推' : '见面';
    var list = campaigns.filter(function (c) { return c.name.indexOf(keyword) >= 0; });
    if (!list.length) list = campaigns;
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">暂无战役数据，先在数据看板同步</div>';
      return;
    }
    var html = '';
    list.forEach(function (c) {
      var pct = c.target ? Math.round(num(c.current) / num(c.target) * 100) : 0;
      var timePct = Math.round(campaignTimeProgress() * 100);
      var gap = pct - timePct;
      html += '<div class="prog-item">' +
        '<div class="prog-top"><span class="prog-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="prog-num">' + (c.current || 0) + ' / ' + (c.target || 0) + '</span></div>' +
        '<div class="prog-bar"><div class="prog-fill" style="width:' + Math.min(pct, 100) + '%"></div>' +
        '<div class="prog-time-mark" style="left:' + Math.min(timePct, 100) + '%"></div></div>' +
        '<div class="prog-foot"><span>完成 ' + pct + '%</span>' +
        '<span class="time-mark-label">时间已过 ' + timePct + '%</span>' +
        '<span class="' + (gap >= 0 ? 'gap-ok' : 'gap-bad') + '">' + (gap >= 0 ? '领先 ' : '滞后 ') + Math.abs(gap) + '%</span></div>' +
        '</div>';
    });
    // 附：周数据实名/见面进度
    var rows = getWeeklyRows();
    if (rows.length) {
      var rn = 0, cm = 0;
      rows.forEach(function (r) { rn += num(r.realname); cm += num(r.community); });
      html += '<div class="prog-note">周数据累计：好友实名 ' + rn + ' · 社群人数 ' + cm + '</div>';
    }
    el.innerHTML = html;
    return;
  }

  // 周/月对比
  var rows = getWeeklyRows();
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">暂无周数据，无法对比</div>';
    return;
  }
  var today = new Date();
  var weekStart = getWeekStart();
  var monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  var todayS = todayStr();

  function agg(pred) {
    var a = { contacts: 0, realname: 0, community: 0 };
    rows.filter(function (r) { return pred(r.date); }).forEach(function (r) {
      a.contacts += num(r.contacts); a.realname += num(r.realname); a.community += num(r.community);
    });
    return a;
  }
  var wk = agg(function (d) { return d >= weekStart && d <= todayS; });
  var mo = agg(function (d) { return d >= monthStart && d <= todayS; });

  var days = today.getDate(); // 本月已过天数（含今天）
  var dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  function row(label, w, m) {
    var wRate = (w / 7).toFixed(1);
    var mRate = (m / days).toFixed(1);
    var forecast = Math.round(mRate * dim);
    var pace = parseFloat(mRate) >= parseFloat(wRate) ? 'up' : 'down';
    return '<div class="cmp-card">' +
      '<div class="cmp-label">' + label + '</div>' +
      '<div class="cmp-row"><span>本周 ' + w + '</span><span>日均 ' + wRate + '</span></div>' +
      '<div class="cmp-row"><span>本月 ' + m + '</span><span>日均 ' + mRate + '</span></div>' +
      '<div class="cmp-row cmp-forecast"><span>按本月节奏预估全月</span><span class="' + pace + '">' + forecast + '</span></div>' +
      '</div>';
  }

  el.innerHTML = '<div class="cmp-wrap">' +
    row('流量数据', wk.contacts, mo.contacts) +
    row('实名完成', wk.realname, mo.realname) +
    row('活动参与', wk.community, mo.community) +
    '</div><div class="cmp-hint">对比口径：本周（周一起）vs 本月（1 日起），共 ' + days + ' 天 / 全月 ' + dim + ' 天</div>';
}

// ---------- 3. 日常检查 ----------
function renderWorkChecklist() {
  var data = Store.get();
  if (!data) return;
  var el = document.getElementById('work-daily-checklist');
  if (!el) return;
  var items = data.workChecklist || [];
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">暂无检查项</div>';
    return;
  }
  var doneCount = items.filter(function (i) { return i.done; }).length;
  el.innerHTML = '<div class="check-progress">今日完成 ' + doneCount + ' / ' + items.length + '</div>' +
    items.map(function (it) {
      return '<div class="todo-item' + (it.done ? ' done' : '') + '">' +
        '<div class="todo-check' + (it.done ? ' done' : '') + '" onclick="toggleWorkCheckItem(\'' + it.id + '\')">' +
        (it.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>' : '') +
        '</div>' +
        '<span class="todo-text' + (it.done ? ' done' : '') + '">' + escapeHtml(it.text) + '</span>' +
        '<button class="todo-delete" onclick="deleteWorkCheckItem(\'' + it.id + '\')">✕</button>' +
        '</div>';
    }).join('');
}

function addWorkCheckItem() {
  showModal('新增检查项', '<input class="modal-input" id="wchk-input" placeholder="例如：确认见面会名单">', [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveWorkCheckItem()' }
  ]);
  setTimeout(function () { var i = document.getElementById('wchk-input'); if (i) i.focus(); }, 100);
}

function saveWorkCheckItem() {
  var inp = document.getElementById('wchk-input');
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;
  var data = Store.get();
  if (!data) return;
  if (!data.workChecklist) data.workChecklist = [];
  data.workChecklist.push({ id: uid(), text: text, done: false });
  Store.save(data);
  hideModal();
  renderWorkChecklist();
  showToast('已添加');
}

function toggleWorkCheckItem(id) {
  var data = Store.get();
  if (!data) return;
  (data.workChecklist || []).forEach(function (it) { if (it.id === id) it.done = !it.done; });
  Store.save(data);
  renderWorkChecklist();
}

function deleteWorkCheckItem(id) {
  var data = Store.get();
  if (!data) return;
  data.workChecklist = (data.workChecklist || []).filter(function (i) { return i.id !== id; });
  Store.save(data);
  renderWorkChecklist();
  showToast('已删除');
}

// ---------- 4. 学情分析 ----------
var XQ_FULL = 730; // 上饶中考参考满分

function generateXueqing() {
  var nameEl = document.getElementById('xq-name');
  var scoreEl = document.getElementById('xq-score');
  if (!nameEl || !scoreEl) return;
  var name = nameEl.value.trim() || '该生';
  var score = parseFloat(scoreEl.value);
  if (isNaN(score)) { showToast('请先填写模考分数'); return; }
  var pct = Math.round(score / XQ_FULL * 100);

  var tier, plan, focus;
  if (pct >= 85) {
    tier = '冲刺重点';
    focus = '压轴题突破 + 答题规范';
    plan = ['第1周：锁定数学压轴与物理电学综合，每天 2 道压轴限时练',
      '第2周：语文作文结构定型，准备 3 套万能素材',
      '第3周：英语完形+阅读限时训练，控制在 25 分钟内',
      '第4周：全科模拟卷 2 套，重点复盘失误类型'];
  } else if (pct >= 70) {
    tier = '稳中有升';
    focus = '中档题提分 + 薄弱学科补强';
    plan = ['第1周：梳理各科错题，找出 3 个高频失分点',
      '第2周：数学中档题专项（函数/几何证明），每日 8 题',
      '第3周：理化基础公式过关，错题重做一遍',
      '第4周：限时套卷训练，提升答题节奏'];
  } else if (pct >= 55) {
    tier = '基础补漏';
    focus = '基础知识重建 + 必拿分题型';
    plan = ['第1周：课本例题重做，各科基础概念过关',
      '第2周：数学前 18 题、物理前 20 题专项，确保不失分',
      '第3周：英语词汇 1600 词冲刺，每日 40 词',
      '第4周：基础卷模拟，建立答题信心'];
  } else {
    tier = '重建信心';
    focus = '习惯养成 + 保底分策略';
    plan = ['第1周：固定学习节奏，每天 2 小时专注时段',
      '第2周：只攻最易提分模块（古诗文默写、化学方程式、物理公式）',
      '第3周：一对一答疑，解决卡点不积攒',
      '第4周：小测验收，用进步反馈建立信心'];
  }

  var gap = XQ_FULL - score;
  var scripts = [
    { t: '开场（破冰）', c: name + '家长您好，我是负责学情规划的×老师。今天不谈报班，先花 10 分钟把孩子的真实情况捋清楚，您看方便吗？' },
    { t: '诊断（说真话）', c: '孩子目前模考 ' + score + ' 分，占满分 ' + pct + '%，属于「' + tier + '」这一档。离目标还差 ' + gap + ' 分，但好消息是——这个分数段的孩子，提分空间最大的恰恰是基础和中档题，不是难题。' },
    { t: '给出路径', c: '接下来一个月的重心是：' + focus + '。我给孩子排了四周计划，' + plan[0].replace('第1周：', '') + '，先做这一件事，别贪多。' },
    { t: '家长配合', c: '家长这边只需要做两件事：一是每天签字确认计划完成情况，二是这周内不要主动提分数，只问「今天哪道题弄懂了」。' },
    { t: '收口（约动作）', c: '下周三我再跟您同步一次孩子这一周的完成情况，到时候根据实际进度再调整计划。您看这样行吗？' }
  ];

  var html = '<div class="xq-result">' +
    '<div class="xq-head"><span class="xq-tier tier-' + (pct >= 85 ? 'a' : pct >= 70 ? 'b' : pct >= 55 ? 'c' : 'd') + '">' + tier + '</span>' +
    '<span class="xq-score">' + score + ' / ' + XQ_FULL + '（' + pct + '%）</span></div>' +
    '<div class="xq-focus">主攻方向：' + focus + '</div>' +
    '<div class="xq-block-title">四周学情计划</div>' +
    '<ol class="xq-plan">' + plan.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ol>' +
    '<div class="xq-block-title">单聊话术</div>' +
    scripts.map(function (s) {
      return '<div class="xq-script"><span class="xs-tag">' + s.t + '</span><p>' + escapeHtml(s.c) + '</p></div>';
    }).join('') +
    '<button class="btn-quick-action" onclick="saveXueqing()">保存到学情记录</button>' +
    '</div>';

  var res = document.getElementById('xueqing-result');
  res.innerHTML = html;
  res._xq = { name: name, score: score, tier: tier, plan: plan, date: todayStr() };
}

function saveXueqing() {
  var res = document.getElementById('xueqing-result');
  if (!res || !res._xq) return;
  var data = Store.get();
  if (!data) return;
  if (!data.xueqingRecords) data.xueqingRecords = [];
  data.xueqingRecords.push(res._xq);
  Store.save(data);
  showToast('已保存学情记录');
}

// ===== 时间轴 =====
function renderTimeline() {
  var data = Store.get();
  if (!data) return;
  Store.ensureWorkData(data);
  var el = document.getElementById('timeline-canvas');
  if (!el) return;
  var projects = data.timelineProjects || [];
  if (!projects.length) {
    el.innerHTML = '<div class="empty-state">还没有项目，点下方新增</div>';
    return;
  }

  // 时间范围：本月 1 日 ~ 月末
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var start = new Date(y, m, 1);
  var end = new Date(y, m + 1, 0);
  var totalDays = end.getDate();
  var todayDay = now.getDate();

  var html = '<div class="tl-grid">';

  // 表头：日期刻度
  html += '<div class="tl-row tl-head"><div class="tl-name"></div><div class="tl-track">';
  for (var d = 1; d <= totalDays; d++) {
    var isToday = d === todayDay;
    var wk = new Date(y, m, d).getDay();
    html += '<div class="tl-day' + (isToday ? ' today' : '') + (wk === 0 || wk === 6 ? ' weekend' : '') + '">' + d + '</div>';
  }
  html += '</div></div>';

  projects.forEach(function (p) {
    var s = Math.max(1, Math.min(totalDays, parseInt((p.start || '').slice(8, 10), 10) || 1));
    var e = Math.max(s, Math.min(totalDays, parseInt((p.end || '').slice(8, 10), 10) || totalDays));
    var left = (s - 1) / totalDays * 100;
    var width = (e - s + 1) / totalDays * 100;
    html += '<div class="tl-row">' +
      '<div class="tl-name" onclick="editTimelineProject(\'' + p.id + '\')">' + escapeHtml(p.name) + '</div>' +
      '<div class="tl-track">' +
      '<div class="tl-today-line" style="left:' + (todayDay / totalDays * 100) + '%"></div>' +
      '<div class="tl-bar" style="left:' + left + '%;width:' + width + '%;background:' + (p.color || '#7E9BA8') + '" onclick="editTimelineProject(\'' + p.id + '\')">' +
      '<div class="tl-bar-fill" style="width:' + (p.progress || 0) + '%"></div>' +
      '<span class="tl-bar-text">' + (p.progress || 0) + '%</span>' +
      '</div>' +
      '</div></div>';
  });

  html += '</div>';
  el.innerHTML = html;
}

function addTimelineProject() {
  var body = '<input class="modal-input" id="tl-name" placeholder="项目名称，如：三一裂变">' +
    '<label class="modal-label">开始日期</label><input class="modal-input" id="tl-start" type="date">' +
    '<label class="modal-label">截止日期</label><input class="modal-input" id="tl-end" type="date">' +
    '<label class="modal-label">完成进度 %</label><input class="modal-input" id="tl-progress" type="number" value="0">';
  showModal('新增项目', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveTimelineProject()' }
  ]);
  var d = todayStr();
  setTimeout(function () {
    var s = document.getElementById('tl-start'); if (s) s.value = d;
    var e = document.getElementById('tl-end'); if (e) e.value = d;
  }, 50);
}

function saveTimelineProject() {
  var name = (document.getElementById('tl-name') || {}).value || '';
  name = name.trim();
  if (!name) { showToast('请填写项目名称'); return; }
  var data = Store.get();
  if (!data) return;
  if (!data.timelineProjects) data.timelineProjects = [];
  var palette = ['#7E9BA8', '#A88C7D', '#8FA48D', '#9B8AA6', '#B08968', '#94A89A'];
  data.timelineProjects.push({
    id: uid(),
    name: name,
    start: (document.getElementById('tl-start') || {}).value || todayStr(),
    end: (document.getElementById('tl-end') || {}).value || todayStr(),
    progress: parseInt((document.getElementById('tl-progress') || {}).value, 10) || 0,
    color: palette[data.timelineProjects.length % palette.length]
  });
  Store.save(data);
  hideModal();
  renderTimeline();
  showToast('项目已添加');
}

function editTimelineProject(id) {
  var data = Store.get();
  if (!data) return;
  var p = (data.timelineProjects || []).filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  var body = '<input class="modal-input" id="tl-e-name" value="' + escapeAttr(p.name) + '">' +
    '<label class="modal-label">开始日期</label><input class="modal-input" id="tl-e-start" type="date" value="' + p.start + '">' +
    '<label class="modal-label">截止日期</label><input class="modal-input" id="tl-e-end" type="date" value="' + p.end + '">' +
    '<label class="modal-label">完成进度 %</label><input class="modal-input" id="tl-e-progress" type="number" value="' + (p.progress || 0) + '">';
  showModal('编辑项目', body, [
    { text: '删除', cls: 'btn-modal cancel', action: 'deleteTimelineProject(\'' + id + '\')' },
    { text: '保存', cls: 'btn-modal confirm', action: 'updateTimelineProject(\'' + id + '\')' }
  ]);
}

function updateTimelineProject(id) {
  var data = Store.get();
  if (!data) return;
  var p = (data.timelineProjects || []).filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  p.name = (document.getElementById('tl-e-name').value || p.name).trim();
  p.start = document.getElementById('tl-e-start').value || p.start;
  p.end = document.getElementById('tl-e-end').value || p.end;
  p.progress = parseInt(document.getElementById('tl-e-progress').value, 10) || 0;
  Store.save(data);
  hideModal();
  renderTimeline();
  showToast('已更新');
}

function deleteTimelineProject(id) {
  var data = Store.get();
  if (!data) return;
  data.timelineProjects = (data.timelineProjects || []).filter(function (x) { return x.id !== id; });
  Store.save(data);
  hideModal();
  renderTimeline();
  showToast('已删除');
}

// ===== 备份到腾讯文档 =====
function buildBackupPayload() {
  var data = Store.get();
  if (!data) return null;
  return {
    backupAt: new Date().toISOString(),
    todos: data.dailyTodos || [],
    workChecklist: data.workChecklist || [],
    workTasks: data.workTasks || [],
    timelineProjects: data.timelineProjects || [],
    xueqingRecords: data.xueqingRecords || [],
    lifeRecords: data.lifeRecords || [],
    emotionRecords: data.emotionRecords || [],
    hotspots: data.hotspots || [],
    study: data.study || {},
    team: data.team || {}
  };
}

function exportBackup() {
  var payload = buildBackupPayload();
  if (!payload) return;
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '工作台备份_' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  var data = Store.get();
  data.backup.lastBackup = Date.now();
  Store.save(data);
  showToast('备份文件已下载，可交给助手上传腾讯文档');
}

function copyBackupToClipboard() {
  var payload = buildBackupPayload();
  if (!payload) return;
  var text = JSON.stringify(payload);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('备份数据已复制，粘贴给助手即可上传');
    }, function () { showToast('复制失败，请改用下载'); });
  } else {
    showToast('当前环境不支持复制，请改用下载');
  }
}

function showBackupModal() {
  var data = Store.get();
  var last = data.backup && data.backup.lastBackup ? new Date(data.backup.lastBackup) : null;
  var body = '<p class="modal-desc">工作台数据保存在本机浏览器。为防止清理缓存丢失，可定期备份到《工作台数据备份同步》。</p>' +
    '<p class="modal-desc">上次备份：' + (last ? (last.getMonth() + 1) + '月' + last.getDate() + '日 ' + String(last.getHours()).padStart(2, '0') + ':' + String(last.getMinutes()).padStart(2, '0') : '从未备份') + '</p>' +
    '<div class="modal-btn-row"><button class="btn-quick-action" onclick="exportBackup()">下载备份文件</button>' +
    '<button class="btn-quick-action ghost" onclick="copyBackupToClipboard()">复制备份数据</button></div>';
  showModal('备份到腾讯文档', body, [
    { text: '关闭', cls: 'btn-modal cancel', action: 'hideModal()' }
  ]);
}

function addWorkTask() {
  var body = '<input class="modal-input" id="work-task-text" placeholder="输入工作任务...">' +
    '<label style="font-size:11px;color:var(--text-sub);">优先级</label>' +
    '<select class="modal-input" id="work-task-priority"><option value="high">高</option><option value="medium" selected>中</option><option value="low">低</option></select>';
  showModal('添加工作任务', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveWorkTask()' }
  ]);
}

function saveWorkTask() {
  var text = document.getElementById('work-task-text').value.trim();
  var priority = document.getElementById('work-task-priority').value;
  if (!text) return;
  var data = Store.get();
  if (!data) return;
  if (!data.workTasks) data.workTasks = [];
  data.workTasks.push({ id: uid(), text: text, done: false, priority: priority, date: todayStr() });
  Store.save(data);
  hideModal();
  showToast('任务已添加');
}

function toggleWorkTask(id) {
  var data = Store.get();
  if (!data) return;
  for (var i = 0; i < data.workTasks.length; i++) {
    if (data.workTasks[i].id === id) { data.workTasks[i].done = !data.workTasks[i].done; break; }
  }
  Store.save(data);
}

function editWorkTask(id) {
  var data = Store.get();
  if (!data) return;
  var t = data.workTasks.find(function (task) { return task.id === id; });
  if (!t) return;
  var body = '<input class="modal-input" id="edit-wt-text" value="' + escapeAttr(t.text) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">优先级</label>' +
    '<select class="modal-input" id="edit-wt-priority"><option value="high"' + (t.priority === 'high' ? ' selected' : '') + '>高</option><option value="medium"' + (t.priority === 'medium' ? ' selected' : '') + '>中</option><option value="low"' + (t.priority === 'low' ? ' selected' : '') + '>低</option></select>';
  showModal('编辑工作任务', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'updateWorkTask(\'' + id + '\')' }
  ]);
}

function updateWorkTask(id) {
  var data = Store.get();
  if (!data) return;
  var t = data.workTasks.find(function (task) { return task.id === id; });
  if (!t) return;
  t.text = document.getElementById('edit-wt-text').value.trim();
  t.priority = document.getElementById('edit-wt-priority').value;
  Store.save(data);
  hideModal();
  showToast('任务已更新');
}

function deleteWorkTask(id) {
  var data = Store.get();
  if (!data) return;
  data.workTasks = data.workTasks.filter(function (t) { return t.id !== id; });
  Store.save(data);
  showToast('已删除');
}


// ===== Life View =====
function renderLife() {
  var data = Store.get();
  if (!data) return;
  document.getElementById('life-date-label').textContent = formatDate(todayStr());

  // Load today's record if exists
  var records = data.lifeRecords || [];
  var today = todayStr();
  var todayRecord = records.find(function (r) { return r.date === today; });

  document.getElementById('life-weight').value = todayRecord ? (todayRecord.weight || '') : '';
  document.getElementById('life-steps').value = todayRecord ? (todayRecord.steps || '') : '';
  document.getElementById('life-calories').value = todayRecord ? (todayRecord.calories || '') : '';
  document.getElementById('life-exercise').value = todayRecord ? (todayRecord.exercise || '') : '';

  renderMealRecommendation(records);
  renderExerciseSuggestion(records);
  drawLifeChart();
}

function saveLifeRecord() {
  var weight = parseFloat(document.getElementById('life-weight').value) || 0;
  var steps = parseInt(document.getElementById('life-steps').value) || 0;
  var calories = parseInt(document.getElementById('life-calories').value) || 0;
  var exercise = document.getElementById('life-exercise').value.trim();

  var data = Store.get();
  if (!data) return;
  if (!data.lifeRecords) data.lifeRecords = [];

  var today = todayStr();
  var existing = data.lifeRecords.findIndex(function (r) { return r.date === today; });

  var record = { id: uid(), date: today, weight: weight, steps: steps, calories: calories, exercise: exercise };

  if (existing >= 0) {
    record.id = data.lifeRecords[existing].id;
    data.lifeRecords[existing] = record;
  } else {
    data.lifeRecords.push(record);
  }

  // Sort by date
  data.lifeRecords.sort(function (a, b) { return a.date.localeCompare(b.date); });

  Store.save(data);
  renderLife();
  showToast('数据已保存');
}

function renderMealRecommendation(records) {
  var el = document.getElementById('meal-rec');
  if (records.length === 0) {
    el.textContent = '请先记录今日体重和运动数据，我将根据你的身体状况推荐合适的餐食。';
    return;
  }

  var today = records[records.length - 1];
  var prev = records.length > 1 ? records[records.length - 2] : null;
  var weightDiff = prev ? (today.weight - prev.weight) : 0;
  var calories = today.calories || 0;

  var rec = '';
  if (calories < 200) {
    rec = '今日运动量较少，建议轻食餐：\n• 藜麦蔬菜沙拉（约200kcal）\n• 清蒸鸡胸肉（约150kcal）\n• 一碗紫菜蛋花汤（约80kcal）\n总热量约 430kcal';
  } else if (calories < 500) {
    rec = '运动量适中，建议均衡餐：\n• 糙米饭一碗（约180kcal）\n• 香煎三文鱼（约220kcal）\n• 蒜蓉西兰花（约80kcal）\n• 一杯无糖酸奶（约70kcal）\n总热量约 550kcal';
  } else {
    rec = '运动量较大，建议补充能量：\n• 全麦意面（约250kcal）\n• 黑椒牛肉（约280kcal）\n• 烤蔬菜拼盘（约100kcal）\n• 一根香蕉（约90kcal）\n总热量约 720kcal';
  }

  if (weightDiff > 0.5) {
    rec += '\n\n⚠ 体重较昨日增加 ' + weightDiff.toFixed(1) + ' kg，建议适当减少碳水摄入，增加蛋白质比例。';
  } else if (weightDiff < -0.5) {
    rec += '\n\n✓ 体重较昨日下降 ' + Math.abs(weightDiff).toFixed(1) + ' kg，注意补充蛋白质和充足水分。';
  }

  el.textContent = rec;
}

function renderExerciseSuggestion(records) {
  var el = document.getElementById('exercise-rec');
  if (records.length === 0) {
    el.textContent = '请先记录今日数据，我将根据你的运动情况提供个性化建议。';
    return;
  }

  var today = records[records.length - 1];
  var steps = today.steps || 0;

  var suggestion = '';
  if (steps < 3000) {
    suggestion = '今日步数偏少，建议：\n• 午休后快走20分钟\n• 晚饭后散步30分钟\n• 目标步数：8000步\n\n小步开始，不要着急。';
  } else if (steps < 6000) {
    suggestion = '步数尚可，建议补充：\n• 15分钟力量训练（深蹲3组×15次、俯卧撑3组×10次）\n• 10分钟拉伸放松\n\n保持节奏，循序渐进。';
  } else if (steps < 10000) {
    suggestion = '步数良好！建议：\n• 10分钟全身拉伸\n• 瑜伽或普拉提15分钟\n\n注意运动后补充水分。';
  } else {
    suggestion = '今日运动量充足！ ✓\n建议：\n• 15分钟深度拉伸\n• 泡沫轴放松肌肉\n• 充足睡眠帮助恢复\n\n明天可以适当休息或轻度活动。';
  }

  el.textContent = suggestion;
}

var lifeChartPeriod = 'week';
var lifeChartMetric = 'steps';

function switchLifeChart(period) {
  lifeChartPeriod = period;
  var tabs = document.querySelectorAll('#view-life .chart-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.period === period);
  }
  drawLifeChart();
}

function switchLifeMetric(metric) {
  lifeChartMetric = metric;
  var tabs = document.querySelectorAll('#view-life .metric-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.metric === metric);
  }
  drawLifeChart();
}

function drawLifeChart() {
  var canvas = document.getElementById('life-chart');
  var emptyEl = document.getElementById('life-chart-empty');
  if (!canvas) return;

  var data = Store.get();
  if (!data) return;
  var records = data.lifeRecords || [];
  if (records.length === 0) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  var series = aggregateLifeData(records, lifeChartPeriod);
  var values = series.map(function (s) { return lifeChartMetric === 'steps' ? s.steps : s.calories; });
  var labels = series.map(function (s) { return s.label; });
  var title = lifeChartMetric === 'steps' ? '步数' : '卡路里(kcal)';
  var color = '#C4A57B';

  drawBar(canvas, values, labels, title, color);
}

function aggregateLifeData(records, period) {
  var result = [];
  var today = new Date();

  if (period === 'week') {
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var rec = records.find(function (r) { return r.date === ds; });
      result.push({ label: d.getMonth() + 1 + '/' + d.getDate(), steps: rec ? rec.steps : 0, calories: rec ? rec.calories : 0 });
    }
  } else if (period === 'month') {
    for (var j = 3; j >= 0; j--) {
      var wkStart = new Date(today);
      wkStart.setDate(wkStart.getDate() - j * 7 - wkStart.getDay() + 1);
      var wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 6);

      var sumSteps = 0, sumCal = 0, cnt = 0;
      for (var k = 0; k < records.length; k++) {
        var rd = new Date(records[k].date);
        if (rd >= wkStart && rd <= wkEnd && rd <= today) {
          sumSteps += records[k].steps || 0;
          sumCal += records[k].calories || 0;
          cnt++;
        }
      }
      result.push({ label: '第' + (j + 1) + '周', steps: Math.round(sumSteps), calories: Math.round(sumCal) });
    }
  } else if (period === 'year') {
    for (var m = 11; m >= 0; m--) {
      var md = new Date(today.getFullYear(), today.getMonth() - m, 1);
      var mKey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
      var mRecords = records.filter(function (r) { return r.date.startsWith(mKey); });
      var avgSteps = 0, avgCal = 0;
      if (mRecords.length > 0) {
        avgSteps = Math.round(mRecords.reduce(function (s, r) { return s + (r.steps || 0); }, 0) / mRecords.length);
        avgCal = Math.round(mRecords.reduce(function (s, r) { return s + (r.calories || 0); }, 0) / mRecords.length);
      }
      result.push({ label: (md.getMonth() + 1) + '月', steps: avgSteps, calories: avgCal });
    }
  }

  return result;
}

// ===== Emotion View =====
function renderEmotion() {
  var data = Store.get();
  if (!data) return;
  document.getElementById('emotion-date-label').textContent = formatDate(todayStr());

  // Load today's record
  var today = todayStr();
  var todayRecord = (data.emotionRecords || []).find(function (r) { return r.date === today; });

  document.getElementById('emotion-score').value = todayRecord ? todayRecord.score : 6;
  document.getElementById('emotion-note').value = todayRecord ? (todayRecord.note || '') : '';
  updateEmotionScore();

  drawEmotionChart();
  renderEmotionTips();
}

function updateEmotionScore() {
  var score = parseInt(document.getElementById('emotion-score').value);
  document.getElementById('emotion-score-value').textContent = score;

  var emoji = score <= 3 ? '😞' : score <= 5 ? '😟' : score <= 7 ? '😐' : score <= 9 ? '😊' : '🌟';
  document.getElementById('emotion-score-emoji').textContent = emoji;
}

function saveEmotionRecord() {
  var score = parseInt(document.getElementById('emotion-score').value);
  var note = document.getElementById('emotion-note').value.trim();

  var data = Store.get();
  if (!data) return;
  if (!data.emotionRecords) data.emotionRecords = [];

  var today = todayStr();
  var existing = data.emotionRecords.findIndex(function (r) { return r.date === today; });

  var record = { id: uid(), date: today, score: score, note: note };

  if (existing >= 0) {
    record.id = data.emotionRecords[existing].id;
    data.emotionRecords[existing] = record;
  } else {
    data.emotionRecords.push(record);
  }

  data.emotionRecords.sort(function (a, b) { return a.date.localeCompare(b.date); });
  Store.save(data);
  renderEmotion();
  showToast('情绪记录已保存');
}

var emotionChartPeriod = 'week';

function switchEmotionChart(period) {
  emotionChartPeriod = period;
  var tabs = document.querySelectorAll('#view-emotion .chart-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.period === period);
  }
  drawEmotionChart();
}

function drawEmotionChart() {
  var canvas = document.getElementById('emotion-chart');
  var emptyEl = document.getElementById('emotion-chart-empty');
  if (!canvas) return;

  var data = Store.get();
  if (!data) return;
  var records = data.emotionRecords || [];
  if (records.length === 0) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  var series = aggregateEmotionData(records, emotionChartPeriod);
  var values = series.map(function (s) { return s.score; });
  var labels = series.map(function (s) { return s.label; });

  drawLine(canvas, values, labels, '情绪指数', '#B89BA5');
}

function aggregateEmotionData(records, period) {
  var result = [];
  var today = new Date();

  if (period === 'week') {
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var rec = records.find(function (r) { return r.date === ds; });
      result.push({ label: d.getMonth() + 1 + '/' + d.getDate(), score: rec ? rec.score : null });
    }
  } else if (period === 'month') {
    for (var j = 3; j >= 0; j--) {
      var wkStart = new Date(today);
      wkStart.setDate(wkStart.getDate() - j * 7 - wkStart.getDay() + 1);
      var wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 6);

      var sum = 0, cnt = 0;
      for (var k = 0; k < records.length; k++) {
        var rd = new Date(records[k].date);
        if (rd >= wkStart && rd <= wkEnd && rd <= today) { sum += records[k].score; cnt++; }
      }
      var avg = cnt > 0 ? Math.round(sum / cnt * 10) / 10 : null;
      result.push({ label: '第' + (j + 1) + '周', score: avg });
    }
  } else if (period === 'year') {
    for (var m = 11; m >= 0; m--) {
      var md = new Date(today.getFullYear(), today.getMonth() - m, 1);
      var mKey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
      var mRecords = records.filter(function (r) { return r.date.startsWith(mKey); });
      var avg = mRecords.length > 0 ? Math.round(mRecords.reduce(function (s, r) { return s + r.score; }, 0) / mRecords.length * 10) / 10 : null;
      result.push({ label: (md.getMonth() + 1) + '月', score: avg });
    }
  }

  return result;
}

function renderEmotionTips() {
  var container = document.getElementById('emotion-tips');
  // Show 5 random tips
  var shuffled = emotionTips.slice().sort(function () { return Math.random() - 0.5; });
  var selected = shuffled.slice(0, 5);

  var html = '';
  for (var i = 0; i < selected.length; i++) {
    var icons = ['😌', '🌿', '💆', '☕', '🎵'];
    html += '<div class="tip-card-mini"><span class="tip-icon">' + icons[i] + '</span>' + selected[i] + '</div>';
  }
  html += '<button class="refresh-tips-btn" onclick="renderEmotionTips()" style="grid-column:1/-1;">⟳ 换一批妙招</button>';
  container.innerHTML = html;
}

// ===== Hotspot View =====
var hotspotNewsCache = [];

function renderHotspot() {
  var data = Store.get();
  if (!data) return;
  var hotspots = data.hotspots || [];
  var container = document.getElementById('hotspot-list');
  var today = todayStr();

  // Auto-news section
  var autoNews = (data.autoNews || []).filter(function (n) { return n.date === today; });
  var newsContainer = document.getElementById('auto-news-list');

  if (autoNews.length === 0) {
    newsContainer.innerHTML = '<div class="empty-state">暂无今日热点，点击「刷新热点」获取最新资讯</div>';
  } else {
    var newsHtml = '';
    for (var ni = 0; ni < autoNews.length; ni++) {
      var n = autoNews[ni];
      var catCls = 'news-cat-' + (n.category || 'general');
      newsHtml += '<div class="news-item">' +
        '<span class="news-cat-tag ' + catCls + '">' + escapeHtml(n.categoryLabel || n.category) + '</span>' +
        '<div class="news-item-text">' +
        '<div class="news-item-title">' + escapeHtml(n.title) + '</div>' +
        '<div class="news-item-summary">' + escapeHtml(n.summary || '').replace(/\n/g, '<br>') + '</div>' +
        '</div>' +
        '</div>';
    }
    newsContainer.innerHTML = newsHtml;
  }

  // Update timestamp
  var lastSync = data.lastNewsSync;
  var syncInfo = document.getElementById('news-sync-info');
  if (syncInfo) {
    syncInfo.textContent = lastSync ? '上次更新：' + new Date(lastSync).toLocaleString('zh-CN') : '';
  }

  // Manual hotspots
  if (hotspots.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无手动记录，点击 + 添加你关注的热点话题</div>';
    return;
  }

  var items = hotspots.slice().reverse();
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var h = items[i];
    html += '<div class="hotspot-item">' +
      '<div class="hotspot-item-title">' + escapeHtml(h.title) + '</div>' +
      '<div class="hotspot-item-content">' + escapeHtml(h.content || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="hotspot-item-date">' + formatDate(h.date) + '</div>' +
      '<div class="hotspot-item-actions">' +
      '<button onclick="editHotspot(\'' + h.id + '\')">编辑</button>' +
      '<button onclick="deleteHotspot(\'' + h.id + '\')">删除</button>' +
      '</div>' +
      '</div>';
  }
  container.innerHTML = html;
}

function requestNewsSync() {
  document.getElementById('news-sync-overlay').classList.add('active');
}

function hideNewsSyncHint() {
  document.getElementById('news-sync-overlay').classList.remove('active');
}

function addHotspot() {
  var body = '<label style="font-size:11px;color:var(--text-sub);">标题</label><input class="modal-input" id="hotspot-title" placeholder="输入热点标题...">' +
    '<label style="font-size:11px;color:var(--text-sub);">内容</label><textarea class="modal-textarea" id="hotspot-content" placeholder="输入内容..." rows="3"></textarea>';
  showModal('添加热点', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveHotspot()' }
  ]);
}

function saveHotspot() {
  var title = document.getElementById('hotspot-title').value.trim();
  var content = document.getElementById('hotspot-content').value.trim();
  if (!title) return;
  var data = Store.get();
  if (!data) return;
  if (!data.hotspots) data.hotspots = [];
  data.hotspots.push({ id: uid(), title: title, content: content, date: todayStr() });
  Store.save(data);
  hideModal();
  renderHotspot();
  showToast('已添加');
}

function editHotspot(id) {
  var data = Store.get();
  if (!data) return;
  var h = data.hotspots.find(function (hs) { return hs.id === id; });
  if (!h) return;
  var body = '<label style="font-size:11px;color:var(--text-sub);">标题</label><input class="modal-input" id="edit-hotspot-title" value="' + escapeAttr(h.title) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">内容</label><textarea class="modal-textarea" id="edit-hotspot-content" rows="3">' + escapeHtml(h.content || '') + '</textarea>';
  showModal('编辑热点', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'updateHotspot(\'' + id + '\')' }
  ]);
}

function updateHotspot(id) {
  var data = Store.get();
  if (!data) return;
  var h = data.hotspots.find(function (hs) { return hs.id === id; });
  if (!h) return;
  h.title = document.getElementById('edit-hotspot-title').value.trim();
  h.content = document.getElementById('edit-hotspot-content').value.trim();
  Store.save(data);
  hideModal();
  renderHotspot();
  showToast('已更新');
}

function deleteHotspot(id) {
  var data = Store.get();
  if (!data) return;
  data.hotspots = data.hotspots.filter(function (h) { return h.id !== id; });
  Store.save(data);
  renderHotspot();
  showToast('已删除');
}

// ===== Canvas Chart Functions =====
function drawBar(canvas, values, labels, title, color) {
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var W = rect.width;
  var H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.height = H + 'px';

  var pad = { top: 20, right: 12, bottom: 30, left: 42 };
  var cW = W - pad.left - pad.right;
  var cH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#F5F1EC';
  ctx.beginPath();
  roundRect(ctx, 0, 0, W, H, 8);
  ctx.fill();

  var maxVal = Math.max.apply(null, values.concat([1]));

  // Grid lines
  ctx.strokeStyle = '#DDD7D0';
  ctx.lineWidth = 0.5;
  for (var g = 0; g <= 4; g++) {
    var gy = pad.top + (cH / 4) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(pad.left + cW, gy);
    ctx.stroke();
    ctx.fillStyle = '#B0A89E';
    ctx.font = '9px -apple-system';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 4) * g), pad.left - 6, gy + 3);
  }

  ctx.textAlign = 'center';

  // Bars
  if (values.length > 0) {
    var barGap = cW / values.length;
    var barW = Math.min(barGap * 0.55, 40);

    for (var i = 0; i < values.length; i++) {
      var val = values[i] || 0;
      var barH = (val / maxVal) * cH;
      var x = pad.left + barGap * i + (barGap - barW) / 2;
      var y = pad.top + cH - barH;

      // Bar
      ctx.fillStyle = color;
      ctx.beginPath();
      roundRect(ctx, x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Value on top
      if (barH > 15) {
        ctx.fillStyle = '#4A453F';
        ctx.font = '10px -apple-system';
        ctx.textAlign = 'center';
        ctx.fillText(val, x + barW / 2, y - 4);
      }

      // Label
      ctx.fillStyle = '#8A8378';
      ctx.font = '9px -apple-system';
      ctx.fillText(labels[i], x + barW / 2, H - 8);
    }
  }

  // Axis
  ctx.strokeStyle = '#C9C2BA';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.stroke();
}

function drawLine(canvas, values, labels, title, color) {
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var W = rect.width;
  var H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.height = H + 'px';

  var pad = { top: 20, right: 12, bottom: 30, left: 36 };
  var cW = W - pad.left - pad.right;
  var cH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#F5F1EC';
  ctx.beginPath();
  roundRect(ctx, 0, 0, W, H, 8);
  ctx.fill();

  // Grid lines
  ctx.strokeStyle = '#DDD7D0';
  ctx.lineWidth = 0.5;
  for (var g = 0; g <= 4; g++) {
    var gy = pad.top + (cH / 4) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(pad.left + cW, gy);
    ctx.stroke();
    ctx.fillStyle = '#B0A89E';
    ctx.font = '9px -apple-system';
    ctx.textAlign = 'right';
    ctx.fillText(12 - g * 2, pad.left - 6, gy + 3);
  }

  // Fill valid (non-null) data points
  var validPoints = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined) {
      validPoints.push({ index: i, value: values[i] });
    }
  }

  if (validPoints.length === 0) {
    ctx.fillStyle = '#B0A89E';
    ctx.font = '13px -apple-system';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', W / 2, H / 2);
    return;
  }

  var pointGap = cW / Math.max(values.length - 1, 1);

  // Fill area
  ctx.fillStyle = color + '20';
  ctx.beginPath();
  var firstX = pad.left + validPoints[0].index * pointGap;
  ctx.moveTo(firstX, pad.top + cH);
  for (var j = 0; j < validPoints.length; j++) {
    var px = pad.left + validPoints[j].index * pointGap;
    var py = pad.top + cH - (validPoints[j].value / 10) * cH;
    ctx.lineTo(px, py);
  }
  var lastX = pad.left + validPoints[validPoints.length - 1].index * pointGap;
  ctx.lineTo(lastX, pad.top + cH);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (var k = 0; k < validPoints.length; k++) {
    var lx = pad.left + validPoints[k].index * pointGap;
    var ly = pad.top + cH - (validPoints[k].value / 10) * cH;
    if (k === 0) ctx.moveTo(lx, ly);
    else ctx.lineTo(lx, ly);
  }
  ctx.stroke();

  // Points
  ctx.fillStyle = color;
  for (var m = 0; m < validPoints.length; m++) {
    var dx = pad.left + validPoints[m].index * pointGap;
    var dy = pad.top + cH - (validPoints[m].value / 10) * cH;
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Value label
    ctx.fillStyle = '#4A453F';
    ctx.font = '10px -apple-system';
    ctx.textAlign = 'center';
    ctx.fillText(validPoints[m].value, dx, dy - 8);
    ctx.fillStyle = color;
  }

  // X-axis labels
  ctx.fillStyle = '#8A8378';
  ctx.font = '9px -apple-system';
  ctx.textAlign = 'center';
  for (var n = 0; n < values.length; n++) {
    ctx.fillText(labels[n], pad.left + n * pointGap, H - 8);
  }

  // Axis
  ctx.strokeStyle = '#C9C2BA';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
  else if (Array.isArray(r)) r = { tl: r[0] || 0, tr: r[1] || 0, br: r[2] || 0, bl: r[3] || 0 };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
  ctx.lineTo(x + r.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
}

// ===== Custom Sidebar =====
// ===== Team View (市场团队管理) =====
function refreshTeamData() {
  Store.loadTeamFromJson(false);
}

function getTeamData() {
  var data = Store.get();
  if (!data) return { members: [], records: [], dailyTarget: 50, docUrl: '', lastSync: null };
  Store.ensureTeamData(data);
  return data.team;
}

// ===== 九月战役总览 =====
function defaultCampaigns() {
  return [
    { id: 'fission', name: '三一裂变', unit: '新家长', target: 600, current: 0, desc: '老家长推荐新家长（送资料活动）' },
    { id: 'ground', name: '地推实名', unit: '实名家长', target: 2000, current: 0, desc: '派资料 → 进群 → 加好友 → 实名' },
    { id: 'meetup', name: '见面会', unit: '到场人数', target: 320, current: 0, desc: '目标4场 × 80人' },
    { id: 'webinar', name: '线上讲座', unit: '留资人数', target: 400, current: 0, desc: '目标8场，在线转留资' }
  ];
}

function campaignTimeProgress() {
  // September 2026 campaign window
  var start = new Date(2026, 8, 1).getTime();
  var end = new Date(2026, 8, 31).getTime() + 86400000;
  var now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now - start) / (end - start);
}

function renderCampaigns() {
  var team = getTeamData();
  var campaigns = team.campaigns || defaultCampaigns();
  var container = document.getElementById('team-campaigns');
  var expected = campaignTimeProgress();
  var dayOfMonth = new Date().getMonth() === 8 ? new Date().getDate() : (new Date() < new Date(2026, 8, 1) ? 0 : 31);

  var html = '';
  for (var i = 0; i < campaigns.length; i++) {
    var c = campaigns[i];
    var target = Number(c.target) || 1;
    var current = Number(c.current) || 0;
    var rate = Math.min(100, Math.round(current / target * 100));

    // Status: compare completion rate with time progress
    var status, statusText;
    if (dayOfMonth === 0) {
      status = 'pending'; statusText = '9月1日启动';
    } else if (rate >= expected * 100 + 10) {
      status = 'ahead'; statusText = '超前';
    } else if (rate >= expected * 100 - 10) {
      status = 'ontrack'; statusText = '正常';
    } else {
      status = 'behind'; statusText = '预警';
    }

    var barColor = status === 'ahead' ? '#8FA89A' : status === 'ontrack' ? '#7E9BA8' : status === 'behind' ? '#C58F8F' : '#C4C0BA';

    html += '<div class="campaign-card" onclick="editCampaign(\'' + c.id + '\')">' +
      '<div class="campaign-top">' +
        '<span class="campaign-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="campaign-status st-' + status + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="campaign-desc">' + escapeHtml(c.desc || '') + '</div>' +
      '<div class="campaign-bar"><span class="campaign-bar-fill" style="width:' + rate + '%;background:' + barColor + ';"></span></div>' +
      '<div class="campaign-nums">' +
        '<span class="campaign-rate" style="color:' + barColor + ';">' + rate + '%</span>' +
        '<span class="campaign-detail">' + current + ' / ' + target + ' ' + escapeHtml(c.unit) + '</span>' +
      '</div>' +
    '</div>';
  }

  // Time progress hint
  var tp = Math.round(expected * 100);
  html += '<div class="campaign-time-hint">⏳ 9月时间进度：<b>' + tp + '%</b>（战役完成率低于时间进度10个百分点即预警）</div>';

  container.innerHTML = html;
}

function editCampaign(campaignId) {
  var team = getTeamData();
  var campaigns = team.campaigns || defaultCampaigns();
  var options = '';
  var selIdx = 0;
  for (var i = 0; i < campaigns.length; i++) {
    if (campaigns[i].id === campaignId) selIdx = i;
    options += '<option value="' + i + '">' + escapeHtml(campaigns[i].name) + '</option>';
  }
  var first = campaigns[selIdx] || campaigns[0];
  var body =
    '<label style="font-size:11px;color:var(--text-sub);">战役</label><select class="modal-input" id="cp-select" onchange="syncCampaignInputs()">' + options + '</select>' +
    '<label style="font-size:11px;color:var(--text-sub);">当前进度（' + escapeHtml(first.unit || '') + '）</label><input class="modal-input" id="cp-current" type="number" value="' + (Number(first.current) || 0) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">月度目标</label><input class="modal-input" id="cp-target" type="number" value="' + (Number(first.target) || 0) + '">';
  showModal('更新战役进度', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveCampaign()' }
  ]);
  var sel = null;
  setTimeout(function () { sel = document.getElementById('cp-select'); if (sel) sel.value = String(selIdx); }, 0);
}

function syncCampaignInputs() {
  var team = getTeamData();
  var campaigns = team.campaigns || defaultCampaigns();
  var idx = Number(document.getElementById('cp-select').value) || 0;
  var c = campaigns[idx];
  if (!c) return;
  document.getElementById('cp-current').value = Number(c.current) || 0;
  document.getElementById('cp-target').value = Number(c.target) || 0;
}

function saveCampaign() {
  var data = Store.get();
  if (!data) return;
  Store.ensureTeamData(data);
  var campaigns = data.team.campaigns || defaultCampaigns();
  var idx = Number(document.getElementById('cp-select').value) || 0;
  var c = campaigns[idx];
  if (!c) return;
  c.current = Number(document.getElementById('cp-current').value) || 0;
  c.target = Number(document.getElementById('cp-target').value) || 0;
  Store.save(data);
  hideModal();
  renderCampaigns();
  showToast('战役进度已更新');
}

// ===== 管理节奏检查表 =====
var mgmtChecklistDef = [
  { group: 'daily', title: '日检 · 每天5分钟', items: [
    { id: 'd1', text: '看团队榜单日报（进群/加好友/完成率）' },
    { id: 'd2', text: '私聊辅导：连续2天完成率＜80%的成员' },
    { id: 'd3', text: '抽查1条地推话术执行（防动作变形）' },
    { id: 'd4', text: '核对昨日新增实名，剔除无效数据' }
  ]},
  { group: 'weekly', title: '周检 · 每周一早会30分钟', items: [
    { id: 'w1', text: '四大战役进度条过一遍（对照时间进度）' },
    { id: 'w2', text: '排名公示 + 前3名动作拆解分享' },
    { id: 'w3', text: '后2名一对一沟通，找卡点' },
    { id: 'w4', text: '下周目标拆解：到人到天' }
  ]},
  { group: 'monthly', title: '月检 · 月末复盘会1小时', items: [
    { id: 'm1', text: '四大战役复盘：数据 + ROI' },
    { id: 'm2', text: '优秀动作沉淀为SOP话术' },
    { id: 'm3', text: '动作变形点清单，纳入下月培训' },
    { id: 'm4', text: '下月目标制定并拆解到周' }
  ]}
];

function mgmtGroupKey(group) {
  var now = new Date();
  if (group === 'daily') return todayStr();
  if (group === 'weekly') {
    // ISO week key
    var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + week;
  }
  return now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
}

function renderMgmtChecklist() {
  var data = Store.get();
  if (!data) return;
  Store.ensureTeamData(data);
  var checks = data.team.mgmtChecks || {};
  var html = '';
  for (var g = 0; g < mgmtChecklistDef.length; g++) {
    var group = mgmtChecklistDef[g];
    var key = group.group + ':' + mgmtGroupKey(group.group);
    var done = checks[key] || {};
    var doneCount = 0;
    for (var k = 0; k < group.items.length; k++) if (done[group.items[k].id]) doneCount++;

    html += '<div class="mgmt-group">' +
      '<div class="mgmt-group-title">' +
        '<span>' + group.title + '</span>' +
        '<span class="mgmt-count">' + doneCount + '/' + group.items.length + '</span>' +
      '</div>';
    for (var i = 0; i < group.items.length; i++) {
      var item = group.items[i];
      var checked = !!done[item.id];
      html += '<div class="mgmt-item' + (checked ? ' done' : '') + '" onclick="toggleMgmtItem(\'' + group.group + '\',\'' + item.id + '\')">' +
        '<span class="mgmt-check">' + (checked ? '✓' : '') + '</span>' +
        '<span class="mgmt-text">' + item.text + '</span>' +
      '</div>';
    }
    html += '</div>';
  }
  document.getElementById('team-mgmt-checklist').innerHTML = html;
}

function toggleMgmtItem(group, itemId) {
  var data = Store.get();
  if (!data) return;
  Store.ensureTeamData(data);
  var checks = data.team.mgmtChecks;
  var key = group + ':' + mgmtGroupKey(group);
  if (!checks[key]) checks[key] = {};
  checks[key][itemId] = !checks[key][itemId];
  Store.save(data);
  renderMgmtChecklist();
}

function renderTeam() {
  var team = getTeamData();

  // Sync label
  var syncLabel = document.getElementById('team-sync-label');
  if (team.lastSync) {
    var d = new Date(team.lastSync);
    syncLabel.textContent = '更新于 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  } else {
    syncLabel.textContent = '';
  }

  renderTeamStats(team);
  renderTeamMembers(team);
  renderTeamDateSelect(team);
  renderTeamRank();
  renderTeamDocLink(team);
  renderCampaigns();
  renderMgmtChecklist();
}

function renderTeamStats(team) {
  var members = team.members || [];
  var totalFriends = 0, totalReal = 0, totalGroups = 0;
  for (var i = 0; i < members.length; i++) {
    totalFriends += Number(members[i].friends) || 0;
    totalReal += Number(members[i].realName) || 0;
    totalGroups += Number(members[i].groupJoins) || 0;
  }
  var hasReal = totalReal > 0;
  var hasGroups = totalGroups > 0;

  // Latest date records → average completion rate
  var dates = getTeamDates(team);
  var avgRate = 0;
  if (dates.length > 0) {
    var latest = dates[dates.length - 1];
    var dayRecords = (team.records || []).filter(function (r) { return r.date === latest; });
    if (dayRecords.length > 0) {
      var sum = 0;
      for (var j = 0; j < dayRecords.length; j++) {
        sum += teamRecordRate(dayRecords[j], team.dailyTarget);
      }
      avgRate = Math.round(sum / dayRecords.length);
    }
  }

  var thirdCard = hasReal
    ? '<div class="team-stat"><span class="team-stat-value">' + totalReal + '</span><span class="team-stat-label">实名总数</span></div>'
    : '<div class="team-stat"><span class="team-stat-value">' + totalGroups + '</span><span class="team-stat-label">进群总数</span></div>';

  var html =
    '<div class="team-stat"><span class="team-stat-value">' + members.length + '</span><span class="team-stat-label">团队成员</span></div>' +
    '<div class="team-stat"><span class="team-stat-value">' + totalFriends + '</span><span class="team-stat-label">好友总数</span></div>' +
    thirdCard +
    '<div class="team-stat"><span class="team-stat-value">' + avgRate + '%</span><span class="team-stat-label">日均完成</span></div>';
  document.getElementById('team-stats').innerHTML = html;
}

function renderTeamMembers(team) {
  var members = (team.members || []).slice().sort(function (a, b) {
    return (Number(b.friends) || 0) - (Number(a.friends) || 0);
  });
  var tbody = document.getElementById('team-member-tbody');
  var thead = document.getElementById('team-member-thead');

  if (members.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" class="team-empty">暂无成员，等待文档同步或点击下方添加</td></tr>';
    return;
  }

  // Adaptive columns: only show columns that actually have data
  var hasVirtual = false, hasGroups = false, hasReal = false;
  for (var k = 0; k < members.length; k++) {
    if (members[k].virtual) hasVirtual = true;
    if (Number(members[k].groupJoins) > 0) hasGroups = true;
    if (Number(members[k].realName) > 0) hasReal = true;
  }

  var headHtml = '<tr><th>人名</th>';
  if (hasVirtual) headHtml += '<th>虚拟人</th>';
  if (hasGroups) headHtml += '<th>进群</th>';
  headHtml += '<th>好友</th>';
  if (hasReal) headHtml += '<th>实名</th>';
  headHtml += '<th>添加率</th></tr>';
  thead.innerHTML = headHtml;

  var html = '';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var g = Number(m.groupJoins) || 0;
    var f = Number(m.friends) || 0;
    var rate = g > 0 ? Math.round(f / g * 100) : 0;
    var rateCls = rate >= 90 ? 'rate-good' : rate >= 60 ? 'rate-mid' : 'rate-low';

    html += '<tr>' +
      '<td class="team-name-cell">' + escapeHtml(m.name) + '</td>';
    if (hasVirtual) html += '<td class="team-virtual-cell">' + escapeHtml(m.virtual || '-') + '</td>';
    if (hasGroups) html += '<td class="team-num-cell">' + g + '</td>';
    html += '<td class="team-num-cell">' + f + '</td>';
    if (hasReal) html += '<td class="team-num-cell">' + (Number(m.realName) || 0) + '</td>';
    html += '<td class="team-rate-cell"><span class="rate-bar"><span class="rate-bar-fill ' + rateCls + '" style="width:' + Math.min(rate, 100) + '%"></span></span><span class="rate-num">' + rate + '%</span></td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

function getTeamDates(team) {
  var seen = {};
  var dates = [];
  var records = team.records || [];
  for (var i = 0; i < records.length; i++) {
    if (records[i].date && !seen[records[i].date]) {
      seen[records[i].date] = true;
      dates.push(records[i].date);
    }
  }
  dates.sort();
  return dates;
}

function renderTeamDateSelect(team) {
  var select = document.getElementById('team-date-select');
  var dates = getTeamDates(team);
  var month = new Date().toISOString().slice(0, 7);

  var html = '<option value="month">' + month.slice(0, 4) + '年' + month.slice(5, 7) + '月累计</option>';
  for (var i = dates.length - 1; i >= 0; i--) {
    var d = dates[i];
    html += '<option value="' + d + '">' + d.slice(5).replace('-', '/') + '</option>';
  }
  select.innerHTML = html;
  // Default to the latest date if exists, otherwise month view
  select.value = dates.length > 0 ? dates[dates.length - 1] : 'month';
}

function teamRecordRate(record, dailyTarget) {
  var target = Number(record.target) || Number(dailyTarget) || 50;
  var adds = Number(record.friendAdds) || 0;
  return Math.round(adds / target * 100);
}

function renderTeamRank() {
  var team = getTeamData();
  var select = document.getElementById('team-date-select');
  var mode = select ? select.value : 'month';
  var records = team.records || [];
  var tbody = document.getElementById('team-rank-tbody');

  var rows = [];

  if (mode === 'month') {
    // Aggregate by person for current month
    var month = new Date().toISOString().slice(0, 7);
    var byName = {};
    var order = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.date && r.date.slice(0, 7) !== month) continue;
      if (!byName[r.name]) { byName[r.name] = { name: r.name, groupJoins: 0, friendAdds: 0 }; order.push(r.name); }
      byName[r.name].groupJoins += Number(r.groupJoins) || 0;
      byName[r.name].friendAdds += Number(r.friendAdds) || 0;
    }
    for (var k = 0; k < order.length; k++) rows.push(byName[order[k]]);
  } else {
    for (var j = 0; j < records.length; j++) {
      if (records[j].date === mode) rows.push({
        name: records[j].name,
        groupJoins: Number(records[j].groupJoins) || 0,
        friendAdds: Number(records[j].friendAdds) || 0
      });
    }
  }

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="team-empty">暂无数据，录入或等待文档同步</td></tr>';
    return;
  }

  // Sort by completion rate desc, then friendAdds desc
  for (var m = 0; m < rows.length; m++) rows[m].rate = teamRecordRate(rows[m], team.dailyTarget);
  rows.sort(function (a, b) { return b.rate !== a.rate ? b.rate - a.rate : b.friendAdds - a.friendAdds; });

  var html = '';
  for (var n = 0; n < rows.length; n++) {
    var row = rows[n];
    var rank = n + 1;
    var rankHtml = rank === 1 ? '<span class="rank-medal rank-gold">1</span>' :
      rank === 2 ? '<span class="rank-medal rank-silver">2</span>' :
      rank === 3 ? '<span class="rank-medal rank-bronze">3</span>' :
      '<span class="rank-plain">' + rank + '</span>';
    var rateCls = row.rate >= 100 ? 'rate-good' : row.rate >= 60 ? 'rate-mid' : 'rate-low';
    html += '<tr>' +
      '<td class="team-date-cell">' + (mode === 'month' ? '累计' : mode.slice(5).replace('-', '/')) + '</td>' +
      '<td>' + rankHtml + '</td>' +
      '<td class="team-name-cell">' + escapeHtml(row.name) + '</td>' +
      '<td class="team-num-cell">' + row.groupJoins + '</td>' +
      '<td class="team-num-cell">' + row.friendAdds + '</td>' +
      '<td class="team-rate-cell"><span class="rate-bar"><span class="rate-bar-fill ' + rateCls + '" style="width:' + Math.min(row.rate, 100) + '%"></span></span><span class="rate-num">' + row.rate + '%</span></td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

function renderTeamDocLink(team) {
  var el = document.getElementById('team-doc-link');
  if (team.docUrl) {
    el.innerHTML = '<a href="' + escapeAttr(team.docUrl) + '" target="_blank" rel="noopener">📄 打开腾讯文档数据源</a>';
  } else {
    el.innerHTML = '';
  }
}

// --- Manual editing (works offline, without doc sync) ---
function addTeamMember() {
  var body =
    '<label style="font-size:11px;color:var(--text-sub);">人名</label><input class="modal-input" id="tm-name" placeholder="如：张三">' +
    '<label style="font-size:11px;color:var(--text-sub);">虚拟人（昵称/账号名）</label><input class="modal-input" id="tm-virtual" placeholder="如：小张同学">' +
    '<label style="font-size:11px;color:var(--text-sub);">好友人数</label><input class="modal-input" id="tm-friends" type="number" placeholder="0">' +
    '<label style="font-size:11px;color:var(--text-sub);">实名人数</label><input class="modal-input" id="tm-real" type="number" placeholder="0">';
  showModal('添加团队成员', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveTeamMember()' }
  ]);
}

function saveTeamMember() {
  var name = document.getElementById('tm-name').value.trim();
  if (!name) return;
  var data = Store.get();
  if (!data) return;
  Store.ensureTeamData(data);
  data.team.members.push({
    name: name,
    virtual: document.getElementById('tm-virtual').value.trim(),
    friends: Number(document.getElementById('tm-friends').value) || 0,
    realName: Number(document.getElementById('tm-real').value) || 0
  });
  Store.save(data);
  hideModal();
  renderTeam();
  showToast('成员已添加');
}

function addTeamRecord() {
  var team = getTeamData();
  if ((team.members || []).length === 0) { showToast('请先添加团队成员'); return; }
  var options = '';
  for (var i = 0; i < team.members.length; i++) {
    options += '<option value="' + escapeAttr(team.members[i].name) + '">' + escapeHtml(team.members[i].name) + '</option>';
  }
  var body =
    '<label style="font-size:11px;color:var(--text-sub);">日期</label><input class="modal-input" id="tr-date" type="date" value="' + todayStr() + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">人名</label><select class="modal-input" id="tr-name">' + options + '</select>' +
    '<label style="font-size:11px;color:var(--text-sub);">进群人数</label><input class="modal-input" id="tr-groups" type="number" placeholder="0">' +
    '<label style="font-size:11px;color:var(--text-sub);">好友添加人数</label><input class="modal-input" id="tr-adds" type="number" placeholder="0">';
  showModal('录入当日数据', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'saveTeamRecord()' }
  ]);
}

function saveTeamRecord() {
  var date = document.getElementById('tr-date').value;
  var name = document.getElementById('tr-name').value;
  if (!date || !name) return;
  var data = Store.get();
  if (!data) return;
  Store.ensureTeamData(data);
  data.team.records.push({
    date: date,
    name: name,
    groupJoins: Number(document.getElementById('tr-groups').value) || 0,
    friendAdds: Number(document.getElementById('tr-adds').value) || 0
  });
  Store.save(data);
  hideModal();
  renderTeam();
  showToast('数据已录入');
}

function renderSidebar() {
  var data = Store.get();
  if (!data) return;
  var customItems = data.customSidebar || [];
  var container = document.getElementById('sidebar-custom-items');
  var separator = document.querySelector('.sidebar-divider:last-of-type');

  if (customItems.length === 0) {
    container.innerHTML = '';
    return;
  }

  var html = '';
  for (var i = 0; i < customItems.length; i++) {
    var item = customItems[i];
    html += '<div class="sidebar-custom-item' + (currentView === item.name ? ' active' : '') + '" data-label="' + escapeAttr(item.name) + '" onclick="switchView(\'' + item.name + '\')">' +
      item.name.charAt(0) +
      '<span class="custom-delete" onclick="event.stopPropagation();removeCustomSidebar(\'' + item.id + '\')">✕</span>' +
      '</div>';
  }
  container.innerHTML = html;
}

function showAddSidebarModal() {
  var body = '<label style="font-size:11px;color:var(--text-sub);">模块名称</label><input class="modal-input" id="sidebar-item-name" placeholder="输入模块名称...">';
  showModal('添加侧边栏模块', body, [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'addSidebarItem()' }
  ]);
  setTimeout(function () {
    var inp = document.getElementById('sidebar-item-name');
    if (inp) inp.focus();
  }, 100);
}

function addSidebarItem() {
  var name = document.getElementById('sidebar-item-name').value.trim();
  if (!name) return;
  var data = Store.get();
  if (!data) return;
  if (!data.customSidebar) data.customSidebar = [];

  // Check duplicate
  var allNames = data.sidebarItems.map(function (s) { return s.name; }).concat(data.customSidebar.map(function (s) { return s.name; }));
  if (allNames.indexOf(name) >= 0) { showToast('模块名称已存在'); return; }

  data.customSidebar.push({ id: uid(), name: name, icon: 'custom', items: [] });
  Store.save(data);
  hideModal();
  renderSidebar();
  showToast('模块已添加');
}

function removeCustomSidebar(id) {
  var data = Store.get();
  if (!data) return;
  data.customSidebar = data.customSidebar.filter(function (s) { return s.id !== id; });
  Store.save(data);
  renderSidebar();
  if (currentView !== 'home' && currentView !== 'study' && currentView !== 'work' &&
    currentView !== 'life' && currentView !== 'emotion' && currentView !== 'hotspot' && currentView !== 'inbox') {
    switchView('home');
  }
  showToast('模块已移除');
}

// ===== Custom Section (Generic) =====
function renderCustomSection(name) {
  var data = Store.get();
  if (!data) return;
  var sidebarItem = (data.customSidebar || []).find(function (s) { return s.name === name; });
  if (!sidebarItem) return;

  var items = sidebarItem.items || [];
  var container = document.getElementById('custom-section-list');

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无记录，点击 + 添加</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    html += '<div class="hotspot-item">' +
      '<div class="hotspot-item-title">' + escapeHtml(item.title) + '</div>' +
      '<div class="hotspot-item-content">' + escapeHtml(item.content || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="hotspot-item-date">' + formatDate(item.date) + '</div>' +
      '<div class="hotspot-item-actions">' +
      '<button onclick="editCustomSectionItem(\'' + name + '\', \'' + item.id + '\')">编辑</button>' +
      '<button onclick="deleteCustomSectionItem(\'' + name + '\', \'' + item.id + '\')">删除</button>' +
      '</div>' +
      '</div>';
  }
  container.innerHTML = html;
}

function addCustomSectionItem() {
  showModal('添加记录', '<label style="font-size:11px;color:var(--text-sub);">标题</label><input class="modal-input" id="cs-title" placeholder="输入标题...">' +
    '<label style="font-size:11px;color:var(--text-sub);">内容</label><textarea class="modal-textarea" id="cs-content" placeholder="输入内容..." rows="3"></textarea>', [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '添加', cls: 'btn-modal confirm', action: 'saveCustomSectionItem()' }
  ]);
}

function saveCustomSectionItem() {
  var title = document.getElementById('cs-title').value.trim();
  var content = document.getElementById('cs-content').value.trim();
  if (!title) return;
  var data = Store.get();
  if (!data) return;
  var sidebarItem = (data.customSidebar || []).find(function (s) { return s.name === currentView; });
  if (!sidebarItem) return;
  if (!sidebarItem.items) sidebarItem.items = [];
  sidebarItem.items.push({ id: uid(), title: title, content: content, date: todayStr() });
  Store.save(data);
  hideModal();
  renderCustomSection(currentView);
  showToast('已添加');
}

function editCustomSectionItem(sectionName, itemId) {
  var data = Store.get();
  if (!data) return;
  var sidebarItem = (data.customSidebar || []).find(function (s) { return s.name === sectionName; });
  if (!sidebarItem) return;
  var item = (sidebarItem.items || []).find(function (it) { return it.id === itemId; });
  if (!item) return;
  showModal('编辑记录', '<label style="font-size:11px;color:var(--text-sub);">标题</label><input class="modal-input" id="ecs-title" value="' + escapeAttr(item.title) + '">' +
    '<label style="font-size:11px;color:var(--text-sub);">内容</label><textarea class="modal-textarea" id="ecs-content" rows="3">' + escapeHtml(item.content || '') + '</textarea>', [
    { text: '取消', cls: 'btn-modal cancel', action: 'hideModal()' },
    { text: '保存', cls: 'btn-modal confirm', action: 'updateCustomSectionItem(\'' + sectionName + '\', \'' + itemId + '\')' }
  ]);
}

function updateCustomSectionItem(sectionName, itemId) {
  var data = Store.get();
  if (!data) return;
  var sidebarItem = (data.customSidebar || []).find(function (s) { return s.name === sectionName; });
  if (!sidebarItem) return;
  var item = (sidebarItem.items || []).find(function (it) { return it.id === itemId; });
  if (!item) return;
  item.title = document.getElementById('ecs-title').value.trim();
  item.content = document.getElementById('ecs-content').value.trim();
  Store.save(data);
  hideModal();
  renderCustomSection(sectionName);
  showToast('已更新');
}

function deleteCustomSectionItem(sectionName, itemId) {
  var data = Store.get();
  if (!data) return;
  var sidebarItem = (data.customSidebar || []).find(function (s) { return s.name === sectionName; });
  if (!sidebarItem) return;
  sidebarItem.items = (sidebarItem.items || []).filter(function (it) { return it.id !== itemId; });
  Store.save(data);
  renderCustomSection(sectionName);
  showToast('已删除');
}

// ===== Settings (Export/Import) =====
function showSettings() {
  var body = '<div class="settings-section">' +
    '<div class="settings-label">数据管理</div>' +
    '<button class="btn-settings export" onclick="exportData()">📤 导出数据</button>' +
    '<button class="btn-settings import-btn" onclick="document.getElementById(\'import-file\').click()">📥 导入数据</button>' +
    '<input type="file" id="import-file" accept=".json" onchange="importData(this)">' +
    '<button class="btn-settings backup" onclick="hideModal();setTimeout(showBackupModal,150)">☁️ 备份到腾讯文档</button>' +
    '</div>' +
    '<div class="settings-section">' +
    '<div class="settings-label">关于</div>' +
    '<div style="font-size:12px;color:var(--text-sub);line-height:1.6;">' +
    '<strong>神之随笔</strong> v2.0<br>' +
    '个人AI工作中枢<br>' +
    '数据存储于浏览器本地（localStorage）<br>' +
    '邮箱：ptss4184@agent.qq.com<br>' +
    '请定期导出数据备份</div>' +
    '</div>';

  showModal('设置', body, [{ text: '关闭', cls: 'btn-modal cancel', action: 'hideModal()' }]);
}

function exportData() {
  var data = Store.get();
  if (!data) { showToast('无数据可导出'); return; }

  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'lauv-workspace-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('数据导出成功');
}

function importData(input) {
  var file = input.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.dailyTodos && !data.inbox && !data.study && !data.lifeRecords && !data.emotionRecords) {
        showToast('文件格式不正确');
        return;
      }
      Store.save(data);
      location.reload();
      showToast('数据导入成功，页面将刷新');
      setTimeout(function () { location.reload(); }, 500);
    } catch (err) {
      showToast('文件解析失败，请确认是有效的导出文件');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ===== Utility HTML Helpers =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== Modal System =====
function showModal(title, body, actions) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  var actionsEl = document.getElementById('modal-actions');
  var html = '';
  for (var i = 0; i < actions.length; i++) {
    html += '<button class="' + actions[i].cls + '" onclick="' + actions[i].action + '">' + actions[i].text + '</button>';
  }
  actionsEl.innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ===== Sync Notice =====
function dismissNotice() {
  document.getElementById('sync-notice').style.display = 'none';
  var data = Store.get();
  if (data) { data.firstRun = false; Store.save(data); }
}

// ===== Top Bar Date =====
function updateTopDate() {
  var d = new Date();
  var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  var text = d.getMonth() + 1 + '月' + d.getDate() + '日 星期' + weekDays[d.getDay()];
  document.getElementById('top-date').textContent = text;
}

// ===== Window Resize Handler (for charts) =====
var resizeTimeout;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(function () {
    if (currentView === 'life') drawLifeChart();
    if (currentView === 'emotion') drawEmotionChart();
  }, 300);
});

// ===== Init =====
function init() {
  var data = Store.init();
  updateTopDate();
  renderSidebar();
  renderHome();
  updateInboxBadges();

  // Load news from news.json (auto-updated daily)
  Store.loadNewsFromJson();

  // Load team data from team.json (synced from Tencent Docs)
  Store.loadTeamFromJson(true);

  // Load FY27 weekly data from weekly.json (synced from Tencent Docs)
  Store.loadWeeklyFromJson(true);

  // Show sync notice on first run
  if (data.firstRun) {
    document.getElementById('sync-notice').style.display = 'flex';
  } else {
    document.getElementById('sync-notice').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', init);
