// shared/branding.js
// Lightweight brand/accessibility polish without changing theme styles.

(function () {
  const LOGO_SRC = "/logo.png";

  function ensureFavicon() {
    const hasIcon = document.querySelector("link[rel='icon']");
    if (!hasIcon) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = LOGO_SRC;
      document.head.appendChild(link);
    }
  }

  function createLogoImg(size = 28) {
    const img = document.createElement("img");
    img.src = LOGO_SRC;
    img.alt = "TamGam";
    img.width = size;
    img.height = size;
    img.style.width = size + "px";
    img.style.height = size + "px";
    img.style.objectFit = "contain";
    img.decoding = "async";
    img.loading = "eager";
    return img;
  }

  function patchTopNavLogo() {
    const anchors = document.querySelectorAll("a.nav-logo");
    anchors.forEach((a) => {
      if (a.querySelector("img")) return;
      const text = (a.textContent || "").trim() || "TamGam";
      a.textContent = "";
      const wrap = document.createElement("span");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";
      wrap.appendChild(createLogoImg(26));
      const label = document.createElement("span");
      label.textContent = text;
      wrap.appendChild(label);
      a.appendChild(wrap);
      a.setAttribute("aria-label", "TamGam Home");
    });
  }

  function patchSidebarLogo() {
    document.querySelectorAll(".sidebar-logo .flame").forEach((flame) => {
      if (flame.querySelector("img")) return;
      flame.textContent = "";
      flame.appendChild(createLogoImg(30));
    });
  }

  function normalizeInlineLogos() {
    document.querySelectorAll("img[src$='logo.png'], img[src='/logo.png'], img[src='logo.png']").forEach((img) => {
      if (!img.alt) img.alt = "TamGam";
      if (!img.decoding) img.decoding = "async";
      if (!img.loading) img.loading = "lazy";
    });
  }

  function run() {
    ensureFavicon();
    patchTopNavLogo();
    patchSidebarLogo();
    normalizeInlineLogos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
