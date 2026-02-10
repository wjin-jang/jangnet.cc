(function () {
  'use strict';

  var library = [];
  var audio = new Audio();
  var currentArtistIdx = null;
  var currentAlbumIdx = null;
  var currentTrackIdx = null;
  var queue = []; // tracks in current album for auto-advance

  // DOM refs
  var sidebar = document.getElementById('artist-list');
  var content = document.getElementById('content');
  var npTitle = document.getElementById('np-title');
  var npArtist = document.getElementById('np-artist');
  var npArt = document.getElementById('np-art');
  var npCurrent = document.getElementById('np-current');
  var npDuration = document.getElementById('np-duration');
  var npBarFill = document.getElementById('np-bar-fill');
  var npBar = document.getElementById('np-bar');
  var btnPlay = document.getElementById('btn-play');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');
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
      content.innerHTML = '<div class="content-placeholder"><p>Failed to load library. <a href="/login">Login again</a>.</p></div>';
    });

  // ── Render artists sidebar ──

  function renderArtists() {
    var html = '';
    for (var i = 0; i < library.length; i++) {
      html += '<div class="artist-item" data-idx="' + i + '">' + esc(library[i].name) + '</div>';
    }
    sidebar.innerHTML = html;

    sidebar.addEventListener('click', function (e) {
      var item = e.target.closest('.artist-item');
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-idx'), 10);
      selectArtist(idx);
    });
  }

  // ── Select artist → album grid ──

  function selectArtist(idx) {
    currentArtistIdx = idx;
    var artist = library[idx];

    // Highlight sidebar
    var items = sidebar.querySelectorAll('.artist-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', i === idx);
    }

    var html = '<div class="album-grid">';
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

    content.innerHTML = html;

    content.querySelectorAll('.album-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        var ai = parseInt(this.getAttribute('data-artist'), 10);
        var ali = parseInt(this.getAttribute('data-album'), 10);
        selectAlbum(ai, ali);
      });
    });
  }

  // ── Select album → track list ──

  function selectAlbum(ai, ali) {
    currentAlbumIdx = ali;
    var artist = library[ai];
    var album = artist.albums[ali];
    var coverSrc = album.hasCover ? coverUrl(ai, ali) : '';

    // Build queue
    queue = [];
    for (var t = 0; t < album.tracks.length; t++) {
      queue.push({ artistIdx: ai, albumIdx: ali, trackIdx: t });
    }

    var html = '<div class="album-detail">';

    // Back link
    html += '<div class="album-back" data-artist="' + ai + '">&larr; Back to ' + esc(artist.name) + '</div>';

    // Cover
    html += '<div class="album-detail-cover">';
    if (coverSrc) {
      html += '<img src="' + coverSrc + '" alt="' + esc(album.name) + '">';
    }
    html += '</div>';

    // Header info
    html += '<div class="album-detail-header">';
    html += '<div class="album-detail-title">' + esc(album.name) + '</div>';
    html += '<div class="album-detail-meta">' + esc(artist.name) + (album.year ? ' &middot; ' + album.year : '') + ' &middot; ' + album.tracks.length + ' tracks</div>';
    html += '</div>';

    // Tracks
    html += '<div class="track-list">';
    for (var i = 0; i < album.tracks.length; i++) {
      var track = album.tracks[i];
      var isPlaying = currentArtistIdx === ai && currentAlbumIdx === ali && currentTrackIdx === i;
      html += '<div class="track-row' + (isPlaying ? ' playing' : '') + '" data-artist="' + ai + '" data-album="' + ali + '" data-track="' + i + '">';
      html += '<span class="track-num">' + track.number + '</span>';
      html += '<span class="track-title">' + esc(track.title) + '</span>';
      html += '</div>';
    }
    html += '</div></div>';

    content.innerHTML = html;

    // Back button
    content.querySelector('.album-back').addEventListener('click', function () {
      var idx = parseInt(this.getAttribute('data-artist'), 10);
      selectArtist(idx);
    });

    // Track clicks
    content.querySelectorAll('.track-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var ai = parseInt(this.getAttribute('data-artist'), 10);
        var ali = parseInt(this.getAttribute('data-album'), 10);
        var ti = parseInt(this.getAttribute('data-track'), 10);
        playTrack(ai, ali, ti);
      });
    });
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

    // Update now-playing bar
    npTitle.textContent = track.title;
    npArtist.textContent = artist.name + ' — ' + album.name;
    btnPlay.innerHTML = '&#9646;&#9646;';

    if (album.hasCover) {
      npArt.innerHTML = '<img src="' + coverUrl(ai, ali) + '" alt="">';
    } else {
      npArt.innerHTML = '';
    }

    // Highlight current track row
    highlightTrackRow();
  }

  function highlightTrackRow() {
    var rows = content.querySelectorAll('.track-row');
    rows.forEach(function (row) {
      var ai = parseInt(row.getAttribute('data-artist'), 10);
      var ali = parseInt(row.getAttribute('data-album'), 10);
      var ti = parseInt(row.getAttribute('data-track'), 10);
      row.classList.toggle('playing', ai === currentArtistIdx && ali === currentAlbumIdx && ti === currentTrackIdx);
    });
  }

  // ── Audio events ──

  audio.addEventListener('timeupdate', function () {
    npCurrent.textContent = formatTime(audio.currentTime);
    if (audio.duration) {
      npBarFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    }
  });

  audio.addEventListener('loadedmetadata', function () {
    npDuration.textContent = formatTime(audio.duration);
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

  npBar.addEventListener('click', function (e) {
    if (!audio.duration) return;
    var rect = npBar.getBoundingClientRect();
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
    // If more than 3s in, restart current track
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
