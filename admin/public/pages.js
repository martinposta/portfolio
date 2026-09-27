(function(){
  'use strict';

  var C = window.AdminCommon;
  var esc = C.esc, api = C.api, json = C.json, clone = C.clone, setStatus = C.setStatus;

  var pages = [];        // being edited
  var saved = [];        // as they are in git
  var deleted = [];      // slugs removed since the last publish
  var baseHead = null;
  var cards = [];        // gallery cards, to show which card opens a page
  var doodles = [];      // files in images/doodles/
  var cur = 0, selB = 0, pickerAt = null;

  var TYPES = {
    text: { name: 'Text', desc: 'Paragraphs' }, heading: { name: 'Heading', desc: 'Section title' },
    video: { name: 'Video', desc: 'Vimeo / YouTube' }, photos: { name: 'Photos', desc: 'One or more stills' },
    buttons: { name: 'Buttons', desc: 'Links: Steam, IMDb…' }, credit: { name: 'Credit card', desc: 'Boxed note + handwriting' },
    doodle: { name: 'Doodle', desc: 'A drawing in the margin' }
  };
  var COLORS = { black: '#141414', red: '#b23a2e', blue: '#2c5f8a' };
  var PAPER = { '1': '#e9dfc4', '2': '#dbe3e6', '3': '#f2dbd9', '4': '#dfe8db' };

  var editor = document.getElementById('editor');
  var frame = document.getElementById('pv');

  function P(){ return pages[cur]; }
  function savedOf(p){ return saved.filter(function(s){ return s.slug === p.slug; })[0]; }
  function isNew(p){ return !savedOf(p); }
  function isEdited(p){ var s = savedOf(p); return !s || JSON.stringify(s) !== JSON.stringify(p); }

  // ---------- what changed since the last publish ----------
  function diff(){
    var out = [];
    pages.forEach(function(p){
      var s = savedOf(p);
      if (!s){ out.push({ k: 'add', t: 'New page: ' + p.title + (p.visible === false ? ' (draft)' : '') }); return; }
      if ((s.visible !== false) !== (p.visible !== false)) out.push({ k: p.visible === false ? 'hide' : 'add', t: (p.visible === false ? 'Made a draft: ' : 'Put live: ') + p.title });
      var a = clone(s), b = clone(p); delete a.visible; delete b.visible;
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ k: 'edit', t: 'Edited page: ' + p.title });
    });
    deleted.forEach(function(slug){ out.push({ k: 'del', t: 'Deleted page: ' + slug }); });
    return out;
  }
  function refreshCount(){ var n = diff().length, el = document.getElementById('count'); el.hidden = !n; el.textContent = n; }
  function changed(){ refreshCount(); renderBar(); schedulePreview(); }

  // ---------- loading ----------
  C.hooks.unsaved = diff;
  C.hooks.reload = load;
  function load(){
    setStatus('Checking GitHub…');
    C.sync().then(function(s){
      return api('/api/pages').then(function(res){
        pages = res.pages; saved = clone(pages); deleted = []; baseHead = res.head;
        cards = res.cards; doodles = res.doodles;
        var want = location.hash.slice(1);
        cur = Math.max(0, pages.findIndex(function(p){ return p.slug === want; }));
        selB = 0; pickerAt = null;
        renderAll(); C.renderRepo(s, s.pulled);
        setStatus(pages.length + ' pages loaded', 'ok');
      });
    }).catch(function(e){ setStatus('Load failed: ' + e.message, 'err'); });
  }

  // ---------- page bar ----------
  function renderBar(){
    document.getElementById('pagebar').innerHTML = pages.map(function(p, i){
      return '<button class="pchip" data-p="' + i + '" aria-pressed="' + (i === cur) + '">' + esc(p.title || 'Untitled') +
        (p.visible === false ? '<span class="d">draft</span>' : '') + (isEdited(p) ? '<span class="edited" title="Changed since the last publish"></span>' : '') + '</button>';
    }).join('') + '<button class="pchip new" id="new-page">+ New page</button>';
    var p = P();
    document.getElementById('pv-url').textContent = p ? 'martinposta.com/projects/' + (p.slug || '…') + '.html' + (p.visible === false ? '  ·  draft, not on the site' : '') : '';
  }
  document.getElementById('pagebar').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'new-page'){
      var slug = 'new-project', n = 2;
      while (pages.some(function(p){ return p.slug === slug; })) slug = 'new-project-' + (n++);
      pages.push({ slug: slug, title: 'New project', visible: false, coffee: false, tags: [{ text: 'Short Film', color: 'black' }],
        blocks: [
          { type: 'text', style: 'normal', text: 'A few sentences about the project and what you did on it.' },
          { type: 'video', url: '', caption: 'hit play! ▶', paper: 'auto', tilt: 'normal' }
        ] });
      cur = pages.length - 1; selB = 0; pickerAt = null; freshPage = true;
      renderAll(); changed();
      var t = document.getElementById('pt'); t.focus(); t.select();
      return;
    }
    cur = +b.dataset.p; selB = 0; pickerAt = null;
    history.replaceState(null, '', '#' + P().slug);
    freshPage = true;       // another page: start its preview at the top
    renderAll();
  });

  // ---------- editor ----------
  function summary(b){
    if (b.type === 'text') return (b.text || '').replace(/\*/g, '').slice(0, 80);
    if (b.type === 'heading') return b.text;
    if (b.type === 'video'){ var v = C.videoInfo(b.url); return (v.ok ? v.host + ' ' + v.id : 'no video yet') + (b.caption ? ' · ' + b.caption : ''); }
    if (b.type === 'photos') return (b.items || []).length + ' photo' + ((b.items || []).length === 1 ? '' : 's');
    if (b.type === 'buttons') return (b.items || []).map(function(x){ return x.label; }).join(', ');
    if (b.type === 'credit') return (b.text || '').slice(0, 70);
    if (b.type === 'doodle') return (b.src || 'no drawing').split('/').pop() + ' · ' + b.side;
    return '';
  }
  function chips(field, current, options){
    return '<div class="chips" data-f="' + field + '">' + options.map(function(o){
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (String(current) === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function paperChips(field, current){
    return chips(field, current || 'auto', [['auto', 'auto']].concat(['1', '2', '3', '4'].map(function(k){ return [k, '<i style="background:' + PAPER[k] + '"></i>' + k]; })));
  }

  function blockBody(b){
    if (b.type === 'text') return '<div class="f"><span class="lbl">Style</span>' + chips('style', b.style, [['normal', 'Normal'], ['tight', 'List (one line each)'], ['muted', 'Small grey']]) + '</div>' +
      '<div class="f"><label class="lbl" for="b-text">Text</label><textarea id="b-text" data-f="text" rows="7">' + esc(b.text) + '</textarea>' +
      '<span class="hint">Empty line = new paragraph. *Stars* make italics, [label](https://…) makes a link.</span></div>';
    if (b.type === 'heading') return '<div class="f"><label class="lbl" for="b-head">Heading</label><input type="text" id="b-head" data-f="text" value="' + esc(b.text) + '"></div>';
    if (b.type === 'video'){
      var v = C.videoInfo(b.url);
      return '<div class="f"><label class="lbl" for="b-url">Video link</label><input type="text" id="b-url" data-f="url" value="' + esc(b.url) + '" placeholder="Paste any Vimeo or YouTube link">' +
        '<span class="valid' + (v.ok ? '' : ' no') + '" id="vchk">' + (v.ok ? '✓ ' + v.host + ', video ' + v.id : (b.url ? '✕ Not a Vimeo or YouTube link' : 'Paste a link, it is converted when you leave the field')) + '</span></div>' +
        '<div class="f"><label class="lbl" for="b-cap">Caption (handwritten)</label><input type="text" id="b-cap" data-f="caption" value="' + esc(b.caption) + '"></div>' +
        '<div class="f"><span class="lbl">Paper</span>' + paperChips('paper', b.paper) + '<span class="hint">Auto alternates the four papers down the page.</span></div>' +
        '<label class="check"><input type="checkbox" data-f="tilt"' + (b.tilt === 'flip' ? ' checked' : '') + '> Tilt the other way, one strip of tape</label>';
    }
    if (b.type === 'photos') return '<div class="plist">' + (b.items || []).map(function(it, k){
        return '<div class="pitem"><img src="' + esc(it.src) + '" alt="">' +
          '<div class="f"><input type="text" data-pi="' + k + '" data-pf="caption" value="' + esc(it.caption) + '" placeholder="Caption (optional)">' +
          '<input type="text" data-pi="' + k + '" data-pf="alt" value="' + esc(it.alt) + '" placeholder="What is in the photo (for screen readers)">' +
          '<select data-pi="' + k + '" data-pf="paper">' + ['', '1', '2', '3', '4'].map(function(o){ return '<option value="' + o + '"' + ((it.paper || '') === o ? ' selected' : '') + '>' + (o ? 'paper ' + o : 'paper: like the block') + '</option>'; }).join('') + '</select></div>' +
          '<div class="ctl" style="flex-direction:column"><button type="button" data-pmv="-1" data-k="' + k + '" aria-label="Move photo up"' + (k === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-pmv="1" data-k="' + k + '" aria-label="Move photo down"' + (k === b.items.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-pdel="' + k + '" aria-label="Remove photo">×</button></div></div>';
      }).join('') + '</div>' +
      '<div class="row"><button type="button" class="btn" data-act="addphotos">+ Add photos…</button><span class="hint">Longer side scaled to 1600 px before upload.</span></div>' +
      '<div class="f"><span class="lbl">Framing</span>' + chips('fit', b.fit || 'crop', [['crop', 'Fill 16:9 frame (crops)'], ['whole', 'Whole image']]) + '</div>' +
      '<div class="f"><span class="lbl">Paper</span>' + paperChips('paper', b.paper) + '</div>';
    if (b.type === 'buttons') return (b.items || []).map(function(x, k){
        return '<div class="two"><input type="text" data-bi="' + k + '" data-bf="label" value="' + esc(x.label) + '" placeholder="Label"><div class="row" style="flex-wrap:nowrap"><input type="text" data-bi="' + k + '" data-bf="url" value="' + esc(x.url) + '" placeholder="https://…"><button type="button" class="x" data-bdel="' + k + '" aria-label="Remove button">×</button></div></div>';
      }).join('') + '<div><button type="button" class="btn" data-act="addbtn">+ Add button</button></div>';
    if (b.type === 'credit') return '<div class="f"><label class="lbl" for="b-cr">Text</label><textarea id="b-cr" data-f="text" rows="4">' + esc(b.text) + '</textarea></div>' +
      '<div class="f"><label class="lbl" for="b-hl">Handwritten line (optional)</label><input type="text" id="b-hl" data-f="highlight" value="' + esc(b.highlight) + '"></div>';
    if (b.type === 'doodle') return '<div class="f"><span class="lbl">Drawing</span><div class="dlib" data-f="src">' + doodles.map(function(d){
        var media = /\.(webm|mp4)$/i.test(d) ? '<video src="' + esc(d) + '" muted autoplay loop playsinline></video>' : '<img src="' + esc(d) + '" alt="">';
        return '<button type="button" data-v="' + esc(d) + '" aria-pressed="' + (b.src === d) + '">' + media + esc(d.split('/').pop()) + '</button>';
      }).join('') + '</div><div class="row"><button type="button" class="btn" data-act="adddoodle">+ Upload a drawing…</button><span class="hint">SVG, PNG, GIF or a short WebM loop, uploaded as it is.</span></div></div>' +
      '<div class="two"><div class="f"><span class="lbl">Position</span>' + chips('side', b.side, [['left', 'left'], ['center', 'center'], ['right', 'right']]) + '</div>' +
      '<div class="f"><label class="lbl" for="b-size">Width <span id="size-out">' + b.size + '</span> px</label><input type="range" id="b-size" min="60" max="400" step="10" value="' + b.size + '" data-f="size"></div></div>';
    return '';
  }

  function renderEditor(){
    var p = P();
    if (!p){ editor.innerHTML = '<p class="hint">No pages yet. Use “+ New page”.</p>'; return; }
    var linked = cards.filter(function(c){ return c.href === '/projects/' + p.slug + '.html'; });
    var h = '<div class="settings"><div class="row"><h2>' + esc(p.title || 'Untitled') + '</h2>' +
        '<div class="vis" role="group" aria-label="Visibility"><button type="button" class="on" data-vis="1" aria-pressed="' + (p.visible !== false) + '">Live</button><button type="button" class="off" data-vis="0" aria-pressed="' + (p.visible === false) + '">Draft</button></div></div>' +
      '<div class="two"><div class="f"><label class="lbl" for="pt">Title</label><input type="text" id="pt" data-pg="title" value="' + esc(p.title) + '"></div>' +
      '<div class="f"><label class="lbl" for="ps">Address</label><input type="text" id="ps" data-pg="slug" value="' + esc(p.slug) + '"' + (isNew(p) ? '' : ' readonly title="Fixed once published, so links to the page keep working"') + '></div></div>' +
      '<div class="f"><span class="lbl">Labels under the title</span>' + (p.tags || []).map(function(t, k){
        return '<div class="tagrow"><input type="text" data-ti="' + k + '" value="' + esc(t.text) + '"><div class="row" style="gap:3px">' +
          Object.keys(COLORS).map(function(c){ return '<button type="button" class="sw" style="background:' + COLORS[c] + '" data-tc="' + k + '" data-v="' + c + '" aria-pressed="' + (t.color === c) + '" aria-label="' + c + '"></button>'; }).join('') +
          '</div><button type="button" class="x" data-tdel="' + k + '" aria-label="Remove label">×</button></div>';
      }).join('') + '<div><button type="button" class="btn" data-act="addtag">+ Label</button></div></div>' +
      '<label class="check"><input type="checkbox" data-pg="coffee"' + (p.coffee ? ' checked' : '') + '> Coffee stain by the title</label>' +
      '<div class="hint">' + (linked.length ? 'Opened from the gallery card' + (linked.length > 1 ? 's ' : ' ') + linked.map(function(c){ return '<b>' + esc(c.title) + '</b>' + (c.visible ? '' : ' (draft)'); }).join(', ') + '.'
        : 'No gallery card opens this page yet. Add one in the Gallery tab (click behaviour: dedicated project page).') + '</div>' +
      '<div class="row"><button type="button" class="btn danger" data-act="delpage">Delete page</button></div>' +
      '</div>';
    h += '<div class="blocks-head"><h3>Blocks</h3><span class="hint">Click a block here or in the preview to edit it.</span></div><div class="blocks">';
    p.blocks.forEach(function(b, i){
      h += insRow(i);
      h += '<div class="blk' + (i === selB ? ' sel' : '') + '"><div class="bh" data-sel="' + i + '"><span class="ty ' + b.type + '">' + TYPES[b.type].name + '</span><span class="sum">' + esc(summary(b)) + '</span>' +
        '<span class="ctl"><button type="button" data-mv="-1" data-i="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-mv="1" data-i="' + i + '" aria-label="Move down"' + (i === p.blocks.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-del="' + i + '" aria-label="Delete block">×</button></span></div>' +
        (i === selB ? '<div class="bb">' + blockBody(b) + '</div>' : '') + '</div>';
    });
    h += insRow(p.blocks.length) + '</div>';
    if (pickerAt !== p.blocks.length) h += '<button type="button" class="add-end" data-add="' + p.blocks.length + '">+ Add block</button>';
    editor.innerHTML = h;
  }
  function insRow(at){
    if (pickerAt === at) return '<div class="picker">' + Object.keys(TYPES).map(function(k){ return '<button type="button" data-new="' + k + '" data-at="' + at + '"><b>' + TYPES[k].name + '</b>' + TYPES[k].desc + '</button>'; }).join('') + '<button type="button" data-act="closepick">Cancel</button></div>';
    if (at === P().blocks.length) return '';
    return '<div class="ins"><button type="button" data-add="' + at + '" aria-label="Insert a block here">+</button></div>';
  }
  function newBlock(t){
    return {
      text: { type: 'text', style: 'normal', text: '' }, heading: { type: 'heading', text: 'New section' },
      video: { type: 'video', url: '', caption: '', paper: 'auto', tilt: 'normal' },
      photos: { type: 'photos', fit: 'crop', paper: 'auto', items: [] }, buttons: { type: 'buttons', items: [{ label: '', url: '' }] },
      credit: { type: 'credit', text: '', highlight: '' }, doodle: { type: 'doodle', src: doodles[0] || '', side: 'right', size: 140 }
    }[t];
  }
  function renderAll(){ renderBar(); renderEditor(); refreshCount(); schedulePreview(true); }

  editor.addEventListener('input', function(e){
    var t = e.target, p = P(), b = p.blocks[selB], d = t.dataset;
    if (d.pg){
      p[d.pg] = t.type === 'checkbox' ? t.checked : t.value;
      if (d.pg === 'slug') p.slug = t.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-');
      if (d.pg === 'title') editor.querySelector('.settings h2').textContent = t.value || 'Untitled';
    }
    else if (d.ti != null) p.tags[+d.ti].text = t.value;
    else if (d.pi != null) b.items[+d.pi][d.pf] = t.value;
    else if (d.bi != null) b.items[+d.bi][d.bf] = t.value;
    else if (d.f){
      if (d.f === 'tilt') b.tilt = t.checked ? 'flip' : 'normal';
      else if (d.f === 'size'){ b.size = +t.value; document.getElementById('size-out').textContent = t.value; }
      else b[d.f] = t.value;
      var s = editor.querySelector('.blk.sel .sum'); if (s) s.textContent = summary(b);
    } else return;
    changed();
  });
  // pasted video links become player URLs when the field is left
  editor.addEventListener('change', function(e){
    if (e.target.id !== 'b-url') return;
    var b = P().blocks[selB];
    b.url = e.target.value = C.embedUrl(e.target.value);
    var v = C.videoInfo(b.url), c = document.getElementById('vchk');
    c.className = 'valid' + (v.ok ? '' : ' no');
    c.textContent = v.ok ? '✓ ' + v.host + ', video ' + v.id : '✕ Not a Vimeo or YouTube link';
    var s = editor.querySelector('.blk.sel .sum'); if (s) s.textContent = summary(b);
    changed();
  });

  var fileTarget = null;
  editor.addEventListener('click', function(e){
    var t = e.target.closest('button,[data-sel]'); if (!t) return;
    var p = P(), b = p.blocks[selB], d = t.dataset;
    function redo(){ renderEditor(); changed(); }
    if (d.vis != null){ p.visible = d.vis === '1'; return redo(); }
    if (d.mv){ var i = +d.i, j = i + (+d.mv), x = p.blocks.splice(i, 1)[0]; p.blocks.splice(j, 0, x); selB = j; return redo(); }
    if (d.del != null){
      if (!confirm('Delete this ' + TYPES[p.blocks[+d.del].type].name.toLowerCase() + ' block?')) return;
      p.blocks.splice(+d.del, 1); selB = Math.min(selB, p.blocks.length - 1); return redo();
    }
    if (d.add != null){ pickerAt = +d.add; return renderEditor(); }
    if (d.new){ var at = +d.at; p.blocks.splice(at, 0, newBlock(d.new)); selB = at; pickerAt = null; redo(); if (d.new === 'photos') pick('photos'); return; }
    if (d.act === 'closepick'){ pickerAt = null; return renderEditor(); }
    if (d.act === 'addtag'){ p.tags.push({ text: '', color: 'black' }); return redo(); }
    if (d.tdel != null){ p.tags.splice(+d.tdel, 1); return redo(); }
    if (d.tc != null){ p.tags[+d.tc].color = d.v; return redo(); }
    if (d.act === 'addbtn'){ b.items.push({ label: '', url: '' }); return redo(); }
    if (d.bdel != null){ b.items.splice(+d.bdel, 1); return redo(); }
    if (d.pdel != null){ b.items.splice(+d.pdel, 1); return redo(); }
    if (d.pmv){ var k = +d.k, k2 = k + (+d.pmv), it = b.items.splice(k, 1)[0]; b.items.splice(k2, 0, it); return redo(); }
    if (d.act === 'addphotos') return pick('photos');
    if (d.act === 'adddoodle') return pick('doodle');
    if (d.act === 'delpage') return deletePage();
    if (d.v != null){ var grp = t.closest('[data-f]'); if (grp){ b[grp.dataset.f] = d.v; return redo(); } return; }
    if (d.sel != null && !e.target.closest('.ctl')){ selB = +d.sel; pickerAt = null; renderEditor(); markPreview(true); }
  });

  function pick(kind){ fileTarget = kind; document.getElementById(kind === 'doodle' ? 'file-doodle' : 'file-photos').click(); }
  document.getElementById('file-photos').addEventListener('change', function(ev){
    var files = [].slice.call(ev.target.files); ev.target.value = '';
    var b = P().blocks[selB];
    if (!files.length || !b || b.type !== 'photos') return;
    // one after another, so a name clash can ask without two dialogs at once
    files.reduce(function(chain, f){
      return chain.then(function(){
        return C.upload(f, 'projects', { long: 1600 }).then(function(path){
          b.items.push({ src: path, alt: '', caption: '' }); renderEditor(); changed();
        }, function(){});
      });
    }, Promise.resolve());
  });
  document.getElementById('file-doodle').addEventListener('change', function(ev){
    var f = ev.target.files[0]; ev.target.value = '';
    var b = P().blocks[selB];
    if (!f || !b || b.type !== 'doodle') return;
    C.upload(f, 'doodles', null).then(function(path){
      if (doodles.indexOf(path) < 0) doodles.push(path);
      b.src = path; renderEditor(); changed();
    }, function(){});
  });

  function deletePage(){
    var p = P();
    var live = cards.filter(function(c){ return c.visible && c.href === '/projects/' + p.slug + '.html'; });
    if (live.length){ alert('The live gallery card ' + live.map(function(c){ return c.title; }).join(', ') + ' opens this page. Make the card a draft or point it elsewhere first.'); return; }
    if (!confirm('Delete the page “' + p.title + '”? It goes away with the next publish; git history keeps it.')) return;
    if (!isNew(p)) deleted.push(p.slug);
    pages.splice(cur, 1); cur = Math.max(0, cur - 1); selB = 0;
    renderAll(); refreshCount();
  }

  // ---------- preview ----------
  // Rendered by the server (the same code that writes the page), loaded into
  // an iframe served by the admin, so notebook.css, the header and footer are
  // the real ones. Clicking a block in it selects the block in the editor.
  var pvTimer = null, previewScroll = 0, freshPage = true;
  function schedulePreview(now){ clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, now ? 0 : 400); }
  function renderPreview(){
    var p = P(); if (!p) return;
    if (freshPage){ previewScroll = 0; freshPage = false; }
    else { try { previewScroll = frame.contentWindow.scrollY || previewScroll; } catch (e) {} }
    api('/api/pages/preview', json('POST', p)).then(function(res){ frame.src = res.url; })
      .catch(function(e){ setStatus('Preview failed: ' + e.message, 'err'); });
  }
  frame.addEventListener('load', function(){
    var doc = frame.contentDocument; if (!doc) return;
    var st = doc.createElement('style');
    st.textContent = '[data-block]{cursor:pointer;outline:2px solid transparent;outline-offset:10px;transition:outline-color .15s}[data-block]:hover{outline-color:rgba(44,95,138,.25)}[data-block].sel{outline-color:rgba(44,95,138,.75)}';
    doc.head.appendChild(st);
    doc.addEventListener('click', function(e){
      // links in the preview (menu, back to portfolio, buttons) open the
      // real page in a new tab instead of replacing the preview
      var a = e.target.closest('a[href]');
      if (a && !a.closest('[data-block]') && a.getAttribute('href').charAt(0) !== '#'){ e.preventDefault(); window.open(a.href, '_blank'); return; }
      var el = e.target.closest('[data-block]'); if (!el) return;
      e.preventDefault();
      selB = +el.dataset.block; pickerAt = null; renderEditor(); markPreview(false);
      var s = editor.querySelector('.blk.sel'); if (s) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    frame.contentWindow.scrollTo(0, previewScroll);
    markPreview(false);
  });
  function markPreview(scroll){
    var doc = frame.contentDocument; if (!doc) return;
    [].forEach.call(doc.querySelectorAll('[data-block].sel'), function(x){ x.classList.remove('sel'); });
    var el = doc.querySelector('[data-block="' + selB + '"]');
    if (el){ el.classList.add('sel'); if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
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
    }).join('') || '<li>Push the commits that are waiting here.</li>';
    document.getElementById('pub-msg').value = ch.length ? ch.slice(0, 3).map(function(c){ return c.t; }).join('; ') + (ch.length > 3 ? ' (+' + (ch.length - 3) + ' more)' : '') : 'Add uploaded files';
    pubResult.hidden = true; pubResult.className = 'pub-result';
    pubGo.disabled = false; pubGo.textContent = 'Publish'; pubGo.onclick = doPublish;
    pub.hidden = false;
    document.getElementById('pub-msg').focus();
  });

  function doPublish(){
    pubGo.disabled = true; pubGo.textContent = 'Publishing…';
    pubResult.hidden = false; pubResult.className = 'pub-result';
    pubResult.textContent = 'Checking GitHub, writing files, committing, pushing…';
    var changedPages = pages.filter(isEdited);
    api('/api/pages', json('PUT', { pages: changedPages, deleted: deleted, message: document.getElementById('pub-msg').value.trim(), head: baseHead }))
      .then(function(res){
        saved = clone(pages); deleted = []; baseHead = res.repo.head;
        renderAll(); C.renderRepo(res.repo);
        if (res.pushed){
          pubResult.className = 'pub-result ok';
          pubResult.textContent = (res.commit ? 'Committed ' + res.commit + ' (' + res.files.length + ' file' + (res.files.length === 1 ? '' : 's') + ') and pushed to GitHub.' : 'Nothing new to commit; pushed.') +
            '\nThe live site updates about a minute after GitHub Pages finishes building.';
          setStatus('Published', 'ok');
        } else {
          pubResult.className = 'pub-result err';
          pubResult.textContent = 'Committed ' + (res.commit || '') + ' here, but the push to GitHub failed:\n' + res.pushError + '\nNothing is lost. Use “Push now” in the yellow bar when you are back online.';
          setStatus('Committed, not pushed', 'err');
        }
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
      })
      .catch(function(e){
        pubResult.className = 'pub-result err'; pubResult.textContent = e.message;
        if (e.data && e.data.repo && e.data.repo.head) C.renderRepo(e.data.repo);
        pubGo.disabled = false; pubGo.textContent = 'Close'; pubGo.onclick = closePub;
        setStatus('Not published', 'err');
      });
  }

  window.addEventListener('beforeunload', function(e){
    if (!window.AdminSwitching && diff().length){ e.preventDefault(); e.returnValue = ''; } });

  load();
})();
