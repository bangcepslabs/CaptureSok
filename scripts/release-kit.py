from pathlib import Path
import zipfile, json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['version']
report = json.loads((root / 'test-results/report.json').read_text(encoding='utf-8'))
assert report['results'] and all(r['passed'] for r in report['results'])
smoke = json.loads((root / 'test-results/package-smoke.json').read_text(encoding='utf-8'))
assert smoke['passed']
archive = root / f'dist/CaptureSok-{version}-release-kit.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for file in [root / f'dist/CaptureSok-{version}.zip', root / f'dist/CaptureSok-{version}.sha256', root / 'test-results/report.json', root / 'test-results/package-smoke.json']:
        bundle.write(file, file.relative_to(root).as_posix())
    bundle.write(root / 'README.md', 'README.md')
    for folder in ['docs', 'store-assets']:
        for file in (root / folder).rglob('*'):
            if file.is_file():
                bundle.write(file, file.relative_to(root).as_posix())
    bundle.writestr('START-HERE.txt', f'CaptureSok {version} release candidate\n\nUpload dist/CaptureSok-{version}.zip to Chrome Web Store; do not upload this release-kit ZIP.\nRead README.md before publishing.\nStore images: store-assets/\nDeveloper label: bangcepslabs\nContact: bum2432@gmail.com. Verify the public privacy URL and native activeTab behavior before submission.\n')
print(archive)
