/* ===================================================
   Anne Partridge — Visual editor (loaded only in edit mode)
   Click a text or a photo on the live page, edit it, then "Publier":
   the changes are committed to GitHub in one commit (Vercel redeploys).
   =================================================== */

const REPO   = 'WilliamOlivers/anne-partridge';
const BRANCH = 'main';
const API    = 'https://api.github.com';

const TOKEN_KEY = 'ap_token';
const EDIT_KEY  = 'ap_edit';

// Editable text blocks (leaf-most match wins) and zones that are never editable
const TEXT_SEL = 'h1,h2,h3,h4,h5,p,li,blockquote,figcaption,a.btn,.site-nav a,.contact-links a';
const SKIP_SEL = '#ap-login,#ap-editor-ui';

const COLORS = [
  ['primary',       'Couleur principale (titres)'],
  ['primary-light', 'Teinte claire (messages)'],
  ['accent',        'Boutons et liens'],
  ['accent-dark',   'Boutons et liens (survol)'],
  ['bg-alt',        'Fond des sections alternées'],
  ['text',          'Texte'],
  ['text-light',    'Texte secondaire'],
  ['border',        'Bordures'],
];

const norm = s => s.replace(/\s+/g, ' ').trim();

/* ----- State ----- */
let token = null;
let texts = [];          // [{ el, html, text }]  baseline of every editable block
let imgs  = [];          // [{ el, src, alt, upload }]
let colors = {};         // name -> current value
let baseColors = {};
let ui = {};
let current = null;      // element the toolbar is attached to
let leaving = false;
let baseAbout = null;    // body[data-about] as last published ('on' | 'off'), null if the page has no such switch

/* ----- Tiny helpers ----- */
function store(fn) { try { return fn(sessionStorage); } catch { return null; } }

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

function toast(msg, kind = 'ok') {
  ui.toast.textContent = msg;
  ui.toast.className = 'ap-toast show ' + kind;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.classList.remove('show'), kind === 'err' ? 9000 : 4000);
}

function pagePath() {
  let p = decodeURIComponent(location.pathname).replace(/^\/+/, '');
  if (!p) p = 'index.html';
  if (!/\.html$/.test(p)) p += '.html';
  return p;
}

/* ----- Sanitizer: only simple inline formatting survives ----- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

function safeHref(href) {
  const v = (href || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(v) || /^[/#]/.test(v)) return v;
  return '';
}

function cleanChildren(node) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === Node.TEXT_NODE) {
      out += esc(c.nodeValue.replace(/ /g, ' '));
    } else if (c.nodeType === Node.ELEMENT_NODE) {
      const t = c.tagName.toLowerCase();
      if (t === 'script' || t === 'style') continue;
      if (t === 'br') out += '<br>';
      else if (t === 'strong' || t === 'b') out += `<strong>${cleanChildren(c)}</strong>`;
      else if (t === 'em' || t === 'i') out += `<em>${cleanChildren(c)}</em>`;
      else if (t === 'u') out += `<u>${cleanChildren(c)}</u>`;
      else if (t === 'a') {
        const href = safeHref(c.getAttribute('href'));
        const blank = c.getAttribute('target') === '_blank' ? ' target="_blank" rel="noopener"' : '';
        out += href ? `<a href="${escAttr(href)}"${blank}>${cleanChildren(c)}</a>` : cleanChildren(c);
      } else if (t === 'div' || t === 'p') {
        out += (out && !out.endsWith('<br>') ? '<br>' : '') + cleanChildren(c);
      } else out += cleanChildren(c);   // unknown tag: keep its text only
    }
  }
  return out;
}

/* ----- Which elements are editable (same list on live DOM and on source) ----- */
function collect(doc) {
  const body = doc.body;
  return {
    texts: [...body.querySelectorAll(TEXT_SEL)].filter(el => !el.closest(SKIP_SEL) && !el.querySelector(TEXT_SEL)),
    imgs:  [...body.querySelectorAll('img')].filter(el => !el.closest(SKIP_SEL)),
  };
}

/* ===================================================
   GitHub
   =================================================== */
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    cache: 'no-store',
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) { logout(); throw new Error('Session expirée, reconnectez-vous.'); }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message; } catch {}
    throw new Error(`GitHub ${res.status}${detail ? ' : ' + detail : ''}`);
  }
  return opts.raw ? res.text() : res.json();
}

const readRaw = path => gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
  raw: true,
  headers: { Accept: 'application/vnd.github.raw+json' },
});

