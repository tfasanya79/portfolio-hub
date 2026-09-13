/* portfolio admin - UI.
 * Talks to the API in ../server.js. Holds no secrets; the session cookie is
 * HttpOnly so all auth state lives server-side.
 */
'use strict';

const S = {
  site: null,
  indexHtml: '',
  csrf: '',
  user: '',
  git: null,
  dirty: false,
  section: 'header',
  draftUpdatedAt: null,
};

/* ------------------------------------------------------------------ helpers */

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null) continue;
    n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return n;
}

let toastTimer = null;
function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 4200);
}

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = S.csrf;

  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    showLogin();
    throw new Error('session expired, please sign in again');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('request failed (' + res.status + ')'));
  return data;
}

/* --------------------------------------------------------------- save state */

function setSaveState(text, cls = '') {
  const n = $('saveState');
  n.textContent = text;
  n.className = 'save-state ' + cls;
}

let saveTimer = null;

function markDirty() {
  S.dirty = true;
  setSaveState('unsaved changes', 'dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 1200);
}

async function saveDraft() {
  if (!S.dirty) return;
  setSaveState('saving…');
  try {
    const r = await api('/api/draft', {
      method: 'PUT',
      body: JSON.stringify({ site: S.site, indexHtml: S.indexHtml }),
    });
    S.dirty = false;
    S.draftUpdatedAt = r.updatedAt;
    setSaveState('draft saved ' + new Date(r.updatedAt).toLocaleTimeString(), 'saved');
  } catch (e) {
    setSaveState('save failed', 'error');
    toast('Draft save failed: ' + e.message, 'error');
  }
}

/* -------------------------------------------------------------- form pieces */

function field(label, value, onInput, opts = {}) {
  const input = opts.multiline
    ? el('textarea', { rows: opts.rows || 4 })
    : el('input', { type: opts.type || 'text' });
  input.value = value == null ? '' : value;
  input.addEventListener('input', () => { onInput(input.value); markDirty(); });
  return el('div', { class: 'field' }, [el('label', { text: label }), input,
    opts.help ? el('div', { class: 'hint', style: 'margin:4px 0 0', text: opts.help }) : null]);
}

function tagEditor(label, arr, onChange) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', { text: label }));

  const list = el('div', { class: 'tag-list' });
  (arr || []).forEach((t, i) => {
    list.appendChild(el('span', { class: 'tag-pill' }, [
      t,
      el('button', {
        type: 'button', text: '×', title: 'remove',
        onclick: () => { arr.splice(i, 1); onChange(arr); markDirty(); render(); },
      }),
    ]));
  });
  wrap.appendChild(list);

  const input = el('input', { type: 'text', placeholder: 'add tag and press Enter' });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    arr.push(v);
    input.value = '';
    onChange(arr);
    markDirty();
    render();
  });
  wrap.appendChild(input);
  return wrap;
}

/** A repeatable list of objects, rendered as collapsible cards. */
function listEditor(label, arr, makeCard, onAdd) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', { text: label + '  (' + arr.length + ')' }));

  if (!arr.length) wrap.appendChild(el('div', { class: 'empty', text: 'None yet.' }));

  arr.forEach((item, i) => wrap.appendChild(makeCard(item, i, arr)));
  wrap.appendChild(el('button', {
    class: 'ghost', type: 'button', text: '+ Add',
    onclick: () => { onAdd(arr); markDirty(); render(); },
  }));
  return wrap;
}

function cardShell(title, i, arr, bodyNodes) {
  const tools = el('div', { class: 'tools' }, [
    el('button', {
      class: 'ghost tiny', type: 'button', text: '↑',
      onclick: () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); render(); } },
    }),
    el('button', {
      class: 'ghost tiny', type: 'button', text: '↓',
      onclick: () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); render(); } },
    }),
    el('button', {
      class: 'danger tiny', type: 'button', text: 'Remove',
      onclick: () => { arr.splice(i, 1); markDirty(); render(); },
    }),
  ]);
  return el('div', { class: 'card-item' }, [el('div', { class: 'card-head' }, [
    el('strong', { text: title }), tools,
  ])].concat(bodyNodes));
}

/* ------------------------------------------------------------------ sections */

const SECTIONS = [
  { id: 'header', label: 'Header' },
  { id: 'journey', label: 'Career journey' },
  { id: 'flagship', label: 'Flagship' },
  { id: 'projects', label: 'Tool cards' },
  { id: 'cases', label: 'Case studies' },
  { id: 'platform', label: 'Platform & notes' },
  { id: 'raw', label: 'Raw HTML' },
];

