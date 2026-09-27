(function(){
  'use strict';

  var cards = [];
  var saved = [];          // the cards as they are in git, to diff against
  var baseHead = null;     // commit the page was loaded at; the server refuses a publish from a stale one
  var editingIndex = null;
  var icons = [];
  var dragFrom = null;
  var show = 'all';
  var lastCheck = 0;

  var listEl = document.getElementById('card-list');
  var statusEl = document.getElementById('status');
  var overlay = document.getElementById('overlay');
  var panel = document.getElementById('edit-panel');
  var form = document.getElementById('edit-form');
  var bannerEl = document.getElementById('banner');

  var EYE_ON = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 004.4-1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function setStatus(text, cls){
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function api(url, opts){
    return fetch(url, opts).then(function(r){
      return r.json().then(function(data){
        if (!r.ok){ var e = new Error(data.error || ('HTTP ' + r.status)); e.data = data; throw e; }
        return data;
      });
    });
  }
  function json(method, body){ return { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  // ---------- what changed since the last publish ----------
  function diff(){
    var out = [];
    var before = {}; saved.forEach(function(c, i){ before[c.id] = { c: c, i: i }; });
    var now = {}; cards.forEach(function(c){ now[c.id] = c; });
    cards.forEach(function(c){
      var b = before[c.id];
      if (!b){ out.push({ k: 'add', t: 'New card: ' + c.title + (c.visible === false ? ' (draft)' : '') }); return; }
      if ((b.c.visible !== false) !== (c.visible !== false)) out.push({ k: c.visible === false ? 'hide' : 'add', t: (c.visible === false ? 'Made a draft: ' : 'Put live: ') + c.title });
      var x = clone(b.c), y = clone(c); delete x.visible; delete y.visible;
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ k: 'edit', t: 'Edited: ' + c.title });
    });
    saved.forEach(function(c){ if (!now[c.id]) out.push({ k: 'del', t: 'Deleted: ' + c.title }); });
    var a = saved.map(function(c){ return c.id; }).filter(function(id){ return now[id]; });
    var b2 = cards.map(function(c){ return c.id; }).filter(function(id){ return before[id]; });
    if (a.join() !== b2.join()) out.push({ k: 'move', t: 'Changed the order' });
    return out;
  }
  function isEdited(card){
    var b = saved.filter(function(c){ return c.id === card.id; })[0];
    return !b || JSON.stringify(b) !== JSON.stringify(card);
  }
  function refreshCount(){
    var n = diff().length, el = document.getElementById('count');
    el.hidden = !n; el.textContent = n;
  }

  // ---------- repository state ----------
  var repo = null;
  function banner(kind, html, action, onAction){
    if (!kind){ bannerEl.hidden = true; bannerEl.innerHTML = ''; return; }
    bannerEl.className = 'banner ' + kind;
    bannerEl.innerHTML = '<div>' + html + '</div>' + (action ? '<button class="btn" id="banner-act">' + esc(action) + '</button>' : '');
    bannerEl.hidden = false;
    if (action) document.getElementById('banner-act').onclick = onAction;
  }
  function renderRepo(s, pulled){
    repo = s;
    var pill = document.getElementById('repo'), txt = document.getElementById('repo-text');
    var state = 'ok', label = 'main · ' + s.head + ' · up to date';
    banner(null);
    if (s.problem === 'branch' || s.branch !== 'main'){
      state = 'bad'; label = 'on branch ' + s.branch;
      banner('bad', '<b>This copy is on branch “' + esc(s.branch) + '”, not main.</b> Publishing is off until it is back on main.');
    } else if (!s.emailOk){
      state = 'bad'; label = 'main · ' + s.head + ' · commit email';
      banner('bad', '<b>This copy would commit as “' + esc(s.email || 'no email') + '”.</b> GitHub refuses pushes that expose a private address, so publishing is blocked. In the repo folder run <code>git config user.email 33331553+martinposta@users.noreply.github.com</code> and reload.');
    } else if (s.problem === 'diverged' || (s.ahead && s.behind)){
      state = 'bad'; label = 'main · ' + s.head + ' · diverged';
      banner('bad', '<b>This copy and GitHub both have commits the other lacks.</b> That needs sorting out in git by hand; publishing would be refused.');
    } else if (s.problem === 'pull'){
      state = 'bad'; label = 'main · ' + s.head + ' · behind';
      banner('bad', '<b>GitHub has ' + s.behind + ' newer commit(s), but they could not be pulled</b> (probably files changed here that the pull would overwrite).');
    } else if (s.behind){
      state = 'bad'; label = 'main · ' + s.head + ' · GitHub is ahead';
      banner('bad', '<b>main on GitHub moved (' + esc(s.remoteHead) + ', ' + esc(s.remoteWhen) + ').</b> Publishing from here would be refused. Reload to get the newer version' +
        (diff().length ? '; your unsaved edits here are:<ul>' + diff().map(function(c){ return '<li>' + esc(c.t) + '</li>'; }).join('') + '</ul>and will have to be made again.' : '.'),
        'Load newer version', function(){ load(); });
    } else if (s.ahead){
      state = 'warn'; label = 'main · ' + s.head + ' · ' + s.ahead + ' not pushed';
      banner('warn', '<b>' + s.ahead + ' commit(s) here are not on GitHub yet</b> (a push failed earlier). Other machines will not see them until they are pushed.', 'Push now', retryPush);
    } else if (s.dirty && s.dirty.length){
      state = 'warn'; label = 'main · ' + s.head + ' · ' + s.dirty.length + ' file(s) not in git';
      banner('warn', '<b>' + s.dirty.length + ' file(s) on disk are not in git:</b><ul>' + s.dirty.slice(0, 8).map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>They will go into the next publish.');
    } else if (pulled && pulled.length){
      state = 'info';
      banner('info', '<b>Pulled ' + pulled.length + ' commit(s) from GitHub</b> when the admin opened:<ul>' + pulled.slice(0, 6).map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>You are editing the current version.');
    }
    if (s.offline){ state = state === 'ok' ? 'warn' : state; label += ' · offline'; }
    pill.dataset.s = state;
    txt.textContent = label;
    pill.title = s.offline ? 'Could not reach GitHub: ' + (s.fetchError || '') : 'State of this copy against GitHub';
  }
  function retryPush(){
    setStatus('Pushing…');
    api('/api/push', { method: 'POST' }).then(function(res){ renderRepo(res.repo); setStatus('Pushed', 'ok'); })
      .catch(function(e){ setStatus('Push failed: ' + e.message, 'err'); });
  }
  // Re-check when the tab comes back into focus (a copy left open for days
  // on the server would otherwise never learn that another machine published).
  window.addEventListener('focus', function(){
    if (Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    api('/api/repo').then(function(s){ renderRepo(s); }).catch(function(){});
  });

  // ---------- loading ----------
  function load(){
    setStatus('Checking GitHub…');
    api('/api/sync', { method: 'POST' }).then(function(s){
      lastCheck = Date.now();
      return Promise.all([ api('/api/projects'), api('/api/icons') ]).then(function(res){
        cards = res[0].cards; saved = clone(cards); baseHead = res[0].head;
        icons = res[1];
        form.elements.thumbIcon.innerHTML = icons.map(function(i){ return '<option value="' + i + '">' + i + '</option>'; }).join('');
        renderList(); refreshCount(); renderRepo(s, s.pulled);
        setStatus(cards.length + ' cards loaded', 'ok');
      });
    }).catch(function(e){ setStatus('Load failed: ' + e.message, 'err'); });
  }

  function thumbHtml(card){
    if (card.thumb && card.thumb.type === 'photo' && card.thumb.src){
      return '<img class="row-thumb" src="' + esc(card.thumb.src) + '" alt="">';
    }
    var icon = card.thumb ? card.thumb.icon : '';
    return '<div class="row-thumb icon">' + esc(icon || '—') + '</div>';
  }

  function typeLabel(card){
    var t = card.interaction && card.interaction.type;
    if (t === 'link') return 'external link';
    if (t === 'page') return 'project page';
    if (t === 'lightbox') return 'lightbox';
    return t || '';
  }

  function renderList(){
    listEl.innerHTML = '';
    cards.forEach(function(card, i){
      var draft = card.visible === false;
      if (show === 'live' && draft) return;
      if (show === 'draft' && !draft) return;
      var li = document.createElement('li');
      li.className = 'card-row' + (draft ? ' draft' : '');
      li.draggable = show === 'all';
      li.innerHTML =
        '<div class="handle">' + (show === 'all' ? '⠿' : '') + '</div>' +
        thumbHtml(card) +
        '<div class="row-main"><div class="row-title"></div><div class="row-sub"></div></div>' +
        '<div class="row-cat">' + esc(card.category) + '</div>' +
        '<div class="row-type">' + typeLabel(card) + '</div>' +
        '<button class="eye" title="' + (draft ? 'Draft: not on the site. Click to put it live.' : 'Live on the site. Click to make it a draft.') + '" aria-label="' + (draft ? 'Put live' : 'Make draft') + '">' + (draft ? EYE_OFF : EYE_ON) + '</button>';
      var t = li.querySelector('.row-title');
      t.textContent = card.title || '(untitled)';
      if (draft) t.insertAdjacentHTML('beforeend', '<span class="draft-tag">draft</span>');
      if (isEdited(card)) t.insertAdjacentHTML('beforeend', '<span class="edited" title="Changed since the last publish"></span>');
      li.querySelector('.row-sub').textContent = card.role || '';
      li.addEventListener('click', function(ev){
        if (ev.target.closest('.eye')){ card.visible = draft ? true : false; renderList(); refreshCount(); return; }
        if (ev.target.classList.contains('handle')) return;
        openEdit(i);
      });
      li.addEventListener('dragstart', function(){ dragFrom = i; li.classList.add('dragging'); });
      li.addEventListener('dragend', function(){ li.classList.remove('dragging'); });
      li.addEventListener('dragover', function(ev){ ev.preventDefault(); });
      li.addEventListener('drop', function(ev){
        ev.preventDefault();
        if (dragFrom === null || dragFrom === i) return;
        var moved = cards.splice(dragFrom, 1)[0];
        cards.splice(i, 0, moved);
        dragFrom = null;
        renderList(); refreshCount();
      });
      listEl.appendChild(li);
    });
    var drafts = cards.filter(function(c){ return c.visible === false; }).length;
    document.getElementById('n-all').textContent = cards.length;
    document.getElementById('n-live').textContent = cards.length - drafts;
    document.getElementById('n-draft').textContent = drafts;
  }

  Array.prototype.forEach.call(document.querySelectorAll('.toolbar .seg button'), function(b){
    b.addEventListener('click', function(){
      show = b.dataset.show;
      Array.prototype.forEach.call(document.querySelectorAll('.toolbar .seg button'), function(x){ x.setAttribute('aria-pressed', x === b); });
      renderList();
    });
  });

  function showRadioGroup(prefix, value){
    ['photo','icon'].forEach(function(v){
      var el = document.getElementById('thumb-' + v + '-fields');
      if (el && prefix === 'thumb') el.classList.toggle('hidden', v !== value);
    });
    ['link','page','lightbox'].forEach(function(v){
      var el = document.getElementById('fields-' + v);
      if (el && prefix === 'interaction') el.classList.toggle('hidden', v !== value);
    });
  }

  function openEdit(i){
    editingIndex = i;
    var isNew = i === null;
    var card = isNew ? {
      title: '', role: '', category: 'shorts', flag: '',
      thumb: { type: 'photo', src: '', alt: '' },
      interaction: { type: 'page', href: '' }
    } : cards[i];

    document.getElementById('edit-title').textContent = isNew ? 'New card (starts as a draft)' : 'Edit card';
    form.reset();
    form.elements.title.value = card.title || '';
    form.elements.role.value = card.role || '';
    form.elements.category.value = card.category || 'shorts';
    form.elements.flag.value = card.flag || '';

    var thumbType = (card.thumb && card.thumb.type) || 'photo';
    form.querySelector('input[name=thumbType][value="' + thumbType + '"]').checked = true;
    form.elements.thumbSrc.value = (card.thumb && card.thumb.src) || '';
    document.getElementById('thumb-preview').src = (card.thumb && card.thumb.src) || '';
    if (card.thumb && card.thumb.type === 'icon') form.elements.thumbIcon.value = card.thumb.icon || icons[0];
    showRadioGroup('thumb', thumbType);

    var it = card.interaction || { type: 'page' };
    form.querySelector('input[name=interactionType][value="' + it.type + '"]').checked = true;
    form.elements.linkHref.value = it.type === 'link' ? (it.href || '') : '';
    form.elements.pageHref.value = it.type === 'page' ? (it.href || '') : '';
    form.elements.lbTitle.value = it.title || '';
    form.elements.lbDesc.value = it.desc || '';
    form.elements.lbVideo.value = it.video || '';
    form.elements.lbLink.value = it.link || '';
    form.elements.lbLinkLabel.value = it.linkLabel || '';
    form.elements.lbPin.value = it.pin || '';
    showRadioGroup('interaction', it.type);

    document.getElementById('btn-delete').style.display = isNew ? 'none' : '';

    overlay.classList.remove('hidden');
    panel.classList.remove('hidden');
  }

  function closeEdit(){
    overlay.classList.add('hidden');
    panel.classList.add('hidden');
    editingIndex = null;
  }

  Array.prototype.forEach.call(form.querySelectorAll('input[name=thumbType]'), function(r){
    r.addEventListener('change', function(){ showRadioGroup('thumb', r.value); });
  });
  Array.prototype.forEach.call(form.querySelectorAll('input[name=interactionType]'), function(r){
    r.addEventListener('change', function(){ showRadioGroup('interaction', r.value); });
  });

  // Thumbnails show as a square of ~280 css px (560 on a 2x screen), so the
  // shorter side is scaled down to THUMB_SHORT before upload. The canvas draws
  // at the target size in one step; the browser's own resampling is fine for
  // a downscale of this ratio. Never upscales.
  var THUMB_SHORT = 600, THUMB_QUALITY = 0.82;
  function kb(n){ return Math.round(n / 1024) + ' KB'; }
  function shrink(file){
    return new Promise(function(resolve, reject){
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Use a JPG, PNG or WebP image.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        URL.revokeObjectURL(url);
        var scale = Math.min(1, THUMB_SHORT / Math.min(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        // Safari cannot encode WebP and hands back a PNG instead: fall back to JPEG.
        c.toBlob(function(blob){
          if (blob && blob.type === 'image/webp') return resolve({ blob: blob, ext: 'webp', w: w, h: h, from: img.naturalWidth + ' × ' + img.naturalHeight });
          c.toBlob(function(jpg){ resolve({ blob: jpg, ext: 'jpg', w: w, h: h, from: img.naturalWidth + ' × ' + img.naturalHeight }); }, 'image/jpeg', 0.85);
        }, 'image/webp', THUMB_QUALITY);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('The file could not be read as an image.')); };
      img.src = url;
    });
  }

  function upload(file, overwrite, prepared){
    var ready = prepared ? Promise.resolve(prepared) : shrink(file);
    setStatus('Resizing…');
    ready.then(function(p){
      var name = file.name.replace(/\.[^.]+$/, '') + '.' + p.ext;
      var reader = new FileReader();
      reader.onload = function(){
        setStatus('Uploading thumbnail…');
        api('/api/upload-thumb', json('POST', { filename: name, dataBase64: reader.result, overwrite: !!overwrite }))
          .then(function(res){
            form.elements.thumbSrc.value = res.path;
            document.getElementById('thumb-preview').src = res.path + '?t=' + Date.now();
            setStatus('Uploaded ' + p.from + ', ' + kb(file.size) + ' → ' + p.w + ' × ' + p.h + ' ' + p.ext.toUpperCase() + ', ' + kb(p.blob.size), 'ok');
          }).catch(function(e){
            if (e.data && e.data.code === 'exists'){
              if (confirm(e.message + '.\n\nReplace it? Every card using that file will show the new image.')) upload(file, true, p);
              else setStatus('Upload cancelled. Rename the file and try again.', 'err');
              return;
            }
            setStatus('Upload failed: ' + e.message, 'err');
          });
      };
      reader.readAsDataURL(p.blob);
    }).catch(function(e){ setStatus('Upload failed: ' + e.message, 'err'); });
  }
  document.getElementById('thumb-upload').addEventListener('change', function(ev){
    if (ev.target.files[0]) upload(ev.target.files[0], false);
    ev.target.value = '';   // picking the same file again must fire change again
  });

  // Accepts whatever gets pasted — a vimeo.com page, a youtu.be share link —
  // and stores the player URL the lightbox iframe needs. Unknown links are
  // left as typed; the server then refuses them with a readable message.
  function embedUrl(u){
    u = (u || '').trim();
    // already a player URL (possibly with its own ?title=0 options): keep it
    if (/^https:\/\/(player\.vimeo\.com\/video\/\d|www\.youtube(-nocookie)?\.com\/embed\/)/.test(u)) return u;
    var m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/.exec(u);
    if (m){
      var h = /[?&]h=([0-9a-f]+)/.exec(u);
      var hash = m[2] || (h && h[1]);
      return 'https://player.vimeo.com/video/' + m[1] + (hash ? '?h=' + hash : '');
    }
    m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/.exec(u);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    return u;
  }
  form.elements.lbVideo.addEventListener('change', function(){
    form.elements.lbVideo.value = embedUrl(form.elements.lbVideo.value);
  });

  form.elements.thumbSrc.addEventListener('input', function(){
    document.getElementById('thumb-preview').src = form.elements.thumbSrc.value;
  });

  document.getElementById('btn-add').addEventListener('click', function(){ openEdit(null); });
  document.getElementById('btn-close-edit').addEventListener('click', closeEdit);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeEdit);
  overlay.addEventListener('click', closeEdit);

  document.getElementById('btn-delete').addEventListener('click', function(){
    if (editingIndex === null) return;
    if (!confirm('Delete "' + cards[editingIndex].title + '"?\n\nIf you only want it off the site for now, make it a draft instead (the eye in the list).')) return;
    cards.splice(editingIndex, 1);
    closeEdit();
    renderList(); refreshCount();
  });

  function uniqueId(title){
    var base = (title || 'item').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    var id = base, n = 2;
    while (cards.some(function(c){ return c.id === id; })) id = base + '-' + (n++);
    return id;
  }

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var thumbType = form.querySelector('input[name=thumbType]:checked').value;
    var thumb = thumbType === 'photo'
      ? { type: 'photo', src: form.elements.thumbSrc.value.trim(), alt: form.elements.title.value.trim() }
      : { type: 'icon', class: form.elements.category.value, icon: form.elements.thumbIcon.value };

    var itype = form.querySelector('input[name=interactionType]:checked').value;
    var interaction;
    if (itype === 'link') interaction = { type: 'link', href: form.elements.linkHref.value.trim() };
    else if (itype === 'page') interaction = { type: 'page', href: form.elements.pageHref.value.trim() };
    else interaction = {
      type: 'lightbox',
      title: form.elements.lbTitle.value.trim() || form.elements.title.value.trim(),
      desc: form.elements.lbDesc.value.trim(),
      video: form.elements.lbVideo.value.trim(),
      link: form.elements.lbLink.value.trim(),
      linkLabel: form.elements.lbLinkLabel.value.trim(),
      pin: form.elements.lbPin.value
    };

    var old = editingIndex === null ? null : cards[editingIndex];
    var card = {
      // the id stays put on edits, so a renamed card is "edited", not deleted + added
      id: old ? old.id : uniqueId(form.elements.title.value.trim()),
      title: form.elements.title.value.trim(),
      role: form.elements.role.value.trim(),
      category: form.elements.category.value,
      flag: form.elements.flag.value.trim(),
      thumb: thumb,
      interaction: interaction
    };
    // new cards start as drafts; existing ones keep what they had
    if (old ? old.visible === false : true) card.visible = false;

    if (old) cards[editingIndex] = card;
    else cards.unshift(card);

    closeEdit();
    renderList(); refreshCount();
  });

  document.getElementById('btn-preview').addEventListener('click', function(){
    setStatus('Building preview…');
    api('/api/preview', json('POST', cards)).then(function(res){
      window.open(res.url, '_blank');
      setStatus('Preview opened in a new tab (nothing saved)', 'ok');
    }).catch(function(e){ setStatus('Preview failed: ' + e.message, 'err'); });
  });

  // ---------- publish ----------
  var pub = document.getElementById('pub'), pubGo = document.getElementById('pub-go'), pubResult = document.getElementById('pub-result');
  function closePub(){ pub.hidden = true; }
  document.getElementById('pub-cancel').addEventListener('click', closePub);
  pub.addEventListener('click', function(e){ if (e.target === pub) closePub(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closePub(); });

  document.getElementById('btn-save').addEventListener('click', function(){
    var ch = diff();
    var extra = repo && repo.dirty && repo.dirty.length ? [{ k: 'add', t: repo.dirty.length + ' file(s) already on disk' }] : [];
    if (!ch.length && !extra.length && !(repo && repo.ahead)){ setStatus('Nothing to publish: everything matches GitHub.', 'ok'); return; }
    document.getElementById('pub-changes').innerHTML = ch.concat(extra).map(function(c){
      return '<li><span class="k ' + c.k + '">' + c.k + '</span><span>' + esc(c.t) + '</span></li>';
    }).join('') || '<li>Push the commits that are waiting here.</li>';
    document.getElementById('pub-msg').value = ch.length
      ? ch.slice(0, 3).map(function(c){ return c.t; }).join('; ') + (ch.length > 3 ? ' (+' + (ch.length - 3) + ' more)' : '')
      : 'Add uploaded files';
    pubResult.hidden = true; pubResult.className = 'pub-result';
    pubGo.disabled = false; pubGo.textContent = 'Publish';
    pubGo.onclick = doPublish;
    pub.hidden = false;
    document.getElementById('pub-msg').focus();
  });

  function doPublish(){
    pubGo.disabled = true; pubGo.textContent = 'Publishing…';
    pubResult.hidden = false; pubResult.className = 'pub-result';
    pubResult.textContent = 'Checking GitHub, writing files, committing, pushing…';
    api('/api/projects', json('PUT', { cards: cards, message: document.getElementById('pub-msg').value.trim(), head: baseHead }))
      .then(function(res){
        saved = clone(cards); baseHead = res.repo.head;
        renderList(); refreshCount(); renderRepo(res.repo);
        if (res.pushed){
          pubResult.className = 'pub-result ok';
          pubResult.textContent = (res.commit ? 'Committed ' + res.commit + ' (' + res.files.length + ' file' + (res.files.length === 1 ? '' : 's') + ') and pushed to GitHub.' : 'Nothing new to commit; pushed.') +
            '\nThe live site updates about a minute after GitHub Pages finishes building.';
          setStatus('Published', 'ok');
        } else {
          pubResult.className = 'pub-result err';
          pubResult.textContent = 'Committed ' + (res.commit || '') + ' here, but the push to GitHub failed:\n' + res.pushError +
            '\nNothing is lost. Use “Push now” in the yellow bar when you are back online.';
          setStatus('Committed, not pushed', 'err');
        }
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
      })
      .catch(function(e){
        pubResult.className = 'pub-result err';
        pubResult.textContent = e.message;
        if (e.data && e.data.repo && e.data.repo.head) renderRepo(e.data.repo);
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
        setStatus('Not published', 'err');
      });
  }

  window.addEventListener('beforeunload', function(e){
    if (diff().length){ e.preventDefault(); e.returnValue = ''; }
  });

  load();
})();
