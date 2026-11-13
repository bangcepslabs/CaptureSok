import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(await fs.readFile('manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert.equal(manifest.version,'1.1.0');assert.deepEqual([...manifest.permissions].sort(),['activeTab','downloads','scripting','storage']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.optional_host_permissions,undefined);
const locales={};for(const lang of ['ko','en'])locales[lang]=JSON.parse(await fs.readFile(`_locales/${lang}/messages.json`,'utf8'));
assert.deepEqual(Object.keys(locales.ko).sort(),Object.keys(locales.en).sort());
for(const value of Object.values(locales.en))assert.ok(value.message);
for(const target of [...Object.values(manifest.icons),manifest.background.service_worker,manifest.action.default_popup,manifest.options_page])await fs.access(target);
for(const match of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g))assert.ok(locales.ko[match[1]],match[1]);
let count=0;
for(const dir of ['background','content','capture','ui','popup','options','result']){
 for(const name of await fs.readdir(dir)){
  const file=path.join(dir,name),source=await fs.readFile(file,'utf8');
  if(name.endsWith('.js')){execFileSync(process.execPath,['--check',file]);count++;assert.ok(!/\beval\s*\(|new Function\s*\(/.test(source));}
  if(name.endsWith('.html')){
   for(const m of source.matchAll(/(?:src|href)="([^"]+)"/g)){if(!m[1].startsWith('#'))await fs.access(path.resolve(dir,m[1]));}
   for(const m of source.matchAll(/data-(?:i18n|label)="([^"]+)"/g))assert.ok(locales.ko[m[1]],`${file}: ${m[1]}`);
   assert.ok(!/<script(?![^>]*src=)[^>]*>\s*\S/.test(source),'Inline script in '+file);
  }
  for(const m of source.matchAll(/from ['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))await fs.access(path.resolve(dir,m[1]));
 }
}
console.log(`PASS manifest, least-privilege permissions, ${count} scripts, locales, asset and module paths`);