function renderHeader() {
  const h = S.site.header;
  const out = el('div');
  out.appendChild(el('h2', { text: 'Header' }));
  out.appendChild(el('p', { class: 'hint', text: 'The intro block at the top of the homepage.' }));

  out.appendChild(field('Wordmark', h.wordmark, (v) => (h.wordmark = v)));
  out.appendChild(field('Intro', h.intro, (v) => (h.intro = v), { multiline: true, rows: 4 }));
  out.appendChild(field('Tagline', h.tagline, (v) => (h.tagline = v), { multiline: true, rows: 3 }));
  out.appendChild(field('Role line', h.roleLine, (v) => (h.roleLine = v)));

  out.appendChild(field('Stats', '', () => {}, { help: 'Shown in the header strip.' }));
  out.appendChild(listEditor('Stats', h.stats,
    (s, i, arr) => cardShell('Stat ' + (i + 1), i, arr, [
      field('Number', s.num, (v) => (s.num = v)),
      field('Label', s.label, (v) => (s.label = v)),
    ]),
    (arr) => arr.push({ num: '0', label: 'New stat' })));

  out.appendChild(listEditor('Links', h.links,
    (l, i, arr) => cardShell(l.label || 'Link ' + (i + 1), i, arr, [
      field('Label', l.label, (v) => (l.label = v)),
      field('URL', l.href, (v) => (l.href = v), { type: 'url' }),
    ]),
    (arr) => arr.push({ label: 'New link', href: 'https://' })));

  h.badgeGroups.forEach((g, gi) => {
    out.appendChild(el('h2', { text: g.label || 'Badges', style: 'margin-top:26px;font-size:15px' }));
    out.appendChild(field('Group label', g.label, (v) => (g.label = v)));
    if (g.verified) out.appendChild(field('Badge link URL', g.href, (v) => (g.href = v), { type: 'url' }));
    out.appendChild(listEditor('Badges in "' + g.label + '"', g.badges,
      (b, i, arr) => cardShell(b.label || 'Badge ' + (i + 1), i, arr, [
        field('Label', b.label, (v) => (b.label = v)),
        field('Image URL', b.img, (v) => (b.img = v), { type: 'url' }),
        field('Alt text', b.alt, (v) => (b.alt = v)),
      ]),
      (arr) => arr.push({ label: 'New badge', img: '/assets/brand/certs/qualys.png', alt: 'Badge' })));
  });

  out.appendChild(el('h2', { text: 'Call to action', style: 'margin-top:26px;font-size:15px' }));
  out.appendChild(field('Label', h.cta.label, (v) => (h.cta.label = v)));
  out.appendChild(field('URL', h.cta.href, (v) => (h.cta.href = v), { type: 'url' }));

  return out;
}

function renderJourney() {
  const j = S.site.journey;
  const out = el('div');
  out.appendChild(el('h2', { text: 'Career journey' }));
  out.appendChild(el('p', { class: 'hint', text: 'Timeline entries, newest or oldest first as you prefer.' }));
  out.appendChild(field('Section title', j.title, (v) => (j.title = v)));
  out.appendChild(listEditor('Entries', j.items,
    (it, i, arr) => cardShell((it.date || '') + '  ' + (it.role || ''), i, arr, [
      field('Date', it.date, (v) => (it.date = v)),
      field('Role', it.role, (v) => (it.role = v)),
      field('Organisation', it.org, (v) => (it.org = v)),
      field('Description', it.desc, (v) => (it.desc = v), { multiline: true, rows: 3 }),
      el('label', {}, [
        el('input', {
          type: 'checkbox', checked: it.pivot ? 'checked' : null,
          onchange: (e) => { it.pivot = e.target.checked; markDirty(); },
        }),
        ' Highlight as a turning point',
      ]),
    ]),
    (arr) => arr.push({ date: '', role: '', org: '', desc: '' })));
  return out;
}

function caseFields(obj) {
  return [
    field('Tagline', obj.tagline, (v) => (obj.tagline = v)),
    tagEditor('Stack', obj.stack || (obj.stack = []), () => {}),
    field('The problem', obj.problem, (v) => (obj.problem = v), { multiline: true, rows: 5 }),
    field('The approach', obj.approach, (v) => (obj.approach = v), { multiline: true, rows: 6 }),
    field('Real-world impact', obj.impact, (v) => (obj.impact = v), { multiline: true, rows: 5 }),
    field('Source label', obj.source ? obj.source.label : '', (v) => {
      obj.source = obj.source || { label: '', url: '' };
      obj.source.label = v;
    }),
    field('Source URL', obj.source ? obj.source.url : '', (v) => {
      obj.source = obj.source || { label: '', url: '' };
      obj.source.url = v;
    }, { type: 'url' }),
    field('Architecture decisions', obj.decisions, (v) => (obj.decisions = v), { multiline: true, rows: 6 }),
    field('Lesson learned', obj.lesson, (v) => (obj.lesson = v), { multiline: true, rows: 5 }),
  ];
}

