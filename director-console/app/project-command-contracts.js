import { actorPoseParameters, actorPoseInterpolations } from "./actor-pose.js";
import { desktopActions } from "./action-catalog.js";
import {
  cameraApertureMaximum,
  cameraApertureMinimum,
  cameraFocalLengthMaximum,
  cameraFocalLengthMinimum,
  cameraFocusDistanceMaximum,
  cameraFocusDistanceMinimum,
} from "./camera-track.js";
import { clothingColorMaxIndex } from "./project-model.js";

const moveActionIDs = Object.freeze(
  Object.values(desktopActions).filter((action) => action.kind === "move").map((action) => action.id)
);
const holdActionIDs = Object.freeze(
  Object.values(desktopActions).filter((action) => action.kind === "hold").map((action) => action.id)
);
const catalogActionID = (description) => ({
  type: "string",
  pattern: "^[a-z0-9][a-z0-9-]{0,127}$",
  description,
});
const kindCatalogActionID = (kind, packagedIDs, description) => ({ type: "string", enum: packagedIDs, description });

const idReference = (description = "Existing Film Space entity ID.") => ({
  type: "string",
  pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{5,127}$",
  description,
});

const newID = (description = "Optional stable ID for the new entity.") => ({
  type: "string",
  pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{5,127}$",
  description,
});

const text = (description, maximum = 120) => ({
  type: "string",
  minLength: 1,
  maxLength: maximum,
  pattern: "\\S",
  description,
});

const finiteNumber = (description, options = {}) => ({
  type: "number",
  description,
  ...options,
});

const boolean = (description) => ({ type: "boolean", description });

const semanticPatchChange = () => ({
  oneOf: [
    object({
      path: {
        type: "string",
        minLength: 2,
        maxLength: 1000,
        pattern: "^/",
        description: "Stable object-field path using entity-ID segments such as #actor-id.",
      },
      value: {
        description: "JSON value to assign. Entity additions use { index, value }.",
      },
    }, ["path", "value"]),
    object({
      path: {
        type: "string",
        minLength: 2,
        maxLength: 1000,
        pattern: "^/",
        description: "Stable object-field path using entity-ID segments such as #actor-id.",
      },
      delete: { const: true },
    }, ["path", "delete"]),
  ],
});

const vector3 = (description = "World-space XYZ vector in meters.") => object({
  x: finiteNumber("X coordinate in meters.", { minimum: -10000, maximum: 10000 }),
  y: finiteNumber("Y coordinate in meters. Film Space uses Y-up.", { minimum: -10000, maximum: 10000 }),
  z: finiteNumber("Z coordinate in meters.", { minimum: -10000, maximum: 10000 }),
}, ["x", "y", "z"], { description });

const quaternion = (description = "Normalized XYZW quaternion.") => object({
  x: finiteNumber("Quaternion X.", { minimum: -1, maximum: 1 }),
  y: finiteNumber("Quaternion Y.", { minimum: -1, maximum: 1 }),
  z: finiteNumber("Quaternion Z.", { minimum: -1, maximum: 1 }),
  w: finiteNumber("Quaternion W.", { minimum: -1, maximum: 1 }),
}, ["x", "y", "z", "w"], {
  description,
  "x-film-space-normalizedQuaternion": true,
});

const cameraPose = (description = "Complete camera pose and lens.") => object({
  position: vector3("Camera position in world meters."),
  quaternion: quaternion("Camera orientation."),
  focalLength: finiteNumber("Focal length in millimeters.", {
    minimum: cameraFocalLengthMinimum,
    maximum: cameraFocalLengthMaximum,
  }),
  focusDistance: finiteNumber("Optical focus distance from the camera in world meters.", {
    minimum: cameraFocusDistanceMinimum,
    maximum: cameraFocusDistanceMaximum,
  }),
  aperture: finiteNumber("Lens aperture as an f-number.", {
    minimum: cameraApertureMinimum,
    maximum: cameraApertureMaximum,
  }),
}, ["position", "quaternion", "focalLength"], { description });

const cameraAimSharedFields = () => ({
  composition: { type: "string", enum: ["center", "left-third", "right-third"] },
  trackingResponse: finiteNumber("Continuous tracking lag in seconds; zero is exact.", { minimum: 0, maximum: 2 }),
});

const cameraAim = () => ({
  description: "Camera direction-only Look At state. It never changes camera position or focal length.",
  oneOf: [
    object({
      mode: { const: "free" },
    }, ["mode"]),
    object({
      mode: { const: "look-at" },
      targetKind: { const: "actor" },
      targetActorID: idReference("Actor target ID."),
      anchor: { type: "string", enum: ["head", "chest", "pelvis", "ground", "custom"] },
      actorHeight: finiteNumber("Normalized actor height from ground (0) to head (1).", { minimum: 0, maximum: 1 }),
      ...cameraAimSharedFields(),
    }, ["mode", "targetKind", "targetActorID"]),
    object({
      mode: { const: "look-at" },
      targetKind: { const: "world" },
      worldPosition: vector3("Fixed Look At point in world meters."),
      ...cameraAimSharedFields(),
    }, ["mode", "targetKind", "worldPosition"]),
    object({
      mode: { const: "look-at" },
      targetKind: { const: "environment" },
      environmentID: idReference("Visual environment GLB instance ID."),
      localPosition: vector3("Target point in environment-local coordinates; follows instance and group transforms."),
      ...cameraAimSharedFields(),
    }, ["mode", "targetKind", "environmentID", "localPosition"]),
  ],
});

const cameraFollow = () => ({
  description: "Position-only Follow state. Actor rotation never orbits the camera.",
  oneOf: [
    object({
      enabled: { const: false },
    }, ["enabled"]),
    object({
      enabled: { const: true },
      targetActorID: idReference("Actor whose world translation drives the camera."),
      referenceTime: finiteNumber("Shot time used as the translation reference.", { minimum: 0, maximum: 3600 }),
    }, ["enabled", "targetActorID"]),
  ],
});

const cameraFocusTracking = () => ({
  description: "Inherited focus-target state. The evaluated camera keeps the focus plane on the target while either target or camera moves.",
  oneOf: [
    object({
      enabled: { const: false },
    }, ["enabled"]),
    object({
      enabled: { const: true },
      targetKind: { const: "actor" },
      targetActorID: idReference("Actor whose stable body height receives focus."),
      actorHeight: finiteNumber("Normalized actor height from ground (0) to head (1).", { minimum: 0, maximum: 1 }),
    }, ["enabled", "targetKind", "targetActorID", "actorHeight"]),
    object({
      enabled: { const: true },
      targetKind: { const: "blockout" },
      blockoutGroupID: idReference("Owning Blockout group."),
      blockoutObjectID: idReference("Blockout object whose local point receives focus."),
      localPosition: vector3("Target point in Blockout-object local meters."),
    }, ["enabled", "targetKind", "blockoutGroupID", "blockoutObjectID", "localPosition"]),
    object({
      enabled: { const: true },
      targetKind: { const: "environment" },
      environmentID: idReference("Visual-environment instance whose local point receives focus."),
      localPosition: vector3("Target point in visual-environment local meters."),
    }, ["enabled", "targetKind", "environmentID", "localPosition"]),
    object({
      enabled: { const: true },
      targetKind: { const: "world" },
      worldPosition: vector3("Fixed scene point in world meters."),
    }, ["enabled", "targetKind", "worldPosition"]),
  ],
});

