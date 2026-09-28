(function(){
  'use strict';

  // Header & footer: content/site.json. Publishing it rewrites the header,
  // footer and sharing tags inside every page of the site.
  var C = window.AdminCommon;
  var esc = C.esc, api = C.api, json = C.json, clone = C.clone, setStatus = C.setStatus;

  var site = null, saved = null, baseHead = null, documents = [];
  var editor = document.getElementById('editor');
  var frame = document.getElementById('pv');

  function diff(){
    if (!site) return [];
    var out = [], names = { header: 'Header', footer: 'Footer', meta: 'Sharing and search' };
    Object.keys(names).forEach(function(k){
      if (JSON.stringify(site[k]) !== JSON.stringify(saved[k])) out.push({ k: 'edit', t: 'Edited: ' + names[k] });
    });
    return out;
  }
  function changed(){ var n = diff().length, el = document.getElementById('count'); el.hidden = !n; el.textContent = n; schedulePreview(); }

  C.hooks.unsaved = diff;
  C.hooks.reload = load;
  function load(){
    setStatus('Checking GitHub…');
    C.sync().then(function(s){
      return api('/api/site').then(function(res){
        site = res.site; saved = clone(site); baseHead = res.head; documents = res.documents;
        render(); changed(); C.renderRepo(s, s.pulled);
        setStatus('Settings loaded', 'ok');
      });
    }).catch(function(e){ setStatus('Load failed: ' + e.message, 'err'); });
  }

  // one list editor for the header links and the footer links
  function linkRows(list, key, withEmoji){
    return (list || []).map(function(l, i){
      return '<div class="linkrow' + (withEmoji ? ' has-emoji' : '') + '">' +
        (withEmoji ? '<input type="text" data-list="' + key + '" data-i="' + i + '" data-k="emoji" value="' + esc(l.emoji) + '" placeholder="🙂" aria-label="Emoji (optional)" maxlength="4">' : '') +
        '<input type="text" data-list="' + key + '" data-i="' + i + '" data-k="label" value="' + esc(l.label) + '" placeholder="Text" aria-label="Link text">' +
        '<input type="text" data-list="' + key + '" data-i="' + i + '" data-k="href" value="' + esc(l.href) + '" placeholder="https://…" aria-label="Link address">' +
        '<span class="ctl"><button type="button" data-mv="-1" data-list="' + key + '" data-i="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" data-mv="1" data-list="' + key + '" data-i="' + i + '" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" data-del="' + i + '" data-list="' + key + '" aria-label="Remove link">×</button></span></div>';
    }).join('') + '<div><button type="button" class="btn" data-add="' + key + '">+ Link</button></div>';
  }
  function listOf(key){ return key === 'header' ? site.header.links : site.footer.links; }

  function render(){
    var h = site.header, f = site.footer, m = site.meta;
    var docOptions = documents.slice();
    if (h.resume.href && docOptions.indexOf(h.resume.href) < 0) docOptions.unshift(h.resume.href);
    var desc = m.description || '';
    editor.innerHTML =
      '<div class="settings"><h2>Header</h2>' +
        '<div class="f"><span class="lbl">Always there</span><div class="chips"><button type="button" disabled>reel</button><button type="button" disabled>portfolio</button><button type="button" disabled>contact</button></div></div>' +
        '<div class="two"><div class="f"><label class="lbl" for="r-label">Resume link text</label><input type="text" id="r-label" data-path="header.resume.label" value="' + esc(h.resume.label) + '"></div>' +
        '<div class="f"><label class="lbl" for="r-href">Resume file</label><select id="r-href" data-path="header.resume.href">' +
          '<option value="">(no resume link)</option>' + docOptions.map(function(d){ return '<option' + (d === h.resume.href ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="row"><button type="button" class="btn" data-act="pdf">Upload a PDF…</button><span class="hint">Goes to /files/ and becomes the resume file.</span></div>' +
        '<div class="f"><span class="lbl">Your links after “|”</span>' + linkRows(h.links, 'header', true) + '</div>' +
      '</div>' +
      '<div class="settings"><h2>Footer</h2>' +
        '<div class="two"><div class="f"><label class="lbl" for="f-email">Contact email</label><input type="text" id="f-email" data-path="footer.email" value="' + esc(f.email) + '"></div>' +
        '<div class="f"><label class="lbl" for="f-owner">Name (logo and ©)</label><input type="text" id="f-owner" data-path="footer.owner" value="' + esc(f.owner) + '"></div></div>' +
        '<span class="hint">The email is written into the page reversed and turned around by the browser, so address-collecting bots reading the HTML do not see it.</span>' +
        '<div class="f"><span class="lbl">Links</span>' + linkRows(f.links, 'footer', false) + '</div>' +
      '</div>' +
      '<div class="settings"><h2>Sharing and search</h2>' +
        '<span class="hint">What Google shows, and what a link to the site looks like when pasted into LinkedIn, Messenger, Slack or an email.</span>' +
        '<div class="f"><label class="lbl" for="m-title">Homepage title</label><input type="text" id="m-title" data-path="meta.title" value="' + esc(m.title) + '"></div>' +
        '<div class="f"><label class="lbl" for="m-desc">Description <span id="desc-n" class="hint">' + desc.length + ' / ~160</span></label><textarea id="m-desc" data-path="meta.description" rows="3">' + esc(desc) + '</textarea></div>' +
        '<div class="f"><span class="lbl">Preview image (about 1200 × 630)</span>' +
          (m.image ? '<img class="share-img" src="' + esc(m.image) + '" alt="">' : '<span class="hint">None yet: links show without a picture. A still from the showreel works well.</span>') +
          '<div class="row"><button type="button" class="btn" data-act="share">' + (m.image ? 'Replace image…' : 'Upload image…') + '</button>' + (m.image ? '<button type="button" class="btn" data-act="noshare">Remove</button>' : '') + '</div>' +
          '<span class="hint">Project pages use their first photo instead, unless they have none.</span></div>' +
        '<div class="f"><label class="lbl" for="m-url">Site address</label><input type="text" id="m-url" data-path="meta.url" value="' + esc(m.url) + '"></div>' +
      '</div>' + shareCard();
  }

  // what a pasted link will roughly look like
  function shareCard(){
    var m = site.meta;
    return '<div class="settings share-card"><span class="lbl">A shared link will look roughly like this</span>' +
      '<div class="sc">' + (m.image ? '<img src="' + esc(m.image) + '" alt="">' : '') +
      '<div class="sc-t"><small>' + esc(String(m.url || '').replace(/^https?:\/\//, '').toUpperCase()) + '</small><b>' + esc(m.title) + '</b><span>' + esc(m.description) + '</span></div></div></div>';
  }

  function setPath(path, value){
    var parts = path.split('.'), o = site;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  editor.addEventListener('input', function(e){
    var t = e.target, d = t.dataset;
    if (d.path) setPath(d.path, t.value);
    else if (d.list) listOf(d.list)[+d.i][d.k] = t.value;
    else return;
    if (t.id === 'm-desc') document.getElementById('desc-n').textContent = t.value.length + ' / ~160';
    if (/^meta\./.test(d.path || '')){ var old = editor.querySelector('.share-card'); if (old) old.outerHTML = shareCard(); }
    changed();
  });
  editor.addEventListener('change', function(e){ if (e.target.tagName === 'SELECT'){ setPath(e.target.dataset.path, e.target.value); changed(); } });

  editor.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    var d = b.dataset;
    function redo(){ render(); changed(); }
    if (d.add){ listOf(d.add).push({ label: '', href: '' }); redo(); var rows = editor.querySelectorAll('[data-list="' + d.add + '"][data-k="label"]'); rows[rows.length - 1].focus(); return; }
    if (d.del != null){ listOf(d.list).splice(+d.del, 1); return redo(); }
    if (d.mv){ var l = listOf(d.list), i = +d.i, j = i + (+d.mv), x = l.splice(i, 1)[0]; l.splice(j, 0, x); return redo(); }
    if (d.act === 'pdf') return document.getElementById('file-pdf').click();
    if (d.act === 'share') return document.getElementById('file-share').click();
    if (d.act === 'noshare'){ site.meta.image = ''; return redo(); }
  });

  document.getElementById('file-pdf').addEventListener('change', function(ev){
    var f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    C.upload(f, 'files', null).then(function(path){
      if (documents.indexOf(path) < 0) documents.push(path);
      site.header.resume.href = path; render(); changed();
    }, function(){});
  });
  document.getElementById('file-share').addEventListener('change', function(ev){
    var f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    C.upload(f, 'share', { long: 1200 }).then(function(path){ site.meta.image = path; render(); changed(); }, function(){});
  });

  // ---------- preview ----------
  var pvTimer = null, pvScroll = 0;
  function schedulePreview(){ clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 350); }
  function renderPreview(){
    if (!site) return;
    try { pvScroll = frame.contentWindow.scrollY || pvScroll; } catch (e) {}
    api('/api/site/preview', json('POST', site)).then(function(res){ frame.src = res.url; })
      .catch(function(e){ setStatus('Preview failed: ' + e.message, 'err'); });
  }
  frame.addEventListener('load', function(){
    var doc = frame.contentDocument; if (!doc) return;
    // links in the preview open the real page in a new tab
    doc.addEventListener('click', function(e){
      var a = e.target.closest('a[href]');
      if (a && a.getAttribute('href').charAt(0) !== '#'){ e.preventDefault(); window.open(a.href, '_blank'); }
    }, true);
    frame.contentWindow.scrollTo(0, pvScroll);
  });
  [].forEach.call(document.querySelectorAll('[data-jump]'), function(b){
    b.addEventListener('click', function(){
      var w = frame.contentWindow; if (!w) return;
      w.scrollTo({ top: b.dataset.jump === 'top' ? 0 : w.document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
  [].forEach.call(document.querySelectorAll('.pv-bar .seg button'), function(b){
    b.addEventListener('click', function(){
      [].forEach.call(document.querySelectorAll('.pv-bar .seg button'), function(x){ x.setAttribute('aria-pressed', x === b); });
      document.getElementById('stage').classList.toggle('phone', b.dataset.w === 'phone');
    });
  });

  // ---------- publish ----------
  var pub = document.getElementById('pub'), pubGo = document.getElementById('pub-go'), pubResult = document.getElementById('pub-result');
  function closePub(){ pub.hidden = true; }
  document.getElementById('pub-cancel').addEventListener('click', closePub);
  pub.addEventListener('click', function(e){ if (e.target === pub) closePub(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePub(); });

  document.getElementById('btn-save').addEventListener('click', function(){
    var ch = diff(), repo = C.repo();
    var extra = repo && repo.dirty && repo.dirty.length ? [{ k: 'add', t: repo.dirty.length + ' file(s) already on disk' }] : [];
    if (!ch.length && !extra.length && !(repo && repo.ahead)){ setStatus('Nothing to publish: everything matches GitHub.', 'ok'); return; }
    document.getElementById('pub-changes').innerHTML = ch.concat(extra).map(function(c){
      return '<li><span class="k ' + c.k + '">' + c.k + '</span><span>' + esc(c.t) + '</span></li>';
    }).join('') + '<li><span class="k move">note</span><span>Every page of the site is rewritten with the new header and footer.</span></li>';
    document.getElementById('pub-msg').value = ch.length ? ch.map(function(c){ return c.t; }).join('; ') : 'Add uploaded files';
    pubResult.hidden = true; pubResult.className = 'pub-result';
    pubGo.disabled = false; pubGo.textContent = 'Publish'; pubGo.onclick = doPublish;
    pub.hidden = false;
    document.getElementById('pub-msg').focus();
  });

  function doPublish(){
    pubGo.disabled = true; pubGo.textContent = 'Publishing…';
    pubResult.hidden = false; pubResult.className = 'pub-result';
    pubResult.textContent = 'Checking GitHub, rewriting the pages, committing, pushing…';
    api('/api/site', json('PUT', { site: site, message: document.getElementById('pub-msg').value.trim(), head: baseHead }))
      .then(function(res){
        saved = clone(site); baseHead = res.repo.head;
        changed(); C.renderRepo(res.repo);
        pubResult.className = 'pub-result ' + (res.pushed ? 'ok' : 'err');
        pubResult.textContent = res.pushed
          ? (res.commit ? 'Committed ' + res.commit + ' (' + res.files.length + ' files) and pushed to GitHub.' : 'Nothing new to commit; pushed.') + '\nThe live site updates about a minute after GitHub Pages finishes building.'
          : 'Committed ' + (res.commit || '') + ' here, but the push to GitHub failed:\n' + res.pushError + '\nNothing is lost. Use “Push now” in the yellow bar when you are back online.';
        setStatus(res.pushed ? 'Published' : 'Committed, not pushed', res.pushed ? 'ok' : 'err');
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
      })
      .catch(function(e){
        pubResult.className = 'pub-result err'; pubResult.textContent = e.message;
        if (e.data && e.data.repo && e.data.repo.head) C.renderRepo(e.data.repo);
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
        setStatus('Not published', 'err');
      });
  }

  window.addEventListener('beforeunload', function(e){ if (!window.AdminSwitching && diff().length){ e.preventDefault(); e.returnValue = ''; } });

  load();
})();
