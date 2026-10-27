const PIKMotion = (() => {
  function initReveals() {
    const els = document.querySelectorAll(".reveal, .reveal--left, .reveal--right, .reveal--scale");
    if (!("IntersectionObserver" in window)) {
      els.forEach(el => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(el => io.observe(el));
  }

  function initTilt() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll(".tilt").forEach(card => {
      let raf = null;
      card.addEventListener("pointermove", ev => {
        const r = card.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          card.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg");
          card.style.setProperty("--ry", (x * 9).toFixed(2) + "deg");
        });
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  function initCounters() {
    const els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        animate(e.target);
      });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
  }

  function animate(el) {
    const target = parseFloat(el.getAttribute("data-count"));
    const suffix = el.getAttribute("data-suffix") || "";
    const dur = 1400;
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    /* rAF-throttled scroll: class toggle only when state actually changes */
    let ticking = false;
    let last = false;
    const update = () => {
      ticking = false;
      const scrolled = window.scrollY > 12;
      if (scrolled !== last) {
        last = scrolled;
        header.classList.toggle("is-scrolled", scrolled);
      }
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  function initNav(root) {
    const burger = document.querySelector(".nav__burger");
    const links = document.querySelector(".nav__links");
    if (burger && links) {
      burger.addEventListener("click", () => {
        const open = links.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", String(open));
      });
      links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("is-open")));
    }
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav__link").forEach(a => {
      const href = a.getAttribute("href").replace(root, "");
      if (href === path) a.classList.add("is-active");
    });
  }

  function initDocToc() {
    const toc = document.querySelector(".doc-toc");
    if (!toc) return;
    const sections = [...document.querySelectorAll(".doc-section[id]")];
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach(s => io.observe(s));
  }

  function initMeters() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const pct = e.target.getAttribute("data-meter") || "0";
        e.target.style.width = pct + "%";
      });
    }, { threshold: 0.3 });
    document.querySelectorAll(".progress__bar[data-meter], .meter-fill[data-meter]").forEach(el => io.observe(el));
  }

  return { initAll(root) { initReveals(); initTilt(); initCounters(); initHeader(); initNav(root); initDocToc(); initMeters(); } };
})();