function renderFlagship() {
  const f = S.site.flagship;
  const out = el('div');
  out.appendChild(el('h2', { text: 'Flagship project' }));
  out.appendChild(el('p', { class: 'hint', text: 'The featured card. Its case study is edited here too.' }));

  out.appendChild(field('Section title', f.sectionTitle, (v) => (f.sectionTitle = v)));
  out.appendChild(field('Eyebrow', f.eyebrow, (v) => (f.eyebrow = v)));
  out.appendChild(field('Name', f.name, (v) => (f.name = v)));
  out.appendChild(field('Screenshot slug', f.shot, (v) => (f.shot = v), { help: 'Matches /assets/screenshots/<slug>.jpg' }));
  out.appendChild(field('Description', f.description, (v) => (f.description = v), { multiline: true, rows: 4 }));
  out.appendChild(tagEditor('Tags', f.tags, () => {}));
  out.appendChild(field('GitHub repo', f.repo, (v) => (f.repo = v), { help: 'owner/name, used for the star count' }));
  out.appendChild(field('Demo URL', f.demoUrl, (v) => (f.demoUrl = v), { type: 'url' }));
  out.appendChild(field('Code URL', f.codeUrl, (v) => (f.codeUrl = v), { type: 'url' }));
  out.appendChild(field('Case study link', f.caseStudyUrl, (v) => (f.caseStudyUrl = v)));

  if (f.caseStudy) {
    out.appendChild(el('h2', { text: 'Flagship case study', style: 'margin-top:28px;font-size:15px' }));
    out.appendChild(el('button', {
      class: 'ghost tiny', type: 'button', text: 'Preview this case study',
      onclick: () => previewCase(f.caseStudy.slug),
    }));
    caseFields(f.caseStudy).forEach((n) => out.appendChild(n));
  }
  return out;
}

function renderProjects() {
  const out = el('div');
  out.appendChild(el('h2', { text: 'Tool cards' }));
  out.appendChild(el('p', { class: 'hint', text: 'Each card renders into the Security or Network grid automatically from its category.' }));

  const cats = ['security', 'network'];
  out.appendChild(listEditor('Tools', S.site.projects,
    (p, i, arr) => cardShell(p.name || 'Tool ' + (i + 1), i, arr, [
      field('Name', p.name, (v) => (p.name = v), { help: 'Trailing dot is added automatically when rendered' }),
      el('div', { class: 'field' }, [
        el('label', { text: 'Category' }),
        el('select', { onchange: (e) => { p.category = e.target.value; markDirty(); render(); } },
          cats.map((c) => el('option', { value: c, selected: p.category === c ? 'selected' : null, text: c }))),
      ]),
      field('Screenshot slug', p.shot, (v) => (p.shot = v)),
      field('Description', p.description, (v) => (p.description = v), { multiline: true, rows: 3 }),
      tagEditor('Tags', p.tags, () => {}),
      field('Demo URL', p.demoUrl, (v) => (p.demoUrl = v), { type: 'url' }),
      field('Code URL', p.codeUrl, (v) => (p.codeUrl = v), { type: 'url' }),
      el('label', {}, [
        el('input', {
          type: 'checkbox', checked: p.hasCaseStudy ? 'checked' : null,
          onchange: (e) => { p.hasCaseStudy = e.target.checked; markDirty(); },
        }),
        ' Has a case study page',
      ]),
    ]),
    (arr) => arr.push({
      name: 'newtool.', category: 'security', shot: 'newtool',
      description: '', tags: [], demoUrl: 'https://timfas.com/', codeUrl: 'https://github.com/tfasanya79/',
      hasCaseStudy: false, slug: 'newtool', tagline: '', stack: [], problem: '', approach: '',
      impact: '', source: null, decisions: '', lesson: '',
    })));
  return out;
}