const cameraKeyframePose = () => object({
  position: vector3("Camera position in world meters."),
  quaternion: quaternion("Camera orientation."),
  focalLength: finiteNumber("Focal length in millimeters.", {
    minimum: cameraFocalLengthMinimum,
    maximum: cameraFocalLengthMaximum,
  }),
  focusDistance: finiteNumber("Optical focus distance from the camera in world meters.", {
    minimum: cameraFocusDistanceMinimum,
    maximum: cameraFocusDistanceMaximum,
  }),
  aperture: finiteNumber("Lens aperture as an f-number.", {
    minimum: cameraApertureMinimum,
    maximum: cameraApertureMaximum,
  }),
  aim: { anyOf: [cameraAim(), { type: "null" }] },
  follow: { anyOf: [cameraFollow(), { type: "null" }] },
  focusTracking: { anyOf: [cameraFocusTracking(), { type: "null" }] },
}, ["position", "quaternion", "focalLength"], {
  description: "Camera keyframe pose. Aim, Follow, and focus tracking are optional reached-state events.",
});

const handheld = () => object({
  intensity: { type: "string", enum: ["off", "subtle", "standard", "strong"] },
}, ["intensity"], {
  description: "Deterministic Shot-wide handheld modifier.",
});

const depthOfField = () => object({
  enabled: boolean("Whether the Shot renders depth of field."),
}, ["enabled"], {
  description: "Shot-wide depth-of-field enable state; focus distance and aperture remain keyframed camera optics.",
});