function login() {
  return new Promise((resolve, reject) => {
    const w = window.open('/api/auth', 'ap-auth', 'width=600,height=720');
    if (!w) return reject(new Error('Popup bloquée : autorisez les popups pour ce site.'));

    const timer = setInterval(() => { if (w.closed) { cleanup(); reject(new Error('Connexion annulée.')); } }, 500);
    function cleanup() { clearInterval(timer); window.removeEventListener('message', onMsg); }

    function onMsg(e) {
      if (e.origin !== location.origin || typeof e.data !== 'string') return;
      if (e.data === 'authorizing:github') { w.postMessage(e.data, location.origin); return; }
      const m = /^authorization:github:(success|error):([\s\S]*)$/.exec(e.data);
      if (!m) return;
      cleanup();
      try { w.close(); } catch {}
      let payload = {};
      try { payload = JSON.parse(m[2]); } catch {}
      if (m[1] === 'success' && payload.token) resolve(payload.token);
      else reject(new Error(payload.error || 'Connexion refusée.'));
    }
    window.addEventListener('message', onMsg);
  });
}

function logout() {
  store(s => s.removeItem(TOKEN_KEY));
  token = null;
  showLogin();
}

async function checkAccess() {
  const repo = await gh(`/repos/${REPO}`);
  if (!repo.permissions || !repo.permissions.push) {
    throw new Error("Ce compte GitHub n'a pas le droit de modifier le site.");
  }
}

/* ===================================================
   Editing
   =================================================== */
function setupEditing() {
  baseAbout = document.body.getAttribute('data-about');
  const c = collect(document);

  texts = c.texts.map(el => ({ el, html: cleanChildren(el), text: norm(el.textContent), href: el.getAttribute('href') }));
  texts.forEach(({ el }) => {
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.dataset.apText = '';
    el.addEventListener('focus', () => showToolbar(el, 'text'));
    el.addEventListener('input', markDirty);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
  });

  imgs = c.imgs.map(el => ({ el, src: el.getAttribute('src'), alt: el.getAttribute('alt') || '', upload: null }));
  imgs.forEach(item => {
    item.el.dataset.apImg = '';
    item.el.addEventListener('click', e => { e.preventDefault(); showToolbar(item.el, 'img'); });
  });

  // Never follow links while editing
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    if (a && a.closest('[data-ap-text]')) e.preventDefault();
  }, true);

  // Colours
  const cs = getComputedStyle(document.documentElement);
  COLORS.forEach(([name]) => { baseColors[name] = colors[name] = cs.getPropertyValue('--' + name).trim().toUpperCase(); });

  document.addEventListener('mousedown', e => {
    if (!e.target.closest('[data-ap-text],[data-ap-img],#ap-editor-ui')) hideToolbar();
  });
  window.addEventListener('beforeunload', e => { if (!leaving && hasChanges()) { e.preventDefault(); e.returnValue = ''; } });
}

function hrefChanged(t) { return t.el.tagName === 'A' && t.el.getAttribute('href') !== t.href; }
function textChanged(t) { return cleanChildren(t.el) !== t.html; }
function colorsChanged() { return COLORS.filter(([n]) => colors[n] !== baseColors[n]); }
function hasChanges() {
  return texts.some(t => textChanged(t) || hrefChanged(t)) || imgs.some(i => i.upload || (i.el.getAttribute('alt') || '') !== i.alt) || colorsChanged().length > 0 || aboutChanged();
}
function aboutChanged() { return baseAbout !== null && document.body.getAttribute('data-about') !== baseAbout; }
function markDirty() { ui.publish.disabled = !hasChanges(); }

/* ----- Floating toolbar ----- */
function showToolbar(el, kind) {
  current = el;
  const bar = ui.toolbar;
  bar.replaceChildren();
  const btn = (label, title, fn) => {
    const b = h('button', { type: 'button', title }, label);
    b.addEventListener('mousedown', e => e.preventDefault());   // keep the text selection
    b.addEventListener('click', fn);
    bar.append(b);
  };

  if (kind === 'img') {
    btn('Remplacer la photo', 'Choisir une nouvelle photo', () => pickImage(el));
    btn('Texte alternatif', 'Description de la photo (accessibilité)', () => {
      const v = prompt('Description de la photo :', el.getAttribute('alt') || '');
      if (v !== null) { el.setAttribute('alt', v); markDirty(); }
    });
  } else if (el.tagName === 'A') {
    btn('Adresse du lien', 'Modifier la destination du bouton', () => {
      const v = prompt('Adresse du lien (ex : #contact, https://…, mailto:…) :', el.getAttribute('href') || '');
      if (v === null) return;
      if (!safeHref(v)) return toast('Adresse non valide.', 'err');
      el.setAttribute('href', v.trim());
      markDirty();
    });
  } else {
    btn('G', 'Gras', () => document.execCommand('bold'));
    btn('I', 'Italique', () => document.execCommand('italic'));
    btn('Lien', 'Créer un lien sur la sélection', () => {
      const v = prompt('Adresse du lien (laisser vide pour retirer) :', 'https://');
      if (v === null) return;
      if (!v.trim()) document.execCommand('unlink');
      else if (safeHref(v)) document.execCommand('createLink', false, v.trim());
      else toast('Adresse non valide.', 'err');
      markDirty();
    });
  }

  bar.style.display = 'flex';
  const r = el.getBoundingClientRect();
  const top = Math.max(8, r.top + window.scrollY - bar.offsetHeight - 8);
  bar.style.top  = top + 'px';
  bar.style.left = Math.max(8, Math.min(r.left + window.scrollX, document.documentElement.clientWidth - bar.offsetWidth - 8)) + 'px';
}