function renderCases() {
  const out = el('div');
  out.appendChild(el('h2', { text: 'Case studies' }));
  out.appendChild(el('p', { class: 'hint', text: 'Long-form pages. Only tools marked "has a case study" appear here.' }));

  const withCases = S.site.projects.filter((p) => p.hasCaseStudy);
  if (!withCases.length) out.appendChild(el('div', { class: 'empty', text: 'No tools have case studies yet.' }));

  withCases.forEach((p) => {
    const body = [
      el('button', {
        class: 'ghost tiny', type: 'button', text: 'Preview',
        onclick: () => previewCase(p.slug),
      }),
    ].concat(caseFields(p));
    out.appendChild(el('div', { class: 'card-item' }, [
      el('div', { class: 'card-head' }, [el('strong', { text: p.name })]),
    ].concat(body)));
  });
  return out;
}

function renderPlatform() {
  const p = S.site.platformCard;
  const n = S.site.architectureNote;
  const out = el('div');
  out.appendChild(el('h2', { text: 'Platform card' }));
  out.appendChild(field('Name', p.name, (v) => (p.name = v)));
  out.appendChild(field('Screenshot slug', p.shot, (v) => (p.shot = v)));
  out.appendChild(field('Image alt text', p.thumbAlt, (v) => (p.thumbAlt = v)));
  out.appendChild(field('Description', p.description, (v) => (p.description = v), { multiline: true, rows: 4 }));
  out.appendChild(tagEditor('Tags', p.tags, () => {}));
  out.appendChild(field('Button label', p.demoLabel, (v) => (p.demoLabel = v)));
  out.appendChild(field('Button URL', p.demoUrl, (v) => (p.demoUrl = v)));
  out.appendChild(field('Code URL', p.codeUrl, (v) => (p.codeUrl = v), { type: 'url' }));

  out.appendChild(el('h2', { text: 'Architecture note', style: 'margin-top:28px;font-size:15px' }));
  out.appendChild(field('Title', n.title, (v) => (n.title = v)));
  out.appendChild(field('Body', n.body, (v) => (n.body = v), { multiline: true, rows: 6 }));

  out.appendChild(el('h2', { text: 'Group headings', style: 'margin-top:28px;font-size:15px' }));
  ['security', 'network', 'platform'].forEach((k) => {
    out.appendChild(field(k, S.site.toolGroups[k], (v) => (S.site.toolGroups[k] = v)));
  });

  out.appendChild(el('h2', { text: 'Footer', style: 'margin-top:28px;font-size:15px' }));
  out.appendChild(field('Footer text', S.site.footer, (v) => (S.site.footer = v), { multiline: true, rows: 2 }));
  return out;
}

function renderRaw() {
  const out = el('div');
  out.appendChild(el('h2', { text: 'Raw HTML' }));
  out.appendChild(el('p', { class: 'hint', text: 'The full index.html template. Anything outside the BUILD: marker comments is preserved exactly.' }));

  out.appendChild(el('div', { class: 'warn-box' }, [
    'Do not delete the ', el('code', { text: '<!-- BUILD:name:start -->' }),
    ' / ', el('code', { text: '<!-- BUILD:name:end -->' }),
    ' marker pairs. They are what the structured tabs write into. Publishing is blocked if any are missing.',
  ]));

  const ta = el('textarea', { class: 'raw-editor', spellcheck: 'false' });
  ta.value = S.indexHtml;
  ta.addEventListener('input', () => { S.indexHtml = ta.value; markDirty(); });

  out.appendChild(ta);
  out.appendChild(el('p', { class: 'hint', style: 'margin-top:10px' },
    [el('button', {
      class: 'ghost tiny', type: 'button', text: 'Revert raw edits to last published',
      onclick: async () => {
        const st = await api('/api/state');
        S.indexHtml = st.indexHtml;
        markDirty();
        render();
        toast('Raw HTML reverted to the last published version');
      },
    })]));
  return out;
}

const RENDERERS = {
  header: renderHeader,
  journey: renderJourney,
  flagship: renderFlagship,
  projects: renderProjects,
  cases: renderCases,
  platform: renderPlatform,
  raw: renderRaw,
};

function render() {
  const nav = $('nav');
  nav.textContent = '';
  SECTIONS.forEach((s) => {
    nav.appendChild(el('button', {
      class: 'nav-item' + (S.section === s.id ? ' active' : ''),
      text: s.label,
      onclick: () => { S.section = s.id; render(); },
    }));
  });

  const main = $('main');
  main.textContent = '';
  main.appendChild(RENDERERS[S.section]());
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------- preview */

let previewUrl = null;

function showPreview(html, meta) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  $('previewFrame').src = previewUrl;
  $('previewMeta').textContent = meta || '';
  $('previewModal').classList.add('open');
}

