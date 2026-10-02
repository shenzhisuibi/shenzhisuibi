/* 原生 SVG 图表：柱状图 + 雷达图。零依赖，不联网。 */
window.Charts = (function () {

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function pct(v) { return (v * 100).toFixed(1) + "%"; }

  /* ---------------- 柱状图：各科得分率 ---------------- */
  function bar(el, data, targetRate) {
    var W = 640, H = 268;
    var padL = 52, padR = 16, padT = 26, padB = 46;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxRate = 1.0;

    var y = function (r) { return padT + plotH * (1 - r / maxRate); };

    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">');

    // 网格 + Y 轴刻度
    [0, .25, .5, .75, 1].forEach(function (r) {
      var yy = y(r);
      s.push('<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy +
             '" stroke="#e8edf5" stroke-width="1"/>');
      s.push('<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" font-size="11" fill="#9aa4b5" text-anchor="end">' +
             (r * 100) + '%</text>');
    });

    var n = data.length;
    var slot = plotW / n;
    var barW = Math.min(34, slot * 0.52);

    data.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var x0 = cx - barW / 2;
      var h = Math.max(1, plotH * (d.rate / maxRate));
      var y0 = padT + plotH - h;

      // 目标线以下/以上换色
      var below = d.rate < targetRate;
      var grad = below ? '#f0a03c' : '#2f6feb';
      s.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + barW + '" height="' + h +
             '" rx="3" fill="' + grad + '" opacity="0.92"/>');
      s.push('<text x="' + cx + '" y="' + (y0 - 6) + '" font-size="11" fill="#6b7280" text-anchor="middle">' +
             (d.rate * 100).toFixed(0) + '</text>');
      s.push('<text x="' + cx + '" y="' + (padT + plotH + 18) + '" font-size="12" fill="#4b5563" text-anchor="middle">' +
             esc(d.name) + '</text>');
    });

    // 目标得分率参考线
    var ty = y(targetRate);
    s.push('<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty +
           '" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 4"/>');
    var tLabel = '目标得分率 ' + pct(targetRate);
    var tW = tLabel.length * 6.2 + 10;
    s.push('<rect x="' + (W - padR - tW) + '" y="' + (ty - 19) + '" width="' + tW + '" height="16" rx="3" fill="#ffffff" opacity="0.88"/>');
    s.push('<text x="' + (W - padR) + '" y="' + (ty - 7) + '" font-size="11" fill="#dc2626" text-anchor="end">' + tLabel + '</text>');

    // 图例
    s.push('<rect x="' + padL + '" y="6" width="9" height="9" rx="2" fill="#2f6feb"/>');
    s.push('<text x="' + (padL + 14) + '" y="14" font-size="11" fill="#6b7280">达标</text>');
    s.push('<rect x="' + (padL + 58) + '" y="6" width="9" height="9" rx="2" fill="#f0a03c"/>');
    s.push('<text x="' + (padL + 72) + '" y="14" font-size="11" fill="#6b7280">未达标</text>');

    s.push('</svg>');
    el.innerHTML = s.join('');
  }

  /* ---------------- 雷达图：学科均衡度 ---------------- */
  function radar(el, data, targetRate) {
    var W = 420, H = 330;
    var cx = W / 2, cy = H / 2 + 6, R = 96;
    var n = data.length;
    var maxRate = 1.0;

    function pt(i, r) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      var rr = R * (r / maxRate);
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    }

    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">');

    // 同心网格
    [.25, .5, .75, 1].forEach(function (ring) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, ring); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); }
      s.push('<polygon points="' + pts.join(' ') + '" fill="none" stroke="#e8edf5" stroke-width="1"/>');
    });
    // 轴线
    for (var i = 0; i < n; i++) {
      var p = pt(i, maxRate);
      s.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) +
             '" stroke="#eef2f8" stroke-width="1"/>');
    }

    // 目标得分率多边形
    var tp = [];
    for (var j = 0; j < n; j++) { var q = pt(j, targetRate); tp.push(q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
    s.push('<polygon points="' + tp.join(' ') + '" fill="none" stroke="#dc2626" stroke-width="1.2" ' +
           'stroke-dasharray="5 4"/>');

    // 学生多边形
    var sp = [];
    for (var k = 0; k < n; k++) { var u = pt(k, data[k].rate); sp.push(u[0].toFixed(1) + ',' + u[1].toFixed(1)); }
    s.push('<polygon points="' + sp.join(' ') + '" fill="rgba(47,111,235,.20)" stroke="#2f6feb" stroke-width="2"/>');
    for (var m = 0; m < n; m++) { var v = pt(m, data[m].rate); s.push('<circle cx="' + v[0].toFixed(1) + '" cy="' + v[1].toFixed(1) + '" r="2.6" fill="#2f6feb"/>'); }

    // 科目标签
    for (var t = 0; t < n; t++) {
      var a2 = -Math.PI / 2 + t * 2 * Math.PI / n;
      var lx = cx + (R + 20) * Math.cos(a2);
      var ly = cy + (R + 20) * Math.sin(a2);
      var anchor = 'middle';
      if (Math.cos(a2) > 0.3) anchor = 'start';
      else if (Math.cos(a2) < -0.3) anchor = 'end';
      s.push('<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" font-size="11.5" fill="#4b5563" ' +
             'text-anchor="' + anchor + '">' + esc(data[t].name) + ' ' + (data[t].rate * 100).toFixed(0) + '</text>');
    }

    s.push('<text x="' + (W / 2) + '" y="' + 16 + '" font-size="11" fill="#9aa4b5" text-anchor="middle">红线 = 目标得分率，蓝面 = 本人</text>');
    s.push('</svg>');
    el.innerHTML = s.join('');
  }

  return { bar: bar, radar: radar, esc: esc, pct: pct };
})();
