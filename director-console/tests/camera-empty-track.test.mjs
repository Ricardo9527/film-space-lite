import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createCameraTrack,cameraTrackReady,cameraTrackDuration} from '../app/camera-track.js';
test('empty camera tracks remain empty across normalization',()=>{const track=createCameraTrack();assert.deepEqual(track.keyframes,[]);assert.deepEqual(createCameraTrack(track),track);assert.equal(cameraTrackReady(track),false);assert.equal(cameraTrackDuration(track),0);});