async function previewIndex() {
  try {
    const r = await api('/api/preview', {
      method: 'POST',
      body: JSON.stringify({ site: S.site, indexHtml: S.indexHtml }),
    });
    showPreview(r.html, 'homepage, rendered from your current edits');
  } catch (e) {
    toast('Preview failed: ' + e.message, 'error');
  }
}

async function previewCase(slug) {
  try {
    const r = await api('/api/preview', {
      method: 'POST',
      body: JSON.stringify({ site: S.site, indexHtml: S.indexHtml, caseSlug: slug }),
    });
    showPreview(r.html, 'case study: ' + slug);
  } catch (e) {
    toast('Preview failed: ' + e.message, 'error');
  }
}

/* ------------------------------------------------------------------- publish */

function renderSteps(steps) {
  const ul = el('ul', { class: 'steps' });
  (steps || []).forEach((s) => {
    ul.appendChild(el('li', { class: s.ok ? 'ok' : 'fail' }, [
      el('strong', { text: (s.ok ? '✓ ' : '✗ ') + s.name }),
      s.stdout ? el('pre', { text: s.stdout }) : null,
      s.stderr ? el('pre', { text: s.stderr }) : null,
    ]));
  });
  return ul;
}

async function publish() {
  const message = prompt(
    'Commit message for this publish:\n(e.g. "Update CV Builder description")',
    'Update portfolio content'
  );
  if (message === null) return;

  if (!confirm('Publish to timfas.com now?\n\nThis commits, pushes to GitHub, and deploys the live site.')) return;

  const btn = $('publishBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing…';

  try {
    await saveDraft();
    const r = await api('/api/publish', {
      method: 'POST',
      body: JSON.stringify({ site: S.site, indexHtml: S.indexHtml, message }),
    });

    S.dirty = false;
    setSaveState('published', 'saved');

    const main = $('main');
    main.textContent = '';
    main.appendChild(el('h2', { text: 'Published' }));
    main.appendChild(el('p', { class: 'hint', text: 'These steps ran in order. The last one updated the live site.' }));
    main.appendChild(renderSteps(r.steps));
    main.appendChild(el('p', { class: 'hint', style: 'margin-top:14px' },
      [el('a', { href: 'https://timfas.com/', target: '_blank', rel: 'noopener', text: 'Open timfas.com →' })]));

    toast('Published. The live site is updated.', 'ok');
  } catch (e) {
    // Show whatever steps did run, so a partial failure is diagnosable.
    const main = $('main');
    main.textContent = '';
    main.appendChild(el('h2', { text: 'Publish failed' }));
    main.appendChild(el('p', { class: 'hint', text: e.message }));
    if (e.steps) main.appendChild(renderSteps(e.steps));
    toast('Publish failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish';
  }
}

/* ---------------------------------------------------------------------- auth */

function showLogin() {
  $('loginView').style.display = 'flex';
  $('app').classList.remove('ready');
}

function showApp() {
  $('loginView').style.display = 'none';
  $('app').classList.add('ready');
}

async function boot() {
  try {
    const st = await api('/api/state');
    S.site = (st.draft && st.draft.site) || st.live;
    S.indexHtml = st.draftIndexHtml || st.indexHtml;
    S.git = st.git;
    S.draftUpdatedAt = st.draftUpdatedAt;

    const sess = await api('/api/session');
    S.csrf = sess.csrf;
    S.user = sess.user;

    showApp();
    render();

    if (st.draft && st.draft.site) {
      setSaveState('draft from ' + new Date(st.draftUpdatedAt).toLocaleString(), 'dirty');
      toast('Loaded an unpublished draft. Publish to make it live.');
    } else {
      setSaveState('no changes');
    }
  } catch {
    showLogin();
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  $('loginBtn').disabled = true;
  try {
    const r = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('username').value, password: $('password').value }),
    });
    S.csrf = r.csrf;
    S.user = r.user;
    $('password').value = '';
    await boot();
  } catch (err) {
    $('loginError').textContent = err.message;
  } finally {
    $('loginBtn').disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
  S.site = null; S.csrf = '';
  showLogin();
});

$('previewBtn').addEventListener('click', previewIndex);
$('closePreview').addEventListener('click', () => $('previewModal').classList.remove('open'));
$('reloadPreview').addEventListener('click', previewIndex);
$('publishBtn').addEventListener('click', publish);

window.addEventListener('beforeunload', (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
});

boot();
