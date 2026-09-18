const fs = require('node:fs');

// lstat never opens file contents or follows a final symlink. This is NOT a content fingerprint.
function fileMetadata(file) {
  try {
    const stat = fs.lstatSync(file, { bigint: true });
    return Object.fromEntries(['size', 'mtimeNs', 'ctimeNs', 'ino', 'dev', 'mode'].map(key => [key, String(stat[key])]));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
module.exports = { fileMetadata };
