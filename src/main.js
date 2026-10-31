// Vestra Player download page: language, the download button for the visitor's
// system, the feature tour, the plugin filter and the AI workshop mock.
// Plain script, no dependencies.
(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.replace("no-js", "js");
  const data = JSON.parse(document.getElementById("page-data").textContent);
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const hasIO = "IntersectionObserver" in window;

  // ---- Stored preference (may be unavailable: private mode, blocked storage) ----

  const LANG_KEY = "vestra-page-lang";
  const stored = {
    get() {
      try { return localStorage.getItem(LANG_KEY); } catch { return null; }
    },
    set(value) {
      try { localStorage.setItem(LANG_KEY, value); } catch { /* not kept */ }
    },
  };

  // ---- Visitor's system: macOS gets the macOS button, everyone else Windows ----

  function detectOS() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    const ua = navigator.userAgent || "";
    // iPadOS asks for the desktop site and reports a Mac with touch.
    if (/mac/i.test(platform) && navigator.maxTouchPoints > 1) return "windows";
    if (/iphone|ipad|ipod/i.test(ua)) return "windows";
    if (/mac/i.test(platform) || /mac os x/i.test(ua)) return "macos";
    return "windows";
  }
  const detected = detectOS();
  root.dataset.visitor = $(`.cta-btn.os-${detected}`) ? detected : "windows";

  // ---- Language ----

  function pickLang() {
    const saved = stored.get();
    if (data.langs.includes(saved)) return saved;
    for (const tag of navigator.languages || [navigator.language || "en"]) {
      if (/^zh\b/i.test(tag)) return "zh-Hans";
      if (/^en\b/i.test(tag)) return "en";
    }
    return "en";
  }
  let lang = pickLang();
  const text = (key) => data.i18n[lang][key] ?? data.i18n.en[key] ?? key;
  const onLang = [];

  function applyLang() {
    root.lang = lang;
    for (const el of $$("[data-i18n]")) el.textContent = text(el.dataset.i18n);
    for (const el of $$("[data-i18n-html]")) el.innerHTML = text(el.dataset.i18nHtml);
    for (const el of $$("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(";")) {
        const [attr, key] = pair.split(":");
        el.setAttribute(attr, text(key));
      }
    }
    const chrome = $(".chrome");
    if (chrome) chrome.alt = text("frame.alt");
    document.title = text("meta.title");
    $('meta[name="description"]').content = text("meta.description");
    $("#lang-toggle").lang = lang === "en" ? "zh-Hans" : "en";
    for (const fn of onLang) fn();
  }

  $("#lang-toggle").addEventListener("click", () => {
    lang = lang === "en" ? "zh-Hans" : "en";
    stored.set(lang);
    applyLang();
  });

  // ---- One download entry on screen: the nav button shows only when no other is visible ----

  (() => {
    const nav = $("#nav-dl");
    const buttons = $$(".cta-btn").filter((b) => getComputedStyle(b).display !== "none");
    if (!nav || !buttons.length) return;
    nav.href = buttons[0].href;
    if (!hasIO) {
      nav.inert = false;
      root.classList.add("nav-dl-on");
      return;
    }
    // Every download button on the page (the hero's and the closing section's) counts.
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target);
        else seen.delete(entry.target);
      }
      const show = seen.size === 0;
      root.classList.toggle("nav-dl-on", show);
      nav.inert = !show;
    }, { rootMargin: "-64px 0px 0px 0px" }); // a button under the sticky header counts as gone
    for (const b of buttons) io.observe(b);
  })();

  // ---- Other platforms: a dialog (the release page without script) ----

  (() => {
    const dialog = $("#platforms");
    if (!dialog || typeof dialog.showModal !== "function") return;
    for (const opener of $$(".js-platforms")) {
      opener.addEventListener("click", (event) => {
        event.preventDefault();
        dialog.showModal();
      });
    }
    $(".pf-close", dialog).addEventListener("click", () => dialog.close());
    // A click on the backdrop (outside the box) closes it.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) dialog.close();
    });
  })();

  // ---- Media helper: play only while allowed ----

  const mayMove = () => !reduce.matches && !saveData && !document.hidden;
  function safePlay(video) {
    const promise = video.play();
    if (promise) promise.catch(() => { /* autoplay refused: the poster stays */ });
  }

  // ---- Hero backdrop: plays only while on screen ----

  (() => {
    const video = $(".backdrop video");
    if (!video) return;
    let visible = true;
    const update = () => (visible && mayMove() ? safePlay(video) : video.pause());
    if (hasIO) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        update();
      }).observe(video.parentNode);
    }
    document.addEventListener("visibilitychange", update);
    reduce.addEventListener?.("change", update);
    update();
  })();

  // ---- Feature tour: the window stays pinned, the step under the middle of the screen picks the clip ----

  (() => {
    const section = $("#features");
    const stage = $(".tour-stage", section);
    const slides = $$(".slide", section);
    const videos = slides.map((slide) => $("video", slide));
    const steps = $$(".step", section);
    const dots = $$(".step-dot", section);
    if (!slides.length) return;
    let index = 0;
    let visible = false;

    // With reduced motion the pinned window is hidden (each step shows its poster): load nothing for it.
    const shown = () => getComputedStyle(stage).display !== "none";

    function loadPoster(i) {
      const video = videos[i];
      if (!video || !video.dataset.poster || !shown()) return;
      video.poster = video.dataset.poster;
      video.removeAttribute("data-poster");
    }

    function load(i) {
      const video = videos[i];
      if (!video || !shown()) return;
      loadPoster(i);
      if (video.dataset.loaded) return;
      video.dataset.loaded = "1";
      for (const source of $$("source[data-src]", video)) {
        source.src = source.dataset.src;
        source.removeAttribute("data-src");
      }
      video.load();
    }

    function sync() {
      videos.forEach((video, i) => {
        if (i === index && visible && mayMove()) {
          load(i);
          safePlay(video);
        } else {
          video.pause();
        }
      });
    }

    function activate(i) {
      if (i === index) return;
      videos[index].pause();
      index = i;
      slides.forEach((s, n) => s.classList.toggle("is-active", n === i));
      steps.forEach((s, n) => s.classList.toggle("is-active", n === i));
      dots.forEach((d, n) => (n === i ? d.setAttribute("aria-current", "step") : d.removeAttribute("aria-current")));
      // The poster first, so the switch shows a picture at once; the next poster ahead of time.
      load(i);
      loadPoster(i + 1);
      if (videos[i].readyState > 0) videos[i].currentTime = 0;
      sync();
    }

    dots.forEach((dot, i) => dot.addEventListener("click", () => {
      if (getComputedStyle(stage).display === "none") return;
      steps[i].scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "center" });
      activate(i);
    }));

    if (hasIO) {
      // The step crossing a line across the viewport is the active one: the middle beside the
      // window on wide screens, lower on narrow ones where the window is pinned above the text.
      const narrow = window.matchMedia("(max-width: 860px)");
      let stepIO = null;
      const watchSteps = () => {
        if (stepIO) stepIO.disconnect();
        const line = narrow.matches ? 62 : 50;
        stepIO = new IntersectionObserver((entries) => {
          for (const entry of entries) if (entry.isIntersecting) activate(steps.indexOf(entry.target));
        }, { rootMargin: `-${line}% 0px -${100 - line}% 0px` });
        for (const step of steps) stepIO.observe(step);
      };
      watchSteps();
      narrow.addEventListener?.("change", watchSteps);
      // The first poster once the window comes near.
      const near = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) { loadPoster(index); near.disconnect(); }
      }, { rootMargin: "100% 0px" });
      near.observe(stage);
      // Nothing plays while the window is off screen.
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.25 }).observe($(".frame", stage));
    } else loadPoster(0);
    // Reduced motion: each step shows its still instead (no script: a <noscript> copy).
    const stills = () => {
      if (!reduce.matches) return;
      for (const img of $$("img.step-poster[data-src]", section)) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
    };
    stills();
    document.addEventListener("visibilitychange", sync);
    reduce.addEventListener?.("change", () => { stills(); sync(); });
  })();

  // ---- Plugin wall filter ----

  (() => {
    const buttons = $$(".pl-tabs button");
    const cards = $$(".plugin");
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter;
        for (const b of buttons) b.setAttribute("aria-pressed", String(b === button));
        for (const card of cards) card.hidden = filter !== "all" && card.dataset.kind !== filter;
      });
    }
  })();

  // ---- AI workshop mock: types the prompt, then the checks and the install play once ----

  (() => {
    const section = $("#ai");
    const typed = $(".typed", section);
    if (!section || !typed) return;
    let played = false;
    let timer = 0;

    function type() {
      const chars = Array.from(text("ai.prompt"));
      let n = 0;
      clearInterval(timer);
      typed.textContent = "";
      section.classList.add("is-typing");
      timer = setInterval(() => {
        typed.textContent = chars.slice(0, ++n).join("");
        if (n >= chars.length) {
          clearInterval(timer);
          section.classList.remove("is-typing");
          section.classList.add("is-playing");
        }
      }, 45);
    }

    function finish() {
      clearInterval(timer);
      typed.textContent = text("ai.prompt");
      section.classList.remove("is-typing");
      section.classList.add("is-playing");
    }

    onLang.push(() => { if (played) finish(); });
    if (!hasIO || reduce.matches) { finish(); played = true; return; }
    section.classList.add("is-waiting");
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || played) return;
      played = true;
      io.disconnect();
      section.classList.remove("is-waiting");
      if (reduce.matches) finish();
      else type();
    }, { threshold: 0.35 });
    io.observe($(".ai-flow", section));
  })();

  applyLang();
})();
