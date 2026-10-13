export function outputAssetDependencies(project) {
  const groups = new Map(project.scene.environment.groups.map(group => [group.id, group]));
  const visuals = project.scene.environment.visuals.filter(visual => visual.visible !== false && groups.get(visual.groupID)?.visible !== false);
  return { visuals, characterIDs: [], motionIDs: [] };
}
