export const objectPoseChannels=Object.freeze(['offsetX','offsetY','offsetZ','rotationYOffset','rotationX','rotationZ']);
export function rotateXYZ(point,rotation){
 const cz=Math.cos(rotation.z),sz=Math.sin(rotation.z),cy=Math.cos(rotation.y),sy=Math.sin(rotation.y),cx=Math.cos(rotation.x),sx=Math.sin(rotation.x);
 const x=point.x*cz-point.y*sz,y=point.x*sz+point.y*cz;
 const xx=x*cy+point.z*sy,z=-x*sy+point.z*cy;
 return {x:xx,y:y*cx-z*sx,z:y*sx+z*cx};
}
export function movableObjectBounds(object){
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};let count=0;
 for(const part of object.primitives){
  if(!part.visible)continue;
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of part.kind==='plane'?[0]:[-.5,.5]){
   const point=rotateXYZ({x:x*part.size.x,y:y*part.size.y,z:z*part.size.z},part.rotation);
   for(const axis of ['x','y','z']){const value=point[axis]+part.position[axis];min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}count++;
  }
 }
 return count?{min,max}:{min:{x:0,y:0,z:0},max:{x:0,y:0,z:0}};
}
export function movableObjectTarget(actor,sample,fraction){
 const bounds=movableObjectBounds(actor.movableObject),pose=sample.blockingPose || actor;
 const local=rotateXYZ({x:(bounds.min.x+bounds.max.x)*.5*actor.scale,y:(bounds.min.y+(bounds.max.y-bounds.min.y)*fraction)*actor.scale,z:(bounds.min.z+bounds.max.z)*.5*actor.scale},{x:pose.rotationX||0,y:0,z:pose.rotationZ||0});
 const world=rotateXYZ(local,{x:0,y:sample.rotationY||0,z:0});
 return {x:sample.position.x+world.x,y:sample.position.y+world.y,z:sample.position.z+world.z};
}
