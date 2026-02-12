(function () {
  'use strict';

  // ── State ──

  var library = [];
  var audio = new Audio();
  var currentTrack = null;

  // Auto queue (from album/playlist playback)
  var autoQueue = [];
  var autoQueueIndex = -1;
  var originalAutoQueue = []; // saved for shuffle-off restore

  // Manual queue (user-added "next up")
  var manualQueue = [];

  var loopMode = 'none';
  var shuffleOn = false;
  var contextCover = null;
  var autoQueueLabel = ''; // e.g. album name for queue view
  var accountInfo = null;

  var currentView = 'library';
  var viewArgs = {};
  var viewHistory = [];

  // Persistent
  var favArtists = loadJSON('jn-fav-artists', []);
  var favAlbums = loadJSON('jn-fav-albums', []);
  var playlists = loadJSON('jn-playlists', []);

  var ICO = '/assets/images/icons/';

  // ── DOM ──

  var pArt = document.getElementById('p-art');
  var ctrlTrack = document.getElementById('ctrl-track');
  var ctrlArtist = document.getElementById('ctrl-artist');
  var ctrlCur = document.getElementById('ctrl-cur');
  var ctrlDur = document.getElementById('ctrl-dur');
  var ctrlBar = document.getElementById('ctrl-bar');
  var ctrlFill = document.getElementById('ctrl-fill');
  var btnPlay = document.getElementById('btn-play');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
  var btnQueue = document.getElementById('btn-queue');
  var navTitle = document.getElementById('nav-title');
  var navList = document.getElementById('nav-list');
  var navLogout = document.getElementById('nav-logout');

  // ── Helpers ──

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function coverUrl(ai, ali, w) { return '/api/cover/' + ai + '/' + ali + (w ? '?w=' + w : ''); }
  function streamUrl(ai, ali, ti) { return '/api/stream/' + ai + '/' + ali + '/' + ti; }

  function loadJSON(k, fb) {
    try { return JSON.parse(localStorage.getItem(k)) || fb; }
    catch (e) { return fb; }
  }
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function isFavArtist(ai) { return favArtists.indexOf(ai) >= 0; }
  function isFavAlbum(ai, ali) { return favAlbums.indexOf(ai + '-' + ali) >= 0; }

  function toggleFavArtist(ai) {
    var i = favArtists.indexOf(ai);
    if (i >= 0) favArtists.splice(i, 1); else favArtists.push(ai);
    saveJSON('jn-fav-artists', favArtists);
  }

  function toggleFavAlbum(ai, ali) {
    var k = ai + '-' + ali;
    var i = favAlbums.indexOf(k);
    if (i >= 0) favAlbums.splice(i, 1); else favAlbums.push(k);
    saveJSON('jn-fav-albums', favAlbums);
  }

  function sameRef(a, b) {
    return a && b && a.artistIdx === b.artistIdx && a.albumIdx === b.albumIdx && a.trackIdx === b.trackIdx;
  }

  // ── Art Panel ──

  var currentCoverKey = null;

  function fadeIn(img) {
    pArt.appendChild(img);
    img.offsetHeight;
    img.classList.add('visible');
    var old = pArt.querySelectorAll('img:not(:last-child)');
    setTimeout(function () {
      old.forEach(function (o) { if (o.parentNode) o.remove(); });
    }, 450);
  }

  function updateArt() {
    var ai = null, ali = null;
    if (contextCover) {
      ai = contextCover.ai;
      ali = contextCover.ali;
    } else if (currentTrack) {
      var album = library[currentTrack.artistIdx].albums[currentTrack.albumIdx];
      if (album.hasCover) { ai = currentTrack.artistIdx; ali = currentTrack.albumIdx; }
    }

    var key = ai !== null ? ai + '-' + ali : null;
    if (key === currentCoverKey) return;
    currentCoverKey = key;

    if (key === null) {
      var cur = pArt.querySelector('img.visible');
      if (cur) {
        cur.classList.remove('visible');
        setTimeout(function () { pArt.innerHTML = ''; }, 450);
      } else {
        pArt.innerHTML = '';
      }
      return;
    }

    var thumb = new Image();
    thumb.alt = '';
    thumb.src = coverUrl(ai, ali, 80);
    thumb.onload = function () {
      if (currentCoverKey === key) fadeIn(thumb);
    };

    var size = Math.round(Math.max(pArt.offsetWidth, pArt.offsetHeight) * (window.devicePixelRatio || 1));
    size = Math.min(size, 1200);
    if (size > 80) {
      var full = new Image();
      full.alt = '';
      full.src = coverUrl(ai, ali, size);
      full.onload = function () {
        if (currentCoverKey === key) fadeIn(full);
      };
    }
  }

  function updateNowPlaying() {
    if (currentTrack) {
      var track = library[currentTrack.artistIdx].albums[currentTrack.albumIdx].tracks[currentTrack.trackIdx];
      ctrlTrack.textContent = track.title;
      ctrlArtist.textContent = library[currentTrack.artistIdx].name;
    } else {
      ctrlTrack.textContent = '\u2014';
      ctrlArtist.textContent = '';
    }
  }

  // ── Queue button ──

  btnQueue.addEventListener('click', function () {
    if (currentView === 'queue') goBack();
    else navigate('queue');
  });

  // ── Shuffle helpers ──

  function shuffleArray(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function reshuffleAutoQueue() {
    if (autoQueue.length <= 1) return;
    var cur = autoQueue[autoQueueIndex];
    var rest = [];
    for (var i = 0; i < autoQueue.length; i++) {
      if (i !== autoQueueIndex) rest.push(autoQueue[i]);
    }
    shuffleArray(rest);
    autoQueue = [cur].concat(rest);
    autoQueueIndex = 0;
  }

  function restoreAutoQueueOrder() {
    if (originalAutoQueue.length === 0) return;
    var cur = autoQueue[autoQueueIndex];
    autoQueue = originalAutoQueue.slice();
    autoQueueIndex = findIdx(autoQueue, cur.artistIdx, cur.albumIdx, cur.trackIdx);
  }

  // ── Navigation ──

  function navigate(view, args) {
    viewHistory.push({ view: currentView, args: viewArgs });
    currentView = view;
    viewArgs = args || {};
    renderView();
  }

  function goBack() {
    if (viewHistory.length === 0) return;
    var prev = viewHistory.pop();
    currentView = prev.view;
    viewArgs = prev.args;
    renderView();
  }

  function renderView() {
    contextCover = null;
    switch (currentView) {
      case 'library': renderLibrary(); break;
      case 'artists': renderArtists(); break;
      case 'artist': renderArtist(viewArgs.idx); break;
      case 'albums': renderAllAlbums(); break;
      case 'album': renderAlbum(viewArgs.ai, viewArgs.ali); break;
      case 'tracks': renderAllTracks(); break;
      case 'fav-artists': renderFavArtists(); break;
      case 'fav-albums': renderFavAlbums(); break;
      case 'playlists': renderPlaylists(); break;
      case 'playlist': renderPlaylist(viewArgs.idx); break;
      case 'queue': renderQueue(); break;
      case 'settings': renderSettings(); break;
    }
    updateArt();
  }

  // ── Render: Library Home ──

  function renderLibrary() {
    navTitle.textContent = 'Library';
    var h = '';
    h += '<div class="nav-item" data-go="artists"><span class="nav-item-text">Artists</span></div>';
    h += '<div class="nav-item" data-go="albums"><span class="nav-item-text">Albums</span></div>';
    h += '<div class="nav-item" data-go="tracks"><span class="nav-item-text">All Tracks</span></div>';
    h += '<div class="nav-item" data-go="fav-artists"><span class="nav-item-text"><img src="' + ICO + 'heart.png" alt="" class="p-icon"> Artists</span><span class="nav-count">' + favArtists.length + '</span></div>';
    h += '<div class="nav-item" data-go="fav-albums"><span class="nav-item-text"><img src="' + ICO + 'heart.png" alt="" class="p-icon"> Albums</span><span class="nav-count">' + favAlbums.length + '</span></div>';
    for (var i = 0; i < playlists.length; i++) {
      h += '<div class="nav-item" data-go="playlist" data-idx="' + i + '"><span class="nav-item-text">' + esc(playlists[i].name) + '</span><span class="nav-count">' + playlists[i].tracks.length + '</span></div>';
    }
    h += '<div class="nav-item" data-action="new-playlist"><span class="nav-item-text">+ New Playlist</span></div>';
    h += '<div class="nav-item" data-go="settings"><span class="nav-item-text">Settings</span></div>';
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      var go = e.target.closest('[data-go]');
      if (go) {
        var dest = go.getAttribute('data-go');
        if (dest === 'playlist') navigate('playlist', { idx: parseInt(go.getAttribute('data-idx'), 10) });
        else navigate(dest);
        return;
      }
      var act = e.target.closest('[data-action]');
      if (act && act.getAttribute('data-action') === 'new-playlist') {
        var name = prompt('Playlist name:');
        if (name && name.trim()) {
          playlists.push({ name: name.trim(), tracks: [] });
          saveJSON('jn-playlists', playlists);
          renderView();
        }
      }
    };
  }

  // ── Render: Artists ──

  function renderArtists() {
    navTitle.textContent = 'Artists';
    var h = backItem('Library');
    for (var i = 0; i < library.length; i++) {
      var fav = isFavArtist(i);
      h += '<div class="nav-item" data-idx="' + i + '">';
      h += '<span class="nav-item-text">' + esc(library[i].name) + '</span>';
      h += '<span class="nav-fav' + (fav ? ' active' : '') + '" data-fav-artist="' + i + '"><img src="' + ICO + 'heart.png" alt=""></span>';
      h += '</div>';
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      var fb = e.target.closest('[data-fav-artist]');
      if (fb) {
        e.stopPropagation();
        toggleFavArtist(parseInt(fb.getAttribute('data-fav-artist'), 10));
        fb.classList.toggle('active');
        return;
      }
      var item = e.target.closest('[data-idx]');
      if (item) navigate('artist', { idx: parseInt(item.getAttribute('data-idx'), 10) });
    };
  }

  // ── Render: Artist → Album list ──

  function renderArtist(idx) {
    var artist = library[idx];
    navTitle.textContent = artist.name;

    if (artist.albums.length > 0 && artist.albums[0].hasCover) {
      contextCover = { ai: idx, ali: 0 };
    }

    var h = backItem('Artists');
    for (var a = 0; a < artist.albums.length; a++) {
      h += albumItemHTML(idx, a);
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      handleFavAlbumClick(e);
      var item = e.target.closest('.album-item');
      if (item && !e.target.closest('[data-fav-album]')) {
        var ai = parseInt(item.getAttribute('data-artist'), 10);
        var ali = parseInt(item.getAttribute('data-album'), 10);
        navigate('album', { ai: ai, ali: ali });
      }
    };
  }

  // ── Render: All Albums ──

  function renderAllAlbums() {
    navTitle.textContent = 'Albums';
    var h = backItem('Library');
    for (var ai = 0; ai < library.length; ai++) {
      for (var ali = 0; ali < library[ai].albums.length; ali++) {
        h += albumItemHTML(ai, ali);
      }
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      handleFavAlbumClick(e);
      var item = e.target.closest('.album-item');
      if (item && !e.target.closest('[data-fav-album]')) {
        var ai = parseInt(item.getAttribute('data-artist'), 10);
        var ali = parseInt(item.getAttribute('data-album'), 10);
        navigate('album', { ai: ai, ali: ali });
      }
    };
  }

  // ── Render: Album → Track list ──

  function renderAlbum(ai, ali) {
    var artist = library[ai];
    var album = artist.albums[ali];
    navTitle.textContent = album.name;

    if (album.hasCover) contextCover = { ai: ai, ali: ali };

    var tracks = [];
    for (var t = 0; t < album.tracks.length; t++) {
      tracks.push({ artistIdx: ai, albumIdx: ali, trackIdx: t });
    }

    var h = backItem(artist.name);
    for (var i = 0; i < album.tracks.length; i++) {
      h += trackRowHTML(ai, ali, i, album.tracks[i]);
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      if (handleAddMenu(e)) return;
      var row = e.target.closest('.track-row');
      if (row) {
        var ti = parseInt(row.getAttribute('data-track'), 10);
        buildAutoQueue(tracks, findIdx(tracks, ai, ali, ti), album.name);
        playTrack(ai, ali, ti);
      }
    };
  }

  // ── Render: All Tracks ──

  function renderAllTracks() {
    navTitle.textContent = 'All Tracks';
    var all = [];
    var h = backItem('Library');
    for (var ai = 0; ai < library.length; ai++) {
      for (var ali = 0; ali < library[ai].albums.length; ali++) {
        for (var ti = 0; ti < library[ai].albums[ali].tracks.length; ti++) {
          all.push({ artistIdx: ai, albumIdx: ali, trackIdx: ti });
          h += trackRowHTML(ai, ali, ti, library[ai].albums[ali].tracks[ti], library[ai].name);
        }
      }
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      if (handleAddMenu(e)) return;
      var row = e.target.closest('.track-row');
      if (row) {
        var tai = parseInt(row.getAttribute('data-artist'), 10);
        var tali = parseInt(row.getAttribute('data-album'), 10);
        var ti = parseInt(row.getAttribute('data-track'), 10);
        buildAutoQueue(all, findIdx(all, tai, tali, ti), 'All Tracks');
        playTrack(tai, tali, ti);
      }
    };
  }

  // ── Render: Fav Artists ──

  function renderFavArtists() {
    navTitle.innerHTML = '<img src="' + ICO + 'heart.png" alt="" class="p-icon"> Artists';
    var h = backItem('Library');
    if (favArtists.length === 0) {
      h += '<div class="nav-empty">No favourite artists yet.</div>';
    }
    for (var i = 0; i < favArtists.length; i++) {
      var ai = favArtists[i];
      if (!library[ai]) continue;
      h += '<div class="nav-item" data-idx="' + ai + '"><span class="nav-item-text">' + esc(library[ai].name) + '</span></div>';
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      var item = e.target.closest('[data-idx]');
      if (item) navigate('artist', { idx: parseInt(item.getAttribute('data-idx'), 10) });
    };
  }

  // ── Render: Fav Albums ──

  function renderFavAlbums() {
    navTitle.innerHTML = '<img src="' + ICO + 'heart.png" alt="" class="p-icon"> Albums';
    var h = backItem('Library');
    if (favAlbums.length === 0) {
      h += '<div class="nav-empty">No favourite albums yet.</div>';
    }
    for (var i = 0; i < favAlbums.length; i++) {
      var parts = favAlbums[i].split('-');
      var ai = parseInt(parts[0], 10);
      var ali = parseInt(parts[1], 10);
      if (!library[ai] || !library[ai].albums[ali]) continue;
      h += albumItemHTML(ai, ali);
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      handleFavAlbumClick(e);
      var item = e.target.closest('.album-item');
      if (item && !e.target.closest('[data-fav-album]')) {
        var ai = parseInt(item.getAttribute('data-artist'), 10);
        var ali = parseInt(item.getAttribute('data-album'), 10);
        navigate('album', { ai: ai, ali: ali });
      }
    };
  }

  // ── Render: Playlists ──

  function renderPlaylists() {
    navTitle.textContent = 'Playlists';
    var h = backItem('Library');
    if (playlists.length === 0) {
      h += '<div class="nav-empty">No playlists yet.</div>';
    }
    for (var i = 0; i < playlists.length; i++) {
      h += '<div class="nav-item" data-idx="' + i + '">';
      h += '<span class="nav-item-text">' + esc(playlists[i].name) + '</span>';
      h += '<span class="nav-count">' + playlists[i].tracks.length + '</span>';
      h += '<span class="nav-delete" data-del="' + i + '"><img src="' + ICO + 'delete.png" alt=""></span>';
      h += '</div>';
    }
    h += '<div class="nav-item" data-action="new-playlist"><span class="nav-item-text">+ New Playlist</span></div>';
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      var del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        var di = parseInt(del.getAttribute('data-del'), 10);
        if (confirm('Delete "' + playlists[di].name + '"?')) {
          playlists.splice(di, 1);
          saveJSON('jn-playlists', playlists);
          renderView();
        }
        return;
      }
      var act = e.target.closest('[data-action]');
      if (act && act.getAttribute('data-action') === 'new-playlist') {
        var name = prompt('Playlist name:');
        if (name && name.trim()) {
          playlists.push({ name: name.trim(), tracks: [] });
          saveJSON('jn-playlists', playlists);
          renderView();
        }
        return;
      }
      var item = e.target.closest('[data-idx]');
      if (item) navigate('playlist', { idx: parseInt(item.getAttribute('data-idx'), 10) });
    };
  }

  // ── Render: Single Playlist ──

  function renderPlaylist(idx) {
    var pl = playlists[idx];
    if (!pl) { goBack(); return; }
    navTitle.textContent = pl.name;

    var h = backItem('Playlists');
    if (pl.tracks.length === 0) {
      h += '<div class="nav-empty">Empty playlist. Browse tracks and use + to add.</div>';
    }
    for (var i = 0; i < pl.tracks.length; i++) {
      var ref = pl.tracks[i];
      if (!library[ref.artistIdx] || !library[ref.artistIdx].albums[ref.albumIdx] || !library[ref.artistIdx].albums[ref.albumIdx].tracks[ref.trackIdx]) continue;
      var track = library[ref.artistIdx].albums[ref.albumIdx].tracks[ref.trackIdx];
      var playing = sameRef(currentTrack, ref);
      h += '<div class="track-row' + (playing ? ' playing' : '') + '" data-artist="' + ref.artistIdx + '" data-album="' + ref.albumIdx + '" data-track="' + ref.trackIdx + '">';
      h += '<span class="track-num">' + (i + 1) + '</span>';
      h += '<span class="track-title">' + esc(track.title) + '</span>';
      h += '<span class="track-artist-hint">' + esc(library[ref.artistIdx].name) + '</span>';
      h += '<span class="track-remove" data-rm="' + i + '"><img src="' + ICO + 'delete.png" alt=""></span>';
      h += '</div>';
    }
    navList.innerHTML = h;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      var rm = e.target.closest('[data-rm]');
      if (rm) {
        e.stopPropagation();
        pl.tracks.splice(parseInt(rm.getAttribute('data-rm'), 10), 1);
        saveJSON('jn-playlists', playlists);
        renderView();
        return;
      }
      var row = e.target.closest('.track-row');
      if (row) {
        var tai = parseInt(row.getAttribute('data-artist'), 10);
        var tali = parseInt(row.getAttribute('data-album'), 10);
        var ti = parseInt(row.getAttribute('data-track'), 10);
        buildAutoQueue(pl.tracks, findIdx(pl.tracks, tai, tali, ti), pl.name);
        playTrack(tai, tali, ti);
      }
    };
  }

  // ── Render: Queue ──

  function renderQueue() {
    navTitle.textContent = 'Queue';

    var loopLabel = loopMode === 'none' ? 'Off' : loopMode === 'all' ? 'All' : 'One';
    var h = backItem('Back');
    h += '<div class="queue-toggle' + (loopMode !== 'none' ? ' active' : '') + '" data-toggle="loop">';
    h += '<span class="toggle-label">Loop</span>';
    h += '<span class="toggle-state">' + loopLabel + '</span>';
    h += '</div>';
    h += '<div class="queue-toggle' + (shuffleOn ? ' active' : '') + '" data-toggle="shuffle">';
    h += '<span class="toggle-label">Shuffle</span>';
    h += '<span class="toggle-state">' + (shuffleOn ? 'On' : 'Off') + '</span>';
    h += '</div>';

    // Manual queue (Next Up)
    if (manualQueue.length > 0) {
      h += '<div class="queue-label">Next up</div>';
      for (var m = 0; m < manualQueue.length; m++) {
        var mref = manualQueue[m];
        if (!library[mref.artistIdx]) continue;
        var mtrack = library[mref.artistIdx].albums[mref.albumIdx].tracks[mref.trackIdx];
        h += '<div class="track-row" data-mq="' + m + '">';
        h += '<span class="track-num">' + (m + 1) + '</span>';
        h += '<span class="track-title">' + esc(mtrack.title) + '</span>';
        h += '<span class="track-artist-hint">' + esc(library[mref.artistIdx].name) + '</span>';
        h += '<span class="track-remove" data-rm-mq="' + m + '"><img src="' + ICO + 'delete.png" alt=""></span>';
        h += '</div>';
      }
    }

    // Auto queue
    if (autoQueue.length > 0) {
      h += '<div class="queue-label">' + esc(autoQueueLabel || 'Playing from') + '</div>';
      for (var i = 0; i < autoQueue.length; i++) {
        var ref = autoQueue[i];
        if (!library[ref.artistIdx] || !library[ref.artistIdx].albums[ref.albumIdx]) continue;
        var track = library[ref.artistIdx].albums[ref.albumIdx].tracks[ref.trackIdx];
        var playing = i === autoQueueIndex;
        h += '<div class="track-row' + (playing ? ' playing' : '') + '" data-aq="' + i + '">';
        h += '<span class="track-num">' + (i + 1) + '</span>';
        h += '<span class="track-title">' + esc(track.title) + '</span>';
        h += '<span class="track-artist-hint">' + esc(library[ref.artistIdx].name) + '</span>';
        h += '</div>';
      }
    }

    if (autoQueue.length === 0 && manualQueue.length === 0) {
      h += '<div class="nav-empty">No queue. Play a track to start.</div>';
    }

    navList.innerHTML = h;
    navList.scrollTop = 0;

    var playingEl = navList.querySelector('.track-row.playing');
    if (playingEl) playingEl.scrollIntoView({ block: 'center' });

    navList.onclick = function (e) {
      if (handleBack(e)) return;
      var toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        var t = toggle.getAttribute('data-toggle');
        if (t === 'loop') {
          if (loopMode === 'none') loopMode = 'all';
          else if (loopMode === 'all') loopMode = 'one';
          else loopMode = 'none';
        } else if (t === 'shuffle') {
          shuffleOn = !shuffleOn;
          if (shuffleOn && autoQueue.length > 1 && autoQueueIndex >= 0) {
            originalAutoQueue = autoQueue.slice();
            reshuffleAutoQueue();
          } else if (!shuffleOn) {
            restoreAutoQueueOrder();
          }
        }
        renderQueue();
        return;
      }
      // Remove from manual queue
      var rmMq = e.target.closest('[data-rm-mq]');
      if (rmMq) {
        e.stopPropagation();
        manualQueue.splice(parseInt(rmMq.getAttribute('data-rm-mq'), 10), 1);
        renderQueue();
        return;
      }
      // Play from manual queue
      var mqRow = e.target.closest('[data-mq]');
      if (mqRow) {
        var mi = parseInt(mqRow.getAttribute('data-mq'), 10);
        var mref = manualQueue.splice(mi, 1)[0];
        playTrack(mref.artistIdx, mref.albumIdx, mref.trackIdx);
        return;
      }
      // Play from auto queue
      var aqRow = e.target.closest('[data-aq]');
      if (aqRow) {
        autoQueueIndex = parseInt(aqRow.getAttribute('data-aq'), 10);
        var aref = autoQueue[autoQueueIndex];
        playTrack(aref.artistIdx, aref.albumIdx, aref.trackIdx);
      }
    };
  }

  // ── Render: Settings ──

  function showMsg(id, text, ok) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; el.className = 'settings-msg ' + (ok ? 'success' : 'error'); }
  }

  function renderSettings() {
    navTitle.textContent = 'Settings';
    var h = backItem('Library');
    h += '<div class="settings-section">Account</div>';
    h += '<div class="settings-field settings-account">';
    h += '<span>' + esc(accountInfo ? accountInfo.username : '') + '</span>';
    if (accountInfo && accountInfo.admin) h += '<span class="settings-badge">admin</span>';
    h += '</div>';

    h += '<div class="settings-section">Change Password</div>';
    h += '<div class="settings-field"><input type="password" class="settings-input" id="set-cur-pw" placeholder="Current password"></div>';
    h += '<div class="settings-field"><input type="password" class="settings-input" id="set-new-pw" placeholder="New password (4+ chars)"></div>';
    h += '<div class="settings-field"><button class="settings-btn" id="set-change-pw">Change Password</button></div>';
    h += '<div class="settings-msg" id="set-pw-msg"></div>';

    if (accountInfo && accountInfo.admin) {
      h += '<div class="settings-section">Users</div>';
      h += '<div id="admin-users-list"></div>';
      h += '<div class="settings-section">Add User</div>';
      h += '<div class="settings-field"><input type="text" class="settings-input" id="set-new-user" placeholder="Username"></div>';
      h += '<div class="settings-field"><input type="password" class="settings-input" id="set-new-user-pw" placeholder="Password (4+ chars)"></div>';
      h += '<div class="settings-field"><label class="settings-check"><input type="checkbox" id="set-new-user-admin"> Admin</label></div>';
      h += '<div class="settings-field"><button class="settings-btn" id="set-create-user">Create User</button></div>';
      h += '<div class="settings-msg" id="set-user-msg"></div>';
    }

    navList.innerHTML = h;
    navList.scrollTop = 0;

    if (accountInfo && accountInfo.admin) loadAdminUsers();

    document.getElementById('set-change-pw').addEventListener('click', function () {
      var cur = document.getElementById('set-cur-pw').value;
      var np = document.getElementById('set-new-pw').value;
      fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: np })
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (r) {
        showMsg('set-pw-msg', r.ok ? 'Password changed' : (r.data.error || 'Error'), r.ok);
        if (r.ok) { document.getElementById('set-cur-pw').value = ''; document.getElementById('set-new-pw').value = ''; }
      });
    });

    if (accountInfo && accountInfo.admin) {
      document.getElementById('set-create-user').addEventListener('click', function () {
        var u = document.getElementById('set-new-user').value;
        var p = document.getElementById('set-new-user-pw').value;
        var a = document.getElementById('set-new-user-admin').checked;
        fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p, admin: a })
        })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (r) {
          showMsg('set-user-msg', r.ok ? 'User created' : (r.data.error || 'Error'), r.ok);
          if (r.ok) {
            document.getElementById('set-new-user').value = '';
            document.getElementById('set-new-user-pw').value = '';
            document.getElementById('set-new-user-admin').checked = false;
            loadAdminUsers();
          }
        });
      });
    }

    navList.onclick = function (e) {
      if (handleBack(e)) return;
    };
  }

  function loadAdminUsers() {
    var container = document.getElementById('admin-users-list');
    if (!container) return;
    fetch('/api/admin/users')
      .then(function (r) { return r.json(); })
      .then(function (users) {
        var h = '';
        for (var i = 0; i < users.length; i++) {
          h += '<div class="nav-item settings-user">';
          h += '<span class="nav-item-text">' + esc(users[i].username) + '</span>';
          if (users[i].admin) h += '<span class="settings-badge">admin</span>';
          h += '<span class="settings-action" data-reset="' + i + '">reset</span>';
          if (users[i].username !== accountInfo.username) {
            h += '<span class="nav-delete" data-del-user="' + i + '"><img src="' + ICO + 'delete.png" alt=""></span>';
          }
          h += '</div>';
        }
        container.innerHTML = h;
        container.onclick = function (e) {
          var rb = e.target.closest('[data-reset]');
          if (rb) {
            var idx = parseInt(rb.getAttribute('data-reset'), 10);
            var np = prompt('New password for ' + users[idx].username + ':');
            if (np) {
              fetch('/api/admin/users/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: users[idx].username, newPassword: np })
              })
              .then(function (r) { return r.json(); })
              .then(function (d) { showMsg('set-user-msg', d.ok ? 'Password reset' : (d.error || 'Error'), !!d.ok); });
            }
            return;
          }
          var db = e.target.closest('[data-del-user]');
          if (db) {
            var idx = parseInt(db.getAttribute('data-del-user'), 10);
            if (confirm('Delete user "' + users[idx].username + '"?')) {
              fetch('/api/admin/users/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: users[idx].username })
              })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                showMsg('set-user-msg', d.ok ? 'User deleted' : (d.error || 'Error'), !!d.ok);
                if (d.ok) loadAdminUsers();
              });
            }
          }
        };
      });
  }

  // ── HTML Builders ──

  function backItem(label) {
    return '<div class="nav-item" data-back><span class="nav-item-text">&larr; ' + (label || 'Back') + '</span></div>';
  }

  function handleBack(e) {
    if (e.target.closest('[data-back]')) { goBack(); return true; }
    return false;
  }

  function albumItemHTML(ai, ali) {
    var album = library[ai].albums[ali];
    var artist = library[ai];
    var fav = isFavAlbum(ai, ali);
    var h = '<div class="album-item" data-artist="' + ai + '" data-album="' + ali + '">';
    h += '<div class="album-item-info">';
    h += '<div class="album-item-name">' + esc(album.name) + '</div>';
    h += '<div class="album-item-meta">' + esc(artist.name) + (album.year ? ' \u00B7 ' + album.year : '') + ' \u00B7 ' + album.trackCount + ' tracks</div>';
    h += '</div>';
    h += '<span class="album-fav' + (fav ? ' active' : '') + '" data-fav-album="' + ai + '-' + ali + '"><img src="' + ICO + 'heart.png" alt=""></span>';
    h += '</div>';
    return h;
  }

  function trackRowHTML(ai, ali, ti, track, artistHint) {
    var playing = sameRef(currentTrack, { artistIdx: ai, albumIdx: ali, trackIdx: ti });
    var h = '<div class="track-row' + (playing ? ' playing' : '') + '" data-artist="' + ai + '" data-album="' + ali + '" data-track="' + ti + '">';
    h += '<span class="track-num">' + track.number + '</span>';
    h += '<span class="track-title">' + esc(track.title) + '</span>';
    if (artistHint) h += '<span class="track-artist-hint">' + esc(artistHint) + '</span>';
    h += '<span class="track-add" data-add="' + ai + '-' + ali + '-' + ti + '"><img src="' + ICO + 'add.png" alt=""></span>';
    h += '</div>';
    return h;
  }

  function handleFavAlbumClick(e) {
    var fb = e.target.closest('[data-fav-album]');
    if (fb) {
      e.stopPropagation();
      var k = fb.getAttribute('data-fav-album');
      var p = k.split('-');
      toggleFavAlbum(parseInt(p[0], 10), parseInt(p[1], 10));
      fb.classList.toggle('active');
    }
  }

  // ── Add Menu (Queue + Playlists) ──

  function handleAddMenu(e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return false;
    e.stopPropagation();
    closeAddMenu();

    var parts = btn.getAttribute('data-add').split('-');
    var ref = { artistIdx: parseInt(parts[0], 10), albumIdx: parseInt(parts[1], 10), trackIdx: parseInt(parts[2], 10) };

    var rect = btn.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'playlist-menu';
    menu.style.top = rect.bottom + 2 + 'px';
    menu.style.left = Math.min(rect.right, window.innerWidth - 160) + 'px';

    // Add to queue option
    var qItem = document.createElement('div');
    qItem.className = 'playlist-menu-item';
    qItem.textContent = 'Add to Queue';
    qItem.setAttribute('data-add-queue', '1');
    menu.appendChild(qItem);

    // Playlist options
    for (var i = 0; i < playlists.length; i++) {
      var mi = document.createElement('div');
      mi.className = 'playlist-menu-item';
      mi.textContent = playlists[i].name;
      mi.setAttribute('data-pl', i);
      menu.appendChild(mi);
    }
    var ni = document.createElement('div');
    ni.className = 'playlist-menu-item';
    ni.textContent = '+ New Playlist';
    ni.setAttribute('data-pl-new', '1');
    menu.appendChild(ni);

    menu.addEventListener('click', function (me) {
      me.stopPropagation();
      if (me.target.getAttribute('data-add-queue')) {
        manualQueue.push(ref);
        flash(btn);
      } else {
        var pi = me.target.getAttribute('data-pl');
        if (pi !== null) {
          playlists[parseInt(pi, 10)].tracks.push(ref);
          saveJSON('jn-playlists', playlists);
          flash(btn);
        } else if (me.target.getAttribute('data-pl-new')) {
          var n = prompt('Playlist name:');
          if (n && n.trim()) {
            playlists.push({ name: n.trim(), tracks: [ref] });
            saveJSON('jn-playlists', playlists);
            flash(btn);
          }
        }
      }
      closeAddMenu();
    });

    document.body.appendChild(menu);
    setTimeout(function () {
      document.addEventListener('click', closeAddMenu, { once: true });
    }, 0);
    return true;
  }

  function flash(el) {
    el.innerHTML = '<img src="' + ICO + 'done.png" alt="">';
    setTimeout(function () { el.innerHTML = '<img src="' + ICO + 'add.png" alt="">'; }, 700);
  }

  function closeAddMenu() {
    var m = document.querySelector('.playlist-menu');
    if (m) m.remove();
  }

  // ── Queue Management ──

  function buildAutoQueue(tracks, startIdx, label) {
    originalAutoQueue = tracks.slice();
    autoQueueLabel = label || '';
    if (shuffleOn) {
      autoQueue = tracks.slice();
      var cur = autoQueue.splice(startIdx, 1)[0];
      shuffleArray(autoQueue);
      autoQueue.unshift(cur);
      autoQueueIndex = 0;
    } else {
      autoQueue = tracks.slice();
      autoQueueIndex = startIdx;
    }
  }

  function findIdx(arr, ai, ali, ti) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].artistIdx === ai && arr[i].albumIdx === ali && arr[i].trackIdx === ti) return i;
    }
    return 0;
  }

  // ── Playback ──

  function playTrack(ai, ali, ti) {
    currentTrack = { artistIdx: ai, albumIdx: ali, trackIdx: ti };
    audio.src = streamUrl(ai, ali, ti);
    audio.play();
    updateNowPlaying();
    updateArt();
    updateMediaSession(ai, ali, ti);
    highlightTrackRow();
    btnPlay.innerHTML = '<img src="' + ICO + 'pause.png" alt="Pause">';
    // Re-render queue view if we're on it
    if (currentView === 'queue') renderQueue();
  }

  function updateMediaSession(ai, ali, ti) {
    if (!('mediaSession' in navigator)) return;
    var artist = library[ai];
    var album = artist.albums[ali];
    var track = album.tracks[ti];
    var artwork = [];
    if (album.hasCover) {
      artwork = [
        { src: coverUrl(ai, ali, 96), sizes: '96x96', type: 'image/jpeg' },
        { src: coverUrl(ai, ali, 256), sizes: '256x256', type: 'image/jpeg' },
        { src: coverUrl(ai, ali, 512), sizes: '512x512', type: 'image/jpeg' }
      ];
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: artist.name,
      album: album.name,
      artwork: artwork
    });
    navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', function () { playPrev(); });
    navigator.mediaSession.setActionHandler('nexttrack', function () { playNext(); });
    navigator.mediaSession.setActionHandler('seekto', function (d) {
      if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime);
      else audio.currentTime = d.seekTime;
    });
  }

  function highlightTrackRow() {
    var rows = navList.querySelectorAll('.track-row');
    rows.forEach(function (r) {
      var ai = parseInt(r.getAttribute('data-artist'), 10);
      var ali = parseInt(r.getAttribute('data-album'), 10);
      var ti = parseInt(r.getAttribute('data-track'), 10);
      r.classList.toggle('playing', sameRef(currentTrack, { artistIdx: ai, albumIdx: ali, trackIdx: ti }));
    });
  }

  function playNext() {
    if (loopMode === 'one') { audio.currentTime = 0; audio.play(); return; }

    // Manual queue takes priority
    if (manualQueue.length > 0) {
      var next = manualQueue.shift();
      playTrack(next.artistIdx, next.albumIdx, next.trackIdx);
      return;
    }

    // Auto queue
    if (autoQueue.length === 0) return;
    autoQueueIndex++;
    if (autoQueueIndex >= autoQueue.length) {
      if (loopMode === 'all') autoQueueIndex = 0; else return;
    }
    var item = autoQueue[autoQueueIndex];
    playTrack(item.artistIdx, item.albumIdx, item.trackIdx);
  }

  function playPrev() {
    if (autoQueue.length === 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    autoQueueIndex--;
    if (autoQueueIndex < 0) {
      if (loopMode === 'all') autoQueueIndex = autoQueue.length - 1; else { autoQueueIndex = 0; return; }
    }
    var item = autoQueue[autoQueueIndex];
    playTrack(item.artistIdx, item.albumIdx, item.trackIdx);
  }

  // ── Audio Events ──

  audio.addEventListener('timeupdate', function () {
    ctrlCur.textContent = fmt(audio.currentTime);
    if (audio.duration) ctrlFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
  });

  audio.addEventListener('loadedmetadata', function () {
    ctrlDur.textContent = fmt(audio.duration);
  });

  audio.addEventListener('ended', function () { playNext(); });
  audio.addEventListener('play', function () { btnPlay.innerHTML = '<img src="' + ICO + 'pause.png" alt="Pause">'; });
  audio.addEventListener('pause', function () { btnPlay.innerHTML = '<img src="' + ICO + 'play.png" alt="Play">'; });

  // ── Seek ──

  ctrlBar.addEventListener('click', function (e) {
    if (!audio.duration) return;
    var rect = ctrlBar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  });

  // ── Button Handlers ──

  btnPlay.addEventListener('click', function () {
    if (!audio.src) return;
    if (audio.paused) audio.play(); else audio.pause();
  });

  btnNext.addEventListener('click', function () { playNext(); });
  btnPrev.addEventListener('click', function () { playPrev(); });

  // ── Keyboard ──

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); btnPlay.click(); }
  });

  // ── Logout ──

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = '/logout';
    document.body.appendChild(f);
    f.submit();
  });

  // ── Init ──

  fetch('/api/account')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { accountInfo = data; });

  fetch('/api/library')
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (data) {
      library = data;
      renderView();
    })
    .catch(function () {
      navList.innerHTML = '<div class="nav-empty">Failed to load. <a href="/login">Login again</a>.</div>';
    });

})();