function hideToolbar() { ui.toolbar.style.display = 'none'; current = null; }

/* ----- Images ----- */
function pickImage(el) {
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const item = imgs.find(i => i.el === el);
      item.upload = await prepareImage(file);
      el.src = item.upload.preview;
      el.removeAttribute('srcset');
      markDirty();
      showToolbar(el, 'img');
    } catch (e) { toast(e.message, 'err'); }
  });
  input.click();
}

async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Format non supporté (JPEG, PNG ou WebP).');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bmp.width);                // keep the repo and the pages light
  const canvas = h('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);

  const png  = file.type === 'image/png';
  const blob = await new Promise(r => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
  const b64  = await new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result.split(',')[1]);
    fr.readAsDataURL(blob);
  });
  const slug = file.name.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  return { path: `img/uploads/${Date.now()}-${slug}.${png ? 'png' : 'jpg'}`, b64, preview: URL.createObjectURL(blob) };
}

/* ===================================================
   Publish
   =================================================== */
async function publish() {
  ui.publish.disabled = true;
  ui.publish.textContent = 'Publication…';
  try {
    const files = [];                       // { path, content, encoding }
    const page  = pagePath();

    // 1. Page HTML: re-read the source from GitHub and patch only what changed
    const changedTexts = texts.map((t, i) => ({ t, i })).filter(({ t }) => textChanged(t) || hrefChanged(t));
    const changedImgs  = imgs.map((m, i) => ({ m, i })).filter(({ m }) => m.upload || (m.el.getAttribute('alt') || '') !== m.alt);

    if (changedTexts.length || changedImgs.length || aboutChanged()) {
      const doc = new DOMParser().parseFromString(await readRaw(page), 'text/html');
      const src = collect(doc);
      if (src.texts.length !== texts.length || src.imgs.length !== imgs.length) {
        throw new Error('La page a changé depuis son affichage. Rechargez-la (attendez 1 minute si vous venez de publier).');
      }
      if (aboutChanged()) doc.body.setAttribute('data-about', document.body.getAttribute('data-about'));
      for (const { t, i } of changedTexts) {
        // Guard: the source block must still be the one we loaded
        if (norm(src.texts[i].textContent) !== t.text) {
          throw new Error('Un texte a été modifié ailleurs entre-temps. Rechargez la page avant de modifier.');
        }
        if (textChanged(t)) src.texts[i].innerHTML = cleanChildren(t.el);
        if (hrefChanged(t)) src.texts[i].setAttribute('href', t.el.getAttribute('href'));
      }
      for (const { m, i } of changedImgs) {
        const s = src.imgs[i];
        if (m.upload) { s.setAttribute('src', '/' + m.upload.path); s.removeAttribute('srcset'); }
        s.setAttribute('alt', m.el.getAttribute('alt') || '');
        if (m.upload) files.push({ path: m.upload.path, content: m.upload.b64, encoding: 'base64' });
      }
      files.push({ path: page, content: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n', encoding: 'utf-8' });
    }

    // 2. Colours: patch the :root variables of the stylesheet
    const changedColors = colorsChanged();
    if (changedColors.length) {
      let css = await readRaw('css/style.css');
      for (const [name] of changedColors) {
        if (!/^#[0-9A-F]{6}$/.test(colors[name])) throw new Error('Couleur invalide.');
        const re = new RegExp(`(--${name}:\\s*)#[0-9A-Fa-f]{6}(\\s*;)`);
        if (!re.test(css)) throw new Error(`Variable --${name} introuvable dans la feuille de style.`);
        css = css.replace(re, `$1${colors[name]}$2`);
      }
      files.push({ path: 'css/style.css', content: css, encoding: 'utf-8' });
    }

    if (!files.length) throw new Error('Aucune modification à publier.');

    // 3. One commit for everything
    const ref    = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const commit = await gh(`/repos/${REPO}/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of files) {
      const blob = await gh(`/repos/${REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content, encoding: f.encoding }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const msg = `Édition visuelle : ${page}${changedColors.length ? ' + couleurs' : ''}`;
    const newCommit = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [ref.object.sha] }) });
    await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });

    // 4. What is on screen is now the new baseline
    texts.forEach(t => { t.html = cleanChildren(t.el); t.text = norm(t.el.textContent); t.href = t.el.getAttribute('href'); });
    imgs.forEach(m => { if (m.upload) m.src = '/' + m.upload.path; m.alt = m.el.getAttribute('alt') || ''; m.upload = null; });
    baseColors = { ...colors };
    if (baseAbout !== null) baseAbout = document.body.getAttribute('data-about');
    toast('Publié. Le site sera à jour dans environ 1 minute.');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    ui.publish.textContent = 'Publier';
    markDirty();
  }
}

