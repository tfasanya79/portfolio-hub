#!/usr/bin/env node
/*
 * build-site.js - generate the portfolio from content/site.json.
 *
 * Content lives in content/site.json. This script fills the marker-delimited
 * regions in index.html and regenerates the case-study pages.
 *
 *   node scripts/build-site.js            # build
 *   node scripts/build-site.js --check    # report drift, write nothing
 *
 * Regions in index.html look like:
 *   <!-- BUILD:header:start --> ... <!-- BUILD:header:end -->
 *   // BUILD:projects:start     ... // BUILD:projects:end   (inside <script>)
 *
 * Anything outside a marked region is left untouched, so hand edits to the
 * surrounding markup survive a rebuild.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site.json'), 'utf8'));

/* ------------------------------------------------------------------ helpers */

/**
 * Values are treated as trusted HTML fragments: the content is authored by the
 * site owner through the admin, and some fields legitimately carry entities
 * such as &amp; or &rarr;. This is not a user-input path.
 */
const raw = (v) => (v == null ? '' : String(v));

/** Single-quoted JS string literal, for the inline <script> content. */
function jsStr(v) {
  return "'" + raw(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** Replace the text between a region's start and end markers. */
function replaceRegion(src, key, content) {
  const variants = [
    [`<!-- BUILD:${key}:start -->`, `<!-- BUILD:${key}:end -->`],
    [`// BUILD:${key}:start`, `// BUILD:${key}:end`],
  ];

  for (const [startMarker, endMarker] of variants) {
    const si = src.indexOf(startMarker);
    if (si === -1) continue;

    const contentStart = si + startMarker.length;
    const ei = src.indexOf(endMarker, contentStart);
    if (ei === -1) throw new Error(`build-site: no end marker for region "${key}"`);

    // Preserve the indentation of the end-marker line.
    const nl = src.lastIndexOf('\n', ei - 1);
    const endIndent = src.slice(nl + 1, ei);

    return src.slice(0, contentStart) + '\n' + content + '\n' + endIndent + src.slice(ei);
  }

  throw new Error(`build-site: no start marker for region "${key}"`);
}

/* ---------------------------------------------------------- region renderers */

function renderHeader(h) {
  const L = [];
  L.push(`  <div class="wordmark">${raw(h.wordmark)}<span>.</span></div>`);
  L.push(`  <div class="intro">${raw(h.intro)}</div>`);
  L.push(`  <div class="tagline">${raw(h.tagline)}</div>`);
  L.push(`  <div class="role-line">${raw(h.roleLine)}</div>`);

  for (const g of h.badgeGroups) {
    L.push(`  <div class="badges">`);
    L.push(`    <span class="badge-group-label">${raw(g.label)}</span>`);
    for (const b of g.badges) {
      const img = `<img src="${raw(b.img)}" alt="${raw(b.alt)}" loading="lazy">`;
      if (g.verified) {
        L.push(
          `    <a class="badge" href="${raw(g.href)}" target="_blank" rel="noopener">${img}${raw(b.label)}</a>`
        );
      } else {
        L.push(`    <span class="badge badge-static">${img}${raw(b.label)}</span>`);
      }
    }
    L.push(`  </div>`);
  }

  L.push(`  <div class="links">`);
  for (const l of h.links) {
    L.push(`    <a href="${raw(l.href)}" target="_blank" rel="noopener">${raw(l.label)}</a>`);
  }
  L.push(`  </div>`);

  L.push(`  <div class="stats">`);
  for (const s of h.stats) {
    L.push(
      `    <div class="stat"><span class="num">${raw(s.num)}</span><span class="label">${raw(s.label)}</span></div>`
    );
  }
  L.push(`  </div>`);

  L.push(`  <div class="cta">`);
  L.push(
    `    <a href="${raw(h.cta.href)}" target="_blank" rel="noopener">${raw(h.cta.label)}</a>`
  );
  L.push(`  </div>`);

  return L.join('\n');
}

function renderJourney(j) {
  const L = [];
  for (const it of j.items) {
    const cls = it.pivot ? 'journey-item journey-pivot' : 'journey-item';
    L.push(`      <li class="${cls}">`);
    L.push(`        <p class="journey-date">${raw(it.date)}</p>`);
    L.push(`        <p class="journey-role">${raw(it.role)}</p>`);
    L.push(`        <p class="journey-org">${raw(it.org)}</p>`);
    L.push(`        <p class="journey-desc">${raw(it.desc)}</p>`);
    L.push(`      </li>`);
  }
  return L.join('\n');
}

function renderFlagship(f) {
  const L = [];
  L.push(`    <div class="flagship-card">`);
  L.push(
    `      <div class="thumb"><img src="/assets/screenshots/${raw(f.shot)}.jpg" alt="${raw(f.name)} screenshot" loading="lazy" width="960" height="420"></div>`
  );
  L.push(`      <div class="eyebrow">${raw(f.eyebrow)}</div>`);
  L.push(`      <div class="name">${raw(f.name)}<span>.</span></div>`);
  L.push(`      <div class="desc">${raw(f.description)}</div>`);
  L.push(`      <div class="tags">`);
  for (const t of f.tags) L.push(`        <span class="tag">${raw(t)}</span>`);
  L.push(`      </div>`);
  L.push(`      <div class="gh-stats" data-repo="${raw(f.repo)}"></div>`);
  L.push(`      <div class="actions">`);
  L.push(
    `        <a class="demo" href="${raw(f.demoUrl)}" target="_blank" rel="noopener"><span class="status-dot" data-status-tool="${raw(f.shot)}"></span>Live demo</a>`
  );
  L.push(
    `        <a class="code" href="${raw(f.codeUrl)}" target="_blank" rel="noopener">Code</a>`
  );
  L.push(`      </div>`);
  L.push(
    `      <a class="case-link" href="${raw(f.caseStudyUrl)}">Read the case study &rarr;</a>`
  );
  L.push(`    </div>`);
  return L.join('\n');
}

function renderArchNote(n) {
  return `    <p class="arch-desc">${raw(n.body)}</p>`;
}

function renderPlatform(p) {
  const L = [];
  L.push(`      <div class="card" id="card-architecture">`);
  L.push(
    `        <div class="thumb"><img src="/assets/screenshots/${raw(p.shot)}.jpg" alt="${raw(p.thumbAlt)}" loading="lazy" width="960" height="600"></div>`
  );
  L.push(`        <div class="name">${raw(p.name)}<span>.</span></div>`);
  L.push(`        <div class="desc">${raw(p.description)}</div>`);
  L.push(`        <div class="tags">`);
  for (const t of p.tags) L.push(`          <span class="tag">${raw(t)}</span>`);
  L.push(`        </div>`);
  L.push(`        <div class="actions">`);
  L.push(
    `          <a class="demo" href="${raw(p.demoUrl)}" target="_blank" rel="noopener">${raw(p.demoLabel)}</a>`
  );
  L.push(
    `          <a class="code" href="${raw(p.codeUrl)}" target="_blank" rel="noopener">Code</a>`
  );
  L.push(`        </div>`);
  L.push(`      </div>`);
  return L.join('\n');
}

function renderFooter(text) {
  return `  ${raw(text)}`;
}

function renderProjects(projects) {
  const L = [];
  L.push(`  const PROJECTS = [`);
  for (const p of projects) {
    L.push(`    {`);
    L.push(`      name: ${jsStr(p.name)},`);
    L.push(`      category: ${jsStr(p.category)},`);
    L.push(`      shot: ${jsStr(p.shot)},`);
    L.push(`      description: ${jsStr(p.description)},`);
    L.push(`      tags: [${(p.tags || []).map(jsStr).join(', ')}],`);
    L.push(`      demoUrl: ${jsStr(p.demoUrl)},`);
    L.push(`      codeUrl: ${jsStr(p.codeUrl)},`);
    L.push(`    },`);
  }
  L.push(`  ];`);
  return L.join('\n');
}

/* ------------------------------------------------------------------- build */

/** Apply every content region to a template and return the rendered HTML. */
function buildIndexHtml(data, templateHtml) {
  let html = templateHtml;
  html = replaceRegion(html, 'header', renderHeader(data.header));
  html = replaceRegion(html, 'journey', renderJourney(data.journey));
  html = replaceRegion(html, 'flagship', renderFlagship(data.flagship));
  html = replaceRegion(html, 'archnote', renderArchNote(data.architectureNote));
  html = replaceRegion(html, 'platform', renderPlatform(data.platformCard));
  html = replaceRegion(html, 'footer', renderFooter(data.footer));
  html = replaceRegion(html, 'projects', renderProjects(data.projects));
  return html;
}

const REGION_RENDERERS = {
  header: renderHeader,
  journey: renderJourney,
  flagship: renderFlagship,
  archnote: renderArchNote,
  platform: renderPlatform,
  footer: renderFooter,
  projects: renderProjects,
};

module.exports = { buildIndexHtml, replaceRegion, REGION_RENDERERS, jsStr, raw };

// Imported as a module (e.g. by the admin for previews): stop here.
if (require.main !== module) return;

const file = path.join(ROOT, 'index.html');
const html = buildIndexHtml(site, fs.readFileSync(file, 'utf8'));
const current = fs.readFileSync(file, 'utf8');

if (CHECK) {
  if (current === html) {
    console.log('index.html: up to date');
  } else {
    console.log('index.html: WOULD CHANGE');
    const a = current.split('\n');
    const b = html.split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 40; i++) {
      if (a[i] !== b[i]) {
        console.log(`  line ${i + 1}:`);
        console.log(`    -  ${a[i] === undefined ? '<none>' : a[i]}`);
        console.log(`    +  ${b[i] === undefined ? '<none>' : b[i]}`);
        shown++;
      }
    }
  }
} else {
  if (current !== html) {
    fs.writeFileSync(file, html);
    console.log('index.html: written');
  } else {
    console.log('index.html: unchanged');
  }

  // Case-study pages are generated by their own script, which reads the same
  // content file so there is a single source of truth.
  const csGen = require(path.join(ROOT, 'case-studies', 'generate-case-studies.js'));
  csGen.writeAll().forEach(f => console.log('wrote ' + f));
}
