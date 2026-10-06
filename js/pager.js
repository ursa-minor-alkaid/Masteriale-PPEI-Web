/* ============================================================
   首页整页翻页器（仅 index.html 加载，样式见 Styles/pages/home-pager.css）

   工作原理：
   1. 运行时在 DOM 中把 .site-main 内的既有区块组装为若干"满视口页"，
      HTML 源文件中的内容结构保持原样：
        停靠点 1 = Hero + 已发表先例条（.precedents）
        停靠点 2 = #platform  四层架构 + 数据统计行
        停靠点 3 = #hardware  硬件分栏 + 规格卡
        停靠点 4 = #updates   更新日志
        停靠点 5 = #cta + 页脚 合并成的"加高页"（页高 = 视口高 + 页脚高，
                   CTA 与页脚自身大小都不变，只是合起来页面变长）
   2. "停靠位置（stop）"模型：轨道按绝对像素偏移平移。前 4 页各一个
      停靠点；末页为加高页，只设一个停靠点（页顶对齐 CTA 舞台），
      并带"页内滚动范围"（= 页高 − 视口高 = 页脚高）：到达末页后，
      滚轮/触摸/方向键继续向下会在页内自由滚动（不吸附、不翻页），
      逐步露出页脚；滚回页顶后再向上才翻回上一页。
   3. 【滚轮冷却锁定 + 触摸拖拽吸附】两种路径分离：
      - 滚轮/触控板：一次滚轮手势直接触发翻页，900ms 冷却期间忽略所有
        滚轮输入，彻底避免触控板连续微小事件导致的"一跳一跳然后突然翻页"。
      - 触摸滑动：1:1 跟手拖拽，滑过阈值播放平滑动画吸附到目标停靠点；
        未滑够则回弹回当前页。
   4. 右侧点状页码指示器（.fp-dots）：每停靠点一个圆点，高亮当前页，
      点击圆点直接跳转。
   5. 触发方式：鼠标滚轮 / 方向键·PageUp·PageDown·Home·End·空格 /
      触摸滑动 / 点击指示器圆点。
   6. 普通页高度 = 视口高；自然高度超过视口的页按视口比例整体等比缩放，
      保证任何屏幕尺寸下每屏内容完整显示、无截断、无内部滚动条。
   7. 页内锚点（#platform 等）与外部带 hash 的链接自动映射为翻页。

   依赖：必须在 components.js 之后执行（页脚由它注入并参与组装）。
   ============================================================ */

