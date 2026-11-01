// Vestra Player download page: language, the download button for the visitor's
// system, the playing windows (stage and feature chapters), the stage parallax,
// the plugin filter and the AI workshop mock.
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

  // ---- Media: one window plays at a time ----
  // Every [data-media] window (the stage's front window, each feature chapter) holds a poster
  // and a muted video. The most visible one plays and every other one is paused, so only one
  // clip decodes at a time. Nothing loads or plays with reduced motion, Save-Data, a hidden tab
  // or after the visitor pressed pause (one state for the whole page).

  const mayMove = () => !reduce.matches && !saveData && !document.hidden;
  function safePlay(video) {
    const promise = video.play();
    if (promise) promise.catch(() => { /* autoplay refused: the poster stays */ });
  }

  (() => {
    const units = $$("[data-media]")
      .map((el) => ({ el, shot: $(".shot", el), video: $("video", el), ratio: 0 }))
      .filter((u) => u.video);
    const buttons = $$(".pp");
    if (!units.length || !hasIO) return;
    let userPaused = false;

    function load(u) {
      if (u.video.dataset.loaded) return;
      u.video.dataset.loaded = "1";
      for (const source of $$("source[data-src]", u.video)) {
        source.src = source.dataset.src;
        source.removeAttribute("data-src");
      }
      u.video.load();
    }

    function sync() {
      let best = null;
      for (const u of units) if (u.ratio >= 0.35 && (!best || u.ratio > best.ratio)) best = u;
      const allowed = mayMove() && !userPaused;
      for (const u of units) {
        if (u === best && allowed) {
          load(u);
          safePlay(u.video);
        } else if (!u.video.paused) u.video.pause();
      }
    }

    function labels() {
      const key = userPaused ? "media.play" : "media.pause";
      for (const b of buttons) {
        const label = $("[data-i18n]", b);
        label.dataset.i18n = key;
        label.textContent = text(key);
        b.classList.toggle("is-paused", userPaused);
      }
    }

    function controls() {
      // The control exists only while something may play.
      const show = !reduce.matches && !saveData;
      for (const b of buttons) b.hidden = !show;
    }

    for (const u of units) {
      // The video fades in over its poster once frames arrive.
      u.video.addEventListener("playing", () => u.shot.classList.add("is-live"));
    }
    for (const b of buttons) {
      b.addEventListener("click", () => {
        userPaused = !userPaused;
        labels();
        sync();
      });
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const u = units.find((x) => x.el === entry.target);
        if (u) u.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      }
      sync();
    }, { threshold: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1] });
    for (const u of units) io.observe(u.el);

    document.addEventListener("visibilitychange", sync);
    reduce.addEventListener?.("change", () => { controls(); sync(); });
    controls();
  })();

  // ---- Stage parallax: a gentle tilt that follows a mouse (±6°) ----
  // Only for a fine pointer that hovers, never with reduced motion. The tilt is a separate,
  // outer element from the one the scroll animation moves, so the two transforms never fight.
  // Pointer events only record the position; one frame applies it (two custom properties).

  (() => {
    const pin = $(".hero .pin");
    const tilt = pin && $(".tilt", pin);
    if (!tilt) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const MAX = 6;
    let x = 0;
    let y = 0;
    let frame = 0;
    const apply = () => {
      frame = 0;
      tilt.style.setProperty("--ry", `${(x * MAX).toFixed(2)}deg`);
      tilt.style.setProperty("--rx", `${(-y * MAX).toFixed(2)}deg`);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(apply); };
    const reset = () => { x = 0; y = 0; queue(); };
    pin.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !fine.matches || reduce.matches) return;
      x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
      y = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
      queue();
    }, { passive: true });
    pin.addEventListener("pointerleave", reset);
    reduce.addEventListener?.("change", reset);
    fine.addEventListener?.("change", reset);
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
