(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks") || document.querySelector(".nav__links");
  var navLinks = links ? links.querySelectorAll("a") : [];

  function onScroll() {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 8);
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      links.classList.toggle("is-open", !open);
    });

    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
        links.classList.remove("is-open");
      }
    });
  }

  var sections = [].slice.call(document.querySelectorAll("section[id]"));

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          navLinks.forEach(function (a) {
            a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) {
      spy.observe(s);
    });
  }

  if ("IntersectionObserver" in window) {
    var revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    [].slice.call(document.querySelectorAll(".reveal")).forEach(function (el) {
      revealer.observe(el);
    });
  } else {
    [].slice.call(document.querySelectorAll(".reveal")).forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  var body = document.getElementById("termBody");

  if (body && !reduced) {
    var lines = [].slice.call(body.querySelectorAll(".l"));
    lines.forEach(function (l) {
      l.classList.add("is-typing");
    });

    var t = 0;

    var tick = setInterval(function () {
      var line = lines[t];
      if (!line) {
        clearInterval(tick);
        return;
      }
      line.classList.remove("is-typing");
      line.classList.add("is-in");
      t += 1;
    }, 200);
  } else if (body) {
    [].slice.call(body.querySelectorAll(".l")).forEach(function (l) {
      l.classList.add("is-in");
    });
  }

  var copyBtn = document.getElementById("copyBtn");

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var value = copyBtn.getAttribute("data-copy") || "";
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        setTimeout(function () {
          copyBtn.textContent = original;
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done, function () {});
        return;
      }

      var ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();

      try {
        document.execCommand("copy");
        done();
      } catch (e) {}

      document.body.removeChild(ta);
    });
  }
})();
