(function(){
  'use strict';

  var cards = [];
  var editingIndex = null;
  var icons = [];
  var dragFrom = null;

  var listEl = document.getElementById('card-list');
  var statusEl = document.getElementById('status');
  var overlay = document.getElementById('overlay');
  var panel = document.getElementById('edit-panel');
  var form = document.getElementById('edit-form');

  function setStatus(text, cls){
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function api(url, opts){
    return fetch(url, opts).then(function(r){
      return r.json().then(function(data){
        if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  function load(){
    setStatus('Loading…');
    Promise.all([ api('/api/projects'), api('/api/icons') ]).then(function(res){
      cards = res[0];
      icons = res[1];
      var sel = form.elements.thumbIcon;
      sel.innerHTML = icons.map(function(i){ return '<option value="'+i+'">'+i+'</option>'; }).join('');
      renderList();
      setStatus(cards.length + ' cards loaded', 'ok');
    }).catch(function(e){ setStatus('Load failed: ' + e.message, 'err'); });
  }

  function thumbHtml(card){
    if (card.thumb && card.thumb.type === 'photo' && card.thumb.src){
      return '<img class="row-thumb" src="' + card.thumb.src + '" alt="">';
    }
    var icon = card.thumb ? card.thumb.icon : '';
    return '<div class="row-thumb icon">' + (icon || '—') + '</div>';
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
      var li = document.createElement('li');
      li.className = 'card-row';
      li.draggable = true;
      li.dataset.index = i;
      li.innerHTML =
        '<div class="handle">⠿</div>' +
        thumbHtml(card) +
        '<div class="row-main"><div class="row-title"></div><div class="row-sub"></div></div>' +
        '<div class="row-cat">' + (card.category || '') + '</div>' +
        '<div class="row-type">' + typeLabel(card) + '</div>';
      li.querySelector('.row-title').textContent = card.title || '(untitled)';
      li.querySelector('.row-sub').textContent = card.role || '';
      li.addEventListener('click', function(ev){
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
        renderList();
      });
      listEl.appendChild(li);
    });
  }

  function showRadioGroup(prefix, value){
    ['photo','icon'].forEach(function(v){
      var el = document.getElementById('thumb-' + v + '-fields');
      if (el) el.classList.toggle('hidden', v !== value);
    });
    ['link','page','lightbox'].forEach(function(v){
      var el = document.getElementById('fields-' + v);
      if (el) el.classList.toggle('hidden', v !== value);
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

    document.getElementById('edit-title').textContent = isNew ? 'New card' : 'Edit card';
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

  document.getElementById('thumb-upload').addEventListener('change', function(ev){
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      setStatus('Uploading thumbnail…');
      api('/api/upload-thumb', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataBase64: reader.result })
      }).then(function(res){
        form.elements.thumbSrc.value = res.path;
        document.getElementById('thumb-preview').src = res.path;
        setStatus('Thumbnail uploaded', 'ok');
      }).catch(function(e){ setStatus('Upload failed: ' + e.message, 'err'); });
    };
    reader.readAsDataURL(file);
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
    if (!confirm('Delete "' + cards[editingIndex].title + '"?')) return;
    cards.splice(editingIndex, 1);
    closeEdit();
    renderList();
  });

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

    var card = {
      title: form.elements.title.value.trim(),
      role: form.elements.role.value.trim(),
      category: form.elements.category.value,
      flag: form.elements.flag.value.trim(),
      thumb: thumb,
      interaction: interaction
    };
    card.id = (card.title || 'item').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

    if (editingIndex === null) cards.push(card);
    else cards[editingIndex] = card;

    closeEdit();
    renderList();
  });

  document.getElementById('btn-reload').addEventListener('click', load);

  document.getElementById('btn-preview').addEventListener('click', function(){
    setStatus('Building preview…');
    api('/api/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cards)
    }).then(function(res){
      window.open(res.url, '_blank');
      setStatus('Preview opened in a new tab (nothing saved)', 'ok');
    }).catch(function(e){ setStatus('Preview failed: ' + e.message, 'err'); });
  });

  document.getElementById('btn-save').addEventListener('click', function(){
    setStatus('Saving…');
    api('/api/projects', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cards)
    }).then(function(res){
      setStatus('Saved ' + res.count + ' cards to index.html', 'ok');
    }).catch(function(e){ setStatus('Save failed: ' + e.message, 'err'); });
  });

  load();
})();
