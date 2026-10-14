import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/director-renderer.js', import.meta.url), 'utf8');
class Element {
  constructor(tagName, scope = null, editable = false) {
    this.tagName = tagName;
    this.scope = scope;
    this.isContentEditable = editable;
  }
  closest() { return this.scope; }
}
const ignore = vm.runInNewContext(
  source.slice(source.indexOf('const planarCameraKeyCodes'), source.indexOf('const precisionCameraKeyCodes'))
  + source.slice(source.indexOf('function shouldIgnoreCameraKey'), source.indexOf('function createCameraTrackPath'))
  + 'shouldIgnoreCameraKey', {HTMLElement: Element}
);
const key = (code, target, modifiers = {}) => ignore({code, target, ...modifiers});

test('view/transport buttons allow camera translation while keeping native navigation keys', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']) {
    assert.equal(key(code, new Element('BUTTON')), false, code);
    assert.equal(key(code, new Element('CANVAS')), false, code);
  }
  for (const code of ['ArrowLeft', 'ArrowUp', 'BracketLeft', 'KeyT']) {
    assert.equal(key(code, new Element('BUTTON')), true, code);
  }
});

test('typing and popup controls never drive camera translation', () => {
  for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) assert.equal(key('KeyW', new Element(tag)), true);
  assert.equal(key('KeyW', new Element('DIV', null, true)), true);
  for (const scope of ['dialog', 'menu', 'listbox']) {
    assert.equal(key('KeyW', new Element('BUTTON', scope)), true);
  }
});

test('system shortcuts remain reserved for all focus targets', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    for (const tag of ['BUTTON', 'CANVAS']) assert.equal(key('KeyW', new Element(tag), {[modifier]: true}), true);
  }
});
