#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const target=option('--target','mac');
const buildRoot=path.resolve(option('--output',path.join(root,'Builds.noindex','Film-Space-Lite')));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'film-space-lite-build-'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'native/lite/runtime-lock.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(cmd,args,env={}){const r=spawnSync(cmd,args,{encoding:'utf8',env:{...process.env,...env}});if(r.status!==0)throw new Error(cmd+': '+(r.stderr||r.stdout));return r.stdout.trim();}
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true});}
function runtime(destination){for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','third-party','director-console/vendor/three/LICENSE'])copy(path.join(root,file),path.join(destination,file));for(const file of JSON.parse(fs.readFileSync(path.join(root,'native/lite/product-files.json'),'utf8')))copy(path.join(root,file),path.join(destination,file));copy(path.join(root,'plugins/film-space-lite'),path.join(destination,'plugins/film-space-lite'));copy(path.join(root,'native/lite/runtime-lock.json'),path.join(destination,'runtime-lock.json'));copy(path.join(root,'docs/work/film-space-lite-guide.md'),path.join(destination,'使用说明.md'));}
function manifest(destination,platform){const node=platform==='darwin'?'node/bin/node':'node/node.exe',ffmpeg=platform==='darwin'?'ffmpeg/bin/ffmpeg':'ffmpeg/bin/ffmpeg.exe';const files={};function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,d.name);if(d.isDirectory())walk(f);else if(d.isFile())files[path.relative(destination,f).split(path.sep).join('/')]=hash(f);}}walk(destination);fs.writeFileSync(path.join(destination,'runtime-build.json'),JSON.stringify({format:'film-space-lite-runtime',edition:'lite',builtAt:new Date().toISOString(),platform,arch:platform==='darwin'?'arm64':'x64',node:{version:lock.node.version,executable:node,sha256:hash(path.join(destination,node))},ffmpeg:{version:lock[platform].ffmpeg.version,executable:ffmpeg,sha256:hash(path.join(destination,ffmpeg))},verification:platform==='win32'?'pending Windows 11 validation':'Mac acceptance recorded separately',files},null,2)+'\n');}
fs.mkdirSync(buildRoot,{recursive:true});
try {
 if(['mac','all'].includes(target)){
  const source=option('--mac-runtime','/Applications/Film Space Lite.app/Contents/Resources/runtime');
  for(const [file,expected] of Object.entries(lock.darwin.files))if(hash(path.join(source,file))!==expected)throw new Error('Mac runtime checksum mismatch: '+file);
  const nodeVersion=run(path.join(source,'node/bin/node'),['--version']);if(nodeVersion!==lock.node.version)throw new Error('Node version mismatch');
  const app=path.join(work,'Film Space Lite.app'),contents=path.join(app,'Contents'),destination=path.join(contents,'Resources/runtime');runtime(destination);copy(path.join(source,'node'),path.join(destination,'node'));copy(path.join(source,'ffmpeg'),path.join(destination,'ffmpeg'));
  copy(path.join(root,'launcher/macos-template/FilmSpace.icns'),path.join(contents,'Resources/FilmSpace.icns'));
  fs.mkdirSync(path.join(contents,'MacOS'),{recursive:true});
  fs.writeFileSync(path.join(contents,'Info.plist'),'<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.filmspace.lite</string><key>CFBundleName</key><string>Film Space Lite</string><key>CFBundleDisplayName</key><string>Film Space Lite</string><key>CFBundleExecutable</key><string>FilmSpaceLite</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>CFBundleIconFile</key><string>FilmSpace.icns</string><key>LSMinimumSystemVersion</key><string>12.0</string><key>LSUIElement</key><true/></dict></plist>');
  run('/usr/bin/xcrun',['swiftc','-O','-framework','AppKit',path.join(root,'launcher/lite/FilmSpaceLite.swift'),'-o',path.join(contents,'MacOS/FilmSpaceLite')]);manifest(destination,'darwin');
  run('/usr/bin/codesign',['--force','--deep','--sign','-',app]);
  const zip=path.join(buildRoot,'Film Space Lite.app.zip');run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip]);run('/usr/bin/unzip',['-tq',zip]);console.log(zip);
 }
 if(['windows','all'].includes(target)){
  const downloads=path.resolve(option('--windows-deps','/private/tmp/film-space-lite-downloads'));
  for(const [name,expected] of Object.entries(lock.win32.archives))if(hash(path.join(downloads,name))!==expected)throw new Error('Windows archive checksum mismatch: '+name);
  const destination=path.join(work,'Film Space Lite');runtime(destination);
  for(const file of ['node.exe','LICENSE'])copy(path.join(downloads,'node-win/node-v24.18.0-win-x64',file),path.join(destination,'node',file));
  const ffmpegRoot=path.join(downloads,'ffmpeg-win',fs.readdirSync(path.join(downloads,'ffmpeg-win'))[0]);copy(ffmpegRoot,path.join(destination,'ffmpeg'));
  fs.rmSync(path.join(destination,'ffmpeg/bin/ffplay.exe'));
  const refs=path.join(downloads,'net48/build/.NETFramework/v4.8');const compiler=path.join(downloads,'roslyn/tasks/netcore/bincore/csc.dll');
  run(path.join(downloads,'dotnet/dotnet'),[compiler,'-nologo','-target:winexe','-platform:x64','-optimize+','-deterministic+','-nostdlib+','-out:'+path.join(destination,'Film Space Lite.exe'),...['mscorlib','System','System.Core','System.Windows.Forms','System.Drawing'].map(n=>'-reference:'+path.join(refs,n+'.dll')),path.join(root,'launcher/lite/FilmSpaceLite.cs')],{DOTNET_ROOT:path.join(downloads,'dotnet'),DOTNET_CLI_HOME:work});
  fs.writeFileSync(path.join(destination,'安装到本机.cmd'),'@echo off\r\nchcp 65001 >nul\r\nset "FILM_SPACE_LITE_INSTALL=%LOCALAPPDATA%\\Programs\\Film Space Lite"\r\nrobocopy "%~dp0" "%FILM_SPACE_LITE_INSTALL%" /E >nul\r\nif errorlevel 8 exit /b 1\r\npowershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath(\'Desktop\')+\'\\Film Space Lite.lnk\');$s.TargetPath=$env:FILM_SPACE_LITE_INSTALL+\'\\Film Space Lite.exe\';$s.WorkingDirectory=$env:FILM_SPACE_LITE_INSTALL;$s.Save()"\r\nstart "" "%FILM_SPACE_LITE_INSTALL%\\Film Space Lite.exe"\r\n');
  manifest(destination,'win32');const zip=path.join(buildRoot,'Film Space Lite Windows 11 x64.zip');run('python3',['-c','import sys,pathlib,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],\"w\",zipfile.ZIP_DEFLATED); [z.write(f, f.relative_to(root.parent).as_posix()) for f in sorted(root.rglob(\"*\")) if f.is_file()]; z.close()',destination,zip]);run('/usr/bin/unzip',['-tq',zip]);console.log(zip);
 }
}finally{fs.rmSync(work,{recursive:true,force:true});}
