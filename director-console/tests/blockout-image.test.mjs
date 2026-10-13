import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import { createDesktopProject, normalizeDesktopProject, updateBlockoutObject, duplicateBlockoutObject, createBlockoutPrimitive } from '../app/project-model.js';
import { applyFilmSpaceOperations } from '../app/project-command-service.js';
import { defaultBlockoutImage, blockoutImageUV, visibleBlockoutImages } from '../app/blockout-image.js';
import { createBlockoutGeometry } from '../app/blockout-geometry.js';
import { referenceImageAssetURL } from '../app/project-api.js';
import { semanticPatchBetween, applySemanticProjectPatch, invertSemanticPatch } from '../app/semantic-project-patch.js';
const require=createRequire(import.meta.url);
const {createProjectRepository}=require('../app/project-repository.cjs');
const asset={ref:'texture-project-assets/reference-aaaaaaaaaaaaaaaa.png',sourceName:'动物.png',mimeType:'image/png',width:100,height:200,sizeBytes:100};
function fixture() {
 return applyFilmSpaceOperations(createDesktopProject({id:'texture-project'}),[
  {action:'add_blockout_group',id:'door-group'},
  {action:'add_blockout_object',groupID:'door-group',id:'door-object',name:'狼门',position:{x:2,y:0,z:3},rotationY:1,primitives:[{id:'door-leaf',kind:'box',position:{x:0,y:1,z:0},size:{x:1,y:2,z:.1}}]},
 ]).project;
}
const door=p=>p.scene.blockout.groups[0].objects[0];
const textured=()=>{const p=fixture();return updateBlockoutObject(p,'door-group','door-object',{image:defaultBlockoutImage(door(p),asset)});};

test('picture survives command authoring, serialization, transforms, duplicate, removal and semantic undo',()=>{
 const p=fixture();const image={...defaultBlockoutImage(door(p),asset),crop:{x:.2,y:.1,width:.5,height:.6}};
 const next=applyFilmSpaceOperations(p,[{action:'update_blockout_object',groupID:'door-group',objectID:'door-object',patch:{image}}]).project;
 const reopened=normalizeDesktopProject(JSON.parse(JSON.stringify(next)));
 assert.deepEqual(door(reopened).image,door(next).image);
 assert.deepEqual(door(reopened).position,door(p).position);
 const copy=duplicateBlockoutObject(reopened,'door-group','door-object');
 assert.deepEqual(copy.scene.blockout.groups[0].objects[1].image,door(next).image);
 const removed=updateBlockoutObject(next,'door-group','door-object',{image:null});
 assert.equal(door(removed).image,null);
 const undone=applySemanticProjectPatch(removed,invertSemanticPatch(next,removed));
 assert.deepEqual(door(undone).image,door(next).image);
 assert.ok(semanticPatchBetween(p,next).length);
});
test('old projects stay untextured; invalid cross-project assets fail; locks protect pictures',()=>{
 const p=fixture();delete door(p).image;p.schemaVersion=59;
 assert.equal(door(normalizeDesktopProject(p)).image,null);
 assert.throws(()=>updateBlockoutObject(p,'door-group','door-object',{image:{asset:{...asset,ref:'other-project-assets/reference-aaaaaaaaaaaaaaaa.png'}}}),/本项目/);
 door(p).locked=true;
 assert.equal(updateBlockoutObject(p,'door-group','door-object',{image:{asset}}),p);
});
test('crop is top-left based, bounded, and independent of picture size',()=>{
 const p=fixture();const next=updateBlockoutObject(p,'door-group','door-object',{image:{asset,width:2,height:3,crop:{x:.8,y:.9,width:.7,height:.5}}});
 const im=door(next).image;
 assert.ok(Math.abs(im.crop.width-.2)<1e-9);assert.ok(Math.abs(im.crop.height-.1)<1e-9);
 const uv=blockoutImageUV({x:.2,y:.1,width:.4,height:.6});
 assert.ok(Math.abs(uv.offset.y-.3)<1e-9);assert.equal(uv.repeat.x,.4);assert.equal(im.width,2);
});
test('output visibility follows layer, group and object eye switches',()=>{
 const p=textured();assert.equal(visibleBlockoutImages(p).length,1);
 for(const owner of [p.scene.blockout,p.scene.blockout.groups[0],door(p)]){
  owner.visible=false;assert.equal(visibleBlockoutImages(p).length,0);owner.visible=true;
 }

});
test('project-owned image bytes survive project save, duplicate and package import',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'film-space-texture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const repo=createProjectRepository(dir);let p=fixture();repo.save(p);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uoAAAAASUVORK5CYII=','base64');
 const saved=repo.saveReferenceImageAsset(p.id,'animal.png','image/png',png);
 p=updateBlockoutObject(p,'door-group','door-object',{image:{asset:saved}});repo.save(p);
 for(const clone of [repo.duplicate(p.id),repo.importPackage(repo.createPackage(p.id).path)]){
   const opened=normalizeDesktopProject(repo.load(clone.id));
   assert.ok(door(opened).image.asset.ref.startsWith(clone.id+'-assets/'));
   assert.deepEqual(fs.readFileSync(path.join(dir,door(opened).image.asset.ref)),png);
 }
});

