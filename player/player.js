(function () {
  'use strict';

  var library = [];
  var audio = new Audio();
  var currentArtistIdx = null;
  var currentAlbumIdx = null;
  var currentTrackIdx = null;
  var queue = [];

  // DOM refs
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
  var navTitle = document.getElementById('nav-title');
  var navList = document.getElementById('nav-list');
  var navLogout = document.getElementById('nav-logout');

  // ── Helpers ──

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function coverUrl(ai, ali) {
    return '/api/cover/' + ai + '/' + ali;
  }

  function streamUrl(ai, ali, ti) {
    return '/api/stream/' + ai + '/' + ali + '/' + ti;
  }

  // ── Art panel ──

  function showCover(imgSrc) {
    if (imgSrc) {
      pArt.innerHTML = '<img src="' + imgSrc + '" alt="">';
    } else {
      pArt.innerHTML = '';
    }
  }

  // ── Control info ──

  function showTrackInfo(title, artist) {
    ctrlTrack.textContent = title || '\u2014';
    ctrlArtist.textContent = artist || '';
  }

  // ── Logout ──

  navLogout.addEventListener('click', function (e) {
    e.preventDefault();
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = '/logout';
    document.body.appendChild(form);
    form.submit();
  });

  // ── Fetch library ──

  fetch('/api/library')
    .then(function (r) {
      if (!r.ok) throw new Error('Unauthorized');
      return r.json();
    })
    .then(function (data) {
      library = data;
      renderArtists();
    })
    .catch(function () {
      navList.innerHTML = '<div style="padding:var(--pad);font-size:0.8rem;">Failed to load. <a href="/login">Login again</a>.</div>';
    });

  // ── Render artists ──

  function renderArtists() {
    navTitle.textContent = 'Artists';
    var html = '';
    for (var i = 0; i < library.length; i++) {
      html += '<div class="nav-item" data-idx="' + i + '">' + esc(library[i].name) + '</div>';
    }
    navList.innerHTML = html;

    navList.onclick = function (e) {
      var item = e.target.closest('.nav-item');
      if (!item) return;
      var idx = item.getAttribute('data-idx');
      if (idx !== null) {
        selectArtist(parseInt(idx, 10));
      }
    };
  }

  // ── Select artist → album grid ──

  function selectArtist(idx) {
    var artist = library[idx];
    navTitle.textContent = artist.name;

    if (artist.albums.length > 0 && artist.albums[0].hasCover) {
      showCover(coverUrl(idx, 0));
    } else {
      showCover(null);
    }

    var html = '<div class="nav-item" data-back="artists">&larr; All Artists</div>';
    html += '<div class="album-grid">';
    for (var a = 0; a < artist.albums.length; a++) {
      var album = artist.albums[a];
      var coverSrc = album.hasCover ? coverUrl(idx, a) : '';
      html += '<div class="album-cell" data-artist="' + idx + '" data-album="' + a + '">';
      html += '<div class="album-art">';
      if (coverSrc) {
        html += '<img src="' + coverSrc + '" alt="' + esc(album.name) + '" loading="lazy">';
      }
      html += '</div>';
      html += '<div class="album-info">';
      html += '<div class="album-title">' + esc(album.name) + '</div>';
      html += '<div class="album-artist-name">' + esc(artist.name) + '</div>';
      html += '<div class="album-meta">' + (album.year || '') + ' &middot; ' + album.trackCount + ' tracks</div>';
      html += '</div></div>';
    }
    html += '</div>';

    navList.innerHTML = html;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      var back = e.target.closest('[data-back]');
      if (back) {
        renderArtists();
        showCover(null);
        showTrackInfo(null, null);
        return;
      }
      var cell = e.target.closest('.album-cell');
      if (cell) {
        var ai = parseInt(cell.getAttribute('data-artist'), 10);
        var ali = parseInt(cell.getAttribute('data-album'), 10);
        selectAlbum(ai, ali);
      }
    };
  }

  // ── Select album → track list ──

  function selectAlbum(ai, ali) {
    currentAlbumIdx = ali;
    var artist = library[ai];
    var album = artist.albums[ali];
    var coverSrc = album.hasCover ? coverUrl(ai, ali) : '';

    showCover(coverSrc);
    navTitle.textContent = album.name;

    // Build queue
    queue = [];
    for (var t = 0; t < album.tracks.length; t++) {
      queue.push({ artistIdx: ai, albumIdx: ali, trackIdx: t });
    }

    var html = '<div class="nav-item" data-back-artist="' + ai + '">&larr; ' + esc(artist.name) + '</div>';
    for (var i = 0; i < album.tracks.length; i++) {
      var track = album.tracks[i];
      var isPlaying = currentArtistIdx === ai && currentAlbumIdx === ali && currentTrackIdx === i;
      html += '<div class="track-row' + (isPlaying ? ' playing' : '') + '" data-artist="' + ai + '" data-album="' + ali + '" data-track="' + i + '">';
      html += '<span class="track-num">' + track.number + '</span>';
      html += '<span class="track-title">' + esc(track.title) + '</span>';
      html += '</div>';
    }

    navList.innerHTML = html;
    navList.scrollTop = 0;

    navList.onclick = function (e) {
      var back = e.target.closest('[data-back-artist]');
      if (back) {
        selectArtist(parseInt(back.getAttribute('data-back-artist'), 10));
        return;
      }
      var row = e.target.closest('.track-row');
      if (row) {
        var tai = parseInt(row.getAttribute('data-artist'), 10);
        var tali = parseInt(row.getAttribute('data-album'), 10);
        var ti = parseInt(row.getAttribute('data-track'), 10);
        playTrack(tai, tali, ti);
      }
    };
  }

  // ── Play track ──

  function playTrack(ai, ali, ti) {
    var artist = library[ai];
    var album = artist.albums[ali];
    var track = album.tracks[ti];

    currentArtistIdx = ai;
    currentAlbumIdx = ali;
    currentTrackIdx = ti;

    audio.src = streamUrl(ai, ali, ti);
    audio.play();

    var coverSrc = album.hasCover ? coverUrl(ai, ali) : '';
    showCover(coverSrc);
    showTrackInfo(track.title, artist.name + ' \u2014 ' + album.name);

    btnPlay.innerHTML = '&#9646;&#9646;';
    highlightTrackRow();
  }

  function highlightTrackRow() {
    var rows = navList.querySelectorAll('.track-row');
    rows.forEach(function (row) {
      var ai = parseInt(row.getAttribute('data-artist'), 10);
      var ali = parseInt(row.getAttribute('data-album'), 10);
      var ti = parseInt(row.getAttribute('data-track'), 10);
      row.classList.toggle('playing', ai === currentArtistIdx && ali === currentAlbumIdx && ti === currentTrackIdx);
    });
  }

  // ── Audio events ──

  audio.addEventListener('timeupdate', function () {
    ctrlCur.textContent = formatTime(audio.currentTime);
    if (audio.duration) {
      ctrlFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    }
  });

  audio.addEventListener('loadedmetadata', function () {
    ctrlDur.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', function () {
    playNext();
  });

  audio.addEventListener('play', function () {
    btnPlay.innerHTML = '&#9646;&#9646;';
  });

  audio.addEventListener('pause', function () {
    btnPlay.innerHTML = '&#9654;';
  });

  // ── Progress bar seek ──

  ctrlBar.addEventListener('click', function (e) {
    if (!audio.duration) return;
    var rect = ctrlBar.getBoundingClientRect();
    var pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // ── Controls ──

  btnPlay.addEventListener('click', function () {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  });

  btnNext.addEventListener('click', function () {
    playNext();
  });

  btnPrev.addEventListener('click', function () {
    playPrev();
  });

  function playNext() {
    if (queue.length === 0) return;
    var idx = findQueueIndex();
    if (idx < 0 || idx >= queue.length - 1) return;
    var next = queue[idx + 1];
    playTrack(next.artistIdx, next.albumIdx, next.trackIdx);
  }

  function playPrev() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    var idx = findQueueIndex();
    if (idx <= 0) return;
    var prev = queue[idx - 1];
    playTrack(prev.artistIdx, prev.albumIdx, prev.trackIdx);
  }

  function findQueueIndex() {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].artistIdx === currentArtistIdx && queue[i].albumIdx === currentAlbumIdx && queue[i].trackIdx === currentTrackIdx) {
        return i;
      }
    }
    return -1;
  }

  // ── Keyboard shortcuts ──

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      btnPlay.click();
    }
  });

})();
