// Explicit, read-only-source migration. Existing destination files are never replaced.
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const [sourceArg, folderArg] = process.argv.slice(2);
  if (!sourceArg || !folderArg) throw new Error('Usage: node scripts/migrate-local-data.cjs <old-data-directory> <portable-folder>');
  const source = path.resolve(sourceArg), folder = path.resolve(folderArg), destination = path.join(folder, 'data');
  if (source === destination || destination.startsWith(source + path.sep)) throw new Error('Source and destination must be separate');
  await fs.access(path.join(folder, 'RecallMate.exe'));
  const copied = [], unchanged = [];
  for (const category of ['banks', 'backups']) {
    const directory = path.join(source, category);
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await fs.mkdir(path.join(destination, category), { recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/^[0-9a-f-]{36}\.json(?:\.bak|\.corrupt-\d+)?$/i.test(entry.name)) continue;
      const relative = path.join(category, entry.name), target = path.join(destination, relative);
      const bytes = await fs.readFile(path.join(source, relative));
      try {
        const existing = await fs.readFile(target);
        if (!existing.equals(bytes)) throw new Error(`Destination already contains a different file: ${relative}`);
        unchanged.push(relative);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.writeFile(target, bytes, { flag: 'wx', flush: true }); copied.push(relative);
      }
    }
  }
  for (const name of ['app-settings.json', 'app-settings.json.bak']) {
    let bytes;
    try { bytes = await fs.readFile(path.join(source, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const target = path.join(destination, name);
    try { const existing = await fs.readFile(target); if (!existing.equals(bytes)) throw new Error('Destination contains different font preferences: ' + name); unchanged.push(name); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await fs.writeFile(target, bytes, { flag: 'wx', flush: true }); copied.push(name); }
  }
  await fs.writeFile(path.join(destination, 'migration.json'), JSON.stringify({ migratedAt: new Date().toISOString(), copied, unchanged, sourceRetained: true }, null, 2));
  console.log(JSON.stringify({ copied: copied.length, unchanged: unchanged.length, destination, sourceRetained: true }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