const source=fs.readFileSync(new URL('../app/director-renderer.js',import.meta.url),'utf8');
function method(name,next){return source.slice(source.indexOf('  '+name+'('),source.indexOf('\n  '+next+'(',source.indexOf('  '+name+'(')));}
function renderer(loader){
 const sync=new Function('THREE','createBlockoutGeometry','referenceImageAssetURL','blockoutImageUV','disposeObjectChildren',`return ({${method('syncBlockout','syncBlockoutVisibility')}}).syncBlockout`)(
  {...THREE,TextureLoader:loader},createBlockoutGeometry,referenceImageAssetURL,blockoutImageUV,root=>root.clear());
 const visibility=new Function(`return ({${method('syncBlockoutVisibility','applyVisualEnvironmentTransform')}}).syncBlockoutVisibility`)();
 const prepare=new Function('visibleBlockoutImages',`return ({${method('async prepareBlockoutImages','async prepareOutput')}}).prepareBlockoutImages`)(visibleBlockoutImages);
 return {isSceneEditView:()=>false,blockoutRoot:new THREE.Group(),blockoutKey:'',blockoutImageLoads:new Map(),renderer:{domElement:{dataset:{}}},onBlockoutImageError(){},syncBlockout:sync,syncBlockoutVisibility:visibility,prepareBlockoutImages:prepare};
}
test('renderer loads a real texture map, keeps local placement and uses alpha/depth without geometry overrides',async()=>{
 const r=renderer(class{async loadAsync(){return new THREE.Texture();}}),p=textured();
 await r.prepareBlockoutImages(p);
 const object=r.blockoutRoot.children[0].children[0],mesh=object.children.at(-1);
 assert.equal(mesh.name,'BlockoutImage:狼门');assert.equal(mesh.material.map.colorSpace,THREE.SRGBColorSpace);
 assert.ok(Math.abs(mesh.position.z-.052)<1e-9);assert.equal(mesh.scale.y,2);
 assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.polygonOffset,false);
 assert.equal(mesh.userData.blockoutObjectID,'door-object');assert.equal(mesh.material.visible,true);
});
test('output waits for texture decoding and rejects missing visible images, but skips hidden ones',async()=>{
 let release;const r=renderer(class{loadAsync(){return new Promise(resolve=>{release=()=>resolve(new THREE.Texture());});}});
 let done=false;const work=r.prepareBlockoutImages(textured()).then(()=>done=true);
 await Promise.resolve();assert.equal(done,false);release();await work;assert.equal(done,true);
 const failed=renderer(class{async loadAsync(){throw new Error('404');}});const p=textured();
 await assert.rejects(failed.prepareBlockoutImages(p),/无法加载贴图/);
 door(p).visible=false;await failed.prepareBlockoutImages(p);
});

test('new Blockout geometry is solid across UI creation and all MCP creation routes',()=>{
 assert.equal(createBlockoutPrimitive({kind:'box'}).opacity,1);
 const authored=applyFilmSpaceOperations(createDesktopProject({id:'opacity-project'}),[
  {action:'add_blockout_group',id:'opacity-group',objects:[{id:'nested-object',primitives:[{id:'nested-primitive',kind:'box'}]}]},
  {action:'add_blockout_object',groupID:'opacity-group',id:'direct-object',primitives:[{id:'object-primitive',kind:'cylinder'}]},
  {action:'add_blockout_primitive',groupID:'opacity-group',objectID:'direct-object',id:'added-primitive',kind:'sphere'},
  {action:'add_blockout_primitive',groupID:'opacity-group',id:'legacy-primitive',kind:'box'},
 ]).project;
 const reopened=normalizeDesktopProject(JSON.parse(JSON.stringify(authored)));
 for(const o of reopened.scene.blockout.groups[0].objects)for(const p of o.primitives)assert.equal(p.opacity,1);
 const r=renderer(class{});r.syncBlockout(reopened);
 for(const o of r.blockoutRoot.children[0].children)for(const mesh of o.children){
  assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);
 }
});
test('saved and explicitly authored transparency survives normalization and unrelated MCP patches',()=>{
 let p=applyFilmSpaceOperations(createDesktopProject({id:'opacity-existing'}),[
  {action:'add_blockout_group',id:'opacity-group',objects:[{id:'opacity-object',primitives:[
   {id:'opacity-old',kind:'box',opacity:.72},{id:'opacity-zero',kind:'box',opacity:0},{id:'opacity-missing',kind:'box'}
  ]}]},
 ]).project;
 delete p.scene.blockout.groups[0].objects[0].primitives[2].opacity;
 p=normalizeDesktopProject(JSON.parse(JSON.stringify(p)));
 p=applyFilmSpaceOperations(p,[{action:'update_blockout_primitive',groupID:'opacity-group',objectID:'opacity-object',primitiveID:'opacity-old',patch:{name:'旧透明部件'}}]).project;
 assert.deepEqual(p.scene.blockout.groups[0].objects[0].primitives.map(v=>v.opacity),[.72,0,1]);
});
