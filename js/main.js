/* ============================================================
   A-BITE 首页交互脚本
   共 5 个功能：
   1. 导航栏滚动状态（滚动后显示发丝底边线）
   2. 移动端菜单开合
   3. 轻量滚动浮现动画（IntersectionObserver 驱动 .reveal）
   4. Hero 交互层：鼠标视差（文字/图片分层跟随）+ 粒子连线跟随鼠标
      （内含原"滚动时产品图从文字后方脱出"的滚动补偿；仅首页 .hero 启用）
   5. 页脚年份自动更新
   ============================================================ */

/* 立即执行函数 + "use strict"：
   避免污染全局作用域，所有变量只在本文件内有效 */
(function () {
  "use strict";

  /* ---- 1. 导航栏滚动状态 ----
     页面滚离顶部（>8px）后给 header 加 .is-scrolled，
     样式见 navbar.css：背景变实、显示底部发丝线。
     导航 DOM 由 components.js 注入；若注入失败则跳过本功能，不影响其余逻辑 */
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });  // passive：不阻塞滚动，提升性能
  onScroll();  // 初始化时先执行一次，处理"刷新时已不在顶部"的情况

  /* ---- 2. 移动端菜单 ----
     点击汉堡按钮：切换 header 上的 .nav-open（样式见 navbar.css）；
     同步更新 aria-expanded，方便屏幕阅读器识别展开状态 */
  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    /* 点击菜单内任意链接后：自动收起菜单并复位无障碍状态 */
    header.querySelectorAll(".nav-links a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---- 3. 滚动浮现（scroll-reveal）----
     所有 .reveal 元素初始为透明+下移（样式见 reset.css）；
     进入视口后加 .is-visible 触发过渡动画 */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);  // 只播放一次，播完即取消观察
          }
        });
      },
      /* threshold 0.12：元素约 12% 进入视口时触发；
         rootMargin 底部收缩 6%：稍微滚进一点再触发，避免贴边即现 */
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    /* 不支持 IntersectionObserver 的旧浏览器：直接显示全部内容 */
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---- 4. Hero 交互层：鼠标视差 + 不规则星野（仅首页 .hero 存在时启用） ----
     a. 鼠标视差：Hero 内的文字层，以及首屏下部"项目属性 + 文献依据条"的两行，
        被逐层包进无 CSS 过渡的 .hero-plx 外壳，按各自深度随鼠标位移
        （lerp 缓动）；产品图在 <img> 自身的 transform 上合并鼠标位移与
        原有滚动补偿 —— 滚动视差效果保持不变；
     b. 星野画布：Hero 底层插入 <canvas>（样式见 home.css .hero-canvas），
        不规则散布的五角星（大小/转角/色调各异）以细线连成松散的网；
        鼠标靠近时星点被斥力推开、变大变亮，离开后弹簧缓动回位
        （交互结构参考 DeepSeek Harness 官网首屏，视觉换为不规则星野）；
     c. 点阵物理按 60Hz 固定步长积分（与显示器刷新率解耦），绘制逐帧进行；
        仅当 Hero 位于视口内且标签页可见时运行 rAF 循环；
        prefers-reduced-motion 直接整体关闭，
        触屏设备无鼠标斥力、点阵保持静止。 */
  var hero = document.querySelector(".hero");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (hero && !reduceMotion) initHeroInteractive(hero);

  function initHeroInteractive(hero) {
    var finePointer = window.matchMedia("(pointer: fine)").matches;
    var heroImgs = hero.querySelectorAll(".hero-media img");

    /* a-1. 视差分层：depth = 鼠标抵到屏幕边缘时该层的最大位移（px）。
       数值越大越"贴近镜头"——产品图动得最多，文字层依次递减，形成纵深 */
    var layers = [];
    function wrapLayer(el, depth) {
      if (!el) return;
      var w = document.createElement("div");
      w.className = "hero-plx";
      el.parentNode.insertBefore(w, el);
      w.appendChild(el);
      layers.push({ el: w, depth: depth });
    }
    wrapLayer(hero.querySelector(".hero-badge"), 12);
    wrapLayer(hero.querySelector("h1"), 18);
    wrapLayer(hero.querySelector(".hero-cta"), 10);
    /* 首屏下部"项目属性 + 文献依据"条的两行（原 Hero 副标题已下移至此、
       文献列表已移除）：与 Hero 同屏，同属最远层，
       位移不超过 Hero 各文字层，手感一致 */
    var precedents = document.querySelector(".precedents");
    if (precedents) {
      wrapLayer(precedents.querySelector(".hero-sub"), 10);
      wrapLayer(precedents.querySelector(".precedents-label"), 6);
    }

    /* b-1. 点阵画布：插入 Hero 最底层（z-index:0，内容层在其上） */
    var canvas = document.createElement("canvas");
    canvas.className = "hero-canvas";
    canvas.setAttribute("aria-hidden", "true");
    hero.insertBefore(canvas, hero.firstChild);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;

    /* 星野参数：保留 DeepSeek Harness 的"斥力推开 + 弹簧回位"结构，
       布局打散为不规则星点网，节点改为大小不一的五角星（配色 teal 化） */
    var GRID_GAP = 90;                       /* 基准网格间距（px），仅作布点参照 */
    var JITTER = 26;                         /* 每轴向最大随机偏移（px），打破规则感 */
    var MOUSE_R = 140;                       /* 鼠标斥力半径（px） */
    var PHYS_STEP = 1000 / 60;               /* 物理固定步长 60Hz：与显示器刷新率解耦 */
    var LINE_RGB = "53,147,124";             /* 连线色：teal-600 */
    /* 星点三色（teal-700 / teal-600 / sage-600），随机取用让星野更自然 */
    var STAR_RGBS = ["47,130,112", "53,147,124", "134,164,157"];
    var LINE_A = 0.06, STAR_A = 0.3;         /* 线/星基础透明度（线整体降一档） */
    var dots = [], cols = 0, rows = 0;

    /* 以 90px 网格为参照居中布点，每点叠加 ±26px 随机偏移；
       每颗星记录"家"位置（hx,hy）、随机大小/转角/色调/呼吸相位；
       la 为该点的连线淡出系数：约半数的线段会明显更淡 */
    function buildGrid() {
      dots = [];
      cols = Math.ceil(W / GRID_GAP) + 1;
      rows = Math.ceil(H / GRID_GAP) + 1;
      var ox = (W - (cols - 1) * GRID_GAP) / 2;
      var oy = (H - (rows - 1) * GRID_GAP) / 2;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = ox + c * GRID_GAP + (Math.random() - 0.5) * 2 * JITTER,
              y = oy + r * GRID_GAP + (Math.random() - 0.5) * 2 * JITTER;
          dots.push({
            hx: x, hy: y, x: x, y: y, vx: 0, vy: 0,
            sr: 2.9 + Math.random() * 1.4,          /* 星外接圆半径 2.9–4.3px（原值的 1.3 倍） */
            rot: Math.random() * Math.PI * 2,          /* 固定随机转角 */
            rgb: STAR_RGBS[(Math.random() * STAR_RGBS.length) | 0],
            a0: 0.75 + Math.random() * 0.5,            /* 基础透明度个体差异 */
            tw: Math.random() * Math.PI * 2,           /* 呼吸相位 */
            la: Math.random() < 0.5
              ? 0.2 + Math.random() * 0.35              /* 半数线段：明显更淡 0.2–0.55 */
              : 0.75 + Math.random() * 0.35             /* 其余线段：接近正常 0.75–1.1 */
          });
        }
      }
    }

    /* 点阵物理（每步 = 1/60s）：鼠标斥力（越近推得越狠）+ 弹簧回位 + 阻尼。
       步长由原 30fps（1/30s）减半，参数按等价换算：斥力 3→1.5、弹簧 0.05→0.025、
       阻尼 0.85→0.92（≈sqrt(0.85)）—— 运动轨迹与原来一致，但每步都取最新的
       鼠标位置，斥力中心落后光标的距离减半，跟随更准确 */
    function updateGrid(mx, my) {
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        var dx = p.x - mx, dy = p.y - my;
        var d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_R * MOUSE_R && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var f = (1 - d / MOUSE_R) * 15 * 0.1;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx += (p.hx - p.x) * 0.025;
        p.vy += (p.hy - p.y) * 0.025;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;
      }
    }

    /* 画一条网格边：按两端淡出系数的均值决定本条线透明度（整体低，且随机参差）；
       两端各内缩 10px；两点被推近到 20px 内时不画 —— 鼠标附近现出裂口 */
    function segStroke(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 20) return;
      var ux = dx / d, uy = dy / d;
      var alpha = LINE_A * (a.la + b.la) / 2;
      ctx.strokeStyle = "rgba(" + LINE_RGB + "," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(a.x + 10 * ux, a.y + 10 * uy);
      ctx.lineTo(b.x - 10 * ux, b.y - 10 * uy);
      ctx.stroke();
    }

    /* 五角星路径：外接圆半径 R，内半径取黄金比 0.382R，rot 为起始角 */
    function starPath(cx, cy, R, rot) {
      var ri = R * 0.382;
      ctx.moveTo(cx + Math.cos(rot) * R, cy + Math.sin(rot) * R);
      for (var k = 1; k < 10; k++) {
        var rad = (k % 2 === 0) ? R : ri;
        var a = rot + k * Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
    }

    function drawGrid(mx, my, t) {
      ctx.clearRect(0, 0, W, H);
      var i, p, c, r, dx, dy, prox, R;
      /* 横/纵两个方向的邻点细线，逐个独立描边以实现透明度参差 */
      ctx.lineWidth = 0.5;
      for (r = 0; r < rows; r++) {
        for (c = 0; c < cols - 1; c++) segStroke(dots[r * cols + c], dots[r * cols + c + 1]);
      }
      for (c = 0; c < cols; c++) {
        for (r = 0; r < rows - 1; r++) segStroke(dots[r * cols + c], dots[(r + 1) * cols + c]);
      }
      /* 五角星：靠近鼠标时外接圆 +2.6px、透明度提升至 ~0.8；
         附带极轻微的明暗呼吸（±0.06），让星野"活"但不抢眼 */
      for (i = 0; i < dots.length; i++) {
        p = dots[i];
        dx = p.x - mx;
        dy = p.y - my;
        prox = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / MOUSE_R);
        R = p.sr + 2.6 * prox;
        ctx.globalAlpha = STAR_A * p.a0 + 0.06 * Math.sin(t * 0.8 + p.tw) + 0.5 * prox;
        ctx.fillStyle = "rgb(" + p.rgb + ")";
        ctx.beginPath();
        starPath(p.x, p.y, R, p.rot);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* 画布跟随 Hero 尺寸（含 DPR 缩放），尺寸变化时点阵重新分布 */
    function resize() {
      W = hero.offsetWidth;
      H = hero.offsetHeight;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildGrid();
    }

    /* 鼠标状态：tgtX/tgtY 为视差目标（-1 ~ 1，以视口中心为原点）；
       clientX/clientY 原始坐标在逐帧中换算到点阵坐标系 */
    var tgtX = 0, tgtY = 0, curX = 0, curY = 0;
    var clientX = 0, clientY = 0, mouseIn = false;

    window.addEventListener("mousemove", function (e) {
      clientX = e.clientX;
      clientY = e.clientY;
      mouseIn = true;
      tgtX = (e.clientX / window.innerWidth) * 2 - 1;
      tgtY = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
    /* 鼠标离开窗口：目标归零，各层缓动回中、粒子失去引力散回家位 */
    document.addEventListener("mouseleave", function () {
      mouseIn = false;
      tgtX = 0;
      tgtY = 0;
    });

    var SCROLL_FACTOR = 0.18;  /* 沿用原滚动视差系数（滚动 100px 图相对下移 18px） */
    var SCROLL_RANGE = 900;
    var running = false, rafId = null;
    var physAcc = 0, lastTickTime = null;  /* 物理时间累加器与上一帧时间戳 */

    function tick(now) {
      /* a-2. 鼠标视差：7% 缓动逼近目标，来回移动鼠标时各层以不同速度跟随 */
      curX += (tgtX - curX) * 0.07;
      curY += (tgtY - curY) * 0.07;
      if (finePointer) {
        for (var i = 0; i < layers.length; i++) {
          var L = layers[i];
          L.el.style.transform =
            "translate3d(" + (curX * L.depth).toFixed(2) + "px," +
                             (curY * L.depth).toFixed(2) + "px,0)";
        }
      }
      /* 产品图（机器全家福单图）：鼠标位移 + 轻微旋转 + 原滚动补偿 */
      if (heroImgs.length) {
        var sy = Math.min(window.scrollY, SCROLL_RANGE);
        var ix = finePointer ? curX * 30 : 0;
        var iy = finePointer ? curY * 20 : 0;
        var imgTransform =
          "translate3d(" + ix.toFixed(2) + "px," + (iy + sy * SCROLL_FACTOR).toFixed(2) + "px,0)" +
          (finePointer ? " rotate(" + (curX * 1.1).toFixed(3) + "deg)" : "");
        heroImgs.forEach(function (im) { im.style.transform = imgTransform; });
      }

      /* b-2. 网格点阵：物理按 60Hz 固定步长积分（步数由时间累加器决定，与刷新率解耦），
         绘制逐帧进行 —— 每帧都取最新的鼠标位置，斥力中心紧跟光标，
         不再有 30fps 采样带来的滞后与顿感。
         鼠标 → 画布坐标以画布自身的视觉矩形换算：画布 CSS 尺寸恒等于 Hero 尺寸
         （见 home.css .hero-canvas），整页翻页过渡中 Hero 平移/缩放时两者同步变化，
         W/rect.width 即当前缩放系数 —— 既抵消翻页器的等比缩放，也不受任何
         画布盒子尺寸偏差影响，斥力点始终对准光标 */
      var rect = canvas.getBoundingClientRect();
      var scaleX = rect.width ? W / rect.width : 1;
      var scaleY = rect.height ? H / rect.height : 1;
      var mx = mouseIn ? (clientX - rect.left) * scaleX : -9999;
      var my = mouseIn ? (clientY - rect.top) * scaleY : -9999;
      if (lastTickTime === null) lastTickTime = now;
      var dt = now - lastTickTime;
      lastTickTime = now;
      if (dt > 100) dt = 100;  /* 切后台/长时间卡顿后截断大步长，避免物理积分发散 */
      physAcc += dt;
      while (physAcc >= PHYS_STEP) {
        updateGrid(mx, my);
        physAcc -= PHYS_STEP;
      }
      drawGrid(mx, my, now * 0.001);

      if (running) rafId = requestAnimationFrame(tick);
    }

    /* c. 生命周期：Hero 入视口且标签页可见时才运转，离开即停（零后台开销） */
    function start() {
      if (running) return;
      running = true;
      lastTickTime = null;  /* 重新计时：停摆期间的时间差不计入物理累加器 */
      physAcc = 0;
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    var heroVisible = true;
    if ("IntersectionObserver" in window) {
      heroVisible = false;  /* 等待 IO 首次回调确认可见性后再启动 */
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible && !document.hidden) start(); else stop();
      }, { threshold: 0.05 }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && heroVisible) start(); else stop();
    });

    /* 尺寸变化（图片/字体加载、窗口缩放）时重建画布与点阵；
       offsetWidth/Height 不受翻页 transform 影响，翻页动画期间不会误触发 */
    if ("ResizeObserver" in window) {
      var lastW = 0, lastH = 0;
      new ResizeObserver(function () {
        if (hero.offsetWidth === lastW && hero.offsetHeight === lastH) return;
        lastW = hero.offsetWidth;
        lastH = hero.offsetHeight;
        resize();
      }).observe(hero);
    } else {
      window.addEventListener("resize", resize);
    }

    resize();
    if (heroVisible) start();  /* 无 IntersectionObserver 的兜底路径 */
  }

  /* ---- 4.5 Hero 徽章拖拽（仅首页存在 [data-hero-stamp] 时启用） ----
     指针按下后徽章跟随移动，松手停留在当前位置：
     累计位移写入徽章自身的 --dx/--dy 变量（与悬停/拖拽缩放用的 --s 分离，
     见 home.css .hero-stamp），松手后悬停放大依旧生效。
     整页翻页器可能对 .fp-page-inner 做等比缩放，按下时按徽章
     视觉尺寸 / 布局尺寸换算系数，保证拖拽距离与光标一致；
     触屏拖拽通过 stopPropagation 与翻页手势隔离（pager.js 只监听触摸滑动） */
  document.querySelectorAll("[data-hero-stamp]").forEach(function (el) {
    var baseX = 0, baseY = 0;     /* 已落位的累计位移（布局坐标系 px） */
    var startX = 0, startY = 0;   /* 按下瞬间的指针坐标 */
    var k = 1;                    /* 屏幕 px → 布局 px 换算系数（翻页器缩放补偿） */
    var dragging = false;

    el.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;  /* 仅响应主键 */
      e.preventDefault();  /* 阻止图片原生拖影与文本选择 */
      var r = el.getBoundingClientRect();
      k = el.offsetWidth ? r.width / el.offsetWidth : 1;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      el.classList.add("is-dragging");
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });
    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = baseX + (e.clientX - startX) / (k || 1);
      var dy = baseY + (e.clientY - startY) / (k || 1);
      el.style.setProperty("--dx", dx.toFixed(1) + "px");
      el.style.setProperty("--dy", dy.toFixed(1) + "px");
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      /* 松手：当前位移固化为新的基准位置，徽章停留在最后位置 */
      baseX += (e.clientX - startX) / (k || 1);
      baseY += (e.clientY - startY) / (k || 1);
      el.classList.remove("is-dragging");
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  });

  /* ---- 4.6 返回顶部悬浮按钮（全站，DOM 由 components.js 注入） ----
     常规页面：滚动超过 ~60% 视口高度后浮现，点击平滑回顶；
     首页整页翻页模式：window.scrollY 恒为 0，改由 pager.js 暴露的
     ABITE_PAGER 判定“是否位于第 1 屏”，点击交由翻页器回第 1 屏
     （pager.js 在本脚本之后执行，因此首次同步放到 load 事件，
      之后由 “abite:pager-change” 广播驱动显隐，无需轮询） */
  var toTop = document.querySelector(".back-to-top");
  if (toTop) {
    var TO_TOP_THRESHOLD = Math.round(window.innerHeight * 0.6);
    function refreshToTop() {
      var pager = window.ABITE_PAGER;
      var show = pager ? !pager.isTop() : window.scrollY > TO_TOP_THRESHOLD;
      toTop.classList.toggle("is-visible", show);
    }
    window.addEventListener("scroll", refreshToTop, { passive: true });
    window.addEventListener("abite:pager-change", refreshToTop);
    window.addEventListener("load", refreshToTop);
    refreshToTop();

    toTop.addEventListener("click", function () {
      var pager = window.ABITE_PAGER;
      if (pager) {
        pager.toTop();  // 整页翻页：吸附回第 1 屏（含尾页页内滚动归零）
      } else {
        /* html 已声明 scroll-behavior:smooth，且 prefers-reduced-motion 时
           reset.css 会将其关闭——直接依赖 CSS 行为即可，无需 JS 判缓动 */
        window.scrollTo({ top: 0, left: 0 });
      }
      toTop.blur();  // 点击后移出焦点，避免回顶后焦点轮廓留在浮钮上
    });
  }

  /* ---- 4.7 手机端光泽动效自动播放 ----
     目录与按钮的光泽扫过动效（样式见 content.css）在桌面端由 :hover 触发；
     手机端（≤860px，与导航折叠断点一致）没有鼠标，改为自动播放：
     JS 给元素加上与 :hover 同态的 .is-shining 类，过渡播完后移除。
     节奏约定：
       - 动画时长约 1.9s；
       - 目录：动画结束后等待 9s；每项在动画结束后冷却 20s，冷却内不会再次被选中；
       - 按钮：动画结束后随机等待 8–14s（平均约 11s），无单项冷却；同一容器内并排的按钮轮流播放；
     元素不在视口内、标签页隐藏、prefers-reduced-motion 时均不播放。 */
  (function autoShine() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var mobileQuery = window.matchMedia("(max-width: 860px)");
    var SHINE_MS = 1900;  /* 略大于 CSS 1.65s 过渡时长，确保光泽完整播放 */
    var TOC_PLAY_GAP = 9000;  /* 目录动画结束后到下一次播放之间的固定间隔 */
    var TOC_COOLDOWN = 20000;  /* 单个目录项：动画结束后的冷却时间 */
    function buttonGap() {
      /* 11s ± 3s：每次重新抽取，范围为 8–14s */
      return 8000 + Math.random() * 6000;
    }

    function play(el) {
      el.classList.add("is-shining");
      setTimeout(function () { el.classList.remove("is-shining"); }, SHINE_MS);
    }
    function inView(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.left < window.innerWidth && r.right > 0;
    }

    /* 目录：随机轮播。
       采用递归 setTimeout，而不是固定 setInterval，确保“9 秒间隔”从动画结束后开始计算。 */
    var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    if (tocLinks.length) {
      var cooldownEnd = new WeakMap();
      function runTocShine() {
        if (!mobileQuery.matches || document.hidden) {
          setTimeout(runTocShine, 2000);
          return;
        }
        var now = Date.now();
        var pool = tocLinks.filter(function (el) {
          return inView(el) && now >= (cooldownEnd.get(el) || 0);
        });
        if (!pool.length) {
          setTimeout(runTocShine, 2000);
          return;
        }
        var pick = pool[Math.floor(Math.random() * pool.length)];
        /* 冷却从本次动画结束后开始计算，不包含动画播放时间 */
        cooldownEnd.set(pick, now + SHINE_MS + TOC_COOLDOWN);
        play(pick);
        setTimeout(runTocShine, SHINE_MS + TOC_PLAY_GAP);
      }
      setTimeout(runTocShine, TOC_PLAY_GAP);
    }

    /* 按钮：按父容器分组，组内轮流；每组起始相位错开，避免同时闪烁。
       每轮在动画结束后重新抽取 8–14s 的随机等待时间。 */
    var groupsByParent = new Map();
    document.querySelectorAll(".btn-primary, .btn-secondary").forEach(function (b) {
      var p = b.parentElement;
      if (!groupsByParent.has(p)) groupsByParent.set(p, []);
      groupsByParent.get(p).push(b);
    });
    var groupIdx = 0;
    groupsByParent.forEach(function (els) {
      var i = 0;
      var offset = (groupIdx++ % 3) * 1200;  /* 0 / 1.2s / 2.4s 相位错开 */
      function runButtonShine() {
        if (!mobileQuery.matches || document.hidden) {
          setTimeout(runButtonShine, 2000);
          return;
        }
        var el = els[i % els.length];
        i++;
        if (inView(el)) {
          play(el);
          setTimeout(runButtonShine, SHINE_MS + buttonGap());
        } else {
          setTimeout(runButtonShine, 2000);
        }
      }
      setTimeout(runButtonShine, offset + buttonGap());
    });
  })();

  /* ---- 5. 页脚年份 ----
     把 HTML 里 <span data-year> 的占位年份替换为当前年份 */
  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
