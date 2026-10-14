#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(os.homedir(), '.codex/secrets/film-space-lite-updates.env');
const keyFile = path.join(root, 'native/lite/update-public-key.json');
if (process.argv.includes('--init-key')) {
  if (fs.existsSync(envFile) || fs.existsSync(keyFile)) throw new Error('Signing identity already exists; do not replace it.');
  const {privateKey, publicKey} = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(envFile), {recursive: true, mode: 0o700});
  fs.writeFileSync(envFile, 'FILM_SPACE_UPDATE_PRIVATE_KEY_BASE64=' + privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64') + '\n', {mode: 0o600, flag: 'wx'});
  fs.writeFileSync(keyFile, JSON.stringify({algorithm: 'Ed25519', publicKey: publicKey.export({format: 'pem', type: 'spki'})}, null, 2) + '\n');
  console.log('Update signing identity created. Private key stays in ' + envFile);
} else {
  const directory = path.resolve(process.argv[2] || path.join(root, 'Builds.noindex/Film-Space-Lite'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'native/lite/version.json'), 'utf8'));
  const key = fs.readFileSync(envFile, 'utf8').trim().slice('FILM_SPACE_UPDATE_PRIVATE_KEY_BASE64='.length);
  const privateKey = crypto.createPrivateKey({key: Buffer.from(key, 'base64'), format: 'der', type: 'pkcs8'});
  const publicKey = JSON.parse(fs.readFileSync(keyFile, 'utf8')).publicKey;
  const platforms = {};
  for (const [platform, name] of Object.entries({darwin: 'Film.Space.Lite.app.zip', win32: 'Film.Space.Lite.Windows.11.x64.zip'})) {
    const file = path.join(directory, name);
    const bytes = fs.readFileSync(file);
    platforms[platform] = {name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  const payload = Buffer.from(JSON.stringify({product: 'film-space-lite', ...version, platforms}));
  const signature = crypto.sign(null, payload, privateKey);
  if (!crypto.verify(null, payload, publicKey, signature)) throw new Error('Signing key does not match the bundled public key.');
  fs.writeFileSync(path.join(directory, 'update-manifest.json'), JSON.stringify({payload: payload.toString('base64'), signature: signature.toString('base64')}) + '\n');
  console.log('Signed update manifest for ' + version.version);
}
