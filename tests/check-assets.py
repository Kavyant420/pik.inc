#!/usr/bin/env python3
"""Verify every src=/href= in the 19 pik-inc HTML pages resolves to a real file,
all CSS files are non-empty with balanced braces, and no PIK%20Inc path refs remain."""
import os, re, sys, urllib.parse

ROOT = "/workspace/pik-inc"

PAGES = [
    "index.html", "pikx.html", "nexus.html", "nexus-mobile.html",
    "settings.html", "account.html", "security.html", "products.html",
    "products/pikture.html", "products/pik-ide.html", "products/pik-ai.html",
    "products/pikos.html", "products/pikuflix.html", "products/pikmaps.html",
    "products/pik-vpn.html",
    "privacy-policy.html", "terms-of-service.html", "wireless-communication.html",
    "sw-nexus-mobile.html",
]

attr_re = re.compile(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
bad = []
checked = 0
for page in PAGES:
    p = os.path.join(ROOT, page)
    if not os.path.isfile(p):
        bad.append(f"MISSING PAGE: {page}")
        continue
    html = open(p, encoding="utf-8").read()
    for ref in attr_re.findall(html):
        r = ref.strip()
        if r.startswith(("http://", "https://", "//", "mailto:", "tel:", "javascript:", "#", "data:", "blob:")):
            continue
        path_part = urllib.parse.unquote(r.split("?")[0].split("#")[0])
        if not path_part:
            continue
        if path_part.startswith("/"):
            target = os.path.join(ROOT, path_part.lstrip("/"))
        else:
            target = os.path.normpath(os.path.join(os.path.dirname(p), path_part))
        checked += 1
        if not os.path.exists(target):
            bad.append(f"{page}: {r} -> NOT FOUND ({target})")

# CSS validation
css_files = []
for dirpath, dirs, files in os.walk(ROOT):
    if "node_modules" in dirpath: continue
    for f in files:
        if f.endswith(".css"):
            css_files.append(os.path.join(dirpath, f))
css_bad = []
for c in sorted(css_files):
    txt = open(c, encoding="utf-8").read()
    if len(txt.strip()) == 0:
        css_bad.append(f"EMPTY CSS: {c}")
    if txt.count("{") != txt.count("}"):
        css_bad.append(f"UNBALANCED BRACES: {c} ({txt.count('{')} vs {txt.count('}')})")

# leftover PIK%20Inc references anywhere in repo (text files)
leftover = []
for dirpath, dirs, files in os.walk("/workspace"):
    if "node_modules" in dirpath or ".git" in dirpath: continue
    for f in files:
        if f.endswith((".html", ".css", ".js", ".json", ".md", ".txt")):
            fp = os.path.join(dirpath, f)
            try:
                t = open(fp, encoding="utf-8").read()
            except Exception:
                continue
            if "PIK%20Inc" in t:
                leftover.append(fp)

print(f"Pages checked: {len(PAGES)}, local asset refs checked: {checked}")
print(f"CSS files checked: {len(css_files)}")
print(f"Broken refs: {len(bad)}")
for b in bad: print("  ", b)
print(f"CSS problems: {len(css_bad)}")
for b in css_bad: print("  ", b)
print(f"PIK%20Inc leftovers: {len(leftover)}")
for b in leftover: print("  ", b)
sys.exit(0 if not (bad or css_bad or leftover) else 1)
