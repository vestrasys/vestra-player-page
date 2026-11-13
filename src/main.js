// Vestra Player download page: the download button for the visitor's system,
// the playing windows (stage and feature themes), the stage parallax and
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
  // Every [data-media] window (the stage's front window) and the features' sticky window (a layer
  // per theme) holds a poster and a muted video. The most visible window plays (the features' from 60 % visible)
  // and every other one is paused, so only one window decodes at a time. Its companions
  // ([data-companion] cards, the stage's side windows) play with it: they load only once its own
  // clip is playing, and only while they are shown (wide screens; the cards are display: none
  // below). Nothing loads or plays with reduced motion, Save-Data or a hidden tab (no pause button:
  // removed on 2026-11-13, user request).

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
  // The feature themes: each theme's layer in the sticky window loops its pre-composited video. On every video frame
  // (requestVideoFrameCallback, else animation frames reading currentTime) the beat under the
  // clock is found; its rail item takes the ring, its bar is scaled to the beat's progress, and the
  // caption changes (out 120 ms ending 60 ms after the boundary, in 240 ms). A click on an item
  // seeks to its beat, which starts on a key frame. The tour below picks the theme; the media logic
  // below decides whether the window plays.

  const themes = $$(".theme").map((el, ti) => {
    const spec = data.themes[ti];
    const frame = $(`.th-frame[data-theme="${ti}"]`);
    const video = $("video", frame);
    const cap = $(".th-cap", el);
    const name = $(".th-name", cap);
    const textEl = $(".th-text", cap);
    const rail = $(".th-items", el);
    const items = $$(".th-item", rail);
    // The caption of each beat (and the outro), from the prerendered list.
    const texts = $$(".th-list li", el).map((li) => ({
      name: $("b", li).textContent,
      text: $(".tx > span", li).textContent,
      fine: $(".th-fine", li)?.textContent ?? "",
    }));
    const outroEl = $(".th-outro", el);
    if (outroEl) texts.push({ name: $("b", outroEl).textContent, text: $("span", outroEl).textContent, fine: "" });
    const spans = spec.beats.map((b) => [b.start, b.end]);
    if (spec.outro) spans.push([spec.outro.start, spec.outro.end]);
    let current = 0;
    let fading = false;
    let swapTimer = 0;
    let active = false;
    let cb = 0;

    const beatAt = (t) => {
      for (let k = spans.length - 1; k >= 0; k--) if (t >= spans[k][0] - 1e-3) return k;
      return 0;
    };
    function caption(k) {
      clearTimeout(swapTimer);
      name.textContent = texts[k].name;
      textEl.textContent = texts[k].text;
      if (texts[k].fine) textEl.append(" ", Object.assign(document.createElement("small"), { className: "th-fine", textContent: texts[k].fine }));
      cap.classList.remove("out", "in");
      void cap.offsetWidth; // restart the entrance
      cap.classList.add("in");
      fading = false;
    }
    function fadeOut(then) {
      if (fading) return;
      fading = true;
      cap.classList.remove("in");
      cap.classList.add("out");
      swapTimer = setTimeout(then, 120);
    }
    function setBeat(k, animate) {
      if (k === current) return;
      current = k;
      const outro = k >= spec.beats.length;
      items.forEach((item, j) => {
        item.toggleAttribute("aria-current", j === k);
        item.classList.toggle("done", !outro && j < k);
        if (j !== k) item.style.removeProperty("--p");
      });
      rail.classList.toggle("all", outro);
      // The caption follows when its fade-out ends (it started 60 ms before the boundary).
      if (!animate) caption(k);
      else if (!fading) fadeOut(() => caption(current));
    }
    function onTime(t) {
      const k = beatAt(t);
      if (k !== current) setBeat(k, true);
      const [s, e] = spans[k];
      if (k < items.length) items[k].style.setProperty("--p", Math.max(0, Math.min(1, (t - s) / (e - s))).toFixed(4));
      // The outgoing caption starts fading 60 ms before the boundary.
      const next = (k + 1) % spans.length;
      if (!fading && e - t <= 0.06 && next !== k) fadeOut(() => caption(current));
    }
    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    function loop(now, meta) {
      cb = 0;
      onTime(meta ? meta.mediaTime : video.currentTime);
      if (!video.paused) schedule();
    }
    function schedule() {
      if (cb) return;
      cb = hasRVFC ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(() => loop());
    }
    video.addEventListener("playing", () => { frame.classList.add("is-live"); schedule(); });
    video.addEventListener("seeked", () => onTime(video.currentTime));

    function go(k) {
      loadVideo(video);
      const seek = () => { try { video.currentTime = spans[k][0]; } catch { /* not seekable yet */ } };
      if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
      fading = false;
      setBeat(k, false);
      if (active) safePlay(video);
    }
    items.forEach((item, k) => item.addEventListener("click", () => go(k)));
    // Arrow keys move between the items; Enter and Space activate them (they are buttons).
    rail.addEventListener("keydown", (event) => {
      const at = items.indexOf(document.activeElement);
      if (at < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      items[(at + step + items.length) % items.length].focus();
    });

    return {
      el,
      video,
      activate(on) {
        if (on === active) return;
        active = on;
        if (on) { loadVideo(video); safePlay(video); } else if (!video.paused) video.pause();
      },
      prefetch() { if (!video.dataset.loaded) { video.preload = "auto"; loadVideo(video); } },
    };
  });

  // The tour (the sticky scroll showcase of 1d56f43): the theme whose entry has passed the reading
  // line (mid-screen; on narrow screens the middle of the room under the sticky window) shows its
  // layer in the window and plays while the media logic lets the window play. A click on a rail
  // item of another theme scrolls its entry to the reading line first.
  const tour = (() => {
    const win = $(".th-window");
    if (!win || !themes.length) return null;
    const media = $(".th-media");
    const layers = $$(".th-frame", win);
    const wideTour = window.matchMedia("(min-width: 861px)");
    let index = 0;
    let active = false;
    let lock = -1;
    let lockTimer = 0;
    const line = () => {
      if (wideTour.matches) return innerHeight * 0.5;
      const bottom = Math.max(0, media.getBoundingClientRect().bottom);
      return bottom + (innerHeight - bottom) * 0.4;
    };
    function set(i) {
      if (i === index) return;
      themes[index].activate(false);
      index = i;
      layers.forEach((l, k) => l.toggleAttribute("data-on", k === i));
      themes.forEach((t, k) => t.el.toggleAttribute("data-on", k === i));
      themes[i].activate(active);
    }
    function pick() {
      if (lock >= 0) return;
      const at = line();
      let i = 0;
      themes.forEach((t, k) => { if (t.el.getBoundingClientRect().top <= at) i = k; });
      set(i);
    }
    function release() {
      clearTimeout(lockTimer);
      if (lock < 0) return;
      lock = -1;
      pick();
    }
    themes.forEach((t, i) => {
      t.el.addEventListener("click", (event) => {
        if (i === index || !event.target.closest(".th-item")) return;
        const top = t.el.getBoundingClientRect().top - line() + 2;
        lock = i;
        set(i);
        window.scrollBy({ top, behavior: reduce.matches ? "auto" : "smooth" });
        clearTimeout(lockTimer);
        lockTimer = setTimeout(release, 1200);
      }, true);
    });
    if ("onscrollend" in window) addEventListener("scrollend", () => { if (lock >= 0) release(); });
    let queued = 0;
    addEventListener("scroll", () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; pick(); }); }, { passive: true });
    addEventListener("resize", pick);
    pick();
    return {
      el: win,
      activate(on) {
        active = on;
        themes.forEach((t, k) => t.activate(on && k === index));
      },
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
    // The features' sticky window is one more window, played by the tour (from 60 % visible).
    if (tour) units.push({ el: tour.el, tour, ratio: 0, min: 0.6, companions: [] });
    // The stage's side windows are shown from this width on (styles.css).
    const wide = window.matchMedia("(min-width: 861px)");
    if (!units.length || !hasIO) return;

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
      for (const u of units) if (u.ratio >= (u.min ?? 0.35) && (!best || u.ratio > best.ratio)) best = u;
      const allowed = mayMove();
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

    // .motion: something may play (styles.css shows the live captions and rails then).
    function controls() {
      root.classList.toggle("motion", !reduce.matches && !saveData);
    }

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

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const u = units.find((x) => x.el === entry.target);
        if (u) u.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      }
      sync();
    }, { threshold: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1] });
    for (const u of units) io.observe(u.el);
    // A theme's video is fetched once its entry is within one screen of the viewport.
    const near = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !mayMove()) continue;
        const theme = themes.find((t) => t.el === entry.target);
        if (theme) theme.prefetch();
        near.unobserve(entry.target);
      }
    }, { rootMargin: "100% 0px" });
    for (const theme of themes) near.observe(theme.el);

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
