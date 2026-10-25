/* ===================================================
   Anne Partridge — main.js
   =================================================== */

/* ----- Load nav + footer partials ----- */
async function loadPartials() {
  const navEl    = document.getElementById('nav-placeholder');
  const footerEl = document.getElementById('footer-placeholder');

  try {
    if (navEl) {
      const r = await fetch('/partials/nav.html');
      if (r.ok) {
        navEl.innerHTML = await r.text();
        initNav();
        setActiveNav();
      }
    }
    if (footerEl) {
      const r = await fetch('/partials/footer.html');
      if (r.ok) footerEl.innerHTML = await r.text();
    }
  } catch (e) {
    console.warn('Partials not loaded (normal in local file:// mode):', e.message);
  }
}

/* ----- Nav toggle + mobile dropdowns ----- */
function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const menu   = document.querySelector('.nav-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('open', open);
  });

  // Close menu when a non-dropdown link is clicked
  menu.querySelectorAll('a:not(.has-dropdown > a)').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.classList.remove('open');
    });
  });

  // Mobile dropdown toggles
  document.querySelectorAll('.has-dropdown > a').forEach(link => {
    link.addEventListener('click', e => {
      if (window.innerWidth <= 900) {
        e.preventDefault();
        link.parentElement.classList.toggle('open');
      }
    });
  });
}

/* ----- Highlight active page in nav ----- */
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-menu > li > a').forEach(a => {
    const href = (a.getAttribute('href') || '').split('/').pop();
    if (href && href === path) a.closest('li').classList.add('active');
  });
  if (path === '' || path === 'index.html') {
    const home = document.querySelector('.nav-menu a[href="/index.html"]');
    if (home) home.closest('li').classList.add('active');
  }
}

/* ----- Safety helpers: CMS content is untrusted, never inject it raw ----- */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Only allow https:, http: and mailto: links (blocks javascript:, data:, ...)
function safeUrl(url) {
  try {
    const u = new URL(String(url).trim(), window.location.origin);
    return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

/* ----- Load upcoming dates ----- */
async function loadDates() {
  const el = document.getElementById('dates-container');
  if (!el) return;

  try {
    const r    = await fetch('/content/prochaines-dates.json');
    const data = await r.json();

    if (!data.events || data.events.length === 0) {
      el.innerHTML = '<p class="text-muted">Aucun événement prévu pour le moment. Contactez-moi pour connaître les prochaines dates.</p>';
      return;
    }

    el.innerHTML = data.events.map(ev => {
      const d     = ev.date ? new Date(ev.date + 'T12:00:00') : null;
      const day   = d ? d.getDate() : '—';
      const month = d ? d.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase() : '';

      const registration = ev.registration ? safeUrl(ev.registration) : '';

      return `
        <div class="event-card">
          <div class="event-badge">
            <div class="day">${esc(day)}</div>
            <div class="month">${esc(month)}</div>
          </div>
          <div>
            <div class="event-title">${esc(ev.title)}</div>
            <div class="event-meta">
              ${ev.time     ? `<span>${esc(ev.time)}</span>` : ''}
              ${ev.format   ? `<span>${esc(ev.format)}</span>` : ''}
              ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
            </div>
            <p class="event-desc">${esc(ev.description)}</p>
            ${ev.price ? `<div class="event-price">${esc(ev.price)}</div>` : ''}
            ${registration ? `<div style="margin-top:.9rem"><a href="${esc(registration)}" class="btn btn-primary btn-sm">Inscription</a></div>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p class="text-muted">Impossible de charger les dates. Veuillez me contacter directement.</p>';
  }
}

/* ----- Load testimonials ----- */
async function loadTestimonials() {
  const el = document.getElementById('testimonials-container');
  if (!el) return;

  try {
    const r    = await fetch('/content/temoignages.json');
    const data = await r.json();

    el.innerHTML = '<div class="testimonials-grid">' +
      data.testimonials.map(t => `
        <div class="t-card">
          <p class="t-text">${esc(t.text)}</p>
          ${t.author ? `<p class="t-author">— ${esc(t.author)}</p>` : ''}
        </div>`).join('') +
      '</div>';
  } catch (e) {
    el.innerHTML = '<p class="text-muted">Impossible de charger les témoignages.</p>';
  }
}

/* ----- Contact form (Formspree) ----- */
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn     = form.querySelector('button[type=submit]');
    const success = document.getElementById('form-success');
    const error   = document.getElementById('form-error');

    btn.disabled    = true;
    btn.textContent = 'Envoi…';

    try {
      const res = await fetch(form.action, {
        method:  'POST',
        body:    new FormData(form),
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        form.reset();
        if (success) { success.style.display = 'block'; }
        if (error)   { error.style.display   = 'none';  }
      } else {
        throw new Error('Server error');
      }
    } catch {
      if (error) { error.style.display = 'block'; }
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Envoyer';
    }
  });
}

/* ----- Visual editor (admin only): loaded on demand, never for visitors ----- */
function maybeStartEditor() {
  let on = false;
  try {
    if (new URLSearchParams(location.search).has('edit')) sessionStorage.setItem('ap_edit', '1');
    on = sessionStorage.getItem('ap_edit') === '1';
  } catch {}
  if (on) import('/js/editor.js').then(m => m.initEditor());
}

/* ----- Init ----- */
document.addEventListener('DOMContentLoaded', () => {
  loadPartials().then(maybeStartEditor);
  loadDates();
  loadTestimonials();
  initContactForm();
});
