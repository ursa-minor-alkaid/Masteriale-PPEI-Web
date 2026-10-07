/* ============================================================
   A-BITE 全站共享组件注入器
   负责把「毛玻璃背景 + 顶部导航栏」注入每个页面，
   使导航与背景在全站只有这一份源码（改这里 = 全站生效）。

   工作原理：
   1. 通过 document.currentScript.src 推导出站点根路径，
      因此无论页面位于 docs/ 还是 docs/team/ 等更深目录，
      链接与资源路径都能正确解析，页面侧零配置；
   2. 脚本以 defer 方式加载，在 DOM 解析完成后、首次绘制前执行，
      注入过程无闪烁；
   3. 不发起任何网络请求（不依赖 fetch），file:// 直接打开也能工作。
   依赖：本脚本必须先于 main.js 执行（main.js 会绑定导航交互）。
   ============================================================ */

(function () {
  "use strict";

  /* ---- 站点根路径推导 ----
     本文件固定位于 <root>/js/components.js，
     从自身 URL 截掉尾部即得根路径（如 http://host/ 或 file:///.../） */
  var scriptUrl = document.currentScript ? document.currentScript.src : "";
  var root = scriptUrl.replace(/js\/components\.js(\?.*)?$/, "");

  /* ---- 1. 毛玻璃背景（样式见 Styles/components/background.css） ---- */
  var backgroundHtml =
    '<div class="page-background" aria-hidden="true">' +
      '<div class="page-frost-base"></div>' +
      '<div class="page-frost-blob b1"></div>' +
      '<div class="page-frost-blob b2"></div>' +
      '<div class="page-frost-blob b3"></div>' +
      '<div class="page-frost-blob b4"></div>' +
      '<div class="page-frost-blob b5"></div>' +
      '<div class="page-frost-blob b6"></div>' +
      '<div class="page-frost-blob b7"></div>' +
      '<div class="page-frost-glass"></div>' +
    '</div>';

  /* ---- 2. 顶部导航栏（样式见 navbar.css / navbar-dropdown.css） ----
     所有链接基于 root 拼接，保证在任何深度的子页面中都指向正确目标 */
  var chevron =
    '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  var navbarHtml =
    '<header class="site-header">' +
      '<nav class="nav-inner container" aria-label="Primary">' +
        '<a class="nav-logo" href="' + root + 'index.html">' +
          /* WebP 仅 7.7KB（原 PNG 124KB）：DPR≥2 屏走 srcset，旧浏览器回退 PNG */
          '<img src="' + root + 'Assets/icons/logo-mark.png" ' +
               'srcset="' + root + 'Assets/opt/logo-mark-128.webp 2x, ' +
                       root + 'Assets/opt/logo-mark-128.webp 3x" ' +
               'alt="A-BITE logo">' +
          '<span>A-BITE</span>' +
        '</a>' +
        '<div class="nav-links" id="nav-links">' +
          '<div class="nav-item">' +
            '<a class="nav-parent" href="' + root + 'docs/the-problem.html">The problem ' + chevron + '</a>' +
            '<div class="nav-dropdown">' +
              '<a href="' + root + 'docs/the-problem.html#be-careful">Be careful</a>' +
              '<a href="' + root + 'docs/the-problem.html#how-to-know">How to know</a>' +
              '<a href="' + root + 'docs/the-problem.html#look-alike-diseases">Look-alike diseases</a>' +
              '<a href="' + root + 'docs/the-problem.html#tests-take-days">Tests take days</a>' +
              '<a href="' + root + 'docs/the-problem.html#delayed-mapping">Delayed mapping</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-item">' +
            '<a class="nav-parent" href="' + root + 'docs/the-science.html">The science ' + chevron + '</a>' +
            '<div class="nav-dropdown">' +
              '<a href="' + root + 'docs/the-science.html#virus-dose">Virus dose</a>' +
              '<a href="' + root + 'docs/the-science.html#early-replication">Early replication</a>' +
              '<a href="' + root + 'docs/the-science.html#microneedle-access">Microneedle access</a>' +
              '<a href="' + root + 'docs/the-science.html#reading-rna">Reading the RNA</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-item">' +
            '<a class="nav-parent" href="' + root + 'docs/the-next-steps.html">The next steps ' + chevron + '</a>' +
            '<div class="nav-dropdown">' +
              '<a href="' + root + 'docs/the-next-steps.html#acceptability">Acceptability</a>' +
              '<a href="' + root + 'docs/the-next-steps.html#business-model">Business model</a>' +
              '<a href="' + root + 'docs/the-next-steps.html#deployment">Deployment</a>' +
              '<a href="' + root + 'docs/the-next-steps.html#expansion">Expansion</a>' +
              '<a href="' + root + 'docs/the-next-steps.html#data-ethics">Data &amp; ethics</a>' +
              '<a href="' + root + 'docs/what-a-bite-is-not.html">What A-BITE is not</a>' +
            '</div>' +
          '</div>' +
          '<div class="nav-item">' +
            '<a class="nav-parent" href="' + root + 'docs/team/the-team.html">The team ' + chevron + '</a>' +
            '<div class="nav-dropdown">' +
              '<a href="' + root + 'docs/team/us-three.html">Us three</a>' +
              '<a href="' + root + 'docs/team/the-team.html#supervision">Supervision</a>' +
              '<a href="' + root + 'docs/team/the-team.html#acknowledgements">Acknowledgements</a>' +
              '<a href="' + root + 'docs/team/the-program.html">The program</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="nav-links">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</nav>' +
    '</header>';

  /* ---- 3. 页脚（样式见 Styles/components/footer.css） ----
     三个链接列内容与 local/footer_content.md 保持一致，
     全部为站外链接，统一新标签页打开（rel=noopener 保证安全） */
  var ext = ' target="_blank" rel="noopener noreferrer"';

  var footerHtml =
    '<footer class="site-footer" id="about">' +
      '<div class="container">' +
        '<div class="footer-grid">' +
          '<div class="footer-brand">' +
            /* 320px WebP 25.7KB（原 PNG 356KB）；极旧浏览器不支持 WebP 时回退 PNG */
            '<img src="' + root + 'Assets/opt/footer-brand-320.webp" ' +
                 'onerror="this.onerror=null;this.src=\'' + root + 'Assets/icons/ICON (2).png\'" ' +
                 'alt="A-BITE logo" loading="lazy" decoding="async">' +
          '</div>' +
          '<div class="footer-col">' +
            '<h4>Related Courses</h4>' +
            '<ul>' +
              '<li><a href="https://www.universite-paris-saclay.fr/en/education/masters-degree/biologie-moleculaire-et-cellulaire/m2-tissue-cell-and-gene-biotherapies-btcg"' + ext + '>BTCG Master</a></li>' +
              '<li><a href="https://www.univ-evry.fr/intranet/evenements/2026/evenements-du-personnel/les-5-ans-du-ppei.html"' + ext + '>PPEI</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="footer-col">' +
            '<h4>WHO Resources</h4>' +
            '<ul>' +
              '<li><a href="https://www.who.int/news-room/questions-and-answers/item/chikungunya"' + ext + '>WHO: Chikungunya</a></li>' +
              '<li><a href="https://www.who.int/europe/news-room/questions-and-answers/item/public-health-advice-on-dengue-fever"' + ext + '>WHO: Dengue</a></li>' +
            '</ul>' +
          '</div>' +
          '<div class="footer-col">' +
            '<h4>About</h4>' +
            '<ul>' +
              '<li><a href="https://github.com/ursa-minor-alkaid/Masteriale-PPEI-Web"' + ext + '>Source Code</a></li>' +
              '<li><a href="https://life.hust.edu.cn/info/1968/12075.htm#1"' + ext + '>Bio-Symposium</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="footer-bottom">' +
          '<span>© <span data-year>2026</span> A-BITE — demonstration page, content is illustrative.</span>' +
          '<span class="mono">testing → surveillance</span>' +
        '</div>' +
        /* 合作院校徽标：两枚 logo 均为白色透明底，垫深色小底片保证可见性与对比度；
           EVRY 原图透明留白过大，使用裁剪版 EVRY-trimmed.png 以对齐视觉尺寸 */
        '<div class="footer-unis">' +
          /* 校徽改引压缩 WebP（94KB→13KB / 117KB→27KB），不支持时回退原 PNG */
          '<span class="uni-chip"><img src="' + root + 'Assets/opt/evry-520.webp" ' +
            'onerror="this.onerror=null;this.src=\'' + root + 'Assets/icons/EVRY-trimmed.png\'" ' +
            'alt="Université Évry" loading="lazy" decoding="async"></span>' +
          '<span class="uni-chip"><img src="' + root + 'Assets/opt/hust-640.webp" ' +
            'onerror="this.onerror=null;this.src=\'' + root + 'Assets/icons/HUST.png\'" ' +
            'alt="Huazhong University of Science and Technology" loading="lazy" decoding="async"></span>' +
        '</div>' +
      '</div>' +
    '</footer>';

  /* ---- 4. 返回顶部悬浮按钮（样式见 Styles/components/back-to-top.css） ----
     胶囊形玻璃按钮：上移箭头 + mono「TOP」标签；
     显隐与点击回顶逻辑见 main.js（首页整页翻页模式由 pager.js 接管） */
  var toTopHtml =
    '<button type="button" class="back-to-top" aria-label="Back to top">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>' +
      '</svg>' +
      '<span>Top</span>' +
    '</button>';

  /* ---- 注入：背景垫底，导航在页面内容之前，页脚与回顶按钮追加在内容之后 ---- */
  document.body.insertAdjacentHTML("afterbegin", backgroundHtml + navbarHtml);
  document.body.insertAdjacentHTML("beforeend", footerHtml + toTopHtml);
})();