const relativePlacementFields = () => ({
  id: idReference("Entity to move."),
  targetID: idReference("Anchor entity."),
  relation: { type: "string", enum: ["left", "right", "front", "behind"] },
  distance: finiteNumber("Positive separation in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
  reference: { type: "string", enum: ["world", "target"], description: "World axes or anchor-local axes." },
  offset: vector3("Additional right/up/forward offset in the selected reference frame."),
  orient: {
    type: "string",
    enum: ["target", "same_direction", "reference_forward", "none"],
    description: "Optional orientation after placement.",
  },
});

const arrangementFields = () => ({
  ids: {
    type: "array",
    minItems: 2,
    maxItems: 100,
    uniqueItems: true,
    items: idReference(),
  },
  layout: { type: "string", enum: ["line", "grid", "circle", "arc"] },
  center: vector3("Formation center in world meters."),
  spacing: finiteNumber("Line or grid spacing in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
  radius: finiteNumber("Circle or arc radius in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
  columns: { type: "integer", minimum: 1, maximum: 100 },
  arcDegrees: finiteNumber("Arc sweep in degrees.", { exclusiveMinimum: 0, maximum: 360 }),
  heading: finiteNumber("Formation heading in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
  facing: { type: "string", enum: ["center", "outward", "same_direction", "none"] },
  targetID: idReference("Optional actor target that overrides formation facing."),
});

const blockoutRelativePlacementFields = () => ({
  ...relativePlacementFields(),
  orient: {
    type: "string",
    enum: ["target", "same_direction", "none"],
    description: "Optional landmark orientation after placement.",
  },
});

const blockoutArrangementFields = () => {
  const fields = arrangementFields();
  delete fields.targetID;
  fields.facing = { type: "string", enum: ["center", "outward", "none"] };
  return fields;
};

const actorPoseSchema = {...object(Object.fromEntries(Object.entries(actorPoseParameters).map(([name,spec])=>[
  name,finiteNumber(`${spec.label}; ${spec.unit === "angle" ? "radians" : spec.unit}. Only specified channels become authored; other channels retain movement and Hold semantics.`,{minimum:spec.min,maximum:spec.max}),
]))),minProperties:1};

const blockingPostureProperties = {
  posture: { type: "string", enum: ["stand", "sit"], description: "Desktop abstract actor Hold posture. Stand and sit share the foot-ground path anchor; seated hips extend behind it. Existing time-based blending keeps feet anchored during sit/stand. Omitted defaults to stand; not valid for Move or ordinary actors." },
  seatHeight: finiteNumber("Seat surface height above the path point in unscaled actor-local meters; abstract Hold only. Defaults to 0.45.", { minimum: 0, maximum: 2 }),
};

const motionPatch = () => object({
  ...blockingPostureProperties,
  actionID: catalogActionID("Action catalog ID valid for the target action kind."),
  speed: finiteNumber("Move speed in meters per second.", { minimum: 0.05, maximum: 20 }),
  locomotionGait: { type: "string", enum: ["walk"] },
  duration: finiteNumber("Stay duration in seconds.", { minimum: 0, maximum: 3600 }),
  
  
  loopBehavior: { type: "string", enum: ["loop"] },
  
  
  facingY: {
    anyOf: [
      finiteNumber("World-Y facing angle in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
      { type: "null" },
    ],
  },
}, [], { minProperties: 1, description: "Patch only fields valid for the target Move or Stay action." });

export const blockoutSurfaceAuthoringGuidance = 'Avoid overlapping visible coplanar surfaces (z-fighting): join adjacent floors, platforms and walls edge to edge. Give decorative overlays real thickness or clear separation. Equal-height surfaces may meet without overlapping. Inspect the viewport after authoring.';

const blockoutPrimitiveFields = () => ({
  id: newID(),
  name: text("Internal geometry-part name."),
  kind: { type: "string", enum: ["box", "sphere", "cylinder", "cone", "torus", "plane", "wedge"] },
  position: vector3("Geometry-part position relative to its semantic object, in meters."),
  rotation: vector3("Primitive XYZ Euler rotation in radians."),
  size: object({
    x: finiteNumber("Local width in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
    y: finiteNumber("Local height in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
    z: finiteNumber("Local depth in meters.", { exclusiveMinimum: 0, maximum: 10000 }),
  }, ["x", "y", "z"]),
  color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  opacity: finiteNumber("Primitive opacity. New geometry defaults to 1 (fully opaque); omitted updates preserve the current value.", { minimum: 0, maximum: 1 }),
  visible: boolean("Visible in editor views."),
  locked: boolean("Protected from authored geometry edits."),
  
  semanticType: text("Stable semantic label such as wall, tower, doorway, or landmark.", 80),
  confidence: finiteNumber("Confidence of reference-image interpretation.", { minimum: 0, maximum: 1 }),
});

const blockoutPrimitive = (requireKind = true) => object(
  Object.fromEntries(Object.entries(blockoutPrimitiveFields()).filter(([key]) => requireKind || key !== "id")),
  requireKind ? ["kind"] : [],
  { minProperties: 1 }
);

const blockoutObjectFields = () => ({
  id: newID(),
  name: text("User-facing semantic object name."),
  image: { anyOf: [object({
    asset: referenceAsset(), position: vector3("Picture center in object-local meters."),
    rotation: vector3("Picture local XYZ Euler rotation in radians."),
    width: finiteNumber("Picture width in meters.", { minimum: 0.001, maximum: 10000 }),
    height: finiteNumber("Picture height in meters.", { minimum: 0.001, maximum: 10000 }),
    crop: object({ x: finiteNumber("Source left fraction.", { minimum: 0, maximum: 0.9999 }),
      y: finiteNumber("Source top fraction.", { minimum: 0, maximum: 0.9999 }),
      width: finiteNumber("Source width fraction.", { minimum: 0.0001, maximum: 1 }),
      height: finiteNumber("Source height fraction.", { minimum: 0.0001, maximum: 1 }) }, ["x", "y", "width", "height"]),
  }, ["asset"]), { type: "null" }], description: "Project-owned picture attached to this object; null removes it. Inherits object visibility, output visibility, opacity and transforms." },
  position: vector3("Object position relative to its owning group, in meters."),
  rotationY: finiteNumber("Object local Y-axis rotation in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
  scale: finiteNumber("Uniform object scale.", { minimum: 0.01, maximum: 1000 }),
  opacity: finiteNumber("Non-destructive object opacity multiplier.", { minimum: 0, maximum: 1 }),
  visible: boolean("Visible in editor views."),
  locked: boolean("Protected from authored object and geometry edits."),
  
  semanticType: text("Stable semantic label such as tent, flag, tower, or landmark.", 80),
  confidence: finiteNumber("Confidence of reference-image interpretation.", { minimum: 0, maximum: 1 }),
  primitives: {
    type: "array",
    minItems: 1,
    maxItems: 500,
    items: blockoutPrimitive(true),
    description: "Internal geometry parts that move, rotate, scale, hide, duplicate, and delete as one object.",
  },
});

const blockoutObjectPatch = () => object(
  Object.fromEntries(
    Object.entries(blockoutObjectFields()).filter(([key]) => !["id", "primitives"].includes(key))
  ),
  [],
  { minProperties: 1 }
);

const blockoutObjectValue = () => object(
  blockoutObjectFields(),
  ["primitives"],
  { minProperties: 1 }
);

const blockoutGroupFields = () => ({
  id: newID(),
  name: text("Semantic landmark group name."),
  position: vector3("Group world position in meters."),
  rotationY: finiteNumber("Group world-Y rotation in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
  scale: finiteNumber("Uniform group scale.", { minimum: 0.01, maximum: 1000 }),
  opacity: finiteNumber("Non-destructive group opacity multiplier.", { minimum: 0, maximum: 1 }),
  visible: boolean("Visible in editor views."),
  locked: boolean("Protected from authored geometry edits."),
  
  semanticType: text("Stable semantic label for the landmark.", 80),
  sourceReferenceID: { ...idReference("Reference image that informed this group."), type: ["string", "null"] },
  objects: {
    type: "array",
    maxItems: 500,
    items: blockoutObjectValue(),
    description: "User-facing semantic objects. Geometry parts stay nested and are not shown in the normal object list.",
  },
});

const glbEnvironmentAsset = () => object({
  ref: text("Project-local environment asset reference.", 300),
  sourceName: text("Original GLB filename.", 240),
  sizeBytes: { type: "integer", minimum: 1, maximum: 256 * 1024 * 1024 },
  checksum: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
}, ["ref", "sourceName", "sizeBytes"]);

const environmentAsset = () => ({
  ...glbEnvironmentAsset(),
});

const referenceAsset = () => object({
  ref: text("Project-local reference-image asset reference.", 300),
  sourceName: text("Original image filename.", 240),
  mimeType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
  width: { type: "integer", minimum: 1, maximum: 32768 },
  height: { type: "integer", minimum: 1, maximum: 32768 },
  sizeBytes: { type: "integer", minimum: 1, maximum: 32 * 1024 * 1024 },
  checksum: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
}, ["ref", "sourceName", "mimeType", "width", "height", "sizeBytes"]);

const editorDefinitions = [
  operation(
    "patch_project_fields",
    "project",
    "Patch project fields",
    "Apply one UI-authored semantic transaction as stable object-field changes. This is the shared editor transport used for conflict replay and UI-only undo.",
    {
      changes: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        items: semanticPatchChange(),
      },
    },
    ["changes"],
  ),
];

const definitions = [
  operation("rename_project", "project", "Rename project", "Rename the current Desktop project.", {
    name: text("New project name.", 120),
  }, ["name"], { name: "夜街预演" }),
  operation("set_frame_rate", "project", "Set frame rate", "Set the shared authored frame grid.", {
    frameRate: { type: "integer", enum: [24, 25, 30, 60] },
  }, ["frameRate"], { frameRate: 30 }),
  operation("set_project_aspect_ratio", "project", "Set project aspect ratio", "Set the default aspect ratio for new Shots. Existing Shots retain their aspect ratios. Output uses a fixed 1080-pixel short edge.", {
    aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "21:9"] },
  }, ["aspectRatio"], {aspectRatio:"9:16"}),
  operation("set_output_folder", "project", "Set output folder", "Set or clear the absolute Desktop output folder.", {
    folder: {
      type: ["string", "null"],
      minLength: 1,
      format: "film-space-absolute-path",
      description: "Absolute local path, or null.",
    },
  }, ["folder"]),
  operation("set_scene_end", "project", "Set Scene End", "Set the fixed scene duration shared by actors and camera playback.", {
    mode: { const: "manual" },
    seconds: finiteNumber("Scene duration in seconds.", { minimum: 0.2, maximum: 3600 }),
  }, ["mode", "seconds"]),
  operation("retime_camera_to_scene_end", "project", "Retime camera to Scene End", "Proportionally retime camera tracks.", {
    seconds: finiteNumber("Optional target duration; defaults to Scene End.", { minimum: 0, maximum: 3600 }),
  }),

  operation("record_actor_pose_keyframe", "actors", "Record actor pose frame", "Create or update a frame on the shared project frame grid. Pose and additive offsetX/Y/Z in meters. Offsets use the sampled Move/Hold heading before rotationYOffset: +X right, +Y up, +Z forward, independent of actor scale. Hold owns stand/sit and leg geometry; Move owns the base path. Record zero offsets at the landing time to blend back from preceding channel keys; optional rotationX/Z=0 restores upright and rotationYOffset=0 restores automatic facing. rotationYOffset is relative to automatic Move/Hold heading; zero keeps automatic facing. Initial facing uses set_actor_transform.rotationY. Unmentioned orientation channels keep automatic movement/Hold behavior.", {
    actorID:idReference("Actor to pose."),time:finiteNumber("Target time in seconds.",{minimum:0,maximum:3600}),pose:actorPoseSchema,
    interpolation:{type:"string",enum:actorPoseInterpolations},
  },["actorID","time","pose"],{actorID:"actor-lead-01",time:2,pose:{torsoPitch:0.6,headPitch:0.3}}),
  operation("update_actor_pose_keyframe", "actors", "Update actor pose frame", "Update specified pose channels at an existing actor frame; preserve its time and ID.", {
    actorID:idReference("Actor."),keyframeID:idReference("Actor frame."),pose:actorPoseSchema,
  },["actorID","keyframeID","pose"]),
  operation("move_actor_pose_keyframes", "actors", "Move actor pose frames", "Move selected frames together on the frame grid. Preserve spacing and prevent overlap with unselected frames; zero-time actor frames may move.", {
    actorID:idReference("Actor."),keyframeIDs:{type:"array",minItems:1,maxItems:200,uniqueItems:true,items:idReference("Actor frame.")},deltaTime:finiteNumber("Requested signed offset in seconds.",{minimum:-3600,maximum:3600}),
  },["actorID","keyframeIDs","deltaTime"]),
  operation("delete_actor_pose_keyframes", "actors", "Delete actor pose frames", "Delete selected actor frames. Deleting all restores automatic movement and Hold poses.", {
    actorID:idReference("Actor."),keyframeIDs:{type:"array",minItems:1,maxItems:200,uniqueItems:true,items:idReference("Actor frame.")},
  },["actorID","keyframeIDs"]),
  operation("set_actor_pose_interpolation", "actors", "Set actor pose transition", "Set interpolation for the actor's pose frames. The interval between frames is the transition duration; scene and movement timing remain authored.", {
    actorID:idReference("Actor."),interpolation:{type:"string",enum:actorPoseInterpolations},
  },["actorID","interpolation"]),
  operation("add_actor", "actors", "Add actor", "Add one Desktop actor at a world transform.", {
    id: newID(),
    position: vector3(),
    rotationY: finiteNumber("World-Y rotation in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
    clothingColorIndex: { type: "integer", minimum: 0, maximum: clothingColorMaxIndex },
    rotationX: finiteNumber("Abstract figure local front/back tilt in radians; rotates around its authored anchor.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
    rotationZ: finiteNumber("Abstract figure local side tilt in radians; adjust position.y for surface contact.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
    blockingColor: { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{6}$", description: "Custom #RRGGBB color for blocking-figure only; null uses the preset clothingColorIndex." },
    characterAssetID: { type: "string", enum: ["blocking-figure"], description: "blocking-figure is a Desktop-only procedural figure: add_move and add_stay without animation choices." },
    scale: finiteNumber("Actor scale.", { minimum: 0.5, maximum: 2 }),
  }, [], {
    id: "actor-lead-01",
    characterAssetID: "blocking-figure",
    blockingColor: "#d97757",
    rotationX: -Math.PI / 2,
    rotationZ: 0,
    position: { x: 0, y: 0.24, z: 0 },
    rotationY: 0,
    clothingColorIndex: 5,
  }),
  operation("duplicate_actor", "actors", "Duplicate actor", "Duplicate one actor with an unlocked visible offset.", {
    id: idReference("Actor to duplicate."),
  }, ["id"]),
  operation("delete_actor", "actors", "Delete actor", "Delete one unlocked actor. ", {
    id: idReference("Actor to delete."),
  }, ["id"]),
  operation("set_actor_visible", "actors", "Set actor visibility", "Show or hide one actor.", {
    id: idReference("Actor to update."),
    visible: boolean("Desired visibility."),
  }, ["id", "visible"]),
  operation("set_actor_locked", "actors", "Set actor lock", "Lock or unlock authored actor edits.", {
    id: idReference("Actor to update."),
    locked: boolean("Desired lock state."),
  }, ["id", "locked"]),
  operation("set_actor_transform", "actors", "Set actor transform", "Set complete actor world position and Y rotation. ", {
    id: idReference("Actor to update."),
    position: vector3(),
    rotationY: finiteNumber("World-Y rotation in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
  }, ["id", "position", "rotationY"]),
  conditionalOperation("set_actor_property", "actors", "Set actor property", "Set one supported actor appearance property.", [
    propertyOperation("clothingColorIndex", {
      type: "integer",
      minimum: 0,
      maximum: clothingColorMaxIndex,
    }),
    propertyOperation("rotationX", finiteNumber("Abstract figure front/back tilt in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 })),
    propertyOperation("rotationZ", finiteNumber("Abstract figure side tilt in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 })),
    propertyOperation("blockingColor", { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{6}$", description: "Custom abstract figure color; null restores its preset. Setting clothingColorIndex clears the custom color." }),
    propertyOperation("characterAssetID", { type: "string", enum: ["blocking-figure"] }),
    propertyOperation("scale", finiteNumber("Actor scale.", { minimum: 0.5, maximum: 2 })),
  ], {
    id: "actor-lead-01",
    key: "clothingColorIndex",
    value: 6,
  }),
  operation("place_actor_relative", "actors", "Place actor relative", "Place one actor using world or target-local directions.", {
    ...relativePlacementFields(),
  }, ["id", "targetID", "relation"], {
    id: "actor-guest-01",
    targetID: "actor-lead-01",
    relation: "right",
    reference: "target",
    distance: 1.5,
    orient: "target",
  }),
  operation("arrange_actors", "actors", "Arrange actors", "Create a deterministic actor formation.", {
    ...arrangementFields(),
  }, ["ids", "layout"]),
  operation("orient_actor_toward", "actors", "Orient actor toward target", "Rotate one actor toward another actor or world point.", {
    id: idReference("Actor to rotate."),
    targetID: idReference("Target actor."),
    targetPosition: vector3("Target world position."),
  }, ["id"], undefined, {
    anyOf: [{ required: ["targetID"] }, { required: ["targetPosition"] }],
  }),
  operation("face_actor_to_next_move", "actors", "Face actor to first Move", "Orient an actor toward its first authored Move target.", {
    id: idReference("Actor to rotate."),
  }, ["id"]),

  operation("add_move", "motion", "Add Move", "Append one Move and its arrival anchor.", {
    actorID: idReference("Owning actor."),
    target: vector3("Move destination in world meters."),
    options: object({
      actionID: kindCatalogActionID(
        "move",
        moveActionIDs,
        "Move-action catalog ID from the current discovery actionCatalog."
      ),
      speed: finiteNumber("Move speed in meters per second.", { minimum: 0.05, maximum: 20 }),
      locomotionGait: { type: "string", enum: ["walk"] },
      
    }),
  }, ["actorID", "target"], {
    actorID: "actor-lead-01",
    target: { x: 2, y: 0, z: -1 },
    options: { actionID: "walk", speed: 0.8, locomotionGait: "walk" },
  }),
  operation("add_stay", "motion", "Add Stay / Perform", "Append one Stay / Perform at the current arrival point.", {
    actorID: idReference("Owning actor."),
    options: object({
      ...blockingPostureProperties,
      actionID: kindCatalogActionID(
        "stay",
        holdActionIDs,
        "Stay-action catalog ID from the current discovery actionCatalog."
      ),
      duration: finiteNumber("Duration in seconds.", { minimum: 0, maximum: 3600 }),
      loopBehavior: { type: "string", enum: ["loop"] },
      facingY: finiteNumber("Optional world-Y facing angle in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
      
    }),
  }, ["actorID"]),
  operation(
    "insert_stay_before",
    "motion",
    "Insert Stay / Perform before",
    "Insert one Stay / Perform immediately before the sole positive-duration action in its Move-delimited point chain while preserving the target action and reflowing intrinsic displacement.",
    {
      actorID: idReference("Owning actor."),
      targetActionID: idReference("Existing sole positive-duration Stay / Perform in its point chain."),
      options: object({
        ...blockingPostureProperties,
        actionID: kindCatalogActionID(
          "stay",
          holdActionIDs,
          "Stay-action catalog ID from the current discovery actionCatalog."
        ),
        duration: finiteNumber("Duration in seconds.", { minimum: 0, maximum: 3600 }),
        loopBehavior: { type: "string", enum: ["loop"] },
        facingY: finiteNumber("Optional world-Y facing angle in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
        
      }),
    },
    ["actorID", "targetActionID"],
    {
      actorID: "actor-lead-01",
      targetActionID: "action-climbing-01",
      options: {
        actionID: "look",
        duration: 1.2,
        loopBehavior: "play_once",
      },
    }
  ),
  
  
  
  
  operation("update_motion_action", "motion", "Update motion action", "Patch fields valid for one existing Move or Stay action. Stay source in/out points preserve playback rate unless duration is supplied explicitly.", {
    actorID: idReference("Owning actor."),
    actionID: idReference("Existing motion action."),
    patch: motionPatch(),
  }, ["actorID", "actionID", "patch"], {
    actorID: "actor-lead-01",
    actionID: "action-wall-flip-01",
    patch: {
      
    },
  }),
  operation("remove_motion_action", "motion", "Remove motion action", "Remove one existing Move or Stay action.", {
    actorID: idReference("Owning actor."),
    actionID: idReference("Motion action to remove."),
  }, ["actorID", "actionID"]),
  operation("clear_motion", "motion", "Clear actor motion", "Remove authored motion while retaining the structural start anchor.", {
    actorID: idReference("Owning actor."),
  }, ["actorID"]),
  operation("move_performance", "motion", "Reorder performance", "Move one Stay / Perform within its shared path point.", {
    actorID: idReference("Owning actor."),
    actionID: idReference("Stay action to reorder."),
    direction: { type: "string", enum: ["up", "down"] },
  }, ["actorID", "actionID", "direction"]),
  operation("set_path_point", "motion", "Set path point", "Move one durable actor path point in world space.", {
    actorID: idReference("Owning actor."),
    pointID: idReference("Path point ID returned by project state."),
    position: vector3(),
  }, ["actorID", "pointID", "position"]),
  operation("face_action_to_next_move", "motion", "Face Stay to next Move", "Orient one Stay / Perform toward the next Move target.", {
    actorID: idReference("Owning actor."),
    actionID: idReference("Stay action to rotate."),
  }, ["actorID", "actionID"]),

  operation("add_camera_setup", "cameras", "Add camera setup", "Add a reusable static Scene-level camera pose and viewfinder aspect.", {
    id: newID(),
    name: text("Camera Setup name."),
    pose: cameraPose(),
    depthOfField: depthOfField(),
    aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "21:9"] },
  }, [], {
    id: "camera-setup-wide-01",
    name: "街口大全景",
    pose: {
      position: { x: 0, y: 2, z: 8 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      focalLength: 28,
    },
    aspectRatio: "21:9",
  }),
  operation("duplicate_camera_setup", "cameras", "Duplicate camera setup", "Duplicate one Camera Setup.", {
    id: idReference("Camera Setup to duplicate."),
  }, ["id"]),
  operation("delete_camera_setup", "cameras", "Delete camera setup", "Delete one Camera Setup while preserving at least one.", {
    id: idReference("Camera Setup to delete."),
  }, ["id"]),
  operation("rename_camera_setup", "cameras", "Rename camera setup", "Rename one Camera Setup.", {
    id: idReference("Camera Setup to rename."),
    name: text("New Camera Setup name."),
  }, ["id", "name"]),
  operation("set_camera_setup_pose", "cameras", "Set camera setup pose", "Set a complete static Camera Setup pose.", {
    id: idReference("Camera Setup to update."),
    pose: cameraPose(),
  }, ["id", "pose"]),
  operation("set_camera_setup_aspect", "cameras", "Set camera setup aspect", "Set the viewfinder aspect stored with one Camera Setup.", {
    id: idReference("Camera Setup to update."),
    aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "21:9"] },
  }, ["id", "aspectRatio"], {
    id: "camera-setup-wide-01",
    aspectRatio: "21:9",
  }),
  operation("set_camera_setup_depth_of_field", "cameras", "Set camera setup depth of field", "Enable or disable depth-of-field preview stored with one Camera Setup.", {
    id: idReference("Camera Setup to update."),
    depthOfField: depthOfField(),
  }, ["id", "depthOfField"], {
    id: "camera-setup-wide-01",
    depthOfField: { enabled: true },
  }),
  operation("add_shot", "cameras", "Add Shot", "Add and activate one authored Shot.", {
    id: newID(),
    name: text("Shot name."),
    aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "21:9"] },
    cameraPose: cameraPose("Optional first camera keyframe."),
    interpolation: { type: "string", enum: ["linear", "ease-in-out", "smooth"] },
    handheld: handheld(),
    depthOfField: depthOfField(),
    follow: cameraFollow(),
  }, [], {
    id: "shot-establishing-01",
    name: "建立镜头",
    aspectRatio: "16:9",
    cameraPose: {
      position: { x: 0, y: 2, z: 8 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      focalLength: 28,
    },
  }),
  operation("duplicate_shot", "cameras", "Duplicate Shot", "Duplicate one Shot including its editable camera track.", {
    id: idReference("Shot to duplicate."),
  }, ["id"]),
  operation("delete_shot", "cameras", "Delete Shot", "Delete one Shot.", {
    id: idReference("Shot to delete."),
  }, ["id"]),
  operation("rename_shot", "cameras", "Rename Shot", "Rename one Shot.", {
    id: idReference("Shot to rename."),
    name: text("New Shot name."),
  }, ["id", "name"]),
  operation("set_active_shot", "cameras", "Set active Shot", "Select the active Shot.", {
    id: idReference("Shot to activate."),
  }, ["id"]),
  operation("set_shot_aspect", "cameras", "Set Shot aspect", "Set one supported Shot aspect ratio.", {
    id: idReference("Shot to update."),
    aspectRatio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "21:9"] },
  }, ["id", "aspectRatio"]),
  operation("set_shot_duration", "cameras", "Set Shot camera duration", "Resize the selected Shot camera track.", {
    id: idReference("Shot to update."),
    duration: finiteNumber("Duration in seconds.", { minimum: 0, maximum: 3600 }),
  }, ["id", "duration"]),
  operation("set_shot_interpolation", "cameras", "Set Shot interpolation", "Set the camera track fallback interpolation.", {
    id: idReference("Shot to update."),
    interpolation: { type: "string", enum: ["linear", "ease-in-out", "smooth"] },
  }, ["id", "interpolation"]),
  operation("set_shot_segment_interpolation", "cameras", "Set camera segment interpolation", "Set interpolation beginning at one camera keyframe.", {
    id: idReference("Shot to update."),
    keyframeID: idReference("Start keyframe of the segment."),
    interpolation: { type: "string", enum: ["linear", "ease-in-out", "smooth"] },
  }, ["id", "keyframeID", "interpolation"]),
  operation("set_shot_handheld", "cameras", "Set Shot handheld", "Set the deterministic Shot-wide handheld modifier.", {
    id: idReference("Shot to update."),
    handheld: handheld(),
  }, ["id", "handheld"]),
  operation("set_shot_depth_of_field", "cameras", "Set Shot depth of field", "Enable or disable Shot-wide depth-of-field rendering.", {
    id: idReference("Shot to update."),
    depthOfField: depthOfField(),
  }, ["id", "depthOfField"], {
    id: "shot-establishing-01",
    depthOfField: { enabled: true },
  }),
  operation("record_camera_keyframe", "cameras", "Record camera keyframe", "Create or replace a camera keyframe on the project frame grid. New frames explicitly capture the current direction state (free or locked); pose.aim overrides that default. Replacing a frame preserves its aim, including manual null inheritance.", {
    shotID: idReference("Owning Shot."),
    pose: cameraKeyframePose(),
    time: finiteNumber("Shot time in seconds.", { minimum: 0, maximum: 3600 }),
    frameRate: { type: "integer", enum: [24, 25, 30, 60] },
  }, ["shotID", "pose", "time"], {
    shotID: "shot-establishing-01",
    time: 0,
    pose: {
      position: { x: 0, y: 2, z: 8 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      focalLength: 28,
      focusDistance: 4.5,
      aperture: 2.8,
    },
  }),
  operation("update_camera_keyframe", "cameras", "Update camera keyframe pose", "Replace position, orientation, focal length, focus distance, and aperture on one camera keyframe.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to update."),
    pose: cameraPose(),
  }, ["shotID", "keyframeID", "pose"]),
  operation("update_camera_keyframe_aim", "cameras", "Update camera Look At", "Set one reached-state camera direction constraint. Direction changes span the preceding explicit aim frame to this frame; null explicitly inherits and removes this direction boundary.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to update."),
    aim: { anyOf: [cameraAim(), { type: "null" }] },
  }, ["shotID", "keyframeID", "aim"], {
    shotID: "shot-establishing-01",
    keyframeID: "camera-key-start-01",
    aim: { mode: "look-at", targetKind: "environment", environmentID: "environment-statue-01", localPosition: { x: 0, y: 1, z: 0 } },
  }),
  operation("update_camera_keyframe_follow", "cameras", "Update camera Follow", "Set or clear one reached-state position Follow constraint.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to update."),
    follow: { anyOf: [cameraFollow(), { type: "null" }] },
  }, ["shotID", "keyframeID", "follow"]),
  operation("update_camera_keyframe_focus_tracking", "cameras", "Update camera focus tracking", "Set or clear one inherited focus-target state.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to update."),
    focusTracking: { anyOf: [cameraFocusTracking(), { type: "null" }] },
  }, ["shotID", "keyframeID", "focusTracking"], {
    shotID: "shot-establishing-01",
    keyframeID: "camera-key-start-01",
    focusTracking: {
      enabled: true,
      targetKind: "actor",
      targetActorID: "actor-lead-01",
      actorHeight: 0.9,
    },
  }),
  operation("move_camera_keyframe", "cameras", "Move camera keyframe", "Move one camera keyframe on the project frame grid.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to move."),
    time: finiteNumber("New Shot time in seconds.", { minimum: 0, maximum: 3600 }),
    frameRate: { type: "integer", enum: [24, 25, 30, 60] },
  }, ["shotID", "keyframeID", "time"]),
  operation("move_camera_keyframes", "cameras", "Move camera keyframes", "Shift selected keyframes by one common frame-quantized offset, preserving their intervals. Stop at unselected neighbors and keep the zero-second key fixed. Scene End is unchanged.", {
    shotID: idReference("Owning Shot."),
    keyframeIDs: { type: "array", items: idReference("Camera keyframe."), minItems: 1, uniqueItems: true },
    deltaTime: finiteNumber("Requested relative shift in seconds.", { minimum: -3600, maximum: 3600 }),
    frameRate: { type: "integer", enum: [24, 25, 30, 60] },
  }, ["shotID", "keyframeIDs", "deltaTime"], {
    shotID: "shot-establishing-01", keyframeIDs: ["camera-key-middle-01", "camera-key-end-01"], deltaTime: 2,
  }),
  operation("delete_camera_keyframes", "cameras", "Delete camera keyframes", "Delete selected keyframes in one operation, keeping the zero-second key fixed.", {
    shotID: idReference("Owning Shot."),
    keyframeIDs: { type: "array", items: idReference("Camera keyframe."), minItems: 1, uniqueItems: true },
  }, ["shotID", "keyframeIDs"], {
    shotID: "shot-establishing-01", keyframeIDs: ["camera-key-middle-01", "camera-key-end-01"],
  }),
  operation("delete_camera_keyframe", "cameras", "Delete camera keyframe", "Delete one camera keyframe.", {
    shotID: idReference("Owning Shot."),
    keyframeID: idReference("Camera keyframe to delete."),
  }, ["shotID", "keyframeID"]),

  operation("set_ground_visible", "scene", "Set ground visibility", "Show or hide scene grid ground consistently in Edit, Export preview, captured frames and MP4.", {
    visible: boolean("Desired ground visibility."),
  }, ["visible"]),
  operation("set_blockout_layer_visible", "scene", "Set Blockout layer visibility", "Show or hide the complete Blockout hierarchy without rewriting child visibility.", {
    visible: boolean("Desired Blockout layer visibility."),
  }, ["visible"]),
  operation("set_blockout_layer_locked", "scene", "Set Blockout layer lock", "Lock or unlock authored changes throughout the Blockout hierarchy.", {
    locked: boolean("Desired Blockout layer lock state."),
  }, ["locked"]),
  operation("set_blockout_layer_opacity", "scene", "Set Blockout layer opacity", "Set the non-destructive opacity multiplier for all Blockout groups. Unlock the layer before changing opacity.", {
    opacity: finiteNumber("Blockout layer opacity multiplier.", { minimum: 0, maximum: 1 }),
  }, ["opacity"]),
  operation("clear_blockout", "scene", "Clear Blockout content", "Delete every Blockout group and object while preserving actors, cameras, Shots, visual-environment assets, and reference images. The desktop UI records this as one undoable change.", {}),
  operation("set_visual_environment_asset", "scene", "Add environment asset", "Attach one already imported project-local GLB asset as a new visual-environment instance.", {
    id: newID("Optional stable ID for the new visual-environment instance."),
    asset: environmentAsset(),
  }, ["asset"], {
    id: "visual-environment-courtyard",
    asset: {
      ref: "project-123456-assets/environment-0123456789abcdef.glb",
      sourceName: "courtyard.glb",
      sizeBytes: 2048,
    },
  }),
  operation("replace_visual_environment_asset", "scene", "Replace environment asset", "Replace one visual-environment instance asset while preserving its authored state.", {
    environmentID: idReference("Visual-environment instance to replace."),
    asset: environmentAsset(),
  }, ["environmentID", "asset"], {
    environmentID: "visual-environment-courtyard",
    asset: {
      ref: "project-123456-assets/environment-fedcba9876543210.glb",
      sourceName: "courtyard-v2.glb",
      sizeBytes: 3072,
    },
  }),
  operation("set_visual_environment_visible", "scene", "Set environment visibility", "Show or hide one visual environment.", {
    environmentID: idReference("Visual-environment instance to update."),
    visible: boolean("Desired environment visibility."),
  }, ["environmentID", "visible"]),
  operation("rename_visual_environment", "scene", "Rename environment", "Rename one GLB instance while preserving its source filename and stable camera references.", {
    environmentID: idReference("Visual-environment instance to rename."),
    name: { type: "string", minLength: 1, maxLength: 80 },
  }, ["environmentID", "name"], { environmentID: "visual-environment-courtyard", name: "庭院雕像" }),
  operation("set_visual_environment_locked", "scene", "Set environment lock", "Lock or unlock authored edits for one visual environment.", {
    environmentID: idReference("Visual-environment instance to update."),
    locked: boolean("Desired environment lock state."),
  }, ["environmentID", "locked"]),
  operation("set_visual_environment_opacity", "scene", "Set environment opacity", "Set one visual environment's opacity.", {
    environmentID: idReference("Visual-environment instance to update."),
    opacity: finiteNumber("Opacity.", { minimum: 0, maximum: 1 }),
  }, ["environmentID", "opacity"]),
  operation("set_visual_environment_material_mode", "scene", "Set environment material mode", "Use imported materials or a non-destructive gray override for one visual environment.", {
    environmentID: idReference("Visual-environment instance to update."),
    materialMode: { type: "string", enum: ["material", "gray"] },
  }, ["environmentID", "materialMode"]),
  operation("set_visual_environment_transform", "scene", "Set environment transform", "Patch one visual environment's transform.", {
    environmentID: idReference("Visual-environment instance to update."),
    transform: object({
      position: vector3("Environment world position in meters."),
      quaternion: quaternion("Environment orientation."),
      uniformScale: finiteNumber("Environment uniform scale.", { minimum: 0.001, maximum: 1000 }),
    }, [], { minProperties: 1 }),
  }, ["environmentID", "transform"]),
  operation("remove_visual_environment", "scene", "Remove visual environment", "Detach one visual-environment instance.", {
    environmentID: idReference("Visual-environment instance to remove."),
  }, ["environmentID"]),
  operation("add_visual_environment_group", "scene", "Add visual-environment group", "Create one non-nested visual-environment group and reparent addressed 3D assets without changing their world poses.", {
    id: newID("Optional stable ID for the new visual-environment group."),
    name: text("User-facing visual-environment group name.", 80),
    environmentIDs: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
      items: idReference("Visual-environment instance to include."),
    },
  }, ["environmentIDs"]),
  operation("update_visual_environment_group", "scene", "Update visual-environment group", "Patch one visual-environment group's name, transform, visibility, or lock.", {
    groupID: idReference("Visual-environment group to update."),
    patch: object({
      name: text("User-facing visual-environment group name.", 80),
      visible: boolean("Desired group visibility without rewriting child visibility."),
      locked: boolean("Desired group lock state."),
      transform: object({
        position: vector3("Group world position in meters."),
        quaternion: quaternion("Group world orientation."),
        uniformScale: finiteNumber("Group uniform scale.", { minimum: 0.001, maximum: 1000 }),
      }, [], { minProperties: 1 }),
    }, [], { minProperties: 1 }),
  }, ["groupID", "patch"]),
  operation("assign_visual_environments_to_group", "scene", "Assign visual environments to group", "Move one or more 3D asset instances into a group, or pass null to ungroup them, while preserving world poses.", {
    environmentIDs: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      uniqueItems: true,
      items: idReference("Visual-environment instance to reparent."),
    },
    groupID: {
      anyOf: [idReference("Target visual-environment group."), { type: "null" }],
    },
  }, ["environmentIDs", "groupID"]),
  operation("dissolve_visual_environment_group", "scene", "Dissolve visual-environment group", "Remove one group while keeping every member asset at its current world pose.", {
    groupID: idReference("Visual-environment group to dissolve."),
  }, ["groupID"]),
  
  
  
  
  
  
  operation("attach_reference_image", "scene", "Attach reference image", "Attach one already imported project-local image as Blockout provenance.", {
    asset: referenceAsset(),
    options: object({
      id: newID(),
      name: text("Reference display name."),
      visible: boolean("Visible in editor UI."),
      locked: boolean("Protected from authored changes."),
      opacity: finiteNumber("Reference opacity.", { minimum: 0.05, maximum: 1 }),
      cameraPose: cameraPose("Camera pose associated with the source image."),
    }),
  }, ["asset"]),
  operation("update_reference_image", "scene", "Update reference image", "Patch presentation or camera provenance for one reference image.", {
    id: idReference("Reference image to update."),
    patch: object({
      name: text("Reference display name."),
      visible: boolean("Visible in editor UI."),
      locked: boolean("Protected from authored changes."),
      opacity: finiteNumber("Reference opacity.", { minimum: 0.05, maximum: 1 }),
      cameraPose: { anyOf: [cameraPose(), { type: "null" }] },
    }, [], { minProperties: 1 }),
  }, ["id", "patch"]),
  operation("remove_reference_image", "scene", "Remove reference image", "Remove one unlocked reference image.", {
    id: idReference("Reference image to remove."),
  }, ["id"]),
  operation("add_blockout_group", "scene", "Add Blockout group", `Add one semantic landmark group. ${blockoutSurfaceAuthoringGuidance}`, {
    ...blockoutGroupFields(),
  }, [], {
    id: "landmark-clocktower-01",
    name: "钟楼",
    semanticType: "landmark",
    position: { x: 0, y: 0, z: 0 },
  }),
  operation("update_blockout_group", "scene", "Update Blockout group", `Patch one semantic landmark group. ${blockoutSurfaceAuthoringGuidance}`, {
    id: idReference("Blockout group to update."),
    patch: object({
      name: text("Semantic landmark group name."),
      position: vector3("Group world position in meters."),
      rotationY: finiteNumber("Group world-Y rotation in radians.", { minimum: -Math.PI * 2, maximum: Math.PI * 2 }),
      scale: finiteNumber("Uniform group scale.", { minimum: 0.01, maximum: 1000 }),
      opacity: finiteNumber("Non-destructive group opacity multiplier.", { minimum: 0, maximum: 1 }),
      visible: boolean("Visible in editor views."),
      locked: boolean("Protected from authored geometry edits."),
      
      semanticType: text("Stable semantic landmark label.", 80),
    }, [], { minProperties: 1 }),
  }, ["id", "patch"]),
  operation("duplicate_blockout_group", "scene", "Duplicate Blockout group", "Duplicate one semantic landmark group.", {
    id: idReference("Blockout group to duplicate."),
  }, ["id"]),
  operation("delete_blockout_group", "scene", "Delete Blockout group", "Delete one unlocked semantic landmark group.", {
    id: idReference("Blockout group to delete."),
  }, ["id"]),
  operation("add_blockout_object", "scene", "Add Blockout object", `Add one user-facing semantic object. Put every shape that must move as one thing in its primitives array. ${blockoutSurfaceAuthoringGuidance}`, {
    groupID: idReference("Owning Blockout group."),
    ...blockoutObjectFields(),
  }, ["groupID", "primitives"], {
    groupID: "landmark-clocktower-01",
    id: "clocktower-object-01",
    name: "钟楼",
    semanticType: "tower",
    position: { x: 0, y: 0, z: 0 },
    primitives: [
      {
        id: "primitive-tower-body-01",
        name: "塔身",
        kind: "box",
        position: { x: 0, y: 3.5, z: 0 },
        size: { x: 2, y: 7, z: 2 },
        semanticType: "tower-body",
        opacity: 1,
      },
    ],
  }),
  operation("update_blockout_object", "scene", "Update Blockout object", `Patch one user-facing semantic object transform, name, visibility, lock, or appearance. ${blockoutSurfaceAuthoringGuidance}`, {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Semantic object to update."),
    patch: blockoutObjectPatch(),
  }, ["groupID", "objectID", "patch"], {
    groupID: "hall-doors", objectID: "wolf-door",
    patch: { image: {
      asset: { ref: "project-demo-assets/reference-wolf.png", sourceName: "wolf.png", mimeType: "image/png", width: 940, height: 1672, sizeBytes: 102400 },
      position: { x: 0, y: 1.09, z: 0.042 }, rotation: { x: 0, y: 0, z: 0 },
      width: 1.05, height: 2.18, crop: { x: 0, y: 0, width: 1, height: 1 },
    } },
  }),
  operation("duplicate_blockout_object", "scene", "Duplicate Blockout object", "Duplicate one semantic object and all of its internal geometry parts.", {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Semantic object to duplicate."),
  }, ["groupID", "objectID"]),
  operation("delete_blockout_object", "scene", "Delete Blockout object", "Delete one unlocked semantic object and all of its internal geometry parts.", {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Semantic object to delete."),
  }, ["groupID", "objectID"]),
  operation("add_blockout_primitive", "scene", "Add Blockout geometry part", `Advanced geometry editing: add one internal part to an object. When objectID is omitted for legacy compatibility, Film Space wraps the primitive in a new semantic object. ${blockoutSurfaceAuthoringGuidance}`, {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Owning semantic object. Omit only for legacy one-primitive object creation."),
    ...blockoutPrimitiveFields(),
  }, ["groupID", "kind"]),
  operation("update_blockout_primitive", "scene", "Update Blockout geometry part", `Advanced geometry editing: patch one internal geometry part without changing its semantic object. ${blockoutSurfaceAuthoringGuidance}`, {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Owning semantic object. Optional for legacy ID lookup."),
    primitiveID: idReference("Geometry part to update."),
    patch: blockoutPrimitive(false),
  }, ["groupID", "primitiveID", "patch"]),
  operation("duplicate_blockout_primitive", "scene", "Duplicate Blockout geometry part", "Advanced geometry editing: duplicate one internal geometry part.", {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Owning semantic object. Optional for legacy ID lookup."),
    primitiveID: idReference("Geometry part to duplicate."),
  }, ["groupID", "primitiveID"]),
  operation("delete_blockout_primitive", "scene", "Delete Blockout geometry part", "Advanced geometry editing: delete one unlocked internal geometry part.", {
    groupID: idReference("Owning Blockout group."),
    objectID: idReference("Owning semantic object. Optional for legacy ID lookup."),
    primitiveID: idReference("Geometry part to delete."),
  }, ["groupID", "primitiveID"]),
  operation("place_blockout_relative", "scene", "Place Blockout group relative", "Place one landmark using world or target-local directions.", {
    ...blockoutRelativePlacementFields(),
  }, ["id", "targetID", "relation"]),
  operation("arrange_blockout_groups", "scene", "Arrange Blockout groups", "Create a deterministic landmark formation.", {
    ...blockoutArrangementFields(),
  }, ["ids", "layout"]),
];

export const filmSpaceOperationDefinitions = Object.freeze(Object.fromEntries(
  definitions.map((definition) => [definition.action, Object.freeze(definition)])
));

export const filmSpaceOperationActions = Object.freeze(definitions.map((definition) => definition.action));

export const filmSpaceEditorOperationDefinitions = Object.freeze(Object.fromEntries(
  editorDefinitions.map((definition) => [definition.action, Object.freeze(definition)])
));

export const filmSpaceEditorOperationActions = Object.freeze(
  editorDefinitions.map((definition) => definition.action),
);

export const filmSpaceCommandDefinitions = Object.freeze({
  ...filmSpaceEditorOperationDefinitions,
  ...filmSpaceOperationDefinitions,
});

export const filmSpaceOperationDomains = Object.freeze(Object.fromEntries(
  ["project", "actors", "motion", "cameras", "scene"].map((domain) => [
    domain,
    Object.freeze(definitions.filter((definition) => definition.domain === domain).map((definition) => definition.action)),
  ])
));

export const filmSpaceOperationContracts = Object.freeze(Object.fromEntries(
  definitions.map((definition) => [definition.action, definition.summary])
));

export function filmSpaceOperationBatchSchema(domain = null) {
  const actions = domain ? filmSpaceOperationDomains[domain] : filmSpaceOperationActions;
  if (!actions) throw new Error(`Unknown Film Space operation domain: ${domain}`);
  return {
    type: "array",
    minItems: 1,
    maxItems: 200,
    items: {
      oneOf: actions.map((action) => filmSpaceOperationDefinitions[action].inputSchema),
    },
  };
}

export function validateFilmSpaceOperation(operation, allowedActions = filmSpaceOperationActions) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw contractError("operation must be an object");
  }
  const action = typeof operation.action === "string" ? operation.action : "";
  if (!allowedActions.includes(action)) {
    throw contractError(`unsupported action ${action || "(missing)"}`);
  }
  const definition = filmSpaceCommandDefinitions[action];
  const errors = validateSchema(definition.inputSchema, operation, "$");
  if (errors.length) {
    throw contractError(`${action}: ${errors[0]}`);
  }
  return definition;
}

