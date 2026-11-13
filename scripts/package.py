from pathlib import Path
import json, zipfile, hashlib

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
assert 'host_permissions' not in manifest
assert set(manifest['permissions']) == {'activeTab', 'scripting', 'storage', 'downloads'}
assert 'optional_host_permissions' not in manifest
files = [root / 'manifest.json', root / 'docs/privacy.html']
for folder in ['background', 'content', 'capture',  'ui', 'popup', 'options', 'result', '_locales', 'icons']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and p.suffix in {'.js', '.html', '.css', '.json', '.png', '.svg'})
dist = root / 'dist'
dist.mkdir(exist_ok=True)
name = f"CaptureSok-{manifest['version']}"
archive = dist / f'{name}.zip'
unpacked = dist / name
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for file in sorted(files):
        relative = file.relative_to(root)
        bundle.write(file, relative.as_posix())
        target = unpacked / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file.read_bytes())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert 'manifest.json' in bundle.namelist()
    assert not any(x.startswith(('tests/', 'node_modules/', 'scripts/')) for x in bundle.namelist())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(dist / f'{name}.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
(dist / 'FILES.txt').write_text('\n'.join(str(p.relative_to(root)).replace('\\', '/') for p in sorted(files)), encoding='utf-8')
print(f'{archive}\n{len(files)} runtime files, {archive.stat().st_size} bytes\nSHA256 {digest}')
