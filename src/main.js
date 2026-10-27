// Vestra Player download page: language, download button for the visitor's
// system, and the feature tour. Plain script, no dependencies.
(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.replace("no-js", "js");
  const data = JSON.parse(document.getElementById("page-data").textContent);
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const format = (text, args) => text.replace(/\{(\w+)\}/g, (m, key) => (key in args ? args[key] : m));

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

  // ---- Visitor's system: one download button on Windows and macOS ----

  function detectOS() {
    const ua = navigator.userAgent || "";
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/android|iphone|ipad|ipod/i.test(ua)) return "other";
    // iPadOS asks for the desktop site and reports a Mac with touch.
    if (/mac/i.test(platform) && navigator.maxTouchPoints > 1) return "other";
    if (/^win/i.test(platform) || /windows nt/i.test(ua)) return "windows";
    if (/mac/i.test(platform) || /mac os x/i.test(ua)) return "macos";
    return "other";
  }
  const os = detectOS();
  root.dataset.visitor = $(`.cta-btn[data-os="${os}"]`) ? os : "other";

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
    $(".chrome").alt = text("frame.alt");
    document.title = text("meta.title");
    $('meta[name="description"]').content = text("meta.description");
    $("#lang-toggle").lang = lang === "en" ? "zh-Hans" : "en";
    tour.relabel();
  }

  $("#lang-toggle").addEventListener("click", () => {
    lang = lang === "en" ? "zh-Hans" : "en";
    stored.set(lang);
    applyLang();
  });

  // ---- Copy SHA-256 ----

  for (const button of $$(".copy")) {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = text("dl.copied");
        setTimeout(() => { button.textContent = text("dl.copy"); }, 1500);
      } catch { /* clipboard refused: the hash stays selectable */ }
    });
  }

  // ---- Feature tour ----

  const tour = (() => {
    const region = $("#tour");
    const slides = $$(".slide", region);
    const videos = slides.map((slide) => $("video", slide));
    const dots = $$(".dot-btn", region);
    const caption = $("#tour-caption");
    const titleEl = $(".slide-title [data-i18n]", caption);
    const textEl = $(".slide-text [data-i18n]", caption);
    const iconEl = $(".slide-icon", caption);
    const pauseButton = $(".pause", region);
    const clipButton = $(".clip-toggle", region);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const count = slides.length;
    const FALLBACK_MS = 8000; // per slide when its video cannot play
    const broken = new Array(count).fill(false);

    let index = 0;
    let userPaused = reduce.matches; // reduced motion: nothing moves until asked
    let hovered = false;
    let focused = false;
    let visible = true;
    let manualClip = false;
    let timer = 0;
    let timerStart = 0;

    videos[0].dataset.loaded = "1";

    function load(i) {
      const video = videos[i];
      if (video.dataset.poster) {
        video.poster = video.dataset.poster;
        video.removeAttribute("data-poster");
      }
      if (video.dataset.loaded) return;
      video.dataset.loaded = "1";
      for (const source of $$("source[data-src]", video)) {
        source.src = source.dataset.src;
        source.removeAttribute("data-src");
      }
      video.preload = "auto";
      video.load();
    }

    // Poster of the next slide ahead of time, so the switch shows an image at once.
    function warm(i) {
      const video = videos[(i + count) % count];
      if (video.dataset.poster) {
        const image = new Image();
        image.src = video.dataset.poster;
      }
    }

    for (const [i, video] of videos.entries()) {
      video.addEventListener("ended", () => {
        if (i !== index) return;
        if (advancing()) go(index + 1);
        else safePlay(video);
      });
      // The last <source> failing means nothing playable: fall back to the poster and a timer.
      const sources = $$("source", video);
      sources[sources.length - 1].addEventListener("error", () => {
        broken[i] = true;
        if (i === index) sync();
      });
    }

    const motion = () => !userPaused && visible;
    const advancing = () => motion() && !hovered && !focused;

    function safePlay(video) {
      const promise = video.play();
      if (promise) promise.catch(() => {
        // Autoplay refused (e.g. power saving): treat like a missing video.
        const i = videos.indexOf(video);
        if (i === index && !manualClip) { broken[i] = true; sync(); }
      });
    }

    function sync() {
      const video = videos[index];
      video.loop = !advancing();
      clipButton.hidden = !userPaused;
      if ((motion() && !broken[index]) || manualClip) safePlay(video);
      else video.pause();
      clearTimeout(timer);
      timer = 0;
      if (advancing() && broken[index]) {
        timerStart = performance.now();
        timer = setTimeout(() => go(index + 1), FALLBACK_MS);
      }
      pauseButton.setAttribute("aria-pressed", String(userPaused));
      pauseButton.dataset.i18nAttr = `aria-label:${userPaused ? "tour.play" : "tour.pause"}`;
      pauseButton.setAttribute("aria-label", text(userPaused ? "tour.play" : "tour.pause"));
      const clipKey = manualClip && !video.paused ? "tour.pauseClip" : "tour.playClip";
      clipButton.setAttribute("aria-label", text(clipKey));
    }

    function go(target, { announce = false } = {}) {
      const next = (target + count) % count;
      if (next !== index) {
        videos[index].pause();
        slides[index].classList.remove("is-active");
        index = next;
        slides[index].classList.add("is-active");
        load(index);
        if (videos[index].readyState > 0) videos[index].currentTime = 0;
      }
      dots[index].style.setProperty("--p", "0");
      warm(index + 1);
      manualClip = false;
      caption.setAttribute("aria-live", announce ? "polite" : "off");
      relabel();
      sync();
    }

    function relabel() {
      const id = data.slides[index].id;
      titleEl.dataset.i18n = `slide.${id}.title`;
      textEl.dataset.i18n = `slide.${id}.caption`;
      titleEl.textContent = text(titleEl.dataset.i18n);
      textEl.textContent = text(textEl.dataset.i18n);
      const icon = data.slides[index].icon;
      iconEl.hidden = !icon;
      if (icon) iconEl.src = icon;
      dots.forEach((dot, i) => {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
        dot.setAttribute("aria-label", format(text("tour.show"), { n: i + 1, title: text(`slide.${data.slides[i].id}.title`) }));
      });
    }

    // Progress of the current slide on its dot.
    function frame() {
      const video = videos[index];
      let p = 0;
      if (timer) p = (performance.now() - timerStart) / FALLBACK_MS;
      else if (video.duration) p = video.currentTime / video.duration;
      dots[index].style.setProperty("--p", Math.min(1, p).toFixed(4));
      requestAnimationFrame(frame);
    }

    // ---- Input ----

    $(".prev", region).addEventListener("click", () => go(index - 1, { announce: true }));
    $(".next", region).addEventListener("click", () => go(index + 1, { announce: true }));
    dots.forEach((dot, i) => dot.addEventListener("click", () => go(i, { announce: true })));
    pauseButton.addEventListener("click", () => {
      userPaused = !userPaused;
      manualClip = false;
      sync();
    });
    clipButton.addEventListener("click", () => {
      const video = videos[index];
      manualClip = video.paused;
      if (manualClip) safePlay(video);
      else video.pause();
      sync();
    });
    region.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") go(index - 1, { announce: true });
      else if (event.key === "ArrowRight") go(index + 1, { announce: true });
      else return;
      event.preventDefault();
    });

    const stage = $(".stage", region);
    stage.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hovered = true; sync(); } });
    stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { hovered = false; sync(); } });
    region.addEventListener("focusin", () => { focused = true; sync(); });
    region.addEventListener("focusout", (e) => {
      if (!region.contains(e.relatedTarget)) { focused = false; sync(); }
    });

    // Swipe on touch screens.
    const frameEl = $(".frame", region);
    let start = null;
    frameEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") start = { x: e.clientX, y: e.clientY };
    });
    frameEl.addEventListener("pointerup", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1), { announce: true });
    });
    frameEl.addEventListener("pointercancel", () => { start = null; });

    // Nothing plays off screen or in a background tab.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting && !document.hidden;
        sync();
      }, { threshold: 0.2 }).observe(frameEl);
    }
    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      sync();
    });
    reduce.addEventListener?.("change", () => {
      userPaused = reduce.matches;
      sync();
    });

    warm(1);
    requestAnimationFrame(frame);
    return { relabel() { relabel(); sync(); }, start: sync };
  })();

  applyLang();
  tour.start();
})();