/* ===================================================
   UI
   =================================================== */
function buildUI() {
  ui.toast = h('div', { class: 'ap-toast', role: 'status' });
  ui.toolbar = h('div', { id: 'ap-toolbar', class: 'ap-toolbar' });
  ui.publish = h('button', { type: 'button', class: 'ap-primary', disabled: '', onclick: publish }, 'Publier');

  ui.about = h('button', { type: 'button', onclick: () => {
    const body = document.body;
    body.setAttribute('data-about', body.getAttribute('data-about') === 'off' ? 'on' : 'off');
    aboutLabel();
    markDirty();
  } });
  aboutLabel();

  ui.panel = h('div', { class: 'ap-panel' });
  ui.panel.hidden = true;
  ui.panel.append(h('strong', {}, 'Couleurs du site'));
  COLORS.forEach(([name, label]) => {
    const input = h('input', { type: 'color', value: colors[name].toLowerCase() });
    input.addEventListener('input', () => {
      colors[name] = input.value.toUpperCase();
      document.documentElement.style.setProperty('--' + name, colors[name]);
      markDirty();
    });
    ui.panel.append(h('label', {}, input, ' ' + label));
  });
  ui.panel.append(h('button', { type: 'button', onclick: () => {
    colors = { ...baseColors };
    COLORS.forEach(([n]) => document.documentElement.style.removeProperty('--' + n));
    ui.panel.querySelectorAll('input').forEach((inp, i) => { inp.value = baseColors[COLORS[i][0]].toLowerCase(); });
    markDirty();
  } }, 'Réinitialiser'));

  const bar = h('div', { class: 'ap-bar' },
    h('span', { class: 'ap-title' }, 'Mode édition'),
    h('span', { class: 'ap-hint' }, 'Cliquez sur un texte ou une photo pour la modifier'),
    ...(baseAbout !== null ? [ui.about] : []),
    h('button', { type: 'button', onclick: () => { ui.panel.hidden = !ui.panel.hidden; } }, 'Couleurs'),
    ui.publish,
    h('button', { type: 'button', onclick: quit }, 'Quitter'));

  const root = h('div', { id: 'ap-editor-ui' }, ui.toolbar, ui.panel, bar, ui.toast);
  document.body.append(root);
  document.body.classList.add('ap-editing');
}

function aboutLabel() {
  ui.about.textContent = document.body.getAttribute('data-about') === 'off' ? 'Afficher « Qui suis-je ? »' : 'Masquer « Qui suis-je ? »';
}

function quit() {
  if (hasChanges() && !confirm('Des modifications ne sont pas publiées. Quitter quand même ?')) return;
  store(s => { s.removeItem(EDIT_KEY); s.removeItem(TOKEN_KEY); });
  leaving = true;
  location.href = location.pathname;
}

function showLogin(message) {
  document.getElementById('ap-login')?.remove();
  const err = h('p', { class: 'ap-err' }, message || '');
  const box = h('div', { id: 'ap-login' },
    h('div', { class: 'ap-login-card' },
      h('h2', {}, 'Modifier le site'),
      h('p', {}, 'Connectez-vous avec votre compte GitHub autorisé.'),
      err,
      h('button', { type: 'button', class: 'ap-primary', onclick: async e => {
        e.target.disabled = true;
        try {
          token = await login();
          await checkAccess();
          store(s => s.setItem(TOKEN_KEY, token));
          box.remove();
          start();
        } catch (ex) {
          token = null;
          err.textContent = ex.message;
          e.target.disabled = false;
        }
      } }, 'Se connecter avec GitHub'),
      h('button', { type: 'button', onclick: quit }, 'Annuler')));
  document.body.append(box);
}

let started = false;
function start() {
  if (started) return;
  started = true;
  setupEditing();
  buildUI();
}

/* ----- Entry point ----- */
export async function initEditor() {
  const css = h('link', { rel: 'stylesheet', href: '/css/editor.css' });
  document.head.append(css);

  token = store(s => s.getItem(TOKEN_KEY));
  if (!token) return showLogin();
  try {
    await checkAccess();
    start();
  } catch (e) {
    if (token) { token = null; store(s => s.removeItem(TOKEN_KEY)); }
    showLogin(e.message);
  }
}
