#!/usr/bin/env node
/*
 * Generate case-study pages from content/site.json - the single source of truth.
 *
 * Normally run via:  node scripts/build-site.js
 * which regenerates index.html and then requires this file.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const site = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'content', 'site.json'), 'utf8')
);

/** Fill in defaults so the template can rely on every field existing. */
function normalizeCase(o) {
  return {
    slug: o.slug,
    name: o.name,
    tagline: o.tagline,
    demoUrl: o.demoUrl,
    codeUrl: o.codeUrl,
    shot: o.shot,
    stack: o.stack || [],
    problem: o.problem || '',
    approach: o.approach || '',
    lesson: o.lesson || '',
    decisions: o.decisions || '',
    impact: o.impact || '',
    source: o.source || null,
  };
}

/** Build the case-study records from a site object. */
function casesFromSite(data) {
  const out = [];

  for (const p of data.projects || []) {
    if (p.hasCaseStudy) out.push(normalizeCase(p));
  }

  // The flagship build has a case study but no tool card.
  if (data.flagship && data.flagship.caseStudy) {
    const f = data.flagship;
    out.push(
      normalizeCase(
        Object.assign({}, f.caseStudy, {
          name: f.name,
          demoUrl: f.demoUrl,
          codeUrl: f.codeUrl,
          shot: f.shot,
        })
      )
    );
  }

  return out;
}

// One record per case study: every project that has one, plus the flagship.
const CASES = casesFromSite(site);

const css = fs.readFileSync(path.join(__dirname, 'case-study.css'), 'utf8');

function renderPage(c) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name.replace(/\.$/, '')} case study : Tim Fasanya</title>
<meta name="description" content="${c.tagline}.">
<link rel="canonical" href="https://timfas.com/case-studies/${c.slug}.html">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<header>
  <a class="back" href="/">&larr; back to portfolio</a>
  <div class="thumb"><img src="/assets/screenshots/${c.shot}.jpg" alt="${c.name.replace(/\.$/, '')} screenshot" width="1280" height="800"></div>
  <div class="name">${c.name.replace(/\.$/, '')}<span>.</span></div>
  <div class="tagline">${c.tagline}.</div>
  <div class="stack">${c.stack.map(s => `<span class="tag">${s}</span>`).join('')}</div>
  <div class="actions">
    <a class="demo" href="${c.demoUrl}" target="_blank" rel="noopener">Live demo</a>
    <a class="code" href="${c.codeUrl}" target="_blank" rel="noopener">Code</a>
  </div>
</header>
<main>
  <section>
    <p class="section-title">The problem</p>
    <p class="body">${c.problem}</p>
  </section>
  <section>
    <p class="section-title">The approach</p>
    <p class="body">${c.approach}</p>
  </section>
  ${c.impact ? `<section>
    <p class="section-title">Real-world impact</p>
    <p class="body">${c.impact}</p>
    ${c.source ? `<p class="source">Source: <a href="${c.source.url}" target="_blank" rel="noopener">${c.source.label}</a></p>` : ''}
  </section>` : ''}
  <section>
    <p class="section-title">Architecture decisions</p>
    <p class="body">${c.decisions}</p>
  </section>
  <section>
    <p class="section-title">Lesson learned</p>
    <p class="body">${c.lesson}</p>
  </section>
</main>
<footer>
  Built by Tim, one small tool at a time. <a href="/">Back to portfolio</a>
</footer>
<script data-goatcounter="https://stats.187.55.230.139.sslip.io/count" async src="https://stats.187.55.230.139.sslip.io/count.js"></script>
</body>
</html>
`;
}

function writeAll() {
  const written = [];
  CASES.forEach(c => {
    fs.writeFileSync(path.join(__dirname, c.slug + '.html'), renderPage(c));
    written.push(c.slug + '.html');
  });
  return written;
}

module.exports = { CASES, renderPage, casesFromSite, normalizeCase, writeAll };

if (require.main === module) {
  writeAll().forEach(f => console.log('wrote ' + f));
}
