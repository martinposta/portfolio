(function(){
  'use strict';

  var C = window.AdminCommon;
  var esc = C.esc, api = C.api, json = C.json, clone = C.clone, setStatus = C.setStatus;
  var EYE_ON = C.EYE_ON, EYE_OFF = C.EYE_OFF;

  var cards = [];
  var saved = [];          // the cards as they are in git, to diff against
  var baseHead = null;     // commit the page was loaded at; the server refuses a publish from a stale one
  var editingIndex = null;
  var icons = [];
  var dragFrom = null;
  var show = 'all';

  var listEl = document.getElementById('card-list');
  var overlay = document.getElementById('overlay');
  var panel = document.getElementById('edit-panel');
  var form = document.getElementById('edit-form');

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
    schedulePreview();
  }

  // ---------- loading ----------
  C.hooks.unsaved = diff;
  C.hooks.reload = load;
  var renderRepo = C.renderRepo;
  function load(){
    setStatus('Checking GitHub…');
    C.sync().then(function(s){
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
      li.className = 'card-row' + (draft ? ' draft' : '') + (editing && i === editingIndex ? ' editing' : '');
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
    editing = true;
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
    renderList();
    schedulePreview();
  }

  function closeEdit(){
    overlay.classList.add('hidden');
    panel.classList.add('hidden');
    editing = false;
    editingIndex = null;
    renderList();
    schedulePreview();
  }

  Array.prototype.forEach.call(form.querySelectorAll('input[name=thumbType]'), function(r){
    r.addEventListener('change', function(){ showRadioGroup('thumb', r.value); });
  });
  Array.prototype.forEach.call(form.querySelectorAll('input[name=interactionType]'), function(r){
    r.addEventListener('change', function(){ showRadioGroup('interaction', r.value); });
  });

  // Thumbnails show as a square of ~280 css px (560 on a 2x screen): the
  // shorter side is scaled to 600 px before upload.
  document.getElementById('thumb-upload').addEventListener('change', function(ev){
    var file = ev.target.files[0];
    ev.target.value = '';   // picking the same file again must fire change again
    if (!file) return;
    C.upload(file, 'thumbs', { short: 600 }).then(function(path){
      form.elements.thumbSrc.value = path;
      document.getElementById('thumb-preview').src = path + '?t=' + Date.now();
    }).catch(function(){});
  });
  form.elements.lbVideo.addEventListener('change', function(){
    form.elements.lbVideo.value = C.embedUrl(form.elements.lbVideo.value);
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

  // The card as the form describes it right now (also used, unapplied, by
  // the live preview while typing).
  function formToCard(){
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
    return card;
  }

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var old = editingIndex === null ? null : cards[editingIndex];
    var card = formToCard();
    if (old) cards[editingIndex] = card;
    else cards.unshift(card);

    closeEdit();
    renderList(); refreshCount();
  });

  // ---------- live preview ----------
  // The real homepage (server-rendered, real notebook.css) with every unsaved
  // edit in it, including what is typed in the open form before "Apply".
  // Clicking a card in it opens that card here instead of following it.
  var editing = false, frame = document.getElementById('pv'), pvTimer = null, pvScroll = null;
  function previewCards(){
    if (!editing) return cards;
    var list = cards.slice(), card = formToCard();
    if (editingIndex === null) list.unshift(card); else list[editingIndex] = card;
    return list;
  }
  function schedulePreview(){ clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 350); }
  function renderPreview(){
    try { if (frame.contentWindow && frame.contentWindow.scrollY) pvScroll = frame.contentWindow.scrollY; } catch (e) {}
    api('/api/preview?embed=1', json('POST', previewCards())).then(function(res){ frame.src = res.url; })
      .catch(function(e){ setStatus('Preview failed: ' + e.message, 'err'); });
  }
  frame.addEventListener('load', function(){
    var doc = frame.contentDocument; if (!doc) return;
    var st = doc.createElement('style');
    st.textContent = '.grid .card{cursor:pointer}.grid .card.admin-editing{outline:3px solid #2c5f8a;outline-offset:6px}';
    doc.head.appendChild(st);
    var gridCards = [].slice.call(doc.querySelectorAll('.grid .card'));
    // the form's card sits at editingIndex, or first when it is a new one
    var at = editing ? (editingIndex === null ? 0 : editingIndex) : -1;
    if (gridCards[at]) gridCards[at].classList.add('admin-editing');
    doc.addEventListener('click', function(e){
      var el = e.target.closest('.grid .card'); if (!el) return;
      e.preventDefault(); e.stopPropagation();
      if (editing && editingIndex === null) return;   // a new card is being written: do not throw it away
      var i = gridCards.indexOf(el);
      if (i >= 0 && i < cards.length) openEdit(i);
    }, true);
    if (pvScroll === null){ var p = doc.getElementById('portfolio'); pvScroll = p ? p.getBoundingClientRect().top + frame.contentWindow.scrollY - 20 : 0; }
    frame.contentWindow.scrollTo(0, pvScroll);
    if (gridCards[at]){ var r = gridCards[at].getBoundingClientRect(); if (r.top < 0 || r.bottom > frame.contentWindow.innerHeight) gridCards[at].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  form.addEventListener('input', schedulePreview);
  form.addEventListener('change', schedulePreview);
  [].forEach.call(document.querySelectorAll('.pv-bar .seg button'), function(b){
    b.addEventListener('click', function(){
      [].forEach.call(document.querySelectorAll('.pv-bar .seg button'), function(x){ x.setAttribute('aria-pressed', x === b); });
      document.getElementById('stage').classList.toggle('phone', b.dataset.w === 'phone');
    });
  });

  document.getElementById('btn-preview').addEventListener('click', function(){
    setStatus('Building preview…');
    api('/api/preview', json('POST', previewCards())).then(function(res){
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
    var repo = C.repo();
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
    if (!window.AdminSwitching && diff().length){ e.preventDefault(); e.returnValue = ''; }
  });

  load();
})();