function operation(action, domain, title, description, properties = {}, required = [], example, schemaOptions = {}) {
  const inputSchema = object({
    action: { const: action, description: `Must be "${action}".` },
    ...properties,
  }, ["action", ...required], schemaOptions);
  return {
    action,
    domain,
    title,
    description,
    summary: compactContract(inputSchema),
    inputSchema,
    ...(example ? { example: { action, ...example } } : {}),
  };
}

function conditionalOperation(action, domain, title, description, alternatives, example) {
  return {
    action,
    domain,
    title,
    description,
    summary: alternatives.map(compactContract).join(" | "),
    inputSchema: { oneOf: alternatives },
    ...(example ? { example: { action, ...example } } : {}),
  };
}

function propertyOperation(key, valueSchema) {
  return object({
    action: { const: "set_actor_property" },
    id: idReference("Actor to update."),
    key: { const: key },
    value: valueSchema,
  }, ["action", "id", "key", "value"]);
}

function object(properties, required = [], options = {}) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
    ...options,
  };
}

function compactContract(schema) {
  if (schema.oneOf) return schema.oneOf.map(compactContract).join(" | ");
  const required = new Set(schema.required || []);
  const fields = Object.entries(schema.properties || {})
    .filter(([key]) => key !== "action")
    .map(([key, value]) => `${key}${required.has(key) ? "" : "?"}${compactType(value)}`);
  return `{ ${fields.join(", ")} }`;
}

