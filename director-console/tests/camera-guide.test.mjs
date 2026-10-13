import test from "node:test";
import assert from "node:assert/strict";

import {
  authoredCameraPositionFromGuide,
  evaluatedCameraGuideTrack,
} from "../app/camera-guide.js";
import {
  addActor,
  addMoveAction,
  addShot,
  createDesktopProject,
  findShot,
  recordShotCameraKeyframe,
} from "../app/project-model.js";
import { sampleProject } from "../app/playback-engine.js";

const cameraPose = {
  position: { x: 0, y: 2, z: -4 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  focalLength: 35,
};

function followedProject() {
  let project = addActor(createDesktopProject(), {
    id: "actor-1",
    position: { x: 0, y: 0, z: 0 },
  });
  project = addMoveAction(project, "actor-1", { x: 6, y: 0, z: 0 }, { speed: 1 });
  project = addShot(project, { cameraPose, follow: {
    enabled: true,
    targetActorID: "actor-1",
    referenceTime: 0,
  } });
  return project;
}

test("Scene camera guide shows the final Follow trajectory", () => {
  const project = followedProject();
  const guide = evaluatedCameraGuideTrack(project, findShot(project));

  assert.deepEqual(guide.start.position, cameraPose.position);
  assert.deepEqual(guide.end.position, { ...cameraPose.position, x: 6 });
  assert.ok(guide.pathPoses.length > 2);
});

test("dragging an evaluated Follow marker converts back to authored camera position", () => {
  let project = followedProject();
  const shotID = findShot(project).id;
  project = recordShotCameraKeyframe(project, shotID, cameraPose, 4, 30);
  const shot = findShot(project);
  const keyframe = shot.camera.track.keyframes.at(-1);
  const guide = evaluatedCameraGuideTrack(project, shot);
  const evaluatedKeyframe = guide.keyframes.find((candidate) => candidate.id === keyframe.id);

  assert.deepEqual(evaluatedKeyframe.position, {
    ...cameraPose.position,
    x: sampleProject(project, 4).get("actor-1").position.x,
  });
  assert.deepEqual(
    authoredCameraPositionFromGuide(project, shot, keyframe, evaluatedKeyframe.position),
    cameraPose.position
  );
});
