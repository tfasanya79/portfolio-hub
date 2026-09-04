const fs = require('fs');
const path = require('path');

const CASES = [
  {
    slug: 'subnet-calculator',
    name: 'subnet.',
    tagline: 'A clean, visual IPv4 subnet and CIDR calculator',
    demoUrl: 'https://timfas.com/subnet-calculator/',
    codeUrl: 'https://github.com/tfasanya79/subnet-calculator',
    shot: 'subnet-calculator',
    stack: ['HTML/CSS/JS', 'Client side only', 'No backend'],
    problem: 'Most subnet calculators online just spit out a set of numbers. They are built for people who already understand subnetting, not for the students and junior admins who are trying to learn it. There is rarely an explanation of why the network and host bit split works the way it does.',
    approach: 'Built as a single page app that runs entirely in the browser. Any IP and prefix combination is broken down visually: a network/host bit bar, a full binary breakdown of each octet, and the standard computed values (network address, broadcast, usable host range, wildcard mask). A VLSM splitter was added so a block can be divided into smaller subnets of different sizes in one view, and a permalink feature encodes the current calculation into the URL so a result can be shared or bookmarked directly.',
    lesson: 'IPv6 support was scoped out deliberately. It was tempting to add it early, but VLSM and shareable permalinks were more useful to more people and shipped faster. Keeping the feature set disciplined and finishing fewer things completely, rather than half-finishing more things, made this a stronger portfolio piece.',
    decisions: 'I chose client side only, no backend, over a server side calculator because subnetting math does not need to touch a network at all. Doing it in the browser removes a whole class of availability and latency concerns for a tool that should feel instant. I encoded permalinks directly into the URL query string instead of storing them server side, trading a slightly longer URL for zero database, zero expiry, and zero privacy exposure of what someone calculated.',
  },
  {
    slug: 'passcheck',
    name: 'passcheck.',
    tagline: 'A password strength and known breach checker that never sends your password anywhere in full',
    demoUrl: 'https://timfas.com/passcheck/',
    codeUrl: 'https://github.com/tfasanya79/passcheck',
    shot: 'passcheck',
    stack: ['HTML/CSS/JS', 'Client side only', 'Have I Been Pwned API'],
    problem: 'People reuse weak passwords because strength meters are inconsistent and breach checking tools usually ask you to type your real password into a form you have to trust. That is a bad habit to encourage, even for a legitimate tool.',
    approach: 'Password strength is scored entirely client side, so nothing about the password ever leaves the browser during analysis. Breach checking uses the Have I Been Pwned API with k-anonymity: only the first five characters of the password\'s SHA-1 hash are sent to the API, and the full match happens locally in the browser against the returned candidate list. The full password is never transmitted.',
    lesson: 'Privacy by architecture, not by policy, is the differentiator here. A privacy promise in a README is worth little if the code sends the raw password to a server anyway. Building the k-anonymity flow correctly was the whole point of the project, not an add-on feature.',
    decisions: 'I chose the k-anonymity design, sending only a 5 character hash prefix and matching the rest locally, over the simpler option of hashing and sending the full SHA-1, because a full hash is still enough for the API operator to correlate requests to a specific password over time. The extra client side matching logic is a deliberate tradeoff: a little more code for a real, not just claimed, privacy guarantee.',
  },
  {
    slug: 'inspect',
    name: 'inspect.',
    tagline: 'A DNS and security header inspector with plain English explanations',
    demoUrl: 'https://timfas.com/inspect/',
    codeUrl: 'https://github.com/tfasanya79/dns-inspector',
    shot: 'inspect',
    stack: ['Node.js', 'Express', 'Small backend', 'systemd service'],
    problem: 'Email spoofing and missing security headers are two of the most common, most overlooked domain misconfigurations. Existing checkers either bury the result in jargon (raw SPF/DKIM/DMARC record dumps) or grade a site without explaining what the grade actually means for a non-specialist.',
    approach: 'A small Express backend performs the DNS lookups for SPF, DKIM, and DMARC, and fetches security headers for the target site, then grades the headers A through F similar to Mozilla Observatory. Each result includes a plain English explanation of what it means and why it matters, added directly in response to the question "does 58 percent mean this site is not secure enough", since a percentage alone does not answer that.',
    lesson: 'A backend service that looks fine can still die quietly. The systemd unit here has Restart=on-failure, but the process was stopped by a clean SIGTERM rather than a crash, so it did not auto-restart and sat dead for about 22 hours before a routine check caught it. A grading tool is only useful if it is actually up, this is a reminder to add real uptime monitoring, not just a restart policy.',
    decisions: 'I needed a small Express backend here, unlike the fully client side tools in this portfolio, because DNS lookups (SPF, DKIM, DMARC) and header fetches against an arbitrary third party domain are blocked by browser CORS policy and would leak the visitor doing the lookup. That backend dependency is exactly why this was the one tool that went silently down, so I added it to the uptime checker that now polls every 5 minutes and drives the status dot on every project card.',
  },
  {
    slug: 'cert-check',
    name: 'cert-check.',
    tagline: 'An SSL/TLS certificate checker with plain English grading',
    demoUrl: 'https://timfas.com/cert-check/',
    codeUrl: 'https://github.com/tfasanya79/cert-check',
    shot: 'cert-check',
    stack: ['Node.js', 'Small backend', 'TLS inspection'],
    problem: 'Certificates expire quietly and cause outages at the worst possible time. Checking expiry, chain of trust, protocol version, and key strength normally means reaching for openssl on the command line, which most people outside networking or security do not use day to day.',
    approach: 'A small backend connects to the target host over TLS, walks the certificate chain, and reports expiry countdown, chain of trust, negotiated protocol version, key strength, and hostname coverage (SAN matching), all translated into plain English rather than raw certificate fields.',
    lesson: 'The tool was scoped deliberately as a one shot checker, with no ongoing watchlist or email alerting. That kind of persistent monitoring feature is a real product on its own, and trying to build it here would have turned a focused, portfolio ready tool into an unfinished one.',
    decisions: 'I used a direct TLS socket connection to read the live certificate chain instead of relying on a third party certificate transparency log API, so the result always reflects exactly what a real client connecting right now would see, including misconfigurations like an incomplete chain that a log lookup alone would not surface. I chose accuracy over convenience here on purpose.',
  },
  {
    slug: 'acl-gen',
    name: 'acl-gen.',
    tagline: 'A firewall rule and ACL syntax translator across five vendor formats',
    demoUrl: 'https://timfas.com/acl-gen/',
    codeUrl: 'https://github.com/tfasanya79/acl-gen',
    shot: 'acl-gen',
    stack: ['HTML/CSS/JS', 'Client side only', 'No backend'],
    problem: 'The same firewall rule has to be re-written by hand in Cisco IOS, pfSense, iptables, and increasingly cloud formats like AWS security groups and Azure NSGs. Translating between them manually is slow and a common source of mistakes during migrations or audits.',
    approach: 'A rule is defined once in a simple form, parsed into a single internal model, and rendered out to all five syntaxes side by side. Shadowed and conflicting rule detection flags rules that can never be reached, and a packet tester lets you simulate a packet against the rule set to see which rule matches and why, all before anything is deployed to real hardware.',
    lesson: 'Four features (shadow detection, the packet tester, cloud syntax support, and shareable permalinks/export) were planned and shipped together in one focused pass rather than trickled out. Treating that as one milestone, not four separate small updates, made the tool feel complete rather than perpetually half built.',
    decisions: 'I designed a single internal rule model first, before writing any vendor renderer, so adding a sixth vendor format later only means writing one new renderer against an existing model instead of reworking the whole tool. Shadow and conflict detection runs against that same internal model rather than against each rendered syntax separately, so I write and test that logic once instead of five times.',
  },
  {
    slug: 'cv-builder',
    name: 'CV Builder.',
    tagline: 'A local first CV builder and job search assistant, the flagship project',
    demoUrl: 'https://timfas.com/cv-builder/',
    codeUrl: 'https://github.com/tfasanya79/resume-developer',
    shot: 'cv-builder',
    stack: ['Next.js', 'Supabase', 'DeepSeek AI', 'PostgreSQL'],
    problem: 'Most resume builders are either generic templates with no feedback, or expensive subscriptions gatekeeping basic features like ATS scoring. Job seekers need one tool that covers the whole loop: building the CV, checking it against a real job description, tracking applications, and prepping for the interview.',
    approach: 'Built with Next.js and Supabase for auth and storage, with DeepSeek powering the AI features: a real time ATS score sidebar, tailoring suggestions against a pasted job description, a skill gap analyzer, salary insights, an AI interview coach, and a LinkedIn optimizer, on top of 14 templates and PDF import and export. I later moved it onto timfas.com at /cv-builder/ so it lives alongside my other tools instead of on its own domain.',
    lesson: 'Adding a basePath to a Next.js app to share a domain path is not just a config change: every internal client side fetch call to an API route has to be explicitly prefixed with that basePath, or it silently breaks in production while looking fine in development. That single class of bug was found across four separate features during an audit and became the reason a shared withAppBasePath() helper exists in the codebase now, so it cannot be forgotten again.',
    decisions: 'I chose Supabase over a self managed database to keep auth, storage, and Postgres in one managed service for a solo built product, trading some vendor lock-in for a much smaller operational surface. I picked DeepSeek for the AI features over a larger frontier model provider mainly on cost per request at the volume a free tier tool needs to sustain, and wrote the interview coach and tailoring prompts to be portable to another provider if that tradeoff changes later.',
  },
];

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
</body>
</html>
`;
}

const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
CASES.forEach(c => {
  fs.writeFileSync(path.join(outDir, c.slug + '.html'), renderPage(c));
  console.log('wrote', c.slug + '.html');
});
