const fs = require('fs');
const path = require('path');

function scanLibrary(musicRoot) {
  if (!fs.existsSync(musicRoot)) {
    console.error(`Music root not found: ${musicRoot}`);
    return [];
  }

  const artists = [];

  const artistDirs = fs.readdirSync(musicRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  for (const artistName of artistDirs) {
    const artistPath = path.join(musicRoot, artistName);
    const albums = [];

    const albumDirs = fs.readdirSync(artistPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const albumDir of albumDirs) {
      const albumPath = path.join(artistPath, albumDir);
      const parsed = parseAlbumDir(albumDir, artistName);

      const hasCover = fs.existsSync(path.join(albumPath, 'cover.jpg'));

      const tracks = [];
      const files = fs.readdirSync(albumPath)
        .filter(f => f.toLowerCase().endsWith('.flac'));

      for (const file of files) {
        const track = parseTrackFile(file);
        if (track) {
          track.absolutePath = path.join(albumPath, file);
          tracks.push(track);
        }
      }

      tracks.sort((a, b) => a.number - b.number);

      albums.push({
        name: parsed.name,
        year: parsed.year,
        dirName: albumDir,
        absolutePath: albumPath,
        hasCover,
        tracks,
      });
    }

    albums.sort((a, b) => (a.year || 0) - (b.year || 0));

    if (albums.length > 0) {
      artists.push({
        name: artistName,
        absolutePath: artistPath,
        albums,
      });
    }
  }

  console.log(`Scanned ${artists.length} artists, ${artists.reduce((s, a) => s + a.albums.length, 0)} albums, ${artists.reduce((s, a) => s + a.albums.reduce((t, al) => t + al.tracks.length, 0), 0)} tracks`);
  return artists;
}

function parseAlbumDir(dirName, artistName) {
  // Handle "Artist - Album (Year)" variant: strip leading "Artist - "
  let name = dirName;
  const prefix = artistName + ' - ';
  if (name.startsWith(prefix)) {
    name = name.slice(prefix.length);
  }

  // Extract year from "(YYYY)" at end
  const yearMatch = name.match(/\((\d{4})\)\s*$/);
  let year = null;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    name = name.slice(0, yearMatch.index).trim();
  }

  return { name, year };
}

function parseTrackFile(filename) {
  // Match "01. Title.flac" or "1. Title.flac"
  const match = filename.match(/^(\d+)\.\s+(.+)\.flac$/i);
  if (!match) return null;

  return {
    number: parseInt(match[1], 10),
    title: match[2],
  };
}

function buildClientLibrary(artists) {
  return artists.map((artist, ai) => ({
    idx: ai,
    name: artist.name,
    albums: artist.albums.map((album, ali) => ({
      idx: ali,
      name: album.name,
      year: album.year,
      hasCover: album.hasCover,
      trackCount: album.tracks.length,
      tracks: album.tracks.map((track, ti) => ({
        idx: ti,
        number: track.number,
        title: track.title,
      })),
    })),
  }));
}

function validatePath(resolved, musicRoot) {
  const normalizedRoot = path.resolve(musicRoot) + path.sep;
  const normalizedResolved = path.resolve(resolved);
  return normalizedResolved.startsWith(normalizedRoot);
}

module.exports = { scanLibrary, buildClientLibrary, validatePath };
