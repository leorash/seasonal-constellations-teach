/* ============================================================
   四季星空认星座 · 星图引擎
   复刻 AstroGames/Matplotlib 的立体投影、极投影、星点大小、B−V 星色、
   星座连线、经纬网与标签；并新增“点击命中亮星”用于认星教学。
   依赖 window.ASTRO_DATA
   ============================================================ */
(function () {
  "use strict";

  const D2R = Math.PI / 180;
  const ANCHORS = [
    [-0.4, [155, 176, 255]], [0.0, [202, 215, 255]], [0.4, [248, 247, 255]],
    [0.8, [255, 244, 234]], [1.2, [255, 210, 161]], [1.6, [255, 177, 109]],
    [2.0, [255, 140, 90]]
  ];
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function bvToColor(bv) {
    if (bv == null || isNaN(bv)) return "#f4f7ff";
    if (bv <= ANCHORS[0][0]) return rgb(ANCHORS[0][1]);
    if (bv >= ANCHORS[ANCHORS.length - 1][0]) return rgb(ANCHORS[ANCHORS.length - 1][1]);
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      const [b0, c0] = ANCHORS[i], [b1, c1] = ANCHORS[i + 1];
      if (bv >= b0 && bv <= b1) {
        const t = (bv - b0) / (b1 - b0);
        return rgb(c0.map((v, k) => Math.round(v + (c1[k] - v) * t)));
      }
    }
    return "#f4f7ff";
  }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  // Matplotlib 点面积(点²) -> 半径px
  function starArea(mag) { return 13 * Math.max(0.3, 5.5 - mag) ** 1.68; }

  function StarChart(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.pts = {}; // hip -> {x,y,r,mag,star}
  }

  StarChart.prototype.project = function (region, ra, dec, ra0, dec0) {
    if (region.polar) {
      const radius = Math.max(0, 90 - dec);
      const theta = (((ra - ra0 + 540) % 360) - 180) * D2R;
      return [-radius * Math.sin(theta), radius * Math.cos(theta)];
    }
    const ra1 = ra * D2R, d1 = dec * D2R, ra0r = ra0 * D2R, d0 = dec0 * D2R;
    const cosC = clamp(Math.sin(d0) * Math.sin(d1) + Math.cos(d0) * Math.cos(d1) * Math.cos(ra1 - ra0r), -0.999999, 0.999999);
    const k = 2 / (1 + cosC);
    const x = k * Math.cos(d1) * Math.sin(ra1 - ra0r);
    const y = k * (Math.cos(d0) * Math.sin(d1) - Math.sin(d0) * Math.cos(d1) * Math.cos(ra1 - ra0r));
    return [-x, y];
  };

  // 计算投影中心（单位向量平均）
  StarChart.prototype.regionCenter = function (region) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const hip of region.stars) {
      const st = window.ASTRO_DATA.stars[hip];
      if (!st) continue;
      const [ra, dec, mag] = st;
      if (mag > 6.5) continue;
      const rar = ra * D2R, dr = dec * D2R;
      sx += Math.cos(dr) * Math.cos(rar); sy += Math.cos(dr) * Math.sin(rar); sz += Math.sin(dr); n++;
    }
    if (!n) return { ra0: 0, dec0: 0 };
    sx /= n; sy /= n; sz /= n;
    return { ra0: Math.atan2(sy, sx) / D2R, dec0: Math.atan2(sz, Math.hypot(sx, sy)) / D2R };
  };

  // cfg:
  //  regionKey, showLines, showLabels, labelHips(额外标签),
  //  markHips(编号/重点标记), highlight:{hip,state}, revealHip(揭示正确答案),
  //  dimNames(隐藏这些星的标签，例如亮星定位时)
  StarChart.prototype.render = function (cfg) {
    const canvas = this.canvas, ctx = this.ctx;
    const region = window.ASTRO_DATA.regions[cfg.regionKey];
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#070d1d";
    ctx.fillRect(0, 0, W, H);

    const { ra0, dec0 } = this.regionCenter(region);
    const K = W / 446.4; // 与 Matplotlib 6.2in 对齐
    const rScale = Math.min(W, H) / 2 / 2.6;
    const cx = W / 2, cy = H / 2;

    // 投影并确定范围
    const proj = {};
    for (const hip of region.stars) {
      const st = window.ASTRO_DATA.stars[hip];
      if (!st) continue;
      proj[hip] = this.project(region, st[0], st[1], ra0, dec0);
    }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const hip in proj) {
      const st = window.ASTRO_DATA.stars[hip];
      if (st[2] > 6.5) continue;
      const [x, y] = proj[hip];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pw = maxX - minX || 1, ph = maxY - minY || 1;
    const scale = Math.min((W * 0.92) / pw, (H * 0.92) / ph);
    const toXY = (p) => [cx + (p[0] - (minX + maxX) / 2) * scale,
                         cy - (p[1] - (minY + maxY) / 2) * scale];
    void rScale;

    const P = (hip) => {
      const s = proj[hip];
      const [x, y] = toXY(s);
      const st = window.ASTRO_DATA.stars[hip];
      const rad = Math.sqrt(starArea(st[2])) / 2 * K;
      return { x, y, r: rad, mag: st[2], bv: st[3] };
    };

    // 缓存命中点（命名星 + 全部有投影的星）
    this.pts = {};
    this.namedHips = [];
    for (const n of region.named) {
      if (proj[n.hip]) { this.pts[n.hip] = { ...P(n.hip), name: n.cn }; this.namedHips.push(n.hip); }
    }

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(200,214,255,0.55)";
    ctx.font = (11 * K) + "px sans-serif";
    ctx.lineWidth = 1;
    for (let ra = 0; ra < 360; ra += 10) {
      ctx.beginPath(); let started = false;
      for (let d = region.b[2]; d <= region.b[3]; d += 1.5) {
        const p = this.project(region, ra, d, ra0, dec0);
        const [x, y] = toXY(p);
        if (x < -60 || x > W + 60 || y < -60 || y > H + 60) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let d = -80; d <= 80; d += 10) {
      ctx.beginPath(); let started = false;
      for (let ra = 0; ra <= 360; ra += 2) {
        const p = this.project(region, ra, d, ra0, dec0);
        const [x, y] = toXY(p);
        if (x < -60 || x > W + 60 || y < -60 || y > H + 60) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 度数标签
    ctx.textAlign = "center";
    for (let ra = ((Math.ceil(region.b[0] / 10)) * 10); ra < region.b[1]; ra += 10) {
      const p = this.project(region, ra, region.b[3], ra0, dec0);
      const [x, y] = toXY(p);
      if (x > 30 && x < W - 30) ctx.fillText(ra.toFixed(1) + "°", x, y - 4);
    }
    for (const dec of [region.b[2], region.b[3]]) {
      const mid = (region.b[0] + region.b[1]) / 2;
      const p = this.project(region, mid, dec, ra0, dec0);
      const [x, y] = toXY(p);
      ctx.fillText(dec.toFixed(1) + "°", 18, y + 3);
    }

    // 亮星光晕
    for (const hip of region.stars) {
      const st = window.ASTRO_DATA.stars[hip];
      if (!st || st[2] > 1.5) continue;
      const p = P(hip);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      g.addColorStop(0, "rgba(255,250,230,0.16)");
      g.addColorStop(1, "rgba(255,250,230,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 7); ctx.fill();
    }

    // 星座连线
    if (cfg.showLines) {
      ctx.strokeStyle = "rgba(143,182,255,0.4)";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([]);
      for (const [a, b] of region.l) {
        if (!proj[a] || !proj[b]) continue;
        const pa = toXY(proj[a]), pb = toXY(proj[b]);
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
    }

    // 星点
    for (const hip of region.stars) {
      const st = window.ASTRO_DATA.stars[hip];
      if (!st) continue;
      const p = P(hip);
      ctx.fillStyle = bvToColor(st[3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.5; ctx.stroke();
    }

    // 重点星标记（学习模式：金色细环）
    if (cfg.markHips) {
      for (const hip of cfg.markHips) {
        if (!proj[hip]) continue;
        const p = P(hip);
        ctx.strokeStyle = "rgba(255,211,110,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7, 0, 7); ctx.stroke();
      }
    }

    // 标签
    const dimNames = new Set(cfg.dimNames || []);
    const labelHips = new Set(this.namedHips);
    if (cfg.labelHips) cfg.labelHips.forEach(h => labelHips.add(h));
    if (cfg.showLabels) {
      ctx.font = (12 * K) + "px sans-serif";
      for (const hip of labelHips) {
        const n = region.named.find(x => x.hip === hip);
        if (!n || dimNames.has(hip)) continue;
        const p = P(hip);
        ctx.fillStyle = "#f4f7ff";
        ctx.textAlign = "left";
        ctx.fillText(n.cn, p.x + p.r + 4, p.y + 4);
      }
    }

    // 高亮（点击后反馈 / 揭示）
    const drawHalo = (hip, color, width) => {
      if (!proj[hip]) return;
      const p = P(hip);
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, 7); ctx.stroke();
    };
    if (cfg.highlight) {
      const { hip, state } = cfg.highlight;
      if (state === "correct") drawHalo(hip, "#4ade80", 3);
      else if (state === "wrong") drawHalo(hip, "#f87171", 3);
    }
    if (cfg.revealHip && cfg.revealHip !== (cfg.highlight && cfg.highlight.hip)) {
      drawHalo(cfg.revealHip, "#ffd36e", 2.5);
    }

    this._P = P;
    this._cfg = cfg;
  };

  // 命中检测：返回距离最近的【命名星】（在 tol 内），否则 null
  StarChart.prototype.pick = function (x, y) {
    let best = null, bestD = Infinity;
    for (const hip of this.namedHips) {
      const p = this.pts[hip];
      if (!p) continue;
      const tol = Math.max(p.r + 7, 15);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= tol && d < bestD) { bestD = d; best = { hip, name: p.name, x: p.x, y: p.y }; }
    }
    return best;
  };

  // 某 hip 的屏幕坐标（用于外部标注/滚动）
  StarChart.prototype.screenOf = function (hip) {
    if (!this._P || !window.ASTRO_DATA.regions[this._cfg.regionKey].stars.includes(hip)) return null;
    try { const p = this._P(hip); return { x: p.x, y: p.y }; } catch (e) { return null; }
  };

  window.StarChart = StarChart;
})();
