/* 智能分析台 · 主逻辑（零依赖） */
(function () {
  'use strict';

  var LEVELS = ['优秀', '达标', '接近', '偏低', '薄弱'];
  var LS_KEY = 'smart-analyzer-form-v1';
  var LS_REGIONS = 'smart-analyzer-regions-v1';

  var state = { last: null, ai: null, aiSig: null, stTalk: null, hasKey: false, busy: false };

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = Number(v); return isNaN(n) ? null : n; }
  function pct1(v) { return (v * 100).toFixed(1) + '%'; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }

  /* ================= 初始化 ================= */
  /* regions.js 里的是“出厂数据”。
     老师自己保存过（带 edited 标记）的地区才覆盖出厂数据，
     这样以后更新 regions.js，没动过数据的老师能自动用上新的。 */
  function applyRegionOverride() {
    var builtin = window.REGIONS || {};
    try {
      var s = localStorage.getItem(LS_REGIONS);
      if (!s) return;
      var o = JSON.parse(s);
      if (!o || typeof o !== 'object' || !Object.keys(o).length) return;
      var merged = {};
      Object.keys(builtin).forEach(function (k) { merged[k] = builtin[k]; });
      Object.keys(o).forEach(function (k) {
        if (!builtin[k] || (o[k] && o[k].edited)) merged[k] = o[k];
      });
      window.REGIONS = merged;
    } catch (e) { }
  }

  function init() {
    applyRegionOverride();
    fillRegions();
    renderScores();
    bindEvents();
    restore();
    if (!$('examDate').value) $('examDate').value = today();
    refreshAIMeta();
    compute();
  }

  function fillRegions() {
    var sel = $('region');
    Object.keys(window.REGIONS).forEach(function (r) {
      var o = document.createElement('option');
      o.value = r; o.textContent = r;
      var s = window.REGIONS[r];
      if (!s.schools || !s.schools.length) o.textContent = r + '（待录入分数线）';
      sel.appendChild(o);
    });
  }

  function fillSchools(regionName) {
    var sel = $('school');
    var data = window.REGIONS[regionName];
    sel.innerHTML = '';
    var list = (data && data.schools) || [];
    if (!list.length) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = '该地区暂无分数线，请先手动录入';
      sel.appendChild(o);
      sel.disabled = true;
      $('refYear').innerHTML = '';
      $('schoolMeta').textContent = '提示：这个地区还没有分数线，可点右上角「分数线数据」手动录入。';
      return;
    }
    sel.disabled = false;
    list.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      sel.appendChild(o);
    });
    fillYears(regionName);
  }

  function fillYears(regionName) {
    var data = window.REGIONS[regionName] || { years: [] };
    var sel = $('refYear');
    var years = (data.years || []).slice().sort(function (a, b) { return b - a; });
    sel.innerHTML = '';
    years.forEach(function (y) {
      var o = document.createElement('option');
      o.value = y; o.textContent = y + ' 年';
      sel.appendChild(o);
    });
    renderSchoolMeta();
  }

  function currentRegion() { return window.REGIONS[$('region').value] || null; }

  function currentSchool() {
    var d = currentRegion();
    if (!d || !d.schools) return null;
    var name = $('school').value;
    return d.schools.filter(function (s) { return s.name === name; })[0] || null;
  }

  function renderSchoolMeta() {
    var d = currentRegion();
    var s = currentSchool();
    var box = $('schoolMeta');
    if (!d || !s) { box.innerHTML = ''; return; }
    var total = d.totalScore || 845;
    var years = (d.years || []).slice().sort(function (a, b) { return b - a; });
    var html = '<div class="meta-title">' + s.name + ' 历年录取分</div><div class="meta-chips">';
    years.forEach(function (y) {
      var sc = s.scores[String(y)];
      if (sc === undefined || sc === null) return;
      var rate = sc / total;
      var isRef = String(y) === String($('refYear').value);
      html += '<span class="chip' + (isRef ? ' chip-on' : '') + '">' + y + '：' + sc + ' 分 · ' + pct1(rate) + '</span>';
    });
    html += '</div>';
    if (d.note) html += '<div class="meta-note">' + d.note + '</div>';
    box.innerHTML = html;
  }

  function targetInfo() {
    var d = currentRegion();
    var s = currentSchool();
    if (!d || !s) return null;
    var total = d.totalScore || 845;
    var y = $('refYear').value;
    var sc = s.scores[String(y)];
    if (sc === undefined || sc === null) {
      var ys = Object.keys(s.scores).sort(function (a, b) { return b - a; });
      if (!ys.length) return null;
      y = ys[0]; sc = s.scores[y];
    }
    return { name: s.name, year: y, score: sc, total: total, rate: sc / total };
  }

  /* ================= 分数录入 ================= */
  function renderScores() {
    var box = $('scoreList');
    box.innerHTML = '';
    window.SUBJECTS.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'score-item';
      div.innerHTML =
        '<span class="sname">' + s.name + '</span>' +
        '<span class="smax" id="mx_' + s.key + '">/' + s.max + '</span>' +
        '<input id="sc_' + s.key + '" type="text" inputmode="decimal" placeholder="—">' +
        '<span class="sconv" id="cv_' + s.key + '"></span>';
      box.appendChild(div);
    });
  }

  function mode() {
    var r = document.querySelector('input[name=mode]:checked');
    return r ? r.value : 'std';
  }

  function readScores() {
    return window.SUBJECTS.map(function (s) {
      var el = $('sc_' + s.key);
      var raw = el && el.value.trim() !== '' ? num(el.value) : null;
      var cap = mode() === 'pct' ? 100 : s.max;
      var invalid = raw !== null && (raw < 0 || raw > cap);
      var exam = raw === null ? null : (mode() === 'pct' ? raw / 100 * s.max : raw);
      return { s: s, raw: raw, exam: exam, invalid: invalid, cap: cap };
    });
  }

  function updateConvHints(items) {
    items.forEach(function (it) {
      var cv = $('cv_' + it.s.key);
      var mx = $('mx_' + it.s.key);
      if (!cv || !mx) return;
      if (mode() === 'pct') {
        mx.textContent = '/100';
        cv.textContent = it.exam === null ? '' : '→ ' + it.exam.toFixed(1);
      } else {
        mx.textContent = '/' + it.s.max;
        cv.textContent = '';
      }
      var el = $('sc_' + it.s.key);
      el.style.color = it.invalid ? '#A63D2F' : '';
      el.title = it.invalid ? '超出满分（上限 ' + it.cap + '）' : '';
    });
  }

  /* ================= 计算 ================= */
  function analyze() {
    var t = targetInfo();
    var items = readScores();
    updateConvHints(items);

    var filled = items.filter(function (it) { return it.exam !== null && !it.invalid; });
    var sumScore = filled.reduce(function (a, it) { return a + it.exam; }, 0);
    var sumMax = filled.reduce(function (a, it) { return a + it.s.max; }, 0);
    var sumRate = sumMax ? sumScore / sumMax : 0;

    var targetRate = t ? t.rate : null;

    var rows = items.map(function (it) {
      var rate = it.exam === null ? null : it.exam / it.s.max;
      var diff = (rate !== null && targetRate !== null) ? rate - targetRate : null;
      var lv = diff === null ? null : levelOf(diff);
      return {
        key: it.s.key, name: it.s.name, max: it.s.max,
        score: it.exam, raw: it.raw, mode: mode(),
        rate: rate, diff: diff, levelIdx: lv,
        level: lv === null ? '—' : LEVELS[lv],
        advice: rate === null ? '' : pickAdvice(it.s.name, rate)
      };
    });

    return {
      target: t,
      targetRate: targetRate,
      rows: rows,
      filledCount: filled.length,
      sumScore: sumScore, sumMax: sumMax, sumRate: sumRate,
      gap: targetRate === null ? null : sumRate - targetRate
    };
  }

  function levelOf(diff) {
    if (diff > 0.02) return 0;
    if (diff >= 0) return 1;
    if (diff >= -0.05) return 2;
    if (diff >= -0.10) return 3;
    return 4;
  }

  function pickAdvice(name, rate) {
    var list = window.ADVICE[name];
    if (!list) return '';
    for (var i = 0; i < list.length; i++) {
      if (rate >= list[i].min) return list[i].text;
    }
    return list[list.length - 1].text;
  }

  function priorities(res, excludeGeoBio) {
    var out = [];
    res.rows.forEach(function (r) {
      if (r.rate === null || res.targetRate === null) return;
      if (excludeGeoBio && (r.key === 'geography' || r.key === 'biology')) return;
      var need = (res.targetRate - r.rate) * r.max;
      if (need > 0.05) out.push({ name: r.name, need: need, rate: r.rate, key: r.key });
    });
    out.sort(function (a, b) { return b.need - a.need; });
    return out;
  }

  function excludeGeoBioOn() {
    var cb = $('excludeGeoBio');
    return cb ? cb.checked : true;
  }

  /* ================= 渲染结果 ================= */
  function compute() {
    var res = analyze();
    $('sumScore').textContent = res.filledCount ? res.sumScore.toFixed(1) : '-';
    $('sumMax').textContent = res.filledCount ? res.sumMax : '-';
    $('sumRate').textContent = res.filledCount ? pct1(res.sumRate) : '-';
    return res;
  }

  function renderResult(res) {
    if (!res.target || !res.filledCount) { toast('请先选择目标高中并至少填一科分数'); return false; }
    var invalid = res.rows.filter(function (r) { return r.raw !== null && r.rate !== null && r.rate > 1.001; });
    if (invalid.length) { toast('有科目分数超出满分，请检查：' + invalid.map(function (r) { return r.name; }).join('、'), 3200); return false; }

    $('placeholder').classList.add('hidden');
    $('resultBody').classList.remove('hidden');

    /* KPI */
    var gap = res.gap;
    var kpis = [
      { label: '总分', value: res.sumScore.toFixed(1) + ' / ' + res.sumMax, color: '#2E5D4B' },
      { label: '总分得分率', value: pct1(res.sumRate), color: '#2E5D4B' },
      { label: '目标高中得分率', value: pct1(res.targetRate), color: '#6E7263' },
      {
        label: '与目标差距', value: (gap >= 0 ? '+' : '') + (gap * 100).toFixed(1) + '%',
        color: gap >= 0 ? '#6E8B4A' : (gap >= -0.05 ? '#B8862B' : '#A63D2F'),
        bg: gap >= 0 ? '#E9EEDC' : '#FAF0E2'
      }
    ];
    $('kpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi" style="' + (k.bg ? 'background:' + k.bg : '') + '">' +
        '<div class="k-label">' + k.label + '</div>' +
        '<div class="k-value" style="color:' + k.color + '">' + k.value + '</div></div>';
    }).join('');

    /* 图表 */
    var chartRows = res.rows.filter(function (r) { return r.rate !== null; })
      .map(function (r) { return { name: r.name, rate: r.rate }; });
    window.Charts.bar($('barChart'), chartRows, res.targetRate);
    window.Charts.radar($('radarChart'), chartRows, res.targetRate);

    /* 明细表 */
    var tb = $('detailTable').querySelector('tbody');
    tb.innerHTML = res.rows.map(function (r) {
      if (r.rate === null) {
        return '<tr><td><b>' + r.name + '</b></td><td class="num">—</td><td class="num">—</td>' +
               '<td><span class="tag t3">未填</span></td><td class="advice dim">未录入分数</td></tr>';
      }
      var scoreTxt = r.mode === 'pct'
        ? r.raw + ' <span class="dim tiny">(折算 ' + r.score.toFixed(1) + ' / ' + r.max + ')</span>'
        : r.score.toFixed(1) + ' / ' + r.max;
      var diffTxt = r.diff === null ? '' :
        ' <span class="dim tiny">(' + (r.diff >= 0 ? '+' : '') + (r.diff * 100).toFixed(1) + '%)</span>';
      return '<tr>' +
        '<td><b>' + r.name + '</b></td>' +
        '<td class="num">' + scoreTxt + '</td>' +
        '<td class="num">' + pct1(r.rate) + diffTxt + '</td>' +
        '<td><span class="tag t' + r.levelIdx + '">' + r.level + '</span></td>' +
        '<td class="advice">' + r.advice.replace(/\n/g, '<br>') + '</td>' +
        '</tr>';
    }).join('');

    /* 提分优先级 */
    var pr = priorities(res, excludeGeoBioOn());
    var box = $('priority');
    if (!pr.length) {
      box.innerHTML = '<p class="dim">所有科目都已达到或超过目标高中的得分率，保持即可。</p>';
    } else {
      var maxNeed = pr[0].need;
      box.innerHTML = pr.map(function (p, i) {
        return '<div class="prio-item">' +
          '<span class="prio-rank">' + (i + 1) + '</span>' +
          '<span class="prio-name">' + p.name + '</span>' +
          '<div class="prio-bar"><i style="width:' + Math.max(6, p.need / maxNeed * 100) + '%"></i></div>' +
          '<span class="prio-val">离目标还差 ' + p.need.toFixed(1) + ' 分</span>' +
          '</div>';
      }).join('');
      if (excludeGeoBioOn()) {
        box.innerHTML += '<p class="dim tiny">注：地理、生物为八年级已考科目，分数已计入中考总分，不计入提分优先级。</p>';
      }
    }

    state.last = res;
    save();
    return true;
  }

  /* ================= AI ================= */
  function buildPayload(res) {
    var region = $('region').value;
    var lines = res.rows.filter(function (r) { return r.rate !== null; }).map(function (r) {
      return '  ' + r.name + ' ' + r.score.toFixed(1) + '/' + r.max + ' = ' + pct1(r.rate) + '（' + r.level + '，' +
        (r.diff >= 0 ? '已达目标，高出约 ' + ((r.rate - res.targetRate) * r.max).toFixed(0) + ' 分'
                     : '距目标还需补回约 ' + ((res.targetRate - r.rate) * r.max).toFixed(0) + ' 分') + '）';
    });
    var pr = priorities(res, excludeGeoBioOn());
    return {
      region: region,
      examName: $('examName').value || '本次考试',
      examDate: $('examDate').value || '',
      student: $('stuName').value || '该同学',
      studentSchool: $('stuSchool').value || '',
      studentClass: $('stuClass').value || '',
      teacher: $('teacher').value || '',
      targetName: res.target.name,
      targetYear: res.target.year,
      targetScore: res.target.score,
      totalScore: res.target.total,
      targetRate: res.targetRate,
      sumScore: res.sumScore,
      sumMax: res.sumMax,
      sumRate: res.sumRate,
      gap: res.gap,
      subjectLines: lines,
      priorities: pr.map(function (p) { return p.name + '（离目标还差 ' + p.need.toFixed(1) + ' 分）'; }),
      subjectAdvice: res.rows.filter(function (r) { return r.rate !== null; }).map(function (r) {
        return {
          name: r.name, rate: r.rate, level: r.level,
          need: res.targetRate === null ? null : Math.max(0, (res.targetRate - r.rate) * r.max),
          advice: String(r.advice || '').replace(/\s*\n\s*/g, ' ')
        };
      }),
      needTotal: totalNeed(res),
      geoBioExcluded: excludeGeoBioOn()
    };
  }

  // 还需要补回的总分：只算计入提分优先级的科目（地理、生物已考完时不计）
  function totalNeed(res) {
    var pr = priorities(res, excludeGeoBioOn());
    if (!pr.length) return Math.max(0, (res.targetRate - res.sumRate) * res.sumMax);
    return pr.reduce(function (a, p) { return a + p.need; }, 0);
  }

  function fallbackAI(res) {
    var p = buildPayload(res);
    var name = p.student;
    var top = priorities(res, excludeGeoBioOn()).slice(0, 3);
    var weak = res.rows.filter(function (r) { return r.rate !== null && r.levelIdx >= 3; })
      .sort(function (a, b) { return a.rate - b.rate; });

    var sumNeed = totalNeed(res);
    var talk = name + '这次' + p.examName + '总分 ' + res.sumScore.toFixed(0) + ' 分（满分 ' + res.sumMax +
      ' 分）。' + res.target.name + '去年录取线是 ' + res.target.score + ' 分，' + name + '目前' +
      (res.gap >= 0 ? '已经够了，还多出大约 ' + sumNeed.toFixed(0) + ' 分，说明基础是扎实的，接下来重点是把优势稳住。'
                    : '还差大约 ' + sumNeed.toFixed(0) + ' 分，主要差在几科上，这个差距是完全可以补上来的。') +
      (weak.length ? name + '现在最需要抓的是' + weak.slice(0, 2).map(function (r) { return r.name; }).join('和') + '，' : '') +
      (top.length ? '建议把精力先放在' + top.map(function (t) { return t.name; }).join('、') +
        '上，把和目标的差距补回来，总分就能明显往上走。' : '') +
      '接下来的一个月，我们会按科目逐项过一遍，请家长配合盯一下作业和纠错本。要是想弄清楚具体是哪一块题丢分，可以把卷子带过来，我们学科老师对着卷子帮他看，有情况我随时跟您沟通。';

    var points = [];
    points.push('总分 ' + res.sumScore.toFixed(0) + ' 分（满分 ' + res.sumMax + ' 分）');
    if (res.gap >= 0) points.push('已达到' + res.target.name + '去年录取线，重点是保持稳定，防止优势科目掉下来');
    else points.push('距' + res.target.name + '去年录取线还差大约 ' + sumNeed.toFixed(0) + ' 分，属于可追赶范围');
    top.forEach(function (t) { points.push('优先补 ' + t.name + '，还需补回约 ' + t.need.toFixed(1) + ' 分'); });
    weak.slice(0, 2).forEach(function (r) { points.push(r.name + '目前属于【' + r.level + '】，建议尽快做专项训练'); });
    if (excludeGeoBioOn()) points.push('地理、生物已考完并计入总分，不再投入时间');

    var diagnosis = {};
    (top.length ? top : res.rows.filter(function (r) { return r.rate !== null; }).slice(0, 3))
      .forEach(function (t) {
        var r = res.rows.filter(function (x) { return x.name === t.name; })[0];
        if (!r) return;
        diagnosis[r.name] = (r.diff >= 0
          ? '已经达到目标高中的水平'
          : '距目标还差大约 ' + ((res.targetRate - r.rate) * r.max).toFixed(0) + ' 分') +
          '，属于【' + r.level + '】。' + r.advice.slice(0, 110) + (r.advice.length > 110 ? '…' : '');
      });

    var plan = '【近期重点】\n' +
      (top.length
        ? top.map(function (t, i) { return (i + 1) + '. ' + t.name + '：距目标还差约 ' + t.need.toFixed(1) + ' 分，作为本月主攻科目。'; }).join('\n')
        : '1. 各科均已达标，重点是保持稳定，避免优势科目回落。') + '\n\n' +
      '【未来一个月安排】\n' +
      '1. 每周固定完成 1 套完整真题/模拟卷，限时训练，模拟考试节奏。\n' +
      '2. 每套卷子做完当天必须整理错题，按科目分类记录到纠错本，周日晚重做一遍。\n' +
      '3. 每天固定 30 分钟处理当天的薄弱知识点，不积压。\n' +
      '4. 每两周复看一次纠错本，检查同一个知识点是否重复出错。\n' +
      (res.gap < 0 ? '5. 下阶段目标：总分再提高约 ' + sumNeed.toFixed(0) + ' 分，达到' + res.target.name + '去年的录取水平。\n' : '');

    var subjectTalk = res.rows.filter(function (r) { return r.rate !== null; }).map(function (r) {
      return { subject: r.name, text: subjectTalkFallback(r, res) };
    });

    return { talk: talk, subjectTalk: subjectTalk, points: points, diagnosis: diagnosis, plan: plan, _fallback: true };
  }

  function buildPrompt(p) {
    return '你是一位江西上饶中考升学规划老师，正在帮教培机构的老师准备与家长的沟通材料。\n\n' +
      '【地区】' + p.region + '\n' +
      '【本次考试】' + p.examName + (p.examDate ? '（' + p.examDate + '）' : '') + '\n' +
      '【学生】一位初三在读学生（出于隐私，不提供姓名、学校、班级；这些信息与学习建议无关，请不要在输出里提及或编造）' + '\n' +
      '【目标高中】' + p.targetName + '，' + p.targetYear + ' 年录取分 ' + p.targetScore + ' 分（这条线按中考总分 ' +
      p.totalScore + ' 分算，折算成得分率 ' + pct1(p.targetRate) + '）\n' +
      '【满分口径】本次成绩按 ' + p.sumMax + ' 分算（语数英物化政史地生九科），不含体育和实验操作；录取线是按 ' +
      p.totalScore + ' 分算的，两者口径不同，不能直接相减\n' +
      '【各科成绩】\n' + p.subjectLines.join('\n') + '\n' +
      '【总分】' + p.sumScore.toFixed(1) + ' / ' + p.sumMax + ' = ' + pct1(p.sumRate) + '\n' +
      '【距目标】' + (p.gap >= 0 ? '已经达到' + p.targetName + '的录取水平'
                                 : '离' + p.targetName + '还差约 ' + p.needTotal.toFixed(0) + ' 分') +
      '（系统已折算好，直接用这个数）\n' +
      '【系统算出的提分优先级】' + (p.priorities.length ? p.priorities.join('、') : '各科均已达标') + '\n' +
      (p.geoBioExcluded ? '【注意】地理、生物是八年级已考科目，分数已计入中考总分，无法再提升，不要建议在这两科上花时间。\n' : '') +
      '\n【参考：本地区教研给的各科建议原文，只能当素材改写，不要照抄，也不要出现里面的年份、书名或课程名】\n' +
      (p.subjectAdvice && p.subjectAdvice.length
        ? p.subjectAdvice.map(function (a, i) {
            return '  ' + (i + 1) + '. ' + a.name + '（得分率 ' + pct1(a.rate) + '，当前档位【' + a.level + '】）' + a.advice;
          }).join('\n')
        : '  （无）') + '\n' +
      '\n请严格按下面的 JSON 结构输出，不要输出任何多余文字：\n' +
      '{\n' +
      '  "talk": "给家长的总体沟通话术（开场用），老师第一人称口吻，200字左右，具体、可落地，不要空话套话",\n' +
      '  "subjectTalk": [{"subject": "科目名", "text": "这一科单独跟家长说的一段话，老师第一人称，120-200字"}],\n' +
      '  "points": ["核心要点提纲，3-5条，每条一句话"],\n' +
      '  "diagnosis": {"科目名": "该科目的档位与提升空间，30-60字，不要判断具体丢分板块"},   // 只写最需要关注的2-4个科目\n' +
      '  "plan": "学习规划，分【近期重点】和【未来一个月安排】两部分，要有具体动作（刷哪类题、怎么纠错、每周几套卷）"\n' +
      '}\n\n' +
      '硬性要求：\n' +
      '1. 禁止出现任何机构名、报班或购课建议。\n' +
      '2. 禁止承诺性表述（如"保证提分""包上某校"）。\n' +
      '3. 不得贬低学生、学校或老师。\n' +
      '4. 只给学习建议，语气客观、具体。\n' +
      '5. diagnosis 的学科名必须从上面【各科成绩】里选。\n' +
      '6. subjectTalk 必须覆盖【各科成绩】里的每一个科目，一个都不能漏、也不能多，顺序保持一致；subject 必须和科目名完全一致。\n' +
      '7. subjectTalk 每一科要说清楚三件事：本次考了多少分；离目标高中还差多少分（按该科满分折算，或已达标多少）；接下来具体怎么补（练哪类题、每周做多少、怎么纠错）。不要写"要继续努力""要认真听讲"这类空话。\n' +
      '8. 你没有这位学生的错题数据，所以禁止判断他具体错在哪道题、哪个板块或哪个知识点。不要出现"函数丢分多""文言文错得多""算术失分严重"这类结论。\n' +
      '9. 参考素材里如果有"通常这类同学……""这一档的孩子往往……"这种带前提的说法，可以照这个口气用，但不要改写成对这个学生的断定。\n' +
      '10. 确实需要定位到具体板块时，就把话交出去，写"这块可以让学科老师对着卷子帮他看"，不要自己下结论。\n' +
      '11. subjectTalk 是老师念给家长听的话，不要出现任何机构名、报班建议或课程名，也不要出现 markdown 符号。\n' +
      '12. 家长不一定懂术语：不要出现"百分点"这三个字，也不要反复提"得分率"。要说差距就直接说"还差多少分"（按相应满分折算）。"得分率"整段最多出现一次，其余都用分数说话。\n' +
      '13. 所有"差多少分"一律用上面【距目标】和各科给出的数字，不要自己拿录取分去减学生总分——录取线是按 ' +
      p.totalScore + ' 分算的，学生成绩是按 ' + p.sumMax + ' 分算的，直接相减会算出很大的错数。\n';
  }

  function genAI() {
    var res = state.last;
    if (!res || !res.target) { toast('请先点「开始分析」'); return; }
    if (state.busy) return;
    if (!state.hasKey) {
      var fb = fallbackAI(res);
      applyAI(fb);
      $('aiHint').textContent = '未配置 API Key，已用内置模板生成（可在「设置」里填入 Key 启用 AI）。';
      toast('未配置 API Key，已用内置模板生成');
      return;
    }
    state.busy = true;
    var btn = $('btnGenAI');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span>AI 生成中…';
    $('aiHint').textContent = '正在调用 DeepSeek，通常 10-30 秒…';

    zkDeepSeek(buildPrompt(buildPayload(res)), function (err, content) {
      try {
        if (err) throw err;
        applyAI(zkParseJSON(content));
        $('aiHint').textContent = 'AI 生成完成，可直接编辑后导出。';
      } catch (e2) {
        var fb = fallbackAI(res);
        applyAI(fb);
        $('aiHint').textContent = 'AI 调用失败（' + (e2 && e2.message || e2) + '），已改用内置模板。';
        toast('AI 调用失败，已用内置模板兜底', 3000);
      }
      state.busy = false;
      btn.disabled = false;
      btn.textContent = '生成 / 重新生成';
    });
  }

  function applyAI(raw) {
    var d = raw;
    if (d && !d._fallback) {
      // AI 偶尔会带 markdown 记号，统一清掉
      d = {
        talk: cleanAI(d.talk),
        points: (d.points || []).map(function (x) { return cleanAI(x); }),
        diagnosis: d.diagnosis || {},
        plan: cleanAI(d.plan),
        subjectTalk: (d.subjectTalk || []).map(function (it) {
          return { subject: String((it && it.subject) || ''), text: cleanAI(it && it.text) };
        })
      };
    }
    state.ai = d;
    state.aiSig = state.last ? scoreSignature(state.last) : null;
    state.stTalk = null;
    $('talkText').value = d.talk || '';
    $('talkPoints').value = (d.points || []).map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n');
    $('planText').value = d.plan || '';
    $('aiBadge').textContent = d._fallback ? '内置模板' : 'AI';
    refreshSubjectTalks();
    stCapture();
    save();
  }

  /* 顶栏窄屏折叠：次要按钮收进「⋯」，点开铺成一行铺 warning 在下方 */
  function zkToggleMore() {
    var ex = document.querySelector('.topbar-extra');
    if (!ex) return;
    ex.classList.toggle('open');
  }
  // onclick 跑在全局作用域，IIFE 里的函数要挂出去才能被点得到
  window.zkToggleMore = zkToggleMore;

  /* ===== 并入个人工作台后的改造（2026-10-02）=====
     原本这套代码要跑在 exe 里的本地 PowerShell 服务上（/api/*）。
     现在它是工作台里一个同源自嵌页面，没有本地服务：
     · API Key 与模型存 localStorage（LS_AI）
     · AI 由浏览器直连 DeepSeek（官方接口允许前端跨域调用，无需自建后端）
     · 导出 Excel 改成前端生成 CSV（Excel 可直接打开）
     · 「退出程序」整个拿掉——那只是关本地服务的 */

  var LS_AI = 'smart-analyzer-ai-v1';
  var zkOpenSettings = null;   // 顶栏「AI 未配置」徽章点了直达设置，省一次跳转

  function zkReadAI() {
    try { return JSON.parse(localStorage.getItem(LS_AI) || 'null') || {}; } catch (e) { return {}; }
  }
  function zkWriteAI(o) {
    try { localStorage.setItem(LS_AI, JSON.stringify(o)); } catch (e) { }
  }
  /* 直连 DeepSeek。cb(err, content) */
  function zkDeepSeek(prompt, cb) {
    var cfg = zkReadAI();
    var key = (cfg.apiKey || '').trim();
    if (!key) { cb(new Error('未填写 API Key')); return; }
    fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, stream: false
      })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        if (!o.ok) {
          var m = (o.j && (o.j.error && o.j.error.message)) || ('HTTP ' + this_status(o));
          cb(new Error(m)); return;
        }
        var c = o.j && o.j.choices && o.j.choices[0] && o.j.choices[0].message && o.j.choices[0].message.content;
        cb(null, c || '');
      }).catch(function (e) { cb(e); });
  }
  function this_status() { return ''; }

  /* 把 AI 返回的文本（可能带 markdown 代码块）解析成 JSON 对象 */
  function zkParseJSON(text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    return JSON.parse(s);
  }

  function refreshAIMeta() {
    var cfg = zkReadAI();
    var j = { hasKey: !!cfg.apiKey, model: cfg.model || 'deepseek-chat', apiKey: cfg.apiKey || '' };
    state.hasKey = !!j.hasKey;
      var el = $('aiStatus');
      el.textContent = j.hasKey ? 'AI 已配置' : 'AI 未配置';
      el.title = j.hasKey ? ('当前模型：' + (j.model || 'deepseek-chat')) : '还没填 API Key，点右边「设置」';
      el.className = 'ai-status ' + (j.hasKey ? 'on' : 'off');
      if (j.apiKey) $('apiKey').value = j.apiKey;
      if (j.model) $('model').value = j.model;
  }

  /* ================= 分科话术 ================= */
  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function clipSentences(text, max) {
    var s = String(text || "").replace(/\s*\n\s*/g, "");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      out += s.charAt(i);
      if ("。！？".indexOf(s.charAt(i)) >= 0 && out.length >= max) break;
    }
    if (!out) out = s.slice(0, max);
    return out;
  }

  // 没有 AI 时，用表里的建议文案 + 本次数据拼出分科话术
  function subjectTalkFallback(r, res) {
    var t = res.target;
    var sc = (Math.abs(r.score - Math.round(r.score)) < 0.05) ? String(Math.round(r.score)) : r.score.toFixed(1);
    var head = r.name + "这次考了" + sc + "分（满分" + r.max + "分），";
    if (r.diff === null) {
      head += "这次没有可以对比的目标高中。";
    } else if (r.diff >= 0) {
      head += "已经达到" + t.name + "的录取水平，还多出大约" + ((r.rate - res.targetRate) * r.max).toFixed(0) + "分，" +
        (r.diff > 0.02 ? "是这次的强项，" : "刚好踩线，") + "接下来重点是稳住，别让它掉下来。";
    } else {
      var need = (res.targetRate - r.rate) * r.max;
      head += "离" + t.name + "还差大约" + need.toFixed(0) + "分（按这科满分" + r.max + "分折算），属于【" + r.level + "】。" +
        "这一科接下来要重点补，先把能拿的分拿到手。";
    }
    return head + "\n" + String(r.advice || "").trim();
  }

  function renderSubjectTalks(res, map) {
    var box = $("subjectTalkList");
    if (!box) return;
    var rowsIn = res.rows.filter(function (r) { return r.rate !== null; });
    if (!rowsIn.length) {
      box.innerHTML = '<p class="dim tiny">还没有录入分数，无法生成分科话术。</p>';
      return;
    }
    box.innerHTML = rowsIn.map(function (r) {
      var txt = (map && map[r.name]) ? map[r.name] : subjectTalkFallback(r, res);
      var diffTxt = r.diff === null ? "" :
        "（" + (r.diff >= 0 ? "+" : "") + (r.diff * 100).toFixed(1) + "%）";
      return '<div class="subj-talk" data-subject="' + escapeHtml(r.name) + '">' +
        '<div class="st-head">' +
          '<span class="st-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="tag t' + r.levelIdx + '">' + r.level + '</span>' +
          '<span class="st-rate">得分率 ' + pct1(r.rate) + diffTxt + '</span>' +
          '<button class="ghost tiny-btn st-copy">复制这段</button>' +
        '</div>' +
        '<textarea rows="6" class="st-text">' + escapeHtml(txt) + '</textarea>' +
        '</div>';
    }).join("");
    autoGrowAll(box);
  }

  function autoGrow(ta) {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(96, ta.scrollHeight + 6) + "px";
  }

  function autoGrowAll(box) {
    Array.prototype.slice.call(box.querySelectorAll(".st-text")).forEach(autoGrow);
  }

  function cleanAI(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/\*\*/g, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function scoreSignature(res) {
    return res.rows.map(function (r) {
      return r.name + ":" + (r.score === null ? "-" : r.score.toFixed(1));
    }).join("|");
  }

  function refreshSubjectTalks() {
    var res = state.last;
    if (!res) return;
    var sig = scoreSignature(res);
    var map = {};
    // 老师手动改过的分科话术（只有分数没变时才用，避免数字对不上）
    if (state.stTalk && state.stTalk.sig === sig) {
      Object.keys(state.stTalk.map).forEach(function (k) { map[k] = state.stTalk.map[k]; });
    }
    // AI 文案：同样只在分数一致时使用
    if (state.ai && state.ai.subjectTalk && state.aiSig === sig) {
      var rowsIn = res.rows.filter(function (r) { return r.rate !== null; });
      var items = state.ai.subjectTalk.filter(function (it) { return it && it.text; });
      var taken = {};
      items.forEach(function (it) {
        var hit = rowsIn.filter(function (r) { return r.name === it.subject; })[0];
        if (hit) { map[hit.name] = cleanAI(it.text); taken[it.subject] = true; }
      });
      // 科目名对不上的，按顺序补位，保证不会整科空着
      var rest = items.filter(function (it) { return !taken[it.subject]; });
      var missing = rowsIn.filter(function (r) { return !map[r.name]; });
      for (var i = 0; i < missing.length && i < rest.length; i++) {
        map[missing[i].name] = cleanAI(rest[i].text);
      }
    }
    renderSubjectTalks(res, map);
  }

  // 把界面上的分科话术记下来（分数一变就自动作废）
  function stCapture() {
    var res = state.last;
    if (!res) return;
    var list = collectSubjectTalks();
    if (!list.length) return;
    var map = {};
    list.forEach(function (x) { map[x.subject] = x.text; });
    state.stTalk = { sig: scoreSignature(res), map: map };
  }

  function collectSubjectTalks() {
    return Array.prototype.slice.call(document.querySelectorAll("#subjectTalkList .subj-talk")).map(function (el) {
      var ta = el.querySelector(".st-text");
      return { subject: el.getAttribute("data-subject"), text: ta ? ta.value.trim() : "" };
    }).filter(function (x) { return x.text; });
  }

  /* ================= 分数线编辑 ================= */
  function validateRegions(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return '顶层必须是一个对象（地区名 → 数据）';
    var names = Object.keys(o);
    if (!names.length) return '至少要有一个地区';
    for (var i = 0; i < names.length; i++) {
      var k = names[i], r = o[k];
      if (!r || typeof r !== 'object') return k + '：对应的值必须是对象';
      if (r.totalScore !== undefined && typeof r.totalScore !== 'number') return k + '：中考总分必须是数字';
      if (r.years !== undefined && !Array.isArray(r.years)) return k + '：年份格式不对';
      if (r.schools !== undefined && !Array.isArray(r.schools)) return k + '：学校列表格式不对';
      var sc = r.schools || [];
      for (var j = 0; j < sc.length; j++) {
        if (!sc[j] || !sc[j].name) return k + '：第 ' + (j + 1) + ' 个学校还没填校名';
        if (!sc[j].scores || typeof sc[j].scores !== 'object') return k + '：' + sc[j].name + ' 的分数格式不对';
      }
    }
    var n = names.reduce(function (t, k) { return t + ((o[k].schools || []).length); }, 0);
    return '✓ 格式正确：' + names.length + ' 个地区，共 ' + n + ' 条学校数据';
  }

  var rgDraft = null;
  var rgCur = '';

  function rgClone(o) { return JSON.parse(JSON.stringify(o || {})); }

  function rgYearsOf(r) {
    var ys = (r && r.years && r.years.length) ? r.years.slice() : [];
    if (!ys.length && r && r.schools) {
      r.schools.forEach(function (s) {
        Object.keys(s.scores || {}).forEach(function (y) { ys.push(y); });
      });
    }
    var uniq = [];
    ys.map(Number).filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; })
      .forEach(function (y) { if (uniq.indexOf(y) < 0) uniq.push(y); });
    return uniq.length ? uniq : [2025];
  }

  function rgMsg(text) { $('regionsMsg').textContent = text || ''; }

  function rgFillRegionSelect() {
    var sel = $('rgRegion');
    sel.innerHTML = '';
    Object.keys(rgDraft).forEach(function (n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    sel.value = rgCur;
  }

  function renderRgTable() {
    var r = rgDraft[rgCur];
    var years = r.years || [];
    var schools = r.schools || [];
    $('rgTable').querySelector('thead').innerHTML = '<tr><th>学校</th>' +
      years.map(function (y) { return '<th>' + y + ' 年录取分</th>'; }).join('') +
      '<th></th></tr>';
    var body = schools.map(function (s, i) {
      return '<tr>' +
        '<td><input class="rg-sn" data-i="' + i + '" type="text" value="' + escapeHtml(s.name || '') + '" placeholder="学校名"></td>' +
        years.map(function (y) {
          var v = s.scores ? s.scores[String(y)] : undefined;
          return '<td><input class="rg-sc" data-i="' + i + '" data-y="' + y + '" type="number" value="' +
            (v === undefined || v === null ? '' : v) + '"></td>';
        }).join('') +
        '<td><button class="ghost tiny-btn rg-del" data-i="' + i + '">删除</button></td>' +
        '</tr>';
    }).join('');
    if (!schools.length) {
      body = '<tr><td colspan="' + (years.length + 2) + '" class="dim tiny">还没有学校，点下面的「＋ 新增学校」加一个。</td></tr>';
    }
    $('rgTable').querySelector('tbody').innerHTML = body;
  }

  function renderRg() {
    var r = rgDraft[rgCur];
    if (!r) return;
    if (!r.schools) r.schools = [];
    r.years = rgYearsOf(r);
    rgFillRegionSelect();
    $('rgName').value = rgCur;
    $('rgTotal').value = r.totalScore || 845;
    $('rgYears').value = r.years.join(', ');
    $('rgNote').value = r.note || '';
    renderRgTable();
  }

  function openRegions() {
    rgDraft = rgClone(window.REGIONS);
    if (!Object.keys(rgDraft).length) {
      rgDraft['新地区'] = { totalScore: 845, years: [2025], note: '', schools: [] };
    }
    var pick = $('region').value;
    rgCur = rgDraft[pick] ? pick : Object.keys(rgDraft)[0];
    $('regionsMsg').textContent = '';
    renderRg();
    $('regionsMask').classList.remove('hidden');
  }

  function saveRegions() {
    var names = Object.keys(rgDraft);
    if (!names.length) { rgMsg('✗ 至少要有一个地区'); return; }
    var noName = null;
    names.forEach(function (k) {
      (rgDraft[k].schools || []).forEach(function (s) {
        if (!String(s.name || '').trim()) noName = k;
      });
    });
    if (noName) { rgMsg('✗ 「' + noName + '」里有学校还没填校名，填上或者点「删除」'); return; }

    var clean = rgClone(rgDraft);
    names.forEach(function (k) {
      var r = clean[k];
      if (!r.note) delete r.note;
      r.years = rgYearsOf(r);
      r.schools = (r.schools || []).filter(function (s) { return String(s.name || '').trim(); });
      r.edited = true;
    });
    var msg = validateRegions(clean);
    if (msg.charAt(0) !== '\u2713') { rgMsg('✗ ' + msg); return; }

    try { localStorage.setItem(LS_REGIONS, JSON.stringify(clean)); } catch (e) { }
    window.REGIONS = clean;
    var cur = $('region').value;
    $('region').innerHTML = '';
    fillRegions();
    $('region').value = window.REGIONS[cur] ? cur : Object.keys(window.REGIONS)[0];
    fillSchools($('region').value);
    rgDraft = rgClone(clean);
    rgCur = window.REGIONS[$('region').value] ? $('region').value : Object.keys(clean)[0];
    renderRg();
    rgMsg('✓ 已保存并生效');
    toast('分数线已保存');
  }

  function bindRegionEditor() {
    $('rgRegion').addEventListener('change', function () {
      if (rgDraft[this.value]) { rgCur = this.value; renderRg(); rgMsg(''); }
      else this.value = rgCur;
    });

    $('rgName').addEventListener('change', function () {
      var v = this.value.trim();
      if (!v) { this.value = rgCur; rgMsg('✗ 地区名称不能为空'); return; }
      if (v === rgCur) { this.value = v; return; }
      if (rgDraft[v]) { this.value = rgCur; rgMsg('✗ 已经有一个叫「' + v + '」的地区了，换个名字'); return; }
      var next = {};
      Object.keys(rgDraft).forEach(function (k) { next[k === rgCur ? v : k] = rgDraft[k]; });
      rgDraft = next;
      rgCur = v;
      rgFillRegionSelect();
      rgMsg('');
    });

    $('rgTotal').addEventListener('input', function () {
      var n = num(this.value);
      if (n !== null && n > 0) rgDraft[rgCur].totalScore = n;
    });

    $('rgYears').addEventListener('change', function () {
      var uniq = [];
      String(this.value).split(/[^0-9]+/).map(Number)
        .filter(function (n) { return !isNaN(n) && n > 1900 && n < 2200; })
        .sort(function (a, b) { return a - b; })
        .forEach(function (y) { if (uniq.indexOf(y) < 0) uniq.push(y); });
      if (!uniq.length) {
        toast('年份没填对，例如：2023, 2024, 2025');
        this.value = (rgDraft[rgCur].years || []).join(', ');
        return;
      }
      rgDraft[rgCur].years = uniq;
      this.value = uniq.join(', ');
      renderRgTable();
    });

    $('rgNote').addEventListener('input', function () { rgDraft[rgCur].note = this.value; });

    $('rgTable').addEventListener('input', function (e) {
      var el = e.target;
      var i = Number(el.getAttribute('data-i'));
      var school = (rgDraft[rgCur].schools || [])[i];
      if (!school) return;
      if (el.className.indexOf('rg-sn') >= 0) { school.name = el.value; return; }
      if (el.className.indexOf('rg-sc') >= 0) {
        var y = el.getAttribute('data-y');
        if (!school.scores) school.scores = {};
        if (el.value === '') delete school.scores[y];
        else { var n = num(el.value); if (n !== null) school.scores[y] = n; }
      }
    });

    $('rgTable').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.rg-del') : null;
      if (!btn) return;
      rgDraft[rgCur].schools.splice(Number(btn.getAttribute('data-i')), 1);
      renderRgTable();
    });

    $('rgAddSchool').addEventListener('click', function () {
      var r = rgDraft[rgCur];
      if (!r.schools) r.schools = [];
      r.schools.push({ name: '', scores: {} });
      renderRgTable();
      var inputs = $('rgTable').querySelectorAll('.rg-sn');
      if (inputs.length) inputs[inputs.length - 1].focus();
      rgMsg('');
    });

    $('rgAddRegion').addEventListener('click', function () {
      var name = '新地区', n = 2;
      while (rgDraft[name]) { name = '新地区' + n; n++; }
      rgDraft[name] = {
        totalScore: num($('rgTotal').value) || 845,
        years: (rgDraft[rgCur].years || [2025]).slice(),
        schools: []
      };
      rgCur = name;
      renderRg();
      $('rgName').focus();
      $('rgName').select();
      rgMsg('新地区建好了：把「地区名称」改成实际区县名，再填下面的分数。');
    });

    $('rgDelRegion').addEventListener('click', function () {
      if (Object.keys(rgDraft).length <= 1) { rgMsg('✗ 至少要留一个地区'); return; }
      if (!confirm('确定删除「' + rgCur + '」？删完记得点「保存并生效」。')) return;
      delete rgDraft[rgCur];
      rgCur = Object.keys(rgDraft)[0];
      renderRg();
      rgMsg('已删除，点「保存并生效」后正式生效');
    });
  }

  /* ================= 导出 ================= */
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '').trim() || '学生'; }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function talkPlainText() {
    var res = state.last;
    var t = $('talkText').value.trim();
    var p = $('talkPoints').value.trim();
    var out = '';
    if (res && res.target) {
      out += '学生：' + ($('stuName').value || '—') +
        '　目标高中：' + res.target.name + '（' + res.target.year + ' 年录取分 ' + res.target.score + '）\n';
      out += '总分：' + res.sumScore.toFixed(0) + ' 分，满分 ' + res.sumMax + ' 分　' +
        (res.gap >= 0 ? '已达到录取水平' : '距录取线还差大约 ' + totalNeed(res).toFixed(0) + ' 分') + '\n';
      out += '—'.repeat(30) + '\n';
    }
    if (t) out += t + '\n\n';
    var st = collectSubjectTalks();
    if (st.length) {
      out += '【分科话术｜家长问到哪一科就直接念哪一段】\n' +
        st.map(function (x) { return '◆ ' + x.subject + '\n' + x.text; }).join('\n\n') + '\n\n';
    }
    if (p) out += '【核心要点】\n' + p + '\n';
    return out;
  }

  function copyText(txt, okMsg) {
    txt = String(txt || '');
    if (!txt.trim()) { toast('还没有内容可复制'); return; }
    okMsg = okMsg || '已复制';
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, function () { fallbackCopy(txt, okMsg); });
    } else fallbackCopy(txt, okMsg);
  }
  function fallbackCopy(txt, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg || '已复制'); } catch (e) { toast('复制失败，请手动选中复制'); }
    ta.remove();
  }
  function copyTalk() { copyText(talkPlainText(), '已复制整体话术'); }
  function copyTalkSafe() {
    if (!state.last) { toast('请先点「开始分析」'); return; }
    copyTalk();
  }

  function copySubjectTalk(btn) {
    var wrap = btn.closest('.subj-talk');
    if (!wrap) return;
    var ta = wrap.querySelector('.st-text');
    var name = wrap.getAttribute('data-subject') || '';
    copyText(ta ? ta.value.trim() : '', '已复制【' + name + '】话术');
  }

  function copyAllSubjectTalks() {
    var list = collectSubjectTalks();
    if (!list.length) { toast('还没有分科话术，先点「开始分析」'); return; }
    copyText(list.map(function (x) { return '【' + x.subject + '】\n' + x.text; }).join('\n\n'), '已复制全部分科话术');
  }

  function exportDoc() {
    if (!state.last) { toast('请先点「开始分析」'); return; }
    var txt = talkPlainText();
    if (!txt.trim()) { toast('还没有内容可导出'); return; }
    var body = txt.split('\n').map(function (l) {
      return '<p style="margin:0 0 8px;line-height:1.9;font-size:11pt;">' + (l || '&nbsp;') + '</p>';
    }).join('');
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>家长沟通话术</title></head>' +
      '<body style="font-family:\'Microsoft YaHei\',sans-serif;">' +
      '<h2 style="font-size:14pt;">家长沟通话术</h2>' + body + '</body></html>';
    download(new Blob(['\ufeff' + html], { type: 'application/msword' }),
      '沟通话术_' + safeName($('stuName').value) + '_' + today() + '.doc');
  }

  function exportXlsx() {
    var res = state.last;
    if (!res || !res.target) { toast('请先点「开始分析」'); return; }
    var payload = {
      student: {
        name: $('stuName').value, school: $('stuSchool').value, cls: $('stuClass').value,
        teacher: $('teacher').value, examName: $('examName').value, examDate: $('examDate').value,
        region: $('region').value, targetName: res.target.name
      },
      targetYear: res.target.year,
      targetScore: res.target.score,
      totalScore: res.target.total,
      targetRate: res.targetRate,
      sumScore: res.sumScore, sumMax: res.sumMax, sumRate: res.sumRate, gap: res.gap,
      rows: res.rows.map(function (r) {
        return {
          name: r.name, raw: r.raw, score: r.score, max: r.max, mode: r.mode,
          rate: r.rate, level: r.level, advice: r.advice
        };
      }),
      talk: $('talkText').value,
      points: $('talkPoints').value,
      subjectTalk: collectSubjectTalks()
    };
    /* 原来走后端 /api/export/xlsx（PowerShell 造 xlsx）。
       现在没本地服务了，改成前端直接生成 CSV（带 BOM，Excel / WPS 双击就能打开） */
    var talkMap = {};
    (payload.subjectTalk || []).forEach(function (s) { talkMap[s.subject] = s.text || ''; });
    var lines = ['科目,本次得分,满分,得分率,档位,分科话术'];
    (payload.rows || []).forEach(function (r) {
      var t = String(talkMap[r.name] || '').replace(/"/g, '""');
      lines.push([r.name, r.score, r.max, r.rate, r.level, '"' + t + '"'].join(','));
    });
    if (payload.talk) {
      lines.push('"总体话术","' + String(payload.talk).replace(/"/g, '""') + '"');
    }
    var csv = '﻿' + lines.join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      '沟通话术_' + safeName($('stuName').value) + '_' + today() + '.csv');
    toast('CSV 已导出（Excel 可直接打开）');
  }

  function exportReport() {
    var res = state.last;
    if (!res || !res.target) { toast('请先点「开始分析」'); return; }
    var t = res.target;
    var rows = res.rows.filter(function (r) { return r.rate !== null; }).map(function (r) {
      return {
        name: r.name, score: r.score.toFixed(1), max: r.max, rate: r.rate,
        level: r.level, levelIdx: r.levelIdx,
        need: Math.max(0, (res.targetRate - r.rate) * r.max)
      };
    });
    var pr = priorities(res, excludeGeoBioOn());

    var diag = [];
    if (state.ai && state.ai.diagnosis) {
      Object.keys(state.ai.diagnosis).forEach(function (k) {
        diag.push({ name: k, text: state.ai.diagnosis[k] });
      });
    }
    if (!diag.length) {
      var focus = (pr.length ? pr.slice(0, 3).map(function (p) { return p.name; })
        : res.rows.filter(function (r) { return r.rate !== null; }).map(function (r) { return r.name; }).slice(0, 3));
      focus.forEach(function (n) {
        var r = res.rows.filter(function (x) { return x.name === n; })[0];
        if (r) diag.push({ name: r.name, text: r.advice });
      });
    }

    var kpis = [
      { label: '总分', value: res.sumScore.toFixed(1) + ' / ' + res.sumMax, color: '#2E5D4B' },
      { label: '总分得分率', value: pct1(res.sumRate), color: '#2E5D4B' },
      { label: '目标高中得分率', value: pct1(res.targetRate), color: '#6E7263' },
      {
        label: '距目标高中',
        value: res.gap >= 0 ? '已达标' : '还差约 ' + totalNeed(res).toFixed(0) + ' 分',
        color: res.gap >= 0 ? '#6E8B4A' : (res.gap >= -0.05 ? '#B8862B' : '#A63D2F'),
        bg: res.gap >= 0 ? '#E9EEDC' : '#FAF0E2'
      }
    ];

    var model = {
      genDate: today(),
      org: '',
      student: {
        name: $('stuName').value, school: $('stuSchool').value, cls: $('stuClass').value,
        teacher: $('teacher').value, examName: $('examName').value, examDate: $('examDate').value,
        region: $('region').value, targetName: t.name
      },
      refYear: t.year, targetScore: t.score, totalScore: t.total, targetRate: res.targetRate,
      kpis: kpis, rows: rows, priorities: pr, diagnosis: diag,
      plan: $('planText').value, includePlan: $('includeTalk').checked
    };

    var cv = window.Report.build(model);
    state.reportUrl = cv.toDataURL('image/png');
    state.reportName = '学情报告_' + safeName($('stuName').value) + '_' + today() + '.png';
    var prev = $('reportPreview');
    prev.innerHTML = '<img src="' + state.reportUrl + '" alt="学情报告">';
    $('reportMask').classList.remove('hidden');
  }

  function saveReportImage() {
    if (!state.reportUrl) { toast('请先生成报告'); return; }
    var a = document.createElement('a');
    a.href = state.reportUrl;
    a.download = state.reportName || '学情报告.png';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 500);
    toast('已保存到下载文件夹');
  }

  /* ================= 表单持久化 ================= */
  var FIELDS = ['region', 'school', 'refYear', 'examName', 'stuName', 'stuSchool', 'stuClass',
    'teacher', 'examDate', 'talkText', 'talkPoints', 'planText'];

  function save() {
    var o = { scores: {}, mode: mode(), excludeGeoBio: excludeGeoBioOn(), fields: {} };
    FIELDS.forEach(function (id) { var el = $(id); if (el) o.fields[id] = el.value; });
    window.SUBJECTS.forEach(function (s) { var el = $('sc_' + s.key); if (el) o.scores[s.key] = el.value; });
    if (state.stTalk && state.last && state.stTalk.sig === scoreSignature(state.last)) o.stTalk = state.stTalk;
    try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) { }
  }

  function restore() {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { }
    if (!o) { fillSchools($('region').value); return; }
    if (o.stTalk && o.stTalk.sig && o.stTalk.map) state.stTalk = o.stTalk;
    if (o.mode === 'pct') { document.querySelector('input[name=mode][value=pct]').checked = true; }
    if (o.excludeGeoBio !== undefined && $('excludeGeoBio')) $('excludeGeoBio').checked = o.excludeGeoBio;
    if (o.fields && o.fields.region && window.REGIONS[o.fields.region]) $('region').value = o.fields.region;
    fillSchools($('region').value);
    if (o.fields) {
      Object.keys(o.fields).forEach(function (id) {
        var el = $(id);
        if (!el || id === 'region') return;
        if (id === 'school' && el.disabled) return;
        if (id === 'refYear' && !el.options.length) return;
        if (o.fields[id] !== undefined && o.fields[id] !== null) el.value = o.fields[id];
      });
    }
    if (o.scores) {
      window.SUBJECTS.forEach(function (s) {
        var el = $('sc_' + s.key);
        if (el && o.scores[s.key]) el.value = o.scores[s.key];
      });
    }
  }

  /* ================= 知识点分值统计 ================= */
  var KW_LIST = window.KNOWLEDGE_SUBJECTS || [];
  var kwKey = null;

  function kwPct(score, full) {
    if (!full) return '—';
    return (score / full * 100).toFixed(1) + '%';
  }

  function kwEsc(s) { return escapeHtml(String(s == null ? '' : s)); }

  /* 把模块色稀释成浅底，保证黑字看得清 */
  function kwTint(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length !== 6) return '';
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '';
    function mix(v) { return Math.round(v + (255 - v) * 0.72); }
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  function renderKnowledge() {
    if (!KW_LIST.length) {
      $('kwTabs').innerHTML = '';
      $('kwMeta').textContent = '';
      $('kwMain').innerHTML = '<p class="dim tiny">没有找到知识点数据文件。</p>';
      $('kwMod').innerHTML = '';
      return;
    }
    var subj = null, i, j;
    for (i = 0; i < KW_LIST.length; i++) {
      if (KW_LIST[i].key === kwKey) { subj = KW_LIST[i]; break; }
    }
    if (!subj) { subj = KW_LIST[0]; kwKey = subj.key; }

    var tabs = '';
    for (i = 0; i < KW_LIST.length; i++) {
      var s = KW_LIST[i];
      tabs += '<button type="button" class="kw-tab' + (s.key === kwKey ? ' on' : '') +
              '" data-key="' + kwEsc(s.key) + '">' + kwEsc(s.name) + '</button>';
    }
    $('kwTabs').innerHTML = tabs;

    $('kwMeta').textContent = '（' + subj.name + ' · 满分 ' + subj.full + ' 分）';
    var dl = $('kwDownload');
    dl.setAttribute('href', subj.file);
    dl.setAttribute('download', subj.name + '-2026江西中考知识点分值统计.xlsx');

    var full = subj.full;
    var rows = '', sumS = 0, n = 0;
    for (i = 0; i < subj.groups.length; i++) {
      var g = subj.groups[i];
      rows += '<tr class="kw-group"><td colspan="4">' + kwEsc(g.type) + '</td></tr>';
      for (j = 0; j < g.items.length; j++) {
        var it = g.items[j];
        sumS += it.s;
        n += 1;
        var kc = it.c || '';
        var kcNo = kc ? ' style="box-shadow:inset 4px 0 0 0 ' + kc + '"' : '';
        var kcKp = kc ? ' style="background:' + kwTint(kc) + '"' : '';
        rows += '<tr><td class="n"' + kcNo + '>' + kwEsc(it.no) + '</td><td' + kcKp + '>' + kwEsc(it.kp) + '</td>' +
                '<td class="v">' + it.s + '</td><td class="v dim">' + kwPct(it.s, full) + '</td></tr>';
      }
    }
    rows += '<tr class="kw-total"><td class="n">合计</td><td>' + n + ' 个考点</td>' +
            '<td class="v">' + sumS + '</td><td class="v">' + kwPct(sumS, full) + '</td></tr>';
    $('kwMain').innerHTML =
      '<table class="kw-table"><thead><tr>' +
      '<th style="width:50px">题号</th><th>知识点</th>' +
      '<th style="width:50px;text-align:right">分值</th>' +
      '<th style="width:62px;text-align:right">占比</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    var mrows = '', mSum = 0;
    for (i = 0; i < subj.modules.length; i++) {
      var m = subj.modules[i];
      mSum += m.s;
      var mc = m.c || '';
      var mcStyle = mc ? ' style="box-shadow:inset 4px 0 0 0 ' + mc + ';background:' + kwTint(mc) + '"' : '';
      mrows += '<tr><td' + mcStyle + '>' + kwEsc(m.mod) + '</td><td class="v">' + m.s + '</td>' +
               '<td class="v dim">' + kwPct(m.s, full) + '</td></tr>';
    }
    var off = Math.abs(mSum - full) > 0.01;
    mrows += '<tr class="kw-total' + (off ? ' kw-warn' : '') + '"><td>合计</td>' +
             '<td class="v">' + mSum + '</td><td class="v">' + kwPct(mSum, full) + '</td></tr>';
    $('kwMod').innerHTML =
      '<table class="kw-table"><thead><tr><th>模块</th>' +
      '<th style="width:50px;text-align:right">分值</th>' +
      '<th style="width:62px;text-align:right">占比</th>' +
      '</tr></thead><tbody>' + mrows + '</tbody></table>' +
      (off ? '<p class="dim tiny" style="margin:8px 2px 0">原表模块合计 ' + mSum +
             ' 分，与满分 ' + full + ' 分对不上，这里按原表如实展示。</p>' : '');
  }

  function bindKnowledge() {
    $('btnKnowledge').addEventListener('click', function () {
      $('knowledgeMask').classList.remove('hidden');
      renderKnowledge();
    });
    $('btnCloseKnowledge').addEventListener('click', function () {
      $('knowledgeMask').classList.add('hidden');
    });
    $('knowledgeMask').addEventListener('click', function (e) {
      if (e.target === this) this.classList.add('hidden');
    });
    $('kwTabs').addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.kw-tab') : null;
      if (!b) return;
      kwKey = b.getAttribute('data-key');
      renderKnowledge();
    });
  }

  /* ================= 事件 ================= */
  function bindEvents() {
    $('region').addEventListener('change', function () {
      fillSchools($('region').value); compute(); save();
    });
    $('school').addEventListener('change', function () { renderSchoolMeta(); compute(); save(); });
    $('refYear').addEventListener('change', function () { renderSchoolMeta(); compute(); save(); });

    $('scoreList').addEventListener('input', function () { compute(); save(); });
    document.querySelectorAll('input[name=mode]').forEach(function (r) {
      r.addEventListener('change', function (e) {
        var filled = window.SUBJECTS.some(function (s) { return $('sc_' + s.key).value.trim() !== ''; });
        if (filled && !confirm('切换满分制后，已填分数会按新的满分口径重新计算（例如 80 分在中考满分制下会变成 80/120）。确定切换吗？')) {
          var other = e.target.value === 'pct' ? 'std' : 'pct';
          document.querySelector('input[name=mode][value=' + other + ']').checked = true;
        }
        compute(); save();
      });
    });
    var eg = $('excludeGeoBio');
    if (eg) eg.addEventListener('change', function () { if (state.last) renderResult(state.last); save(); });

    FIELDS.forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', save);
    });
    ['talkText', 'talkPoints', 'planText'].forEach(function (id) {
      $(id).addEventListener('input', function () { if (state.last) renderResult(state.last); save(); });
    });

    $('btnAnalyze').addEventListener('click', function () {
      var res = compute();
      if (renderResult(res)) {
        refreshSubjectTalks();
        $('resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    $('btnReset').addEventListener('click', function () {
      if (!confirm('确定清空已填内容？')) return;
      window.SUBJECTS.forEach(function (s) { $('sc_' + s.key).value = ''; });
      ['stuName', 'stuSchool', 'stuClass', 'examName', 'talkText', 'talkPoints', 'planText'].forEach(function (id) { $(id).value = ''; });
      $('examDate').value = today();
      state.last = null; state.ai = null; state.aiSig = null; state.stTalk = null;
      $('resultBody').classList.add('hidden');
      $('placeholder').classList.remove('hidden');
      compute(); save();
    });

    var stList = $('subjectTalkList');
    if (stList) {
      stList.addEventListener('input', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('st-text')) autoGrow(e.target);
        stCapture();
        save();
      });
      stList.addEventListener('click', function (e) {
        var b = e.target;
        while (b && b !== stList) {
          if (b.classList && b.classList.contains('st-copy')) { copySubjectTalk(b); return; }
          b = b.parentNode;
        }
      });
    }
    var btnCopyAll = $('btnCopySubjectAll');
    if (btnCopyAll) btnCopyAll.addEventListener('click', copyAllSubjectTalks);

    $('btnGenAI').addEventListener('click', genAI);
    $('btnCopyTalk').addEventListener('click', copyTalkSafe);
    $('btnExportTalkDoc').addEventListener('click', exportDoc);
    $('btnExportTalkXlsx').addEventListener('click', exportXlsx);
    $('btnExportReport').addEventListener('click', exportReport);
    $('btnSaveReport').addEventListener('click', saveReportImage);
    $('btnCloseReport').addEventListener('click', function () {
      $('reportMask').classList.add('hidden');
      $('reportPreview').innerHTML = '';
      state.reportUrl = null;
    });
    $('reportMask').addEventListener('click', function (e) {
      if (e.target === this) { this.classList.add('hidden'); $('reportPreview').innerHTML = ''; state.reportUrl = null; }
    });

    $('btnRegions').addEventListener('click', openRegions);
    $('btnCloseRegions').addEventListener('click', function () { $('regionsMask').classList.add('hidden'); });
    $('regionsMask').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
    $('btnSaveRegions').addEventListener('click', function () {
      saveRegions();
      if (state.last && $('regionsMsg').textContent.charAt(0) === '\u2713') analyze();
    });
    bindRegionEditor();
    bindKnowledge();
    $('btnResetRegions').addEventListener('click', function () {
      if (!confirm('确定恢复成出厂数据？你修改过的分数线会丢失。')) return;
      try { localStorage.removeItem(LS_REGIONS); } catch (e) { }
      location.reload();
    });

    $('btnSettings').addEventListener('click', function () { $('settingsMask').classList.remove('hidden'); });
    window.zkOpenSettings = $('btnSettings');
    $('btnCloseSettings').addEventListener('click', function () { $('settingsMask').classList.add('hidden'); });
    $('settingsMask').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
    $('btnSaveSettings').addEventListener('click', function () {
      zkWriteAI({ apiKey: ($('apiKey').value || '').trim(), model: ($('model').value || 'deepseek-chat') });
      refreshAIMeta(); toast('已保存'); $('settingsMask').classList.add('hidden');
    });
    $('btnTestAI').addEventListener('click', function () {
      var el = $('testResult');
      var key = ($('apiKey').value || '').trim();
      if (!key) { el.textContent = '失败：请先填 API Key'; return; }
      el.textContent = '测试中…';
      zkDeepSeek('请只返回 JSON：{"reply":"连接正常"}', function (err, content) {
        if (err) { el.textContent = '失败：' + (err.message || err); return; }
        try { el.textContent = '连接正常：' + zkParseJSON(content).reply; }
        catch (e3) { el.textContent = '失败：返回内容无法解析'; }
      });
    });
    // 「退出程序」按钮已移除：它原本只是关掉本地 PowerShell 服务，现在是工作台内嵌页面，没有本地服务可关

    function showExited() {
      document.body.innerHTML =
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Microsoft YaHei,sans-serif;padding:80px 24px;text-align:center;color:#22281F">' +
        '<h2 style="margin:0 0 12px">已退出</h2>' +
        '<p style="color:#6E7263">可以关掉这个页面了。下次使用请重新打开本工具。</p>' +
        '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