(function () {
  "use strict";

  /* ---- 0. 环境检测：仅当首页五个区块齐全时启用，其余页面不受影响 ---- */
  var main = document.querySelector(".site-main");
  if (!main) return;
  var hero       = main.querySelector(".hero");
  var precedents = main.querySelector(".precedents");
  var platform   = main.querySelector("#platform");
  var hardware   = main.querySelector("#hardware");
  var updates    = main.querySelector("#updates");
  var cta        = main.querySelector("#cta");
  if (!hero || !platform || !hardware || !updates || !cta) return;
  var footer = document.querySelector(".site-footer");  // 由 components.js 注入

  /* ---- 0.5 移动端回退：触屏设备或窄屏（≤860px）不启用整页翻页 ----
     手机上每页自然高度远超视口（四层网格单列后约为视口的 2–3 倍），
     fit() 的整体等比缩放会把正文缩到不可读；整页接管触摸手势也与
     移动端自然阅读预期冲突。此时直接返回：
       - DOM 保持原始文档流，不创建任何 .fp-* 元素，home-pager.css 规则无匹配；
       - 页面走原生滚动，页内锚点由各 CSS 的 scroll-margin-top 补偿固定顶栏；
       - home.css 的小屏媒体查询接管排版。
     判定条件：主指针为触屏（手机/平板），或视口宽度 ≤860（与导航折叠断点一致）。
     仅加载时判定一次：桌面端缩窄窗口仍保留翻页（fit 缩放本就覆盖该场景），
     移动端则稳定获得原生滚动，行为可预期。 */
  var isMobileUI =
    window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth <= 860;
  if (isMobileUI) return;

  /* 滚轮冷却时长（ms）：一次翻页触发后忽略所有滚轮输入，
     避免传统滚轮/触控板的连续事件在动画期间不断触发翻页 */
  var WHEEL_COOLDOWN = 150;
  /* transitionend 未触发时的兜底解锁时间（ms） */
  var LOCK_FALLBACK = 1100;

  /* ---- 1. 运行时组装翻页结构 ----
     普通页：一个 .fp-page（高 = 视口）内含一个 .fp-page-inner；
     加高页：.fp-page.is-tall（高 = 视口 + 页脚高），
             内含 .fp-cta-stage（占一屏）+ 页脚，提供两个停靠点 */
  var viewport = document.createElement("div");
  viewport.className = "fp-viewport";
  main.parentNode.insertBefore(viewport, main);
  viewport.appendChild(main);
  main.classList.add("fp-track");

  function makePage(nodes, tall) {
    var page = document.createElement("div");
    page.className = "fp-page";
    var inner = document.createElement("div");
    inner.className = "fp-page-inner" + (tall ? " is-tall" : "");
    nodes.forEach(function (node) { if (node) inner.appendChild(node); });
    page.appendChild(inner);
    main.appendChild(page);
    return { el: page, inner: inner };
  }

  /* 普通页（每页一个停靠点） */
  var normalPages = [
    makePage([hero, precedents]),
    makePage([platform]),
    makePage([hardware]),
    makePage([updates])
  ];

  /* 加高页：CTA 放进新增的 .fp-cta-stage（占一屏），页脚跟在下方 */
  var tallPage = null, ctaStage = null;
  if (footer) {
    tallPage = makePage([], true);
    ctaStage = document.createElement("div");
    ctaStage.className = "fp-cta-stage";
    ctaStage.appendChild(cta);
    tallPage.inner.appendChild(ctaStage);
    tallPage.inner.appendChild(footer);
  } else {
    /* 页脚注入失败时退化为普通页 */
    normalPages.push(makePage([cta]));
  }

  /* ---- 2. 停靠点表：offset = 该停靠点在轨道坐标系中的顶部偏移（px） ----
     每个停靠点附带代表性锚点，供翻页后回写地址栏 */
  var stops = [];

  function rebuildStops() {
    var vh = viewport.clientHeight;
    stops = [];
    var y = 0;
    normalPages.forEach(function (p) {
      stops.push({ offset: y, hash: firstHash(p.inner, stops.length === 0), el: p.inner });
      y += vh;
    });
    if (tallPage) {
      var fh = footer.offsetHeight;          // 页脚自然高度
      tallPage.el.style.height = (vh + fh) + "px";  // 加高页：视口 + 页脚
      /* 合并尾页只设一个停靠点（页顶对齐 CTA 舞台）；
         页内滚动范围 = 页高 − 视口高 = 页脚高，
         滚到 range 时轨道底部对齐视口底部、完整露出页脚 */
      lastRange = fh;
      lastScroll = Math.min(lastScroll, lastRange);
      stops.push({ offset: y, hash: "#cta", el: tallPage.inner });
    }
  }

  function firstHash(inner, isFirst) {
    if (isFirst) return "";  // 第 1 屏无锚点，回写时清除 hash
    var ids = inner.querySelectorAll("[id]");
    return ids.length ? "#" + ids[0].id : "";
  }

  /* 锚点 → 停靠点索引（供链接点击 / hashchange / 深链定位）；
     hashIndexBottom 记录锚点是否位于合并尾页的页脚内（是则跳转后直达页底） */
  var hashIndex = {}, hashIndexBottom = {};
  function rebuildHashIndex() {
    hashIndex = {}; hashIndexBottom = {};
    stops.forEach(function (s, i) {
      var nodes = s.el.querySelectorAll("[id]");
      for (var k = 0; k < nodes.length; k++) {
        var h = "#" + nodes[k].id;
        if (hashIndex[h] === undefined) {
          hashIndex[h] = i;
          hashIndexBottom[h] = !!(footer && footer.contains(nodes[k]));
        }
      }
    });
  }

  /* ---- 3. 状态机：idle（静止） / drag（跟手拖拽） / settle（吸附动画） ---- */
  var current = 0;          // 当前停靠点索引
  var mode = "idle";
  var dragOffset = 0;       // 拖拽位移（正 = 朝向下一页，仅触摸路径使用）
  var settleTimer = null;   // 吸附动画兜底定时器
  var wheelLocked = false;  // 滚轮冷却锁：翻页期间为 true，冷却结束后释放
  var pendingRelayout = false, pendingSmooth = false;
  var lastScroll = 0;       // 合并尾页的页内滚动位置（0 = 页顶 CTA；lastRange = 页脚完全露出）
  var lastRange = 0;        // 合并尾页页内可滚动范围（px）= 页高 − 视口高 = 页脚高

  function hopForward() {
    return current + 1 < stops.length ? stops[current + 1].offset - stops[current].offset : Infinity;
  }
  function hopBackward() {
    return current - 1 >= 0 ? stops[current].offset - stops[current - 1].offset : Infinity;
  }

  /* 吸附阈值：约为目标跳距的 1/3（80–150px 区间）。
     短跳（如露出页脚）阈值随之变小，小幅度滚动即可触发，手感一致 */
  function thresholdFor(dir) {
    var hop = dir > 0 ? hopForward() : hopBackward();
    if (hop === Infinity) return Infinity;
    return Math.max(80, Math.min(150, hop * 0.33));
  }

  /* 当前位置的附加偏移：合并尾页 = 页内滚动量，其余页恒为 0 */
  function pageExtra() {
    return (tallPage && current === stops.length - 1) ? lastScroll : 0;
  }

  function applyTrack() {
    main.style.transform =
      "translate3d(0," + (-(stops[current].offset + pageExtra() + dragOffset)).toFixed(2) + "px,0)";
  }

  /* 页内滚动应用：短过渡平滑跟随（滚轮逐格用 0.2s，键盘整屏用 0.45s） */
  function innerScrollApply(duration) {
    main.style.setProperty("--fp-duration", duration || "0.2s");
    applyTrack();
    announce();
  }
  function setMode(m) {
    mode = m;
    main.classList.toggle("is-dragging", m === "drag");
  }

  /* 拖拽位移限幅：不越过相邻停靠点过多（0.85 × 跳距，且不超过半屏）；
     合并尾页特殊：向下最多滚到页底（页脚完全露出，不翻页），
     向上先消耗页内滚动余量，再留出与普通页相同的回拉翻页余量 */
  function clampDrag(x) {
    var vh = viewport.clientHeight;
    var fw = hopForward(), bk = hopBackward();
    var maxF, maxB;
    if (tallPage && current === stops.length - 1) {
      maxF = lastRange - lastScroll;
      maxB = Math.min(vh * 0.5, bk * 0.85) + lastScroll;
    } else {
      maxF = fw === Infinity ? 0 : Math.min(vh * 0.5, fw * 0.85);
      maxB = bk === Infinity ? 0 : Math.min(vh * 0.5, bk * 0.85);
    }
    return Math.max(-maxB, Math.min(maxF, x));
  }

  /* 拖拽过程：仅触摸路径使用（1:1 跟手），滚轮路径已改为冷却锁定模式 */
  function updateDrag(delta) {
    if (mode !== "drag") setMode("drag");
    dragOffset = clampDrag(dragOffset + delta);
    applyTrack();
    /* 越过当前停靠点（含尾页页内滚动量）达到阈值 → 吸附翻页 */
    var c = pageExtra() + dragOffset;
    if (c > 0 && c >= thresholdFor(1)) { settleTo(current + 1); return; }
    if (c < 0 && -c >= thresholdFor(-1)) { settleTo(current - 1); return; }
  }

  /* 触摸松开后的吸附/回弹判定 */
  function onTouchRelease() {
    if (mode !== "drag") return;
    var c = pageExtra() + dragOffset;
    if (c > 0 && c >= thresholdFor(1)) { settleTo(current + 1); return; }
    if (c < 0 && -c >= thresholdFor(-1)) { settleTo(current - 1); return; }
    if (tallPage && current === stops.length - 1) {
      if (c >= 0) {
        /* 页内向下滑动：保留停下的位置（不吸附、不回弹），等同自然滚动 */
        lastScroll = Math.min(lastRange, c);
        dragOffset = 0;
        setMode("idle");
        applyTrack();
        if (pendingRelayout) { pendingRelayout = false; relayout(pendingSmooth); }
        return;
      }
      settleTo(current, lastScroll);  // 向上未过阈值 → 回弹到拖拽前的页内位置
      return;
    }
    settleTo(current);  // 未过阈值 → 回弹
  }

  /* ---- 4. 吸附动画与解锁 ---- */
  /* 动画时长按位移距离缩放：整屏位移用 720ms，
     短位移按比例缩短，下限 500ms（页内滚动另用短过渡，见 innerScrollApply） */
  function durationForPx(dist) {
    var vh = viewport.clientHeight || 1;
    var d = 3000 * Math.max(0.4, Math.min(1, dist / vh));
    return Math.max(500, Math.min(820, Math.round(d)));
  }

  function syncHash() {
    if (!history.replaceState) return;
    history.replaceState(null, "", location.pathname + location.search + (stops[current].hash || ""));
  }

  /* inner：目标页内滚动位置（仅合并尾页有效，如 End 键 / 页脚锚点直达页底） */
  function settleTo(idx, inner) {
    idx = Math.max(0, Math.min(stops.length - 1, idx));
    if (mode === "settle") return;  // 吸附进行中忽略新的跳转请求
    var targetInner = (tallPage && idx === stops.length - 1)
      ? Math.max(0, Math.min(lastRange, inner || 0)) : 0;
    if (idx === current && dragOffset === 0 && targetInner === lastScroll) { updateDots(); return; }

    var fromPos = stops[current].offset + pageExtra() + dragOffset;  // 当前视觉位置
    var to = stops[idx].offset + targetInner;
    current = idx;
    dragOffset = 0;
    lastScroll = targetInner;  // 离开尾页时自然归零，翻入尾页时对齐目标位置

    var dist = Math.abs(to - fromPos);
    main.style.setProperty("--fp-duration", (durationForPx(dist) / 1000) + "s");
    setMode("settle");
    applyTrack();  // 从拖拽位置平滑吸附到目标页（transition 生效）
    syncHash();
    announce();

    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(finishSettle, LOCK_FALLBACK);
  }

  function finishSettle() {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (mode !== "settle") return;
    setMode("idle");
    updateDots();
    /* 吸附期间挂起的高度变化：此刻统一处理，避免中途瞬时跳位 */
    if (pendingRelayout) { pendingRelayout = false; relayout(pendingSmooth); }
  }

  /* 过渡结束时精确结束吸附（限定 e.target === main：
     子元素 .reveal 的 transform 过渡会冒泡，不能误判为翻页完成） */
  main.addEventListener("transitionend", function (e) {
    if (mode === "settle" && e.target === main && e.propertyName === "transform") finishSettle();
  });
  main.addEventListener("transitioncancel", function (e) {
    if (mode === "settle" && e.target === main) finishSettle();
  });

  /* ---- 5. 超高内容等比缩放：任何屏幕尺寸下每屏完整显示 ----
     scrollHeight 不受 transform 影响，可直接用于测量自然高度 */
  function fit(inner, avail) {
    if (!inner) return;
    var natural = inner.scrollHeight;
    if (!avail || !natural) return;
    var s = Math.min(1, avail / natural);
    inner.style.transform = s < 0.999 ? "scale(" + s.toFixed(4) + ")" : "";
  }

  function relayout(instantRender) {
    /* 拖拽/吸附中不重排：改高度/瞬时对齐会打断动画或造成跳位，挂起处理 */
    if (mode !== "idle") { pendingRelayout = true; pendingSmooth = pendingSmooth || !!instantRender; return; }
    rebuildStops();
    rebuildHashIndex();
    var vh = viewport.clientHeight;
    normalPages.forEach(function (p) { fit(p.inner, vh); });
    if (ctaStage) fit(ctaStage, vh);  // 极矮视口下压缩 CTA 舞台内容
    if (instantRender) {
      current = Math.min(current, stops.length - 1);
      dragOffset = 0;
      applyTrack();
      updateDots();
    }
  }

  if ("ResizeObserver" in window) {
    /* 图片/字体加载导致内容高度变化时自动重新适配 */
    var ro = new ResizeObserver(function () { relayout(true); });
    normalPages.forEach(function (p) { ro.observe(p.inner); });
    if (ctaStage) ro.observe(ctaStage);
    if (footer) ro.observe(footer);
  }
  window.addEventListener("load", function () { relayout(true); });
  window.addEventListener("resize", function () { relayout(true); });

  /* ---- 6. 右侧点状页码指示器（每停靠点一个圆点，可点击跳转） ---- */
  var dots = document.createElement("nav");
  dots.className = "fp-dots";
  dots.setAttribute("aria-label", "Page navigation");
  viewport.appendChild(dots);

  function updateDots() {
    var children = dots.children;
    for (var i = 0; i < children.length; i++) {
      if (i === current) {
        children[i].classList.add("is-active");
        children[i].setAttribute("aria-current", "page");
      } else {
        children[i].classList.remove("is-active");
        children[i].removeAttribute("aria-current");
      }
    }
  }

  function buildDots() {
    dots.innerHTML = "";
    stops.forEach(function (s, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fp-dot";
      b.setAttribute("aria-label", "Go to page " + (i + 1) + (s.hash ? " (" + s.hash + ")" : ""));
      b.addEventListener("click", function () {
        if (mode !== "settle" && i !== current) settleTo(i);
      });
      dots.appendChild(b);
    });
    updateDots();
  }

  /* ---- 7. 输入触发：滚轮（冷却锁定）/ 键盘（直接跳转）/ 触摸（拖拽） ---- */

  /* 鼠标滚轮与触控板：一次滚轮手势 = 一次翻页，
     冷却期间（动画时长 + 缓冲）忽略所有滚轮输入，
     彻底解决触控板连续事件导致的"一跳一跳然后突然翻页"。
     合并尾页例外：滚轮优先驱动页内滚动（自然滚动、不吸附、不进冷却），
     滚到页内边界后继续同向滚动才走翻页逻辑（页顶向上翻回上一页） */
  var wheelCooldownTimer = null;
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey) return;                    // Ctrl+滚轮 = 浏览器缩放，不拦截
    e.preventDefault();                        // 始终拦截，避免冷却期间原生滚动穿透
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(dy) < 2) return;             // 过滤触控板的微小噪声事件

    /* 合并尾页：页内滚动 */
    if (tallPage && current === stops.length - 1 && !wheelLocked && mode === "idle") {
      if (dy > 0 && lastScroll < lastRange) {
        lastScroll = Math.min(lastRange, lastScroll + dy);
        innerScrollApply();
        return;
      }
      if (dy < 0 && lastScroll > 0) {
        lastScroll = Math.max(0, lastScroll + dy);
        innerScrollApply();
        return;
      }
      /* 已在页内边界：向下到底无页可翻（下方边界判断拦截），
         向上到顶则落入翻页逻辑翻回上一页 */
    }

    if (wheelLocked) return;                   // 冷却中：忽略
    if (mode !== "idle") return;               // 动画中（可能是键盘/圆点触发的）：忽略
    var dir = dy > 0 ? 1 : -1;
    var next = current + dir;
    if (next < 0 || next >= stops.length) return;  // 已到边界

    wheelLocked = true;
    settleTo(next);
    if (wheelCooldownTimer) clearTimeout(wheelCooldownTimer);
    wheelCooldownTimer = setTimeout(function () { wheelLocked = false; }, WHEEL_COOLDOWN);
  }, { passive: false });

  /* 键盘：整页直接跳转（按下即吸附，不做拖拽）；
     合并尾页上方向键/空格先驱动页内滚动，到边界后再翻页 */
  window.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var step = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      if (tallPage && current === stops.length - 1 && mode !== "settle") {
        if (step > 0 && lastScroll < lastRange) {
          lastScroll = Math.min(lastRange, lastScroll + viewport.clientHeight * 0.8);
          innerScrollApply("0.45s");
          return;
        }
        if (step < 0 && lastScroll > 0) {
          lastScroll = Math.max(0, lastScroll - viewport.clientHeight * 0.8);
          innerScrollApply("0.45s");
          return;
        }
      }
      var nextIdx = current + step;
      if (nextIdx < 0 || nextIdx >= stops.length) return;  // 已到边界（如尾页底部再向下）
      settleTo(nextIdx);
    }
    else if (e.key === "Home") { e.preventDefault(); settleTo(0); }
    else if (e.key === "End")  { e.preventDefault(); settleTo(stops.length - 1, tallPage ? lastRange : 0); }
  });

  /* 触摸滑动：1:1 跟手拖拽，松手时过阈值吸附翻页、否则回弹 */
  var touchStart = null, touchLast = null;
  viewport.addEventListener("touchstart", function (e) {
    if (mode !== "idle" || e.touches.length !== 1) return;
    touchStart = e.touches[0].clientY;
    touchLast = touchStart;
  }, { passive: true });
  viewport.addEventListener("touchmove", function (e) {
    if (touchStart === null) return;
    var y = e.touches[0].clientY;
    if (touchLast !== null) updateDrag((touchLast - y) * 1.0);  // 上滑 → 下一页
    touchLast = y;
  }, { passive: true });
  viewport.addEventListener("touchend", function (e) {
    if (touchStart === null) return;
    touchStart = null; touchLast = null;
    onTouchRelease();
  }, { passive: true });

  /* Tab 键焦点进入某屏时自动翻到对应停靠点（键盘无障碍） */
  viewport.addEventListener("focusin", function (e) {
    var el = e.target;
    if (!el || !viewport.contains(el) || el.closest(".fp-dots")) return;
    var docTop = el.getBoundingClientRect().top - viewport.getBoundingClientRect().top +
                 stops[current].offset + pageExtra() + dragOffset;
    for (var i = 0; i < stops.length; i++) {
      var next = i + 1 < stops.length ? stops[i + 1].offset : Infinity;
      if (docTop >= stops[i].offset - 1 && docTop < next) {
        if (i !== current) settleTo(i);
        break;
      }
    }
  });

  /* ---- 8. 锚点接管：指向本页锚点的链接点击改为翻页；
        覆盖纯 #hash 与"同页完整 URL + hash"（如导航栏按钮）两种写法 ---- */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || !a.hash) return;
    var idx = hashIndex[a.hash];
    if (idx === undefined) return;
    var samePage = a.getAttribute("href").charAt(0) === "#" || a.pathname === location.pathname;
    if (!samePage) return;
    e.preventDefault();  // 阻止原生锚点滚动，避免与 transform 平移叠加
    settleTo(idx, hashIndexBottom[a.hash] ? lastRange : 0);  // 页脚内锚点直达页底
  });
  window.addEventListener("hashchange", function () {
    var idx = hashIndex[location.hash];
    if (idx !== undefined && mode !== "settle")
      settleTo(idx, hashIndexBottom[location.hash] ? lastRange : 0);
  });

  /* 兜底：不支持 overflow:clip 的旧浏览器中，容器仍可被程序化滚动
     （锚点导航/scrollIntoView/焦点定位），捕获阶段强制归零，
     保证视觉位置永远只由 transform 决定（定位锁定） */
  viewport.addEventListener("scroll", function (e) {
    var t = e.target;
    if (t && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0; }
  }, true);

  /* ---- 10. 对外最小接口（供全站 back-to-top 悬浮按钮使用，见 main.js） ----
     isTop()：是否位于第 1 屏顶部（含尾页页内滚动归零判定）；
     toTop()：吸附回第 1 屏；
     每次停靠点切换 / 尾页页内滚动后广播 “abite:pager-change”，
     浮层组件据此同步显隐，无需轮询 */
  function announce() {
    try { window.dispatchEvent(new CustomEvent("abite:pager-change")); } catch (err) {}
  }
  window.ABITE_PAGER = {
    isTop: function () { return current === 0 && lastScroll <= 0; },
    toTop: function () { settleTo(0, 0); }
  };

  /* ---- 9. 初始化：处理外部带 hash 进入（如 index.html#updates），瞬时对齐不播动画 ---- */
  relayout(false);
  buildDots();
  var startIndex = hashIndex[location.hash];
  if (startIndex !== undefined) {
    current = startIndex;
    /* 页脚锚点深链（如 index.html#about）：直接对齐页底（页脚可见） */
    if (tallPage && current === stops.length - 1 && hashIndexBottom[location.hash]) lastScroll = lastRange;
  }
  applyTrack();
  updateDots();
  /* 终止可能仍在进行中的浏览器原生锚点平滑滚动（html 上有 scroll-behavior:smooth） */
  try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }
  catch (err) { window.scrollTo(0, 0); }
})();