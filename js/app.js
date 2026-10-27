/* ============================================================
   四季星空认星座（教学增强版）· 应用流程
   首页(选模块) → 季节页 → 学习页(口诀+标注星图+找星+亮星颜色) → 测验
   测验两级：①看图选星座 ②在图上点击指定亮星；支持错题重练
   新增：闪卡速记、观星小课堂、掌握度(localStorage)、混合随机抽查
   ============================================================ */
(function () {
  "use strict";
  const D = window.ASTRO_DATA;
  const T = window.TEACHING;
  const SEASON_META = {
    polar: { icon: "✪", color: "#8fb6ff" },
    spring: { icon: "🌱", color: "#7ee0a0" },
    summer: { icon: "☀", color: "#ffd36e" },
    autumn: { icon: "🍂", color: "#e8a06a" },
    winter: { icon: "❄", color: "#9ad8ff" },
    southern: { icon: "🧭", color: "#c79bff" }
  };
  const ALL_SEASONS = ["polar", "spring", "summer", "autumn", "winter", "southern"];
  const $ = (id) => document.getElementById(id);

  /* ---------- 掌握度存储（localStorage） ---------- */
  const STORE_KEY = "constellation_teach_progress_v1";
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { learned: {}, stat: {} }; }
    catch (e) { return { learned: {}, stat: {} }; }
  }
  const store = loadStore();
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }
  function markLearned(key) { store.learned[key] = 1; saveStore(); }
  function recordResult(key, kind, correct) {
    const s = store.stat[key] || (store.stat[key] = { nameOk: 0, nameTotal: 0, starOk: 0, starTotal: 0 });
    if (kind === "name") { s.nameTotal++; if (correct) s.nameOk++; s.lastName = correct; }
    else { s.starTotal++; if (correct) s.starOk++; s.lastStar = correct; }
    saveStore();
  }
  // 掌握度：new 未学习 / learned 已学习 / partial 需巩固 / master 已掌握
  function masteryOf(key) {
    const s = store.stat[key];
    if (!s) return store.learned[key] ? { level: "learned", label: "已学习", cls: "ms-learned" }
                                      : { level: "new", label: "未学习", cls: "ms-new" };
    const nameDone = s.lastName !== undefined, starDone = s.lastStar !== undefined;
    if (nameDone && starDone && s.lastName && s.lastStar)
      return { level: "master", label: "已掌握", cls: "ms-master" };
    return { level: "partial", label: "需巩固", cls: "ms-partial" };
  }

  /* ---------- 星等 / 颜色工具 ---------- */
  // 该星座“必认亮星”：mag<=3.0 取最亮的前 3 颗，否则取最亮 1 颗
  function keyStars(key) {
    const r = D.regions[key];
    let named = r.named.filter(n => n.cn);
    // 四季板块面向北京（约 40°N）：赤纬 < -45° 的星最高高度不足 5°、基本不可见，
    // 不计入必认亮星；南天板块则保留全部（含水委一、老人星等）。
    if (seasonOf[key] !== "southern") {
      const visible = named.filter(n => n.dec > -45);
      if (visible.length) named = visible;
    }
    named = named.slice().sort((a, b) => a.mag - b.mag);
    const bright = named.filter(n => n.mag <= 3.0);
    const list = bright.length ? bright : named.slice(0, 1);
    return list.slice(0, 3);
  }
  // 由 B−V 色指数给出口语化颜色名与色点（颜色=表面温度）
  function colorName(bv) {
    if (bv == null || isNaN(bv)) return { name: "白色", dot: "#f4f7ff" };
    if (bv < 0.0) return { name: "蓝白色", dot: "#c6d4ff" };
    if (bv < 0.3) return { name: "蓝白色", dot: "#d8e2ff" };
    if (bv < 0.6) return { name: "白色", dot: "#f4f7ff" };
    if (bv < 0.9) return { name: "黄白色", dot: "#fff2d8" };
    if (bv < 1.2) return { name: "淡黄色", dot: "#ffe6b0" };
    if (bv < 1.6) return { name: "橙色", dot: "#ffc070" };
    return { name: "红橙色", dot: "#ff9a5a" };
  }
  function bvOf(hip) { const s = D.stars[hip] || D.stars[String(hip)]; return s ? s[3] : null; }
  function knowledgeOf(cn) { return (D.knowledge && D.knowledge[cn]) ? D.knowledge[cn] : null; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const seasonOf = {};
  ALL_SEASONS.forEach(s => T.seasonOrder[s].forEach(k => { seasonOf[k] = s; }));

  /* ---------- 混合随机抽查：题目池（四季+拱极，不含南天）与 21 颗一等亮星 ---------- */
  const MIX_SEASONS = ["polar", "spring", "summer", "autumn", "winter"];
  const MIX_POOL = [];
  MIX_SEASONS.forEach(s => T.seasonOrder[s].forEach(k => MIX_POOL.push(k)));
  const MIX_QCOUNT = 10;
  const MIX_TOP21 = new Set();
  MIX_POOL.forEach(k => {
    if (D.regions[k].named.some(n => n.cn && n.mag <= 1.4)) MIX_TOP21.add(k);
  });

  let lastHl = null;
  const state = {
    view: "home",
    season: null,
    learnIndex: 0,
    charts: {},
    quiz: null,
    mix: null,
    mixOpts: null,
    flash: null
  };

  /* ---------------- 视图切换 ---------------- */
  function showView(name) {
    state.view = name;
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $("view-" + name).classList.remove("hidden");
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
  function drawChart(which, canvasId, cfg, tries) {
    tries = tries || 0;
    const cv = $(canvasId);
    if (!cv || cv.clientWidth === 0) {
      if (tries < 40) setTimeout(() => drawChart(which, canvasId, cfg, tries + 1), 50);
      return;
    }
    const c = state.charts[which] || (state.charts[which] = new StarChart(cv));
    c.render(cfg);
  }
  function setCrumb(text) { $("crumb").textContent = text; }

  /* ---------------- 首页 ---------------- */
  function renderProgressOverview() {
    const keys = Object.keys(D.regions);
    let learned = 0, master = 0;
    keys.forEach(k => {
      if (store.learned[k]) learned++;
      if (masteryOf(k).level === "master") master++;
    });
    const pct = Math.round(learned / keys.length * 100);
    $("progressOverview").innerHTML =
      '<div class="po-line"><span>学习进度：<b>' + learned + ' / ' + keys.length + '</b> 个星座</span>' +
      '<span class="po-master">已掌握 <b>' + master + ' / ' + keys.length + '</b></span></div>' +
      '<div class="po-bar"><span style="width:' + pct + '%"></span></div>';
  }
  function renderHome() {
    renderProgressOverview();
    const grid = $("seasonGrid");
    grid.innerHTML = "";
    ALL_SEASONS.forEach(s => {
      const meta = T.seasons[s], cm = SEASON_META[s];
      const count = T.seasonOrder[s].length;
      const card = document.createElement("button");
      card.className = "season-card";
      card.style.borderColor = cm.color + "55";
      card.innerHTML =
        '<div class="season-icon" style="color:' + cm.color + '">' + cm.icon + "</div>" +
        '<div class="season-card-body"><h3>' + meta.name + "</h3>" +
        '<div class="season-card-months">' + meta.months + " · " + count + ' 个星座</div>' +
        '<p>' + meta.intro + "</p></div>";
      card.onclick = () => openSeason(s);
      grid.appendChild(card);
    });
  }

  /* ---------------- 季节页 ---------------- */
  function openSeason(s) {
    state.season = s;
    state.learnIndex = 0;
    const meta = T.seasons[s], cm = SEASON_META[s];
    $("seasonTitle").textContent = cm.icon + " " + meta.name;
    $("seasonMonths").textContent = meta.months;
    $("seasonIntro").textContent = meta.intro;
    $("seasonCount").textContent = "本模块共 " + T.seasonOrder[s].length + " 个星座";
    $("seasonLandmarks").innerHTML = meta.landmarks.map(l =>
      '<div class="landmark">' + l + "</div>").join("");
    const grid = $("constellationGrid");
    grid.innerHTML = "";
    T.seasonOrder[s].forEach((key, i) => {
      const r = D.regions[key], tc = T.constellations[key];
      const ks = keyStars(key);
      const ms = masteryOf(key);
      const card = document.createElement("button");
      card.className = "constellation-card";
      card.innerHTML =
        '<div class="cc-top"><span class="cc-name">' + r.n + " <small>" + r.ne + "</small></span>" +
        '<span class="cc-ms ' + ms.cls + '">' + ms.label + "</span></div>" +
        '<div class="cc-shape">' + (tc.shape || "") + "</div>" +
        '<div class="cc-star">最亮：' + (ks[0] ? ks[0].cn : "—") +
          (ks[0] ? "（" + ks[0].mag.toFixed(2) + " 等）" : "") + "</div>";
      card.onclick = () => openLearn(s, i);
      grid.appendChild(card);
    });
    setCrumb(meta.name);
    showView("season");
  }

  /* ---------------- 学习页 ---------------- */
  function openLearn(s, idx) {
    state.season = s;
    state.learnIndex = idx;
    setCrumb(T.seasons[s].name + " / 学习");
    showView("learn");
    renderLearn();
  }
  function renderLearn() {
    const s = state.season;
    const list = T.seasonOrder[s];
    const key = list[state.learnIndex];
    const r = D.regions[key], tc = T.constellations[key];
    const ks = keyStars(key);
    markLearned(key);
    // 口诀
    $("learnMnemonic").textContent = tc.mnemonic || "—";
    // 掌握度
    const ms = masteryOf(key);
    const mp = $("learnMastery");
    mp.textContent = ms.label; mp.className = "mastery-pill " + ms.cls;
    $("learnSeasonBadge").textContent = T.seasons[s].name;
    $("learnName").textContent = r.n;
    $("learnEn").textContent = r.ne + " · " + T.seasons[s].months + " 代表星座";
    $("learnShape").textContent = tc.shape || "—";
    $("learnTip").textContent = tc.tip || "—";
    // 怎么找
    const findEl = document.querySelector("#view-learn .find-li");
    if (tc.find) { findEl.style.display = ""; $("learnFind").textContent = tc.find; }
    else findEl.style.display = "none";
    if (tc.note) { $("learnNoteLi").style.display = ""; $("learnNote").textContent = tc.note; }
    else $("learnNoteLi").style.display = "none";
    if (s === "southern") {
      $("learnBest").textContent = "位于南天，北京（约 40°N）终年不升或仅极低擦过地平线；需在我国南方（海南、华南、云南等低纬度地区）或南半球，选光害小、南方地平线开阔处观测。";
    } else {
      $("learnBest").textContent = T.seasons[s].months + "前后，晚 21 点前后在南（或对应方位）天最高，晴朗无光害处观测最佳。";
    }
    $("learnProgress").textContent = (state.learnIndex + 1) + " / " + list.length;
    $("learnPrev").disabled = state.learnIndex === 0;
    $("learnNext").disabled = state.learnIndex === list.length - 1;

    // 亮星卡片（含颜色点）
    const kc = $("keyStarCards");
    kc.innerHTML = "";
    ks.forEach((n) => {
      const cn = colorName(bvOf(n.hip));
      const b = document.createElement("button");
      b.className = "key-star-chip";
      b.innerHTML =
        '<span class="ksc-dot" style="background:' + cn.dot + '"></span>' +
        n.cn + ' <small>' + n.mag.toFixed(2) + " 等 · " + cn.name + "</small>";
      b.onclick = () => selectKeyStar(key, n, b);
      kc.appendChild(b);
    });
    $("starKnowledge").innerHTML = '<p class="muted small">点击上方亮星卡片，查看该星介绍与颜色。</p>';

    drawChart("learn", "learnChart", {
      regionKey: key,
      showLines: true,
      showLabels: true,
      markHips: ks.map(n => n.hip)
    });
    window.scrollTo(0, 0);
  }
  function selectKeyStar(key, n, btn) {
    document.querySelectorAll(".key-star-chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const c = state.charts.learn;
    const know = knowledgeOf(n.cn);
    const cn = colorName(bvOf(n.hip));
    const tempHint =
      cn.name.indexOf("蓝") >= 0 ? "蓝白色星表面温度很高，是年轻而炽热的恒星。" :
      cn.name.indexOf("橙") >= 0 || cn.name.indexOf("红") >= 0 ? "红橙色多为体积膨胀、已到晚年的巨星。" :
      "黄白色星的表面温度与太阳相近。";
    const fallback = "“" + n.cn + "”（" + (n.en || "") + "）是" + D.regions[key].n +
      "最亮的恒星之一，视星等约 " + n.mag.toFixed(2) + "，呈" + cn.name + "。" + tempHint;
    $("starKnowledge").innerHTML =
      '<div class="sk-head"><b>' + n.cn + "</b> <small>" + (n.en || "") + " · " +
      n.mag.toFixed(2) + " 等 · " + cn.name + "</small></div>" +
      "<p>" + (know || fallback) + "</p>";
    c.render({
      regionKey: key, showLines: true, showLabels: true,
      markHips: keyStars(key).map(x => x.hip),
      highlight: { hip: n.hip, state: "correct" }
    });
  }

  /* ---------------- 测验 ---------------- */
  function startQuiz(s, customOrder, reviewMode) {
    const order = customOrder && customOrder.length ? customOrder : shuffle(T.seasonOrder[s]);
    state.quiz = {
      season: s,
      order: order,
      idx: 0,
      stage: "name",
      score: 0,
      total: 0,
      lines: true,
      answers: [],
      nameAnswered: false,
      starAnswered: false,
      review: !!reviewMode
    };
    lastHl = null;
    $("stageResult").classList.add("hidden");
    $("quizScore").textContent = "0";
    updateQuizLinesBtn();
    setCrumb(T.seasons[s].name + (reviewMode ? " / 错题重练" : " / 测验"));
    showView("quiz");
    renderQuiz();
  }
  function currentQuiz() { return state.quiz; }
  function updateProgress() {
    const q = currentQuiz();
    const total = q.order.length * 2;
    const done = q.idx * 2 + (q.stage === "star" ? 1 : 0);
    $("quizProgressFill").style.width = (done / total * 100) + "%";
    $("quizProgressText").textContent =
      "第 " + (q.idx + 1) + " / " + q.order.length + " 个星座 · 第 " + (q.stage === "name" ? "1" : "2") + " 关";
  }
  function updateQuizLinesBtn() {
    $("quizLinesBtn").textContent = currentQuiz().lines ? "隐藏星座连线" : "显示星座连线";
  }
  function renderQuiz() {
    const q = currentQuiz();
    updateProgress();
    $("quizFeedback").classList.add("hidden");
    $("quizNextWrap").classList.add("hidden");
    if (q.idx >= q.order.length) return showResult();
    const key = q.order[q.idx];
    if (q.stage === "name") renderStageName(key);
    else renderStageStar(key);
  }
  function renderStageName(key) {
    const q = currentQuiz();
    q.nameAnswered = false;
    $("stageName").classList.remove("hidden");
    $("stageStar").classList.add("hidden");
    // 错题重练时干扰项仍从本季取
    const others = T.seasonOrder[q.season].filter(k => k !== key);
    const opts = shuffle([key].concat(shuffle(others).slice(0, 3)));
    const wrap = $("nameOptions");
    wrap.innerHTML = "";
    opts.forEach(k => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = D.regions[k].n;
      b.onclick = () => answerName(key, k, b);
      wrap.appendChild(b);
    });
    drawChart("name", "nameChart", { regionKey: key, showLines: q.lines, showLabels: false });
  }
  function answerName(key, chosen, btn) {
    const q = currentQuiz();
    if (q.nameAnswered) return;
    q.nameAnswered = true;
    q.total++;
    const correct = chosen === key;
    if (correct) q.score++;
    document.querySelectorAll("#nameOptions .option").forEach(b => {
      b.disabled = true;
      if (b.textContent === D.regions[key].n) b.classList.add("correct");
    });
    if (!correct) btn.classList.add("wrong");
    recordAnswerRow(key, "name", correct);
    recordResult(key, "name", correct);
    feedback(correct,
      "正确！这是「" + D.regions[key].n + "」。",
      "这是「" + D.regions[key].n + "」，不是「" + D.regions[chosen].n + "」。",
      T.constellations[key].mnemonic || T.constellations[key].tip);
    $("quizScore").textContent = q.score;
  }
  function renderStageStar(key) {
    const q = currentQuiz();
    q.starAnswered = false;
    $("stageName").classList.add("hidden");
    $("stageStar").classList.remove("hidden");
    const target = keyStars(key)[0];
    q.targetHip = target.hip;
    q.targetName = target.cn;
    $("targetStarName").textContent = target.cn + "（" + (target.en || "") + "）";
    $("crosshair").style.display = "none";
    drawChart("star", "starChart", { regionKey: key, showLines: q.lines, showLabels: false });
  }
  function onStarClick(e) {
    const q = currentQuiz();
    if (!q || q.stage !== "star" || q.starAnswered) return;
    const canvas = $("starChart");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const c = state.charts.star;
    const hit = c.pick(x, y);
    const ch = $("crosshair");
    if (!hit) {
      ch.style.display = "block";
      ch.style.left = x + "px"; ch.style.top = y + "px";
      flash("请点击图中一颗有名字的亮星。");
      return;
    }
    ch.style.display = "none";
    const key = q.order[q.idx];
    const correct = hit.hip === q.targetHip;
    q.starAnswered = true;
    q.total++;
    if (correct) q.score++;
    lastHl = { hip: hit.hip, state: correct ? "correct" : "wrong" };
    recordAnswerRow(key, "star", correct);
    recordResult(key, "star", correct);
    c.render({
      regionKey: key, showLines: q.lines, showLabels: false,
      highlight: lastHl,
      revealHip: q.targetHip
    });
    const target = keyStars(key)[0];
    const know = knowledgeOf(target.cn) ||
      ("“" + target.cn + "”是" + D.regions[key].n + "最亮的星，视星等约 " + target.mag.toFixed(2) + "。");
    feedback(correct,
      "点对了！这就是「" + q.targetName + "」。",
      "你点的是「" + hit.name + "」；「" + q.targetName + "」是金圈标出的那颗。",
      know);
    $("quizScore").textContent = q.score;
  }
  let flashTimer = null;
  function flash(msg) {
    const fb = $("quizFeedback");
    fb.className = "quiz-feedback show flash";
    fb.innerHTML = msg;
    fb.classList.remove("hidden");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (!currentQuiz() || !currentQuiz().starAnswered) fb.classList.add("hidden"); }, 1400);
  }
  function recordAnswerRow(key, kind, correct) {
    const q = currentQuiz();
    let row = q.answers.find(a => a.key === key);
    if (!row) { row = { key: key, name: null, star: null }; q.answers.push(row); }
    row[kind] = correct;
  }
  function feedback(correct, title, wrongTitle, detail) {
    const fb = $("quizFeedback");
    fb.className = "quiz-feedback show " + (correct ? "ok" : "bad");
    fb.innerHTML =
      '<div class="fb-title">' + (correct ? "✓ " : "✕ ") + (correct ? title : wrongTitle) + "</div>" +
      '<div class="fb-detail">' + detail + "</div>";
    fb.classList.remove("hidden");
    $("quizNextWrap").classList.remove("hidden");
    $("quizNextBtn").textContent = nextButtonText();
  }
  function nextButtonText() {
    const q = currentQuiz();
    if (q.stage === "name") return "进入第 2 关：点亮亮星 →";
    return q.idx >= q.order.length - 1 ? "查看成绩 →" : "下一个星座 →";
  }
  function nextQuiz() {
    const q = currentQuiz();
    if (q.stage === "name") { q.stage = "star"; renderQuiz(); }
    else { q.idx++; q.stage = "name"; renderQuiz(); }
  }
  function wrongKeysOfQuiz() {
    return currentQuiz().answers.filter(a => a.name === false || a.star === false).map(a => a.key);
  }
  function showResult() {
    const q = currentQuiz();
    $("stageName").classList.add("hidden");
    $("stageStar").classList.add("hidden");
    $("quizFeedback").classList.add("hidden");
    $("quizNextWrap").classList.add("hidden");
    $("quizProgressFill").style.width = "100%";
    $("quizProgressText").textContent = "已完成";
    $("stageResult").classList.remove("hidden");
    const total = q.order.length * 2;
    const pct = Math.round(q.score / total * 100);
    $("resultScore").innerHTML = q.score + " / " + total + "<small>" + pct + " 分</small>";
    const rows = q.order.map(k => {
      const a = q.answers.find(x => x.key === k) || {};
      const ic = (v) => v == null ? "—" : (v ? '<span class="ic-ok">✓</span>' : '<span class="ic-no">✕</span>');
      return '<tr><td>' + D.regions[k].n + '</td><td class="center">' + ic(a.name) +
        '</td><td class="center">' + ic(a.star) + '</td></tr>';
    }).join("");
    $("resultDetail").innerHTML =
      '<table class="result-table"><thead><tr><th>星座</th><th>认星座</th><th>点亮星</th></tr></thead>' +
      '<tbody>' + rows + "</tbody></table>";
    // 错题重练按钮：无错题时禁用
    $("resultWrong").disabled = wrongKeysOfQuiz().length === 0;
    $("resultWrong").textContent = wrongKeysOfQuiz().length ? "错题重练（" + wrongKeysOfQuiz().length + "）" : "错题重练";
  }

  /* ---------------- 观星小课堂 ---------------- */
  function openBasics() {
    setCrumb("观星小课堂");
    showView("basics");
    const grid = $("basicsGrid");
    grid.innerHTML = "";
    T.basics.forEach(b => {
      const d = document.createElement("div");
      d.className = "basic-card";
      d.innerHTML =
        '<div class="basic-title"><span class="basic-icon">' + b.icon + "</span><h3>" + b.title + "</h3></div>" +
        "<p>" + b.body + "</p>";
      grid.appendChild(d);
    });
  }

  /* ---------------- 闪卡速记 ---------------- */
  function renderFlashChecks() {
    const wrap = $("flashChecks");
    wrap.innerHTML = "";
    ALL_SEASONS.forEach(s => {
      const label = document.createElement("label");
      label.className = "mix-check";
      label.innerHTML =
        '<input type="checkbox" value="' + s + '" checked>' +
        '<span class="mix-check-name">' + SEASON_META[s].icon + " " + T.seasons[s].name + "</span>" +
        '<span class="mix-check-n">' + T.seasonOrder[s].length + " 个</span>";
      wrap.appendChild(label);
    });
  }
  function readFlashSeasons() {
    return [].slice.call(document.querySelectorAll("#flashChecks input:checked"))
      .map(i => i.value).filter(v => ALL_SEASONS.indexOf(v) >= 0);
  }
  function startFlash() {
    const seasons = readFlashSeasons();
    if (!seasons.length) {
      const w = $("flashWarn");
      w.textContent = "请至少勾选一个模块。";
      w.classList.remove("hidden");
      return;
    }
    let keys = [];
    seasons.forEach(s => T.seasonOrder[s].forEach(k => keys.push(k)));
    keys = Array.from(new Set(keys));
    if ($("flashRandom").checked) keys = shuffle(keys);
    state.flash = {
      keys: keys,
      idx: 0,
      lines: !$("flashNoLines").checked,
      flipped: false
    };
    $("flashSetup").classList.add("hidden");
    $("flashPlay").classList.remove("hidden");
    setCrumb("闪卡速记");
    showView("flashcard");
    renderFlashCard();
  }
  function renderFlashCard() {
    const f = state.flash;
    const key = f.keys[f.idx];
    // 先翻回正面
    f.flipped = false;
    $("flashCard").classList.remove("flipped");
    $("flashCount").textContent = (f.idx + 1) + " / " + f.keys.length;
    $("flashPrevBtn").disabled = f.idx === 0;
    $("flashNextBtn").disabled = f.idx === f.keys.length - 1;
    drawChart("flash", "flashChart", { regionKey: key, showLines: f.lines, showLabels: false });
    // 背面内容
    const r = D.regions[key], tc = T.constellations[key];
    const ks = keyStars(key);
    $("flashBackName").innerHTML = r.n + " <small>" + r.ne + "</small>";
    $("flashBackMnemonic").innerHTML =
      '<span class="fbm-tag">口诀</span>' + (tc.mnemonic || "—");
    $("flashBackStars").innerHTML = ks.map(n => {
      const cn = colorName(bvOf(n.hip));
      return '<span class="fbs-chip"><span class="ksc-dot" style="background:' + cn.dot +
        '"></span>' + n.cn + " <small>" + n.mag.toFixed(2) + " · " + cn.name + "</small></span>";
    }).join("");
  }
  function flipFlash() {
    const f = state.flash;
    f.flipped = !f.flipped;
    $("flashCard").classList.toggle("flipped", f.flipped);
  }
  function flashPrev() {
    const f = state.flash;
    if (f.idx > 0) { f.idx--; renderFlashCard(); }
  }
  function flashNext() {
    const f = state.flash;
    if (f.idx < f.keys.length - 1) { f.idx++; renderFlashCard(); }
  }

  /* ---------------- 混合随机抽查 ---------------- */
  function renderMixSeasonChecks() {
    const wrap = $("mixSeasonChecks");
    wrap.innerHTML = "";
    MIX_SEASONS.forEach(s => {
      const label = document.createElement("label");
      label.className = "mix-check";
      label.innerHTML =
        '<input type="checkbox" value="' + s + '" checked>' +
        '<span class="mix-check-name">' + SEASON_META[s].icon + " " + T.seasons[s].name + "</span>" +
        '<span class="mix-check-n">' + T.seasonOrder[s].length + " 个</span>";
      wrap.appendChild(label);
    });
    const dis = document.createElement("label");
    dis.className = "mix-check disabled";
    dis.innerHTML = '<input type="checkbox" disabled>' +
      '<span class="mix-check-name">' + SEASON_META.southern.icon + " 南天星座</span>" +
      '<span class="mix-check-n">本环节不含</span>';
    wrap.appendChild(dis);
  }
  function openMixSetup() {
    state.mix = null;
    setCrumb("混合随机抽查");
    showView("mix");
    $("mixResult").classList.add("hidden");
    $("mixQuiz").classList.add("hidden");
    $("mixSetup").classList.remove("hidden");
    $("mixWarn").classList.add("hidden");
  }
  function readMixSeasons() {
    return [].slice.call(document.querySelectorAll("#mixSeasonChecks input:checked"))
      .map(i => i.value).filter(v => MIX_SEASONS.indexOf(v) >= 0);
  }
  function buildMix(opts) {
    const seasons = opts.seasons && opts.seasons.length ? opts.seasons : MIX_SEASONS;
    let base = [];
    seasons.forEach(s => T.seasonOrder[s].forEach(k => base.push(k)));
    base = Array.from(new Set(base));
    if (!base.length) return null;
    const pref = opts.topStar ? shuffle(base.filter(k => MIX_TOP21.has(k))) : [];
    const rest = shuffle(base.filter(k => pref.indexOf(k) < 0));
    const seq = pref.concat(rest);
    const keys = [];
    for (let i = 0; i < MIX_QCOUNT; i++) {
      if (i < seq.length) keys.push(seq[i]);
      else keys.push(seq[Math.floor(Math.random() * seq.length)]);
    }
    const types = [];
    for (let i = 0; i < MIX_QCOUNT; i++) types.push(i < MIX_QCOUNT / 2 ? "name" : "star");
    const shuffledTypes = shuffle(types);
    return {
      questions: keys.map((k, i) => ({ key: k, type: shuffledTypes[i], correct: null })),
      idx: 0, score: 0, lines: true, answered: false
    };
  }
  function startMix(opts) {
    const m = buildMix(opts);
    if (!m) {
      const w = $("mixWarn");
      w.textContent = "所选范围内没有星座，请至少勾选一个季节。";
      w.classList.remove("hidden");
      return;
    }
    state.mix = m;
    showMixQuiz(m);
  }
  // 用给定 questions 直接开始（错题重练用）
  function startMixWith(questions) {
    const m = { questions: questions, idx: 0, score: 0, lines: true, answered: false };
    state.mix = m;
    showMixQuiz(m);
  }
  function showMixQuiz(m) {
    $("mixSetup").classList.add("hidden");
    $("mixResult").classList.add("hidden");
    $("mixQuiz").classList.remove("hidden");
    $("mixScore").textContent = "0";
    $("mixFeedback").classList.add("hidden");
    updateMixLinesBtn();
    setCrumb("混合随机抽查 / 作答");
    showView("mix");
    renderMixQ();
  }
  function curMix() { return state.mix; }
  function mixTotal() { return curMix().questions.length; }
  function updateMixProgress() {
    const m = curMix();
    $("mixProgressFill").style.width = (m.idx / mixTotal() * 100) + "%";
    $("mixProgressText").textContent = "第 " + (m.idx + 1) + " / " + mixTotal() + " 题";
  }
  function updateMixLinesBtn() {
    $("mixLinesBtn").textContent = curMix().lines ? "隐藏星座连线" : "显示星座连线";
  }
  function renderMixQ() {
    const m = curMix();
    m.answered = false;
    updateMixProgress();
    $("mixFeedback").classList.add("hidden");
    $("mixNextWrap").classList.add("hidden");
    $("mixStageName").classList.add("hidden");
    $("mixStageStar").classList.add("hidden");
    const q = m.questions[m.idx];
    if (q.type === "name") {
      $("mixStageName").classList.remove("hidden");
      const others = shuffle(MIX_POOL.filter(k => k !== q.key)).slice(0, 3);
      const opts = shuffle([q.key].concat(others));
      const wrap = $("mixNameOptions");
      wrap.innerHTML = "";
      opts.forEach(k => {
        const b = document.createElement("button");
        b.className = "option"; b.type = "button"; b.textContent = D.regions[k].n;
        b.onclick = () => answerMixName(q.key, k, b);
        wrap.appendChild(b);
      });
      drawChart("mixname", "mixNameChart", { regionKey: q.key, showLines: m.lines, showLabels: false });
    } else {
      $("mixStageStar").classList.remove("hidden");
      const target = keyStars(q.key)[0];
      q.targetHip = target.hip; q.targetName = target.cn;
      $("mixTargetName").textContent = target.cn + "（" + (target.en || "") + "）";
      $("mixCrosshair").style.display = "none";
      drawChart("mixstar", "mixStarChart", { regionKey: q.key, showLines: m.lines, showLabels: false });
    }
  }
  function answerMixName(key, chosen, btn) {
    const m = curMix();
    if (m.answered) return;
    m.answered = true;
    const q = m.questions[m.idx];
    const correct = chosen === key;
    q.correct = correct;
    if (correct) m.score++;
    recordResult(key, "name", correct);
    document.querySelectorAll("#mixNameOptions .option").forEach(b => {
      b.disabled = true;
      if (b.textContent === D.regions[key].n) b.classList.add("correct");
    });
    if (!correct) btn.classList.add("wrong");
    mixFeedback(correct,
      "正确！这是「" + D.regions[key].n + "」。",
      "这是「" + D.regions[key].n + "」，不是「" + D.regions[chosen].n + "」。",
      T.constellations[key].mnemonic || T.constellations[key].tip);
    $("mixScore").textContent = m.score;
  }
  function onMixStarClick(e) {
    const m = curMix();
    if (!m || $("mixStageStar").classList.contains("hidden") || m.answered) return;
    const q = m.questions[m.idx];
    const canvas = $("mixStarChart");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const c = state.charts.mixstar;
    const hit = c.pick(x, y);
    const ch = $("mixCrosshair");
    if (!hit) {
      ch.style.display = "block";
      ch.style.left = x + "px"; ch.style.top = y + "px";
      mixFlash("请点击图中一颗有名字的亮星。");
      return;
    }
    ch.style.display = "none";
    const correct = hit.hip === q.targetHip;
    m.answered = true;
    q.correct = correct; q.hitHip = hit.hip; q.hitCorrect = correct;
    if (correct) m.score++;
    recordResult(q.key, "star", correct);
    c.render({
      regionKey: q.key, showLines: m.lines, showLabels: false,
      highlight: { hip: hit.hip, state: correct ? "correct" : "wrong" },
      revealHip: q.targetHip
    });
    const target = keyStars(q.key)[0];
    const know = knowledgeOf(target.cn) ||
      ("“" + target.cn + "”是" + D.regions[q.key].n + "最亮的星，视星等约 " + target.mag.toFixed(2) + "。");
    mixFeedback(correct,
      "点对了！这就是「" + q.targetName + "」。",
      "你点的是「" + hit.name + "」；「" + q.targetName + "」是金圈标出的那颗。",
      know);
    $("mixScore").textContent = m.score;
  }
  function mixFeedback(correct, title, wrongTitle, detail) {
    const fb = $("mixFeedback");
    fb.className = "quiz-feedback show " + (correct ? "ok" : "bad");
    fb.innerHTML =
      '<div class="fb-title">' + (correct ? "✓ " : "✕ ") + (correct ? title : wrongTitle) + "</div>" +
      '<div class="fb-detail">' + detail + "</div>";
    fb.classList.remove("hidden");
    $("mixNextWrap").classList.remove("hidden");
    $("mixNextBtn").textContent = curMix().idx >= mixTotal() - 1 ? "查看成绩 →" : "下一题 →";
  }
  let mixFlashTimer = null;
  function mixFlash(msg) {
    const fb = $("mixFeedback");
    fb.className = "quiz-feedback show flash";
    fb.innerHTML = msg;
    fb.classList.remove("hidden");
    clearTimeout(mixFlashTimer);
    mixFlashTimer = setTimeout(() => { if (!curMix() || !curMix().answered) fb.classList.add("hidden"); }, 1400);
  }
  function nextMix() {
    const m = curMix();
    if (!m.answered) return;
    m.idx++;
    if (m.idx >= mixTotal()) showMixResult();
    else renderMixQ();
  }
  function showMixResult() {
    const m = curMix();
    $("mixStageName").classList.add("hidden");
    $("mixStageStar").classList.add("hidden");
    $("mixFeedback").classList.add("hidden");
    $("mixNextWrap").classList.add("hidden");
    $("mixProgressFill").style.width = "100%";
    $("mixProgressText").textContent = "已完成";
    $("mixQuiz").classList.add("hidden");
    $("mixResult").classList.remove("hidden");
    const pct = Math.round(m.score / mixTotal() * 100);
    $("mixResultScore").innerHTML = m.score + " / " + mixTotal() + "<small>" + pct + " 分</small>";
    const rows = m.questions.map((q, i) => {
      const ic = q.correct ? '<span class="ic-ok">✓</span>' : '<span class="ic-no">✕</span>';
      const type = q.type === "name" ? "认星座" : "点亮星";
      return '<tr><td>' + (i + 1) + '</td><td>' + D.regions[q.key].n +
        '</td><td>' + type + '</td><td class="center">' + ic + '</td></tr>';
    }).join("");
    $("mixResultDetail").innerHTML =
      '<table class="result-table"><thead><tr><th>题号</th><th>星座</th><th>考查</th><th>结果</th></tr></thead>' +
      '<tbody>' + rows + "</tbody></table>";
    // 错题重练按钮
    const wrongQs = m.questions.filter(q => q.correct === false);
    $("mixWrongBtn").disabled = wrongQs.length === 0;
    $("mixWrongBtn").textContent = wrongQs.length ? "错题重练（" + wrongQs.length + "）" : "错题重练";
  }

  /* ---------------- 事件绑定 ---------------- */
  $("brandHome").onclick = $("homeBtn").onclick = (e) => {
    e.preventDefault(); setCrumb(""); showView("home"); renderHome();
  };
  $("startLearnBtn").onclick = () => openLearn(state.season, 0);
  $("startQuizBtn").onclick = () => startQuiz(state.season);
  $("learnPrev").onclick = () => { if (state.learnIndex > 0) { state.learnIndex--; renderLearn(); } };
  $("learnNext").onclick = () => {
    const list = T.seasonOrder[state.season];
    if (state.learnIndex < list.length - 1) { state.learnIndex++; renderLearn(); }
  };
  $("learnToQuiz").onclick = () => startQuiz(state.season);
  $("quizNextBtn").onclick = nextQuiz;
  $("quizQuit").onclick = () => { if (confirm("确定退出本次测验吗？成绩不会保留。")) openSeason(state.quiz.season); };
  $("quizLinesBtn").onclick = () => {
    const q = currentQuiz(); q.lines = !q.lines; updateQuizLinesBtn();
    const key = q.order[q.idx];
    if (q.stage === "name") state.charts.name.render({ regionKey: key, showLines: q.lines, showLabels: false });
    else {
      state.charts.star.render({
        regionKey: key, showLines: q.lines, showLabels: false,
        highlight: q.starAnswered && lastHl ? lastHl : undefined,
        revealHip: q.starAnswered ? q.targetHip : undefined
      });
    }
  };
  $("starChart").addEventListener("click", onStarClick);
  $("resultBackSeason").onclick = () => openSeason(currentQuiz().season);
  $("resultRetry").onclick = () => startQuiz(currentQuiz().season);
  $("resultWrong").onclick = () => {
    const wk = wrongKeysOfQuiz();
    if (wk.length) startQuiz(currentQuiz().season, wk, true);
  };
  $("resultHome").onclick = () => { setCrumb(""); showView("home"); renderHome(); };

  // 观星小课堂
  $("basicsEntry").onclick = openBasics;
  $("basicsBackBtn").onclick = () => { setCrumb(""); showView("home"); renderHome(); };

  // 闪卡
  $("flashEntry").onclick = () => {
    setCrumb("闪卡速记");
    showView("flashcard");
    $("flashPlay").classList.add("hidden");
    $("flashSetup").classList.remove("hidden");
    $("flashWarn").classList.add("hidden");
  };
  $("flashStartBtn").onclick = startFlash;
  $("flashCard").onclick = flipFlash;
  $("flashFlipBtn").onclick = (e) => { e.stopPropagation(); flipFlash(); };
  $("flashPrevBtn").onclick = (e) => { e.stopPropagation(); flashPrev(); };
  $("flashNextBtn").onclick = (e) => { e.stopPropagation(); flashNext(); };
  $("flashFlipLinesBtn").onclick = (e) => {
    e.stopPropagation();
    const f = state.flash; f.lines = !f.lines;
    drawChart("flash", "flashChart", { regionKey: f.keys[f.idx], showLines: f.lines, showLabels: false });
  };
  $("flashQuit").onclick = (e) => {
    e.stopPropagation();
    if (confirm("确定退出闪卡吗？")) { setCrumb(""); showView("home"); renderHome(); }
  };

  // 混合随机抽查
  $("mixEntry").onclick = openMixSetup;
  $("mixStartBtn").onclick = () => {
    const seasons = readMixSeasons();
    if (!seasons.length) {
      const w = $("mixWarn");
      w.textContent = "请至少勾选一个季节。";
      w.classList.remove("hidden");
      return;
    }
    state.mixOpts = { seasons: seasons, topStar: $("mixTopStar").checked };
    startMix(state.mixOpts);
  };
  $("mixRandomBtn").onclick = () => {
    document.querySelectorAll("#mixSeasonChecks input").forEach(i => { if (i.value) i.checked = true; });
    $("mixTopStar").checked = false;
    state.mixOpts = { seasons: MIX_SEASONS.slice(), topStar: false };
    startMix(state.mixOpts);
  };
  $("mixNextBtn").onclick = nextMix;
  $("mixStarChart").addEventListener("click", onMixStarClick);
  $("mixQuit").onclick = () => { if (confirm("确定退出本次抽查吗？成绩不会保留。")) openMixSetup(); };
  $("mixLinesBtn").onclick = () => {
    const m = curMix(); m.lines = !m.lines; updateMixLinesBtn();
    const q = m.questions[m.idx];
    if (q.type === "name") {
      drawChart("mixname", "mixNameChart", { regionKey: q.key, showLines: m.lines, showLabels: false });
    } else {
      const cfg = { regionKey: q.key, showLines: m.lines, showLabels: false };
      if (m.answered) {
        cfg.highlight = { hip: q.hitHip, state: q.hitCorrect ? "correct" : "wrong" };
        cfg.revealHip = q.targetHip;
      }
      drawChart("mixstar", "mixStarChart", cfg);
    }
  };
  $("mixRetryBtn").onclick = () => startMix(state.mixOpts || { seasons: MIX_SEASONS.slice(), topStar: false });
  $("mixWrongBtn").onclick = () => {
    const m = curMix();
    const wrongQs = m.questions.filter(q => q.correct === false)
      .map(q => ({ key: q.key, type: q.type, correct: null }));
    if (wrongQs.length) startMixWith(wrongQs);
  };
  $("mixReconfigBtn").onclick = openMixSetup;
  $("mixHomeBtn").onclick = () => { setCrumb(""); showView("home"); renderHome(); };

  // 键盘快捷键（闪卡：空格翻面，左右切换）
  window.addEventListener("keydown", (e) => {
    if (state.view !== "flashcard" || $("flashPlay").classList.contains("hidden")) return;
    if (e.code === "Space") { e.preventDefault(); flipFlash(); }
    else if (e.code === "ArrowLeft") flashPrev();
    else if (e.code === "ArrowRight") flashNext();
  });

  // 窗口缩放重绘当前图
  let rzTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      if (state.view === "learn") { renderLearn(); return; }
      const q = currentQuiz();
      if (state.view === "quiz" && q && q.idx < q.order.length) {
        const key = q.order[q.idx];
        if (q.stage === "name") {
          drawChart("name", "nameChart", { regionKey: key, showLines: q.lines, showLabels: false });
        } else {
          drawChart("star", "starChart", {
            regionKey: key, showLines: q.lines, showLabels: false,
            highlight: q.starAnswered ? lastHl : undefined,
            revealHip: q.starAnswered ? q.targetHip : undefined
          });
        }
      }
      const m = state.mix;
      if (state.view === "mix" && m && $("mixQuiz") && !$("mixQuiz").classList.contains("hidden") && m.idx < mixTotal()) {
        const mq = m.questions[m.idx];
        if (mq.type === "name") {
          drawChart("mixname", "mixNameChart", { regionKey: mq.key, showLines: m.lines, showLabels: false });
        } else {
          const mcfg = { regionKey: mq.key, showLines: m.lines, showLabels: false };
          if (m.answered) {
            mcfg.highlight = { hip: mq.hitHip, state: mq.hitCorrect ? "correct" : "wrong" };
            mcfg.revealHip = mq.targetHip;
          }
          drawChart("mixstar", "mixStarChart", mcfg);
        }
      }
      if (state.view === "flashcard" && state.flash && !$("flashPlay").classList.contains("hidden")) {
        const f = state.flash;
        drawChart("flash", "flashChart", { regionKey: f.keys[f.idx], showLines: f.lines, showLabels: false });
      }
    }, 200);
  });

  window.__TEACH_APP = state;

  renderFlashChecks();
  renderMixSeasonChecks();
  renderHome();
})();
