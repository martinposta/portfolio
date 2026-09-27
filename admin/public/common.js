// Shared by the gallery editor (admin.js) and the page editor (pages.js):
// talking to the server, the repository state bar, image shrinking and
// turning pasted video links into player URLs.
window.AdminCommon = (function(){
  'use strict';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function json(method, body){ return { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
  function api(url, opts){
    return fetch(url, opts).then(function(r){
      return r.json().then(function(data){
        if (!r.ok){ var e = new Error(data.error || ('HTTP ' + r.status)); e.data = data; throw e; }
        return data;
      });
    });
  }

  var statusEl = document.getElementById('status');
  function setStatus(text, cls){
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  var EYE_ON = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 004.4-1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // ---------- repository state bar ----------
  // hooks: unsaved() → [{t}] edits that would be lost on reload, reload() → reloads the editor
  var hooks = { unsaved: function(){ return []; }, reload: function(){ location.reload(); } };
  var bannerEl = document.getElementById('banner');
  var repo = null, lastCheck = 0;

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
    var unsaved = hooks.unsaved();
    banner(null);
    if (s.problem === 'branch' || s.branch !== 'main'){
      state = 'bad'; label = 'on branch ' + s.branch;
      banner('bad', '<b>You are looking at the branch “' + esc(s.branch) + '”.</b> Publishing is off here, only main goes live. ' +
        'See the site as it is on this branch: <a href="/" target="_blank">localhost:' + location.port + '/</a>. Switch back with “Branch” at the top.');
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
        (unsaved.length ? '; your unsaved edits here are:<ul>' + unsaved.map(function(c){ return '<li>' + esc(c.t) + '</li>'; }).join('') + '</ul>and will have to be made again.' : '.'),
        'Load newer version', function(){ hooks.reload(); });
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
  // On open: fetch + fast-forward. Resolves with the state for the caller.
  function sync(){
    return api('/api/sync', { method: 'POST' }).then(function(s){ lastCheck = Date.now(); return s; });
  }
  // Re-check when the tab comes back into focus (a copy left open for days
  // on the server would otherwise never learn that another machine published).
  window.addEventListener('focus', function(){
    if (Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    api('/api/repo').then(function(s){ renderRepo(s); }).catch(function(){});
  });

  // ---------- branch switcher ----------
  // Switching reloads the whole editor: cards and pages differ per branch.
  var branchSel = document.getElementById('branch');
  function loadBranches(){
    api('/api/branches').then(function(b){
      branchSel.innerHTML = b.branches.map(function(n){ return '<option value="' + esc(n) + '"' + (n === b.current ? ' selected' : '') + '>' + esc(n) + (n === 'main' ? ' (live)' : '') + '</option>'; }).join('');
      branchSel.dataset.current = b.current;
    }).catch(function(){});
  }
  branchSel.addEventListener('change', function(){
    var want = branchSel.value, was = branchSel.dataset.current;
    var unsaved = hooks.unsaved();
    if (unsaved.length && !confirm('Your unsaved edits here will be dropped:\n- ' + unsaved.map(function(c){ return c.t; }).join('\n- ') + '\n\nSwitch to “' + want + '” anyway?')){ branchSel.value = was; return; }
    setStatus('Switching to ' + want + '…');
    api('/api/checkout', json('POST', { branch: want })).then(function(){
      window.AdminSwitching = true;   // the editors' leave-page warning stands down
      location.reload();
    }).catch(function(e){ branchSel.value = was; setStatus('Could not switch: ' + e.message, 'err'); });
  });
  loadBranches();

  // ---------- images ----------
  // Scales an image down in a canvas before upload: `short` limits the
  // shorter side, `long` the longer one. Never upscales. WebP where the
  // browser can encode it (Safari cannot and hands back a PNG), else JPEG.
  function shrink(file, limits){
    return new Promise(function(resolve, reject){
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Use a JPG, PNG or WebP image.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        URL.revokeObjectURL(url);
        var W = img.naturalWidth, H = img.naturalHeight, scale = 1;
        if (limits.short) scale = Math.min(scale, limits.short / Math.min(W, H));
        if (limits.long) scale = Math.min(scale, limits.long / Math.max(W, H));
        var w = Math.round(W * scale), h = Math.round(H * scale);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var done = function(blob, ext){ resolve({ blob: blob, ext: ext, w: w, h: h, from: W + ' × ' + H }); };
        c.toBlob(function(blob){
          if (blob && blob.type === 'image/webp') return done(blob, 'webp');
          c.toBlob(function(jpg){ done(jpg, 'jpg'); }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.82);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('The file could not be read as an image.')); };
      img.src = url;
    });
  }
  function kb(n){ return Math.round(n / 1024) + ' KB'; }
  function dataUrl(blob){
    return new Promise(function(resolve){ var r = new FileReader(); r.onload = function(){ resolve(r.result); }; r.readAsDataURL(blob); });
  }
  // Uploads one file to images/<target>/. Photos are shrunk first (limits);
  // limits === null uploads the file as it is (doodles: svg, gif, webm).
  // An existing name asks before replacing. Resolves with the web path.
  function upload(file, target, limits, overwrite, prepared){
    var ready = limits === null ? Promise.resolve({ blob: file, ext: null })
      : prepared ? Promise.resolve(prepared) : shrink(file, limits);
    setStatus(limits === null ? 'Uploading…' : 'Resizing…');
    return ready.then(function(p){
      var name = p.ext ? file.name.replace(/\.[^.]+$/, '') + '.' + p.ext : file.name;
      return dataUrl(p.blob).then(function(data){
        setStatus('Uploading…');
        return api('/api/upload', json('POST', { target: target, filename: name, dataBase64: data, overwrite: !!overwrite }));
      }).then(function(res){
        setStatus(p.ext ? 'Uploaded ' + p.from + ', ' + kb(file.size) + ' → ' + p.w + ' × ' + p.h + ' ' + p.ext.toUpperCase() + ', ' + kb(p.blob.size) : 'Uploaded ' + name, 'ok');
        return res.path;
      }, function(e){
        if (e.data && e.data.code === 'exists'){
          if (confirm(e.message + '.\n\nReplace it? Everything using that file will show the new one.')) return upload(file, target, limits, true, p);
          throw new Error('Upload cancelled. Rename the file and try again.');
        }
        throw e;
      });
    }).catch(function(e){ setStatus('Upload failed: ' + e.message, 'err'); throw e; });
  }

  // ---------- video links ----------
  // Accepts whatever gets pasted — a vimeo.com page, a youtu.be share link —
  // and returns the player URL an iframe needs. Unknown links come back as
  // typed; the server then refuses them with a readable message.
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
  function videoInfo(u){
    var m = /player\.vimeo\.com\/video\/(\d+)/.exec(u || ''); if (m) return { ok: true, host: 'Vimeo', id: m[1] };
    m = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/.exec(u || ''); if (m) return { ok: true, host: 'YouTube', id: m[1] };
    return { ok: false };
  }

  return {
    esc: esc, clone: clone, json: json, api: api, setStatus: setStatus, EYE_ON: EYE_ON, EYE_OFF: EYE_OFF,
    hooks: hooks, renderRepo: renderRepo, sync: sync, repo: function(){ return repo; },
    shrink: shrink, upload: upload, embedUrl: embedUrl, videoInfo: videoInfo
  };
})();