function compactType(schema) {
  if (schema.const !== undefined) return `=${JSON.stringify(schema.const)}`;
  if (schema.enum) return `:${schema.enum.join("|")}`;
  if (schema.oneOf || schema.anyOf) return ":union";
  if (schema.type === "array") return ":[]";
  if (schema.type === "object") return ":{…}";
  if (Array.isArray(schema.type)) return `:${schema.type.join("|")}`;
  return schema.type ? `:${schema.type}` : "";
}

function validateSchema(schema, value, path) {
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validateSchema(candidate, value, path).length === 0);
    return matches.length === 1 ? [] : [`${path} must match exactly one supported shape`];
  }
  if (schema.anyOf && !schema.type && !schema.properties) {
    const matches = schema.anyOf.some((candidate) => validateSchema(candidate, value, path).length === 0);
    return matches ? [] : [`${path} must match one supported shape`];
  }
  if (schema.const !== undefined && value !== schema.const) {
    return [`${path} must equal ${JSON.stringify(schema.const)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`];
  }
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length && !allowedTypes.some((type) => matchesType(type, value))) {
    return [`${path} must be ${allowedTypes.join(" or ")}`];
  }
  if (value == null) return [];
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      return [`${path} must contain at least ${schema.minLength} character(s)`];
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      return [`${path} must contain at most ${schema.maxLength} character(s)`];
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      return [`${path} has an invalid format`];
    }
    if (schema.format === "film-space-absolute-path" && !isAbsoluteLocalPath(value)) {
      return [`${path} must be an absolute local path`];
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return [`${path} must be finite`];
    if (schema.minimum !== undefined && value < schema.minimum) return [`${path} must be >= ${schema.minimum}`];
    if (schema.maximum !== undefined && value > schema.maximum) return [`${path} must be <= ${schema.maximum}`];
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      return [`${path} must be > ${schema.exclusiveMinimum}`];
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      return [`${path} must be < ${schema.exclusiveMaximum}`];
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return [`${path} requires at least ${schema.minItems} item(s)`];
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return [`${path} allows at most ${schema.maxItems} item(s)`];
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) {
      return [`${path} must contain unique items`];
    }
    for (let index = 0; index < value.length; index += 1) {
      const errors = validateSchema(schema.items || {}, value[index], `${path}[${index}]`);
      if (errors.length) return errors;
    }
  }
  if (matchesType("object", value)) {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) return [`${path}.${key} is required`];
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      return [`${path} requires at least ${schema.minProperties} field(s)`];
    }
    if (schema.additionalProperties === false) {
      const unsupported = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (unsupported) return [`${path}.${unsupported} is not supported`];
    }
    for (const [key, child] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      const errors = validateSchema(child, value[key], `${path}.${key}`);
      if (errors.length) return errors;
    }
    if (schema["x-film-space-normalizedQuaternion"] === true) {
      const length = Math.hypot(value.x, value.y, value.z, value.w);
      if (Math.abs(length - 1) > 0.001) return [`${path} must be a normalized quaternion`];
    }
    for (const condition of schema.anyOf || []) {
      const errors = validateSchema(condition, value, path);
      if (!errors.length) return [];
    }
    if (schema.anyOf?.length) return [`${path} must include one supported target field`];
  }
  return [];
}

function matchesType(type, value) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function isAbsoluteLocalPath(value) {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function contractError(message) {
  const error = new Error(`Invalid Film Space operation contract: ${message}`);
  error.statusCode = 400;
  error.code = "FILM_SPACE_OPERATION_CONTRACT";
  error.recovery = "Call get_film_space_operation_schema for the rejected action, then retry with only supported fields.";
  return error;
}
