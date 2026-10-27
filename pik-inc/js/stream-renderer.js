/* ============================================================================
   PIK//NEXUS — stream-renderer.js
   Codex/Claude-Code style incremental rendering:
     - buffers deltas and repaints on rAF (one paint per frame, never per token)
     - closes dangling ``` fences virtually so partial code blocks highlight
       live instead of flashing raw markdown
     - shows a blinking block caret at the tail while streaming
     - auto-scrolls only when the reader is near the bottom
   Usage:
     var sr = PIKStream.create(el); sr.push(textDelta); sr.finish();
   ========================================================================= */
(function (global) {
  "use strict";

  function renderInto(el, raw, streaming) {
    var src = String(raw == null ? "" : raw);
    if (streaming) {
      /* virtually close an open fence so the partial block renders as code */
      var ticks = (src.match(/```/g) || []).length;
      if (ticks % 2 === 1) src += "\n```";
    }
    var html = "";
    if (global.PIKMD) {
      html = PIKMD.render(src);
      if (global.PIKMath) html = PIKMath.renderHtml(html);
    } else {
      html = "<p>" + src.replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/\n/g, "<br>") + "</p>";
    }
    el.innerHTML = html;
    if (global.PIKCodeEnhance) PIKCodeEnhance.enhance(el);
    if (global.PIKMD && PIKMD.wire) PIKMD.wire(el);
    if (streaming) {
      var caret = document.createElement("span");
      caret.className = "md-caret";
      caret.setAttribute("aria-hidden", "true");
      el.appendChild(caret);
    }
  }

  var Stream = {
    create: function (el) {
      var buf = "", raf = 0, done = false;

      function paint() {
        raf = 0;
        renderInto(el, buf, !done);
        /* gentle follow: only scroll if user is near bottom */
        var scroller = el.closest(".nx-thread") || el.closest("[data-nx='thread']");
        if (scroller) {
          var near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 220;
          if (near) scroller.scrollTop = scroller.scrollHeight;
        }
      }

      return {
        push: function (delta) {
          buf += delta;
          if (!raf) raf = requestAnimationFrame(paint);
        },
        setFull: function (text) {
          buf = text; done = true;
          if (raf) cancelAnimationFrame(raf);
          renderInto(el, buf, false);
        },
        finish: function () {
          done = true;
          if (raf) cancelAnimationFrame(raf);
          renderInto(el, buf, false);
        },
        text: function () { return buf; }
      };
    },

    /* one-shot static render (final messages, thinking modal) */
    render: function (el, text) {
      renderInto(el, text, false);
    }
  };

  global.PIKStream = Stream;
})(window);
