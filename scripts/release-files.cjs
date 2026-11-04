const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function verifyCopy(source, destination) {
  const manifest = [];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        const original = await fs.readFile(path.join(source, child));
        const copy = await fs.readFile(path.join(destination, child));
        const digest = bytes => createHash('sha256').update(bytes).digest('hex');
        const sha256 = digest(original);
        if (sha256 !== digest(copy)) throw new Error(`Data backup verification failed: ${child}`);
        manifest.push({ path: child, bytes: original.length, sha256 });
      } else throw new Error(`Unexpected data entry: ${child}`);
    }
  }
  await walk('');
  return manifest;
}

function inside(parent, target) {
  const boundary = path.resolve(parent), checked = path.resolve(target);
  if (!checked.startsWith(boundary + path.sep)) throw new Error(`Refusing path outside ${boundary}: ${checked}`);
  return checked;
}

function managedName(name) {
  if (['win-unpacked', 'latest.yml', 'SHA256SUMS.txt'].includes(name)) return true;
  return /^RecallMate-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-(?:Portable(?:\.zip|\.exe)?|Setup\.exe(?:\.blockmap)?|SHA256SUMS\.txt)$/.test(name);
}

async function inspectRelease(workspace, release) {
  const workspaceReal = await fs.realpath(workspace);
  inside(workspaceReal, await fs.realpath(release));
  const allEntries = await fs.readdir(release, { withFileTypes: true });
  const entries = [];
  for (const entry of allEntries) {
    if (entry.name === 'android' && entry.isDirectory()) {
      const target = inside(release, path.join(release, entry.name));
      if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Refusing linked Android distribution directory');
      inside(release, await fs.realpath(target));
      continue;
    }
    entries.push(entry);
  }
  for (const entry of entries) {
    if (!managedName(entry.name)) throw new Error(`Unrecognized release file; retained without modification: ${entry.name}`);
    const checked = inside(release, path.join(release, entry.name));
    if ((await fs.lstat(checked)).isSymbolicLink()) throw new Error(`Refusing to clean linked release entry: ${entry.name}`);
    inside(release, await fs.realpath(checked));
  }
  return entries;
}

async function backupReleaseData(workspace, release, entries) {
  const backups = [];
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const source = inside(release, path.join(release, entry.name, 'data'));
    try {
      const info = await fs.lstat(source);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Unexpected data path: ${source}`);
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    inside(release, await fs.realpath(source));
    const parent = inside(workspace, path.join(workspace, '.cache', 'release-data-backups'));
    await fs.mkdir(parent, { recursive: true });
    const directory = await fs.mkdtemp(path.join(parent, `${entry.name}-`));
    await fs.cp(source, path.join(directory, 'data'), { recursive: true, force: false, errorOnExist: true });
    const manifest = await verifyCopy(source, path.join(directory, 'data'));
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', flush: true });
    backups.push({ from: source, to: path.join(directory, 'data') });
  }
  return backups;
}

async function removeReleaseEntries(release, entries) {
  for (const entry of entries) {
    const target = inside(release, path.join(release, entry.name));
    // Recheck the final absolute path immediately before recursive removal.
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error(`Refusing linked deletion: ${target}`);
    inside(release, await fs.realpath(target));
    await fs.rm(target, { recursive: entry.isDirectory(), force: false });
  }
}
module.exports = { inside, managedName, inspectRelease, backupReleaseData, removeReleaseEntries, verifyCopy };
