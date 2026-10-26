/* ===================================================
   Anne Partridge — main.js
   =================================================== */

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
  initContactForm();
  maybeStartEditor();
});
