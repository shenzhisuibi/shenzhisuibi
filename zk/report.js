/* 学情报告长图：纯 Canvas 手绘，零依赖，不联网 */
window.Report = (function () {

  var W = 900;          // 逻辑宽度
  var PAD = 44;
  var SCALE = 2;        // 2 倍图，发微信更清晰
  var FONT = '"Microsoft YaHei","PingFang SC",sans-serif';

  var C = {
    text: '#22281F', dim: '#6E7263', line: '#DFD9C8', bg: '#FCFBF6',
    brand: '#2E5D4B', ok: '#6E8B4A', warn: '#B8862B', bad: '#A63D2F'
  };
  var LEVEL_COLORS = ['#2E5D4B', '#6E8B4A', '#B8862B', '#C9A227', '#A63D2F'];
  var LEVEL_BG = ['#E9EEDC', '#DCE8E0', '#F7F1DE', '#FAF0E2', '#F3E3DF'];

  function f(size, weight) { return (weight ? weight + ' ' : '') + size + 'px ' + FONT; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var yy = y;
    var line = '';
    text = String(text || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '\n') { if (line) { ctx.fillText(line, x, yy); } line = ''; yy += lineH; continue; }
      var test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = ch; yy += lineH; }
      else { line = test; }
    }
    if (line) { ctx.fillText(line, x, yy); yy += lineH; }
    return yy;
  }

  function build(model) {
    var H_LIMIT = 6000;
    var cv = document.createElement('canvas');
    cv.width = W * SCALE;
    cv.height = H_LIMIT * SCALE;
    var ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H_LIMIT);
    ctx.textBaseline = 'alphabetic';

    var y = 0;
    var contentW = W - PAD * 2;

    /* ---------- 顶部标题 ---------- */
    ctx.fillStyle = C.brand;
    ctx.fillRect(0, 0, W, 6);
    y = 52;
    ctx.fillStyle = C.text;
    ctx.font = f(28, 'bold');
    ctx.fillText('学情分析报告', PAD, y);
    ctx.font = f(12);
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'right';
    ctx.fillText('生成日期：' + (model.genDate || ''), W - PAD, y - 4);
    ctx.textAlign = 'left';
    y += 16;

    if (model.org) {
      ctx.font = f(12);
      ctx.fillStyle = C.dim;
      ctx.fillText(model.org, PAD, y);
      y += 6;
    }

    /* ---------- 学生信息 ---------- */
    y += 22;
    var info = [
      ['学生姓名', model.student.name], ['就读学校', model.student.school],
      ['班级', model.student.cls], ['考试名称', model.student.examName],
      ['考试日期', model.student.examDate], ['带班老师', model.student.teacher],
      ['地区', model.student.region], ['目标高中', model.student.targetName]
    ];
    var boxH = 46 + Math.ceil(info.length / 2) * 26;
    ctx.fillStyle = '#FCFBF6';
    roundRect(ctx, PAD, y, contentW, boxH, 10); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    roundRect(ctx, PAD, y, contentW, boxH, 10); ctx.stroke();

    var colW = contentW / 2;
    info.forEach(function (it, i) {
      var cx = PAD + 18 + (i % 2) * colW;
      var cy = y + 30 + Math.floor(i / 2) * 26;
      ctx.font = f(12); ctx.fillStyle = C.dim;
      ctx.fillText(it[0], cx, cy);
      ctx.font = f(13, 'bold'); ctx.fillStyle = C.text;
      ctx.fillText(String(it[1] || '—'), cx + 62, cy);
    });
    y += boxH + 26;

    /* ---------- 总分概览 ---------- */
    ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
    ctx.fillText('总体情况', PAD, y);
    y += 16;

    var kpis = model.kpis;
    var kbW = (contentW - (kpis.length - 1) * 12) / kpis.length;
    var kbH = 74;
    kpis.forEach(function (k, i) {
      var x = PAD + i * (kbW + 12);
      ctx.fillStyle = k.bg || '#FCFBF6';
      roundRect(ctx, x, y, kbW, kbH, 10); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      roundRect(ctx, x, y, kbW, kbH, 10); ctx.stroke();
      ctx.font = f(12); ctx.fillStyle = C.dim;
      ctx.fillText(k.label, x + 14, y + 26);
      ctx.font = f(22, 'bold'); ctx.fillStyle = k.color || C.text;
      ctx.fillText(k.value, x + 14, y + 56);
    });
    y += kbH + 26;

    /* ---------- 各科得分率柱状图 ---------- */
    ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
    ctx.fillText('各科得分率', PAD, y);
    y += 10;
    y = drawBars(ctx, model.rows, model.targetRate, PAD, y, contentW);
    y += 20;

    /* ---------- 各科明细 ---------- */
    ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
    ctx.fillText('各科明细', PAD, y);
    y += 16;
    ctx.font = f(11.5); ctx.fillStyle = C.dim;
    ctx.fillText('「离目标高中」按该科满分折算：这一科还差多少分才够目标高中的录取水平（不是离满分差多少分）；「分数」栏是得分 / 满分。', PAD, y);
    y += 12;
    y = drawTable(ctx, model.rows, model.targetRate, PAD, y, contentW);
    y += 24;

    /* ---------- 提分优先级 ---------- */
    if (model.priorities && model.priorities.length) {
      ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
      ctx.fillText('提分优先级', PAD, y);
      y += 20;
      var maxNeed = Math.max.apply(null, model.priorities.map(function (p) { return p.need; }));
      model.priorities.forEach(function (p, i) {
        ctx.font = f(13, 'bold'); ctx.fillStyle = C.text;
        ctx.fillText((i + 1) + '. ' + p.name, PAD + 2, y + 12);
        var barX = PAD + 90, barW = contentW - 90 - 190;
        ctx.fillStyle = '#F1EEE4';
        roundRect(ctx, barX, y + 2, barW, 12, 6); ctx.fill();
        ctx.fillStyle = C.brand;
        roundRect(ctx, barX, y + 2, Math.max(6, barW * (p.need / maxNeed)), 12, 6); ctx.fill();
        ctx.font = f(12); ctx.fillStyle = C.dim;
        ctx.fillText('离目标高中还差 ' + p.need.toFixed(0) + ' 分',
          barX + barW + 12, y + 12);
        y += 26;
      });
      y += 12;
    }

    /* ---------- 重点科目分析 ---------- */
    if (model.diagnosis && model.diagnosis.length) {
      ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
      ctx.fillText('重点科目分析', PAD, y);
      y += 22;
      model.diagnosis.forEach(function (d) {
        ctx.font = f(13, 'bold'); ctx.fillStyle = C.brand;
        ctx.fillText(d.name, PAD + 2, y);
        y += 8;
        ctx.font = f(12.5); ctx.fillStyle = '#22281F';
        y = wrapText(ctx, d.text, PAD + 2, y + 12, contentW - 4, 21);
        y += 14;
      });
      y += 6;
    }

    /* ---------- 学习规划 ---------- */
    if (model.includePlan && model.plan) {
      ctx.font = f(15, 'bold'); ctx.fillStyle = C.text;
      ctx.fillText('学习规划', PAD, y);
      y += 22;
      ctx.font = f(12.5); ctx.fillStyle = '#22281F';
      y = wrapText(ctx, model.plan, PAD + 2, y, contentW - 4, 21);
      y += 10;
    }

    /* ---------- 页脚 ---------- */
    y += 12;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    y += 22;
    ctx.font = f(11.5); ctx.fillStyle = C.dim;
    ctx.fillText('本报告由智能分析台根据本次考试成绩自动生成，仅供教学参考。', PAD, y);
    y += 18;
    ctx.fillText('目标得分率按「' + model.student.targetName + '」' + model.refYear + ' 年录取分 ' +
      model.targetScore + ' 分 ÷ ' + model.totalScore + ' 分 折算。', PAD, y);
    y += 34;

    /* ---------- 裁剪 ---------- */
    var out = document.createElement('canvas');
    out.width = W * SCALE;
    out.height = Math.ceil(y * SCALE);
    var octx = out.getContext('2d');
    octx.drawImage(cv, 0, 0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  /* ---------- 柱状图 ---------- */
  function drawBars(ctx, rows, targetRate, x0, y0, w) {
    var plotH = 150;
    var baseY = y0 + 30 + plotH;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    [0, .25, .5, .75, 1].forEach(function (r) {
      var yy = baseY - plotH * r;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); ctx.stroke();
      ctx.font = f(10.5); ctx.fillStyle = C.dim; ctx.textAlign = 'right';
      ctx.fillText((r * 100) + '%', x0 - 6, yy + 4);
      ctx.textAlign = 'left';
    });

    var n = rows.length;
    var slot = w / n;
    var barW = Math.min(38, slot * 0.5);
    rows.forEach(function (d, i) {
      var cx = x0 + slot * i + slot / 2;
      var bx = cx - barW / 2;
      var h = Math.max(2, plotH * d.rate);
      ctx.fillStyle = d.rate < targetRate ? '#C9A227' : C.brand;
      roundRect(ctx, bx, baseY - h, barW, h, 3); ctx.fill();
      ctx.font = f(10.5); ctx.fillStyle = '#6E7263'; ctx.textAlign = 'center';
      ctx.fillText((d.rate * 100).toFixed(0), cx, baseY - h - 5);
      ctx.font = f(12); ctx.fillStyle = '#6E7263';
      ctx.fillText(d.name, cx, baseY + 18);
      ctx.textAlign = 'left';
    });

    var ty = baseY - plotH * targetRate;
    ctx.strokeStyle = C.bad; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x0 + w, ty); ctx.stroke();
    ctx.setLineDash([]);
    var tLabel = '目标得分率 ' + (targetRate * 100).toFixed(1) + '%';
    ctx.font = f(11);
    var tW = ctx.measureText(tLabel).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, x0 + w - tW, ty - 19, tW, 16, 3); ctx.fill();
    ctx.fillStyle = C.bad; ctx.textAlign = 'right';
    ctx.fillText(tLabel, x0 + w, ty - 6);
    ctx.textAlign = 'left';

    return baseY + 30;
  }

  /* ---------- 明细表 ---------- */
  function drawTable(ctx, rows, targetRate, x0, y0, w) {
    var cols = [0.16, 0.16, 0.18, 0.20, 0.30];
    var cw = cols.map(function (c) { return c * w; });
    var y = y0;
    var rowH = 30;

    ctx.fillStyle = '#F7F5EE';
    ctx.fillRect(x0, y, w, rowH);
    var heads = ['科目', '分数', '得分率', '结果', '离目标高中'];
    ctx.font = f(12, 'bold'); ctx.fillStyle = '#6E7263';
    var acc = x0;
    heads.forEach(function (h, i) {
      ctx.fillText(h, acc + 10, y + 20);
      acc += cw[i];
    });
    y += rowH;

    rows.forEach(function (d, idx) {
      if (idx % 2 === 1) { ctx.fillStyle = '#FCFBF6'; ctx.fillRect(x0, y, w, rowH); }
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y + rowH); ctx.lineTo(x0 + w, y + rowH); ctx.stroke();

      var cx = x0;
      ctx.font = f(13, 'bold'); ctx.fillStyle = C.text;
      ctx.fillText(d.name, cx + 10, y + 20);
      cx += cw[0];

      ctx.font = f(13); ctx.fillStyle = C.text;
      ctx.fillText(d.score + (d.max ? ' / ' + d.max : ''), cx + 10, y + 20);
      cx += cw[1];

      ctx.fillText((d.rate * 100).toFixed(1) + '%', cx + 10, y + 20);
      cx += cw[2];

      var lvIdx = d.levelIdx;
      var tw = 62, th = 20, tx = cx + 10, ty = y + 6;
      ctx.fillStyle = LEVEL_BG[lvIdx];
      roundRect(ctx, tx, ty, tw, th, 10); ctx.fill();
      ctx.font = f(12); ctx.fillStyle = LEVEL_COLORS[lvIdx]; ctx.textAlign = 'center';
      ctx.fillText(d.level, tx + tw / 2, ty + 14);
      ctx.textAlign = 'left';
      cx += cw[3];

      var diff = d.rate - targetRate;
      var need = Math.max(0, (targetRate - d.rate) * d.max);
      ctx.font = f(12.5);
      ctx.fillStyle = diff >= 0 ? C.ok : (diff >= -0.05 ? C.warn : C.bad);
      ctx.fillText(diff >= 0 ? '已达标'
        : '还差 ' + need.toFixed(0) + ' 分（目标 ' + Math.round(targetRate * d.max) + ' 分）', cx + 10, y + 20);

      y += rowH;
    });

    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y); ctx.lineTo(x0 + w, y); ctx.lineTo(x0 + w, y0); ctx.stroke();
    return y;
  }

  return { build: build };
})();
