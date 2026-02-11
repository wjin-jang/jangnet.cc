(function () {
  'use strict';

  // ── State ──

  var library = [];
  var audio = new Audio();
  var currentTrack = null;
  var queue = [];
  var queueIndex = -1;
  var loopMode = 'none';
  var shuffleOn = false;
  var contextCover = null;

  var currentView = 'library';
  var viewArgs = {};
  var viewHistory = [];

  // Persistent
  var favArtists = loadJSON('jn-fav-artists', []);
  var favAlbums = loadJSON('jn-fav-albums', []);
  var playlists = loadJSON('jn-playlists', []);

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
  var btnLoop = document.getElementById('btn-loop');
  var btnShuffle = document.getElementById('btn-shuffle');
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

  function coverUrl(ai, ali) { return '/api/cover/' + ai + '/' + ali; }
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

  // ── Art Panel ──

  function updateArt() {
    var src = null;
    if (contextCover) {
      src = contextCover;
    } else if (currentTrack) {
      var album = library[currentTrack.artistIdx].albums[currentTrack.albumIdx];
      if (album.hasCover) src = coverUrl(currentTrack.artistIdx, currentTrack.albumIdx);
    }
    pArt.innerHTML = src ? '<img src="' + src + '" alt="">' : '';
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

  // ── Loop / Shuffle ──

  function updateLoopBtn() {
    if (loopMode === 'none') {
      btnLoop.classList.remove('active');
      btnLoop.innerHTML = '&#8635;';
      btnLoop.title = 'Loop: Off';
    } else if (loopMode === 'all') {
      btnLoop.classList.add('active');
      btnLoop.innerHTML = '&#8635;';
      btnLoop.title = 'Loop: All';
    } else {
      btnLoop.classList.add('active');
      btnLoop.textContent = '1';
      btnLoop.title = 'Loop: One';
    }
  }

  function updateShuffleBtn() {
    btnShuffle.classList.toggle('active', shuffleOn);
    btnShuffle.title = shuffleOn ? 'Shuffle: On' : 'Shuffle: Off';
  }

  btnLoop.addEventListener('click', function () {
    if (loopMode === 'none') loopMode = 'all';
    else if (loopMode === 'all') loopMode = 'one';
    else loopMode = 'none';
    updateLoopBtn();
  });

  btnShuffle.addEventListener('click', function () {
    shuffleOn = !shuffleOn;
    if (shuffleOn && queue.length > 1 && queueIndex >= 0) reshuffleQueue();
    updateShuffleBtn();
  });

  function reshuffleQueue() {
    var cur = queue[queueIndex];
    var rest = [];
    for (var i = 0; i < queue.length; i++) {
      if (i !== queueIndex) rest.push(queue[i]);
    }
    shuffleArray(rest);
    queue = [cur].concat(rest);
    queueIndex = 0;
  }

  function shuffleArray(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
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
    h += '<div class="nav-item" data-go="fav-artists"><span class="nav-item-text">\u2665 Artists</span><span class="nav-count">' + favArtists.length + '</span></div>';
    h += '<div class="nav-item" data-go="fav-albums"><span class="nav-item-text">\u2665 Albums</span><span class="nav-count">' + favAlbums.length + '</span></div>';
    for (var i = 0; i < playlists.length; i++) {
      h += '<div class="nav-item" data-go="playlist" data-idx="' + i + '"><span class="nav-item-text">' + esc(playlists[i].name) + '</span><span class="nav-count">' + playlists[i].tracks.length + '</span></div>';
    }
    h += '<div class="nav-item" data-action="new-playlist"><span class="nav-item-text">+ New Playlist</span></div>';
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
      h += '<span class="nav-fav' + (fav ? ' active' : '') + '" data-fav-artist="' + i + '">\u2665</span>';
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
      contextCover = coverUrl(idx, 0);
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

    if (album.hasCover) contextCover = coverUrl(ai, ali);

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
      if (handlePlaylistAdd(e)) return;
      var row = e.target.closest('.track-row');
      if (row) {
        var ti = parseInt(row.getAttribute('data-track'), 10);
        buildQueue(tracks, findIdx(tracks, ai, ali, ti));
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
      if (handlePlaylistAdd(e)) return;
      var row = e.target.closest('.track-row');
      if (row) {
        var tai = parseInt(row.getAttribute('data-artist'), 10);
        var tali = parseInt(row.getAttribute('data-album'), 10);
        var ti = parseInt(row.getAttribute('data-track'), 10);
        buildQueue(all, findIdx(all, tai, tali, ti));
        playTrack(tai, tali, ti);
      }
    };
  }

  // ── Render: Fav Artists ──

  function renderFavArtists() {
    navTitle.textContent = '\u2665 Artists';
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
    navTitle.textContent = '\u2665 Albums';
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
      h += '<span class="nav-delete" data-del="' + i + '">\u00D7</span>';
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
      var playing = currentTrack && currentTrack.artistIdx === ref.artistIdx && currentTrack.albumIdx === ref.albumIdx && currentTrack.trackIdx === ref.trackIdx;
      h += '<div class="track-row' + (playing ? ' playing' : '') + '" data-artist="' + ref.artistIdx + '" data-album="' + ref.albumIdx + '" data-track="' + ref.trackIdx + '">';
      h += '<span class="track-num">' + (i + 1) + '</span>';
      h += '<span class="track-title">' + esc(track.title) + '</span>';
      h += '<span class="track-artist-hint">' + esc(library[ref.artistIdx].name) + '</span>';
      h += '<span class="track-remove" data-rm="' + i + '">\u00D7</span>';
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
        buildQueue(pl.tracks, findIdx(pl.tracks, tai, tali, ti));
        playTrack(tai, tali, ti);
      }
    };
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
    h += '<span class="album-fav' + (fav ? ' active' : '') + '" data-fav-album="' + ai + '-' + ali + '">\u2665</span>';
    h += '</div>';
    return h;
  }

  function trackRowHTML(ai, ali, ti, track, artistHint) {
    var playing = currentTrack && currentTrack.artistIdx === ai && currentTrack.albumIdx === ali && currentTrack.trackIdx === ti;
    var h = '<div class="track-row' + (playing ? ' playing' : '') + '" data-artist="' + ai + '" data-album="' + ali + '" data-track="' + ti + '">';
    h += '<span class="track-num">' + track.number + '</span>';
    h += '<span class="track-title">' + esc(track.title) + '</span>';
    if (artistHint) h += '<span class="track-artist-hint">' + esc(artistHint) + '</span>';
    h += '<span class="track-add" data-add="' + ai + '-' + ali + '-' + ti + '">+</span>';
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

  // ── Playlist Add ──

  function handlePlaylistAdd(e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return false;
    e.stopPropagation();
    closePlaylistMenu();

    var parts = btn.getAttribute('data-add').split('-');
    var ref = { artistIdx: parseInt(parts[0], 10), albumIdx: parseInt(parts[1], 10), trackIdx: parseInt(parts[2], 10) };

    if (playlists.length === 0) {
      var name = prompt('Create a playlist:');
      if (name && name.trim()) {
        playlists.push({ name: name.trim(), tracks: [ref] });
        saveJSON('jn-playlists', playlists);
        flash(btn);
      }
      return true;
    }

    var rect = btn.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'playlist-menu';
    menu.style.top = rect.bottom + 2 + 'px';
    menu.style.left = Math.min(rect.right, window.innerWidth - 160) + 'px';

    for (var i = 0; i < playlists.length; i++) {
      var mi = document.createElement('div');
      mi.className = 'playlist-menu-item';
      mi.textContent = playlists[i].name;
      mi.setAttribute('data-pl', i);
      menu.appendChild(mi);
    }
    var ni = document.createElement('div');
    ni.className = 'playlist-menu-item';
    ni.textContent = '+ New';
    ni.setAttribute('data-pl-new', '1');
    menu.appendChild(ni);

    menu.addEventListener('click', function (me) {
      me.stopPropagation();
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
      closePlaylistMenu();
    });

    document.body.appendChild(menu);
    setTimeout(function () {
      document.addEventListener('click', closePlaylistMenu, { once: true });
    }, 0);
    return true;
  }

  function flash(el) {
    el.textContent = '\u2713';
    setTimeout(function () { el.textContent = '+'; }, 700);
  }

  function closePlaylistMenu() {
    var m = document.querySelector('.playlist-menu');
    if (m) m.remove();
  }

  // ── Queue ──

  function buildQueue(tracks, startIdx) {
    queue = tracks.slice();
    if (shuffleOn) {
      var cur = queue.splice(startIdx, 1)[0];
      shuffleArray(queue);
      queue.unshift(cur);
      queueIndex = 0;
    } else {
      queueIndex = startIdx;
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
    highlightTrackRow();
    btnPlay.innerHTML = '&#9646;&#9646;';
  }

  function highlightTrackRow() {
    var rows = navList.querySelectorAll('.track-row');
    rows.forEach(function (r) {
      var ai = parseInt(r.getAttribute('data-artist'), 10);
      var ali = parseInt(r.getAttribute('data-album'), 10);
      var ti = parseInt(r.getAttribute('data-track'), 10);
      r.classList.toggle('playing', currentTrack && ai === currentTrack.artistIdx && ali === currentTrack.albumIdx && ti === currentTrack.trackIdx);
    });
  }

  function playNext() {
    if (queue.length === 0) return;
    if (loopMode === 'one') { audio.currentTime = 0; audio.play(); return; }
    queueIndex++;
    if (queueIndex >= queue.length) {
      if (loopMode === 'all') queueIndex = 0; else return;
    }
    var item = queue[queueIndex];
    playTrack(item.artistIdx, item.albumIdx, item.trackIdx);
  }

  function playPrev() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    queueIndex--;
    if (queueIndex < 0) {
      if (loopMode === 'all') queueIndex = queue.length - 1; else { queueIndex = 0; return; }
    }
    var item = queue[queueIndex];
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
  audio.addEventListener('play', function () { btnPlay.innerHTML = '&#9646;&#9646;'; });
  audio.addEventListener('pause', function () { btnPlay.innerHTML = '&#9654;'; });

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

  updateLoopBtn();
  updateShuffleBtn();

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
