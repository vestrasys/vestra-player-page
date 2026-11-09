// Vestra Player download page: the download button for the visitor's system,
// the playing windows (stage and feature chapters), the stage parallax and
// the one-shot reveals. Each language
// is its own prerendered page, so nothing here translates.
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

  const text = (key) => data.strings[key] ?? key;

  // ---- Visitor's system: its button first (Linux only once it has one), else Windows ----

  function detectOS() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    const ua = navigator.userAgent || "";
    // iPadOS asks for the desktop site and reports a Mac with touch.
    if (/mac/i.test(platform) && navigator.maxTouchPoints > 1) return "windows";
    if (/iphone|ipad|ipod/i.test(ua)) return "windows";
    if (/mac/i.test(platform) || /mac os x/i.test(ua)) return "macos";
    if (/linux/i.test(platform + " " + ua) && !/android|cros/i.test(ua)) return "linux";
    return "windows";
  }
  const detected = detectOS();
  root.dataset.visitor = $(`.cta-btn.os-${detected}`) ? detected : "windows";

  // ---- One download entry on screen: the nav button shows only when no other is visible ----

  (() => {
    const nav = $("#nav-dl");
    // Every real download button (the Linux entry is not a link); the header one leads to the visitor's.
    const buttons = $$("a.cta-btn");
    if (!nav || !buttons.length) return;
    nav.href = ($(`a.cta-btn.os-${root.dataset.visitor}`) ?? buttons[0]).href;
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
  // Every [data-media] window (the stage's front window) holds a poster and a muted video, and
  // the feature tour's sticky window holds one layer per feature. The most visible window plays
  // and every other one is paused, so only one window decodes at a time. Its companions
  // ([data-companion] cards, the stage's side windows) play with it: they load only once its own
  // clip is playing, and only while they are shown (wide screens; the cards are display: none
  // below). Nothing loads or plays with reduced motion, Save-Data, a hidden tab, while the full
  // clip is open or after the visitor pressed pause (one state for the whole page).

  const mayMove = () => !reduce.matches && !saveData && !document.hidden;
  function safePlay(video) {
    const promise = video.play();
    if (promise) promise.catch(() => { /* autoplay refused: the poster stays */ });
  }
  function loadVideo(video) {
    if (video.dataset.loaded) return;
    video.dataset.loaded = "1";
    for (const source of $$("source[data-src]", video)) {
      source.src = source.dataset.src;
      source.removeAttribute("data-src");
    }
    video.load();
  }
  const n2 = (k) => String(k).padStart(2, "0");

  // The feature tour: the step at the reading line picks the feature; its layer loops the
  // slide's in-out cut while the media logic below lets it play (active). Segments under the
  // window show the cut's progress (full with reduced motion: nothing advances).
  const tour = (() => {
    const frame = $("[data-tour]");
    const cuts = data.tour;
    if (!frame || !cuts) return null;
    const layers = $$(".vl-layer", frame);
    const videos = layers.map((l) => $("video", l));
    const steps = $$(".st-step");
    const segs = $$(".st-seg");
    const wide = window.matchMedia("(min-width: 861px)");
    const still = () => reduce.matches || saveData;
    let index = 0;
    let active = false;
    let raf = 0;
    let onChange = () => {};

    const progress = (i, p) => { $("i", segs[i]).style.transform = `scaleX(${p})`; };
    function seekIn(v, cut) {
      const go = () => { try { v.currentTime = cut.in; } catch { /* not seekable yet */ } };
      if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
    }
    function tick() {
      raf = 0;
      const v = videos[index];
      const cut = cuts[index];
      // The cut loops: back to "in" at "out" (or at the clip's end).
      if (v.readyState >= 1 && (v.currentTime >= cut.out - 0.04 || v.ended)) {
        v.currentTime = cut.in;
        if (v.ended) safePlay(v);
      }
      progress(index, Math.max(0, Math.min(1, (v.currentTime - cut.in) / (cut.out - cut.in))));
      if (!v.paused) raf = requestAnimationFrame(tick);
    }
    function run() {
      const v = videos[index];
      if (!active) {
        for (const x of videos) if (!x.paused) x.pause();
        return;
      }
      loadVideo(v);
      if (v.currentTime < cuts[index].in - 0.05 || v.currentTime >= cuts[index].out) seekIn(v, cuts[index]);
      safePlay(v);
    }
    function set(i) {
      const old = index;
      index = i;
      if (old !== index) {
        videos[old].pause();
        progress(old, 0);
        seekIn(videos[index], cuts[index]);
      }
      layers.forEach((l, k) => l.toggleAttribute("data-on", k === index));
      steps.forEach((s, k) => s.toggleAttribute("data-on", k === index));
      frame.setAttribute("aria-label", `${text("tour.watch")}: ${$(".ch-title", steps[index]).textContent}`);
      progress(index, still() ? 1 : 0);
      run();
    }
    for (const [i, v] of videos.entries()) {
      v.addEventListener("playing", () => {
        v.parentElement.classList.add("is-live");
        if (i === index && !raf) raf = requestAnimationFrame(tick);
      });
    }
    // The step whose top has passed the reading line (mid-screen; lower on phones, under the window).
    let queued = 0;
    const pick = () => {
      queued = 0;
      const line = innerHeight * (wide.matches ? 0.5 : 0.72);
      let i = 0;
      steps.forEach((s, k) => { if (s.getBoundingClientRect().top <= line) i = k; });
      if (i !== index) set(i);
    };
    addEventListener("scroll", () => { if (!queued) queued = requestAnimationFrame(pick); }, { passive: true });
    addEventListener("resize", pick);
    reduce.addEventListener?.("change", () => progress(index, still() ? 1 : 0));
    set(0);
    pick();

    // The full clip in a dialog, with the feature's title and caption.
    const box = $("#lightbox");
    const boxVideo = box && $("video", box);
    let boxOpen = false;
    function open(i) {
      if (!box || typeof box.showModal !== "function") return;
      const cut = cuts[i];
      $(".lb-num", box).textContent = `${n2(i + 1)} / ${n2(cuts.length)}`;
      $("#lb-title", box).textContent = $(".ch-title", steps[i]).textContent;
      $(".lb-cap", box).textContent = $(".ch-text", steps[i]).textContent;
      boxVideo.style.setProperty("--ar", String(cut.ar));
      boxVideo.replaceChildren(...cut.sources.map((s) => Object.assign(document.createElement("source"), { src: s.src, type: s.type })));
      boxVideo.load();
      boxOpen = true;
      onChange();
      box.showModal();
      if (!still()) safePlay(boxVideo);
    }
    if (box) {
      $(".lb-close", box).addEventListener("click", () => box.close());
      box.addEventListener("click", (event) => { if (event.target === box) box.close(); });
      box.addEventListener("close", () => { boxVideo.pause(); boxOpen = false; onChange(); });
    }
    frame.addEventListener("click", () => open(index));
    for (const b of $$("[data-open]")) b.addEventListener("click", () => open(Number(b.dataset.open)));

    return {
      el: frame,
      activate(on) { if (on !== active) { active = on; run(); } },
      get boxOpen() { return boxOpen; },
      set onChange(fn) { onChange = fn; },
    };
  })();

  (() => {
    const units = $$("[data-media]")
      .map((el) => ({
        el, shot: $(".shot", el), video: $("video", el), ratio: 0, started: false,
        companions: $$(`[data-companion="${el.dataset.media}"]`)
          .map((card) => ({ shot: $(".shot", card), video: $("video", card) }))
          .filter((c) => c.video),
      }))
      .filter((u) => u.video);
    // The tour's window is one more window, played by the tour itself.
    if (tour) units.push({ el: tour.el, tour, ratio: 0, companions: [] });
    // The stage's side windows are shown from this width on (styles.css).
    const wide = window.matchMedia("(min-width: 861px)");
    const buttons = $$(".pp");
    if (!units.length || !hasIO) return;
    let userPaused = false;

    const load = (u) => loadVideo(u.video);

    let ready = document.readyState === "complete";
    if (!ready) {
      window.addEventListener("load", () => {
        const go = () => { ready = true; sync(); };
        if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 });
        else setTimeout(go, 300);
      }, { once: true });
    }

    function sync() {
      if (!ready) return;
      let best = null;
      for (const u of units) if (u.ratio >= 0.35 && (!best || u.ratio > best.ratio)) best = u;
      const allowed = mayMove() && !userPaused && !(tour && tour.boxOpen);
      for (const u of units) {
        const on = u === best && allowed;
        if (u.tour) {
          u.tour.activate(on);
          continue;
        }
        if (on) {
          load(u);
          safePlay(u.video);
        } else if (!u.video.paused) u.video.pause();
        for (const c of u.companions) {
          if (on && u.started && wide.matches) {
            load(c);
            safePlay(c.video);
          } else if (!c.video.paused) c.video.pause();
        }
      }
    }

    function labels() {
      const key = userPaused ? "media.play" : "media.pause";
      for (const b of buttons) {
        $("span", b).textContent = text(key);
        b.classList.toggle("is-paused", userPaused);
      }
    }

    function controls() {
      // The control exists only while something may play.
      const show = !reduce.matches && !saveData;
      for (const b of buttons) b.hidden = !show;
    }

    if (tour) tour.onChange = sync;
    for (const u of units) {
      if (u.tour) continue;
      // The video fades in over its poster once frames arrive.
      u.video.addEventListener("playing", () => u.shot.classList.add("is-live"));
      for (const c of u.companions) c.video.addEventListener("playing", () => c.shot.classList.add("is-live"));
      // The companions start once the window's own clip plays (it loads first).
      if (u.companions.length) {
        u.video.addEventListener("playing", () => {
          if (u.started) return;
          u.started = true;
          sync();
        });
      }
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
    wide.addEventListener?.("change", sync);
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

  // ---- Reveals: each block rises into place once, the first time it comes on screen ----
  // A one-shot transition (transform and opacity) instead of a scroll-linked animation: no
  // per-frame style work while scrolling, and the element is a plain static box afterwards.
  // Without script, IntersectionObserver or with reduced motion everything is simply shown.

  (() => {
    if (!hasIO || reduce.matches) return;
    const items = $$(".reveal, .os-grid");
    root.classList.add("reveals");
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const item of items) io.observe(item);
  })();

})();
