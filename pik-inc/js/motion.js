const PIKMotion = (() => {
  function reducedMotion() {
    return (
      (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      document.documentElement.getAttribute("data-perf") === "lite"
    );
  }

  function normalizeRoot(root) {
    const r = root || (document.body && document.body.getAttribute("data-root")) || "./";
    return r.endsWith("/") ? r : r + "/";
  }

  function revealEl(el) {
    el.classList.add("is-in", "is-visible");
  }

  function initReveals() {
    const els = document.querySelectorAll(".reveal, .reveal--left, .reveal--right, .reveal--scale");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || reducedMotion()) {
      els.forEach(revealEl);
      return;
    }
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting || e.intersectionRatio > 0) {
            revealEl(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.02, rootMargin: "0px 0px -16px 0px" }
    );

    els.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh * 1.02 && rect.bottom > 0) {
        revealEl(el);
      } else {
        io.observe(el);
      }
    });

    /* Failsafe: ensure above-fold / near-fold elements never remain hidden if layout shifts */
    setTimeout(() => {
      const curVh = window.innerHeight || 800;
      els.forEach(el => {
        if (el.classList.contains("is-visible")) return;
        const r = el.getBoundingClientRect();
        if (r.top < curVh * 1.15) {
          revealEl(el);
          io.unobserve(el);
        }
      });
    }, 1500);
  }

  function initTilt() {
    if (reducedMotion()) return;
    document.querySelectorAll(".tilt").forEach(card => {
      let raf = null;
      const reset = () => {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      };

      card.addEventListener("pointermove", ev => {
        const r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const px = (ev.clientX - r.left) / r.width;
        const py = (ev.clientY - r.top) / r.height;
        const x = px - 0.5;
        const y = py - 0.5;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = null;
          card.style.setProperty("--rx", (-y * 6.5).toFixed(2) + "deg");
          card.style.setProperty("--ry", (x * 8.5).toFixed(2) + "deg");
          card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
          card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
          card.style.setProperty("--cx", (px * 100).toFixed(1) + "%");
          card.style.setProperty("--cy", (py * 100).toFixed(1) + "%");
        });
      });

      card.addEventListener("pointerleave", reset);
      card.addEventListener("pointercancel", reset);
      card.addEventListener("blur", reset);
    });
  }

  function writeCounterText(el, val) {
    /* Preserve @blackhole's <span class="bh-word"> wrapper on index.html if present */
    const wordSpan = el.querySelector(".bh-word");
    (wordSpan || el).textContent = val;
  }

  function initCounters() {
    const els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || reducedMotion()) {
      els.forEach(el => {
        const target = parseFloat(el.getAttribute("data-count") || "0");
        const suffix = el.getAttribute("data-suffix") || "";
        writeCounterText(el, Math.round(target).toLocaleString() + suffix);
      });
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          animateCounter(e.target);
        });
      },
      { threshold: 0.25 }
    );
    els.forEach(el => io.observe(el));
  }

  function animateCounter(el) {
    const target = parseFloat(el.getAttribute("data-count") || "0");
    const suffix = el.getAttribute("data-suffix") || "";
    if (!Number.isFinite(target)) return;
    const dur = 1200;
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      writeCounterText(el, Math.round(target * eased).toLocaleString() + suffix);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    let ticking = false;
    let last = null;
    const update = () => {
      ticking = false;
      const scrolled = window.scrollY > 12;
      if (scrolled !== last) {
        last = scrolled;
        header.classList.toggle("is-scrolled", scrolled);
      }
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    update();
  }

  function canonicalSlug(pathname) {
    const clean = String(pathname || "").replace(/\/+$/, "");
    if (!clean) return "index.html";
    if (/\/products\/[^/]+$/i.test(clean)) return "products.html";
    const seg = clean.split("/").pop() || "index.html";
    if (seg === "pik-inc") return "index.html";
    return seg.endsWith(".html") ? seg : seg + ".html";
  }

  function initNav(root) {
    const normRoot = normalizeRoot(root);
    const burger = document.querySelector(".nav__burger");
    const links = document.querySelector(".nav__links");

    function closeMenu(restoreFocus) {
      if (!burger || !links || !links.classList.contains("is-open")) return;
      links.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
      if (restoreFocus) burger.focus();
    }

    if (burger && links) {
      burger.addEventListener("click", ev => {
        ev.stopPropagation();
        const open = links.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", String(open));
      });
      links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => closeMenu(false)));
      document.addEventListener("click", ev => {
        if (!links.classList.contains("is-open")) return;
        if (!links.contains(ev.target) && !burger.contains(ev.target)) {
          closeMenu(false);
        }
      });
      document.addEventListener("keydown", ev => {
        if (ev.key === "Escape" && links.classList.contains("is-open")) {
          closeMenu(true);
        }
      });
      window.addEventListener(
        "resize",
        () => {
          if (window.innerWidth > 1080) closeMenu(false);
        },
        { passive: true }
      );
    }

    const activeSlug = canonicalSlug(location.pathname);
    document.querySelectorAll(".nav__link, .dock-link").forEach(a => {
      const rawHref = a.getAttribute("href") || "";
      const stripped = rawHref.startsWith(normRoot)
        ? rawHref.slice(normRoot.length)
        : rawHref.replace(/^(\.\/|\.\.\/)+/, "");
      const linkSlug = stripped.split("#")[0] || "index.html";
      const match = linkSlug === activeSlug;
      a.classList.toggle("is-active", match);
      if (match) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function initOverlays() {
    let lastTrigger = null;

    function closeModal(backdrop) {
      if (!backdrop) return;
      backdrop.classList.remove("is-open");
      backdrop.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal-backdrop.is-open, .sheet-drawer.is-open")) {
        document.body.classList.remove("is-locked");
      }
      if (lastTrigger && typeof lastTrigger.focus === "function") {
        lastTrigger.focus();
        lastTrigger = null;
      }
    }

    function openModal(backdrop, trigger) {
      if (!backdrop) return;
      lastTrigger = trigger || document.activeElement;
      backdrop.classList.add("is-open");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-locked");
      const focusable = backdrop.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();
    }

    document.querySelectorAll("[data-modal-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-modal-open");
        const target = id ? document.getElementById(id) : null;
        if (target) openModal(target, btn);
      });
    });

    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
      backdrop.addEventListener("click", ev => {
        if (ev.target === backdrop || ev.target.closest(".modal__close, [data-modal-close]")) {
          closeModal(backdrop);
        }
      });
    });

    document.querySelectorAll(".sheet-drawer").forEach(drawer => {
      drawer.addEventListener("click", ev => {
        if (ev.target.closest("[data-drawer-close], .modal__close")) {
          drawer.classList.remove("is-open");
          if (!document.querySelector(".modal-backdrop.is-open, .sheet-drawer.is-open")) {
            document.body.classList.remove("is-locked");
          }
        }
      });
    });

    document.addEventListener("keydown", ev => {
      const openBackdrop = document.querySelector(".modal-backdrop.is-open");
      const openDrawer = document.querySelector(".sheet-drawer.is-open");

      if (ev.key === "Escape") {
        if (openBackdrop) {
          ev.preventDefault();
          closeModal(openBackdrop);
          return;
        }
        if (openDrawer) {
          ev.preventDefault();
          openDrawer.classList.remove("is-open");
          document.body.classList.remove("is-locked");
          return;
        }
      }

      if (ev.key === "Tab" && openBackdrop) {
        const nodes = [
          ...openBackdrop.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ];
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    });
  }

  function initDocToc() {
    const toc = document.querySelector(".doc-toc");
    if (!toc) return;
    const sections = [...document.querySelectorAll(".doc-section[id]")];
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
          }
        });
      },
      { rootMargin: "-25% 0px -60% 0px" }
    );
    sections.forEach(s => io.observe(s));
  }

  function initMeters() {
    const els = document.querySelectorAll(".progress__bar[data-meter], .meter-fill[data-meter]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || reducedMotion()) {
      els.forEach(el => {
        el.style.width = (el.getAttribute("data-meter") || "0") + "%";
      });
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const pct = e.target.getAttribute("data-meter") || "0";
          e.target.style.width = pct + "%";
        });
      },
      { threshold: 0.2 }
    );
    els.forEach(el => io.observe(el));
  }

  return {
    initAll(root) {
      initReveals();
      initTilt();
      initCounters();
      initHeader();
      initNav(root);
      initOverlays();
      initDocToc();
      initMeters();
    }
  };
})();

if (typeof window !== "undefined") {
  window.PIKMotion = PIKMotion;
}
