import * as T from './vendor/three.module.min.js';
// CPU compatibility renderer for the same Three.js scene, camera and geometry.
// It preserves actual perspective/orbit and texture mapping; PBR reflections and
// dynamic GPU shadows are reserved for WebGL. No simulation state is modified.
export class Canvas3DRenderer{
 constructor(){this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas unavailable');this.pixelRatio=1;this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};this.isSoftware=true;this.textures=new WeakMap();this.normalMatrix=new T.Matrix3();this.matrix=new T.Matrix4();this.light=new T.Vector3(-.45,.85,.55).normalize();this.setPixelRatio(Math.min(devicePixelRatio,1.25));}
 setPixelRatio(n){this.pixelRatio=Math.min(n,1.25);}
 setSize(w,h){this.width=w;this.height=h;this.domElement.width=Math.round(w*this.pixelRatio);this.domElement.height=Math.round(h*this.pixelRatio);}
 project(x,y,z,matrix){const p=new T.Vector3(x,y,z).applyMatrix4(matrix);return {x:(p.x*.5+.5)*this.width,y:(.5-p.y*.5)*this.height,z:p.z};}
 textureImage(texture){const image=texture?.image;if(!image||!image.width)return null;if(texture.repeat.x===1&&texture.repeat.y===1&&texture.offset.x===0&&texture.offset.y===0)return image;
  let cache=this.textures.get(texture);const key=[texture.version,texture.repeat.x,texture.repeat.y,texture.offset.x.toFixed(4),texture.offset.y.toFixed(4)].join('|');if(cache?.key===key)return cache.canvas;
  const canvas=cache?.canvas||document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d'),pattern=ctx.createPattern(image,'repeat');const rx=texture.repeat.x,ry=texture.repeat.y;
  pattern.setTransform(new DOMMatrix().translate(-texture.offset.x*canvas.width/rx,texture.offset.y*canvas.height/ry).scale(canvas.width/image.width/rx,canvas.height/image.height/ry));ctx.fillStyle=pattern;ctx.fillRect(0,0,canvas.width,canvas.height);this.textures.set(texture,{key,canvas});return canvas;
 }
 render(scene,camera){if(!this.width)return;scene.updateMatrixWorld();camera.updateMatrixWorld();const ctx=this.ctx;ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);ctx.globalAlpha=1;ctx.fillStyle=scene.background?.getStyle()||'#e8edef';ctx.fillRect(0,0,this.width,this.height);
  const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),items=[];const cam=camera.getWorldPosition(new T.Vector3());
  scene.traverseVisible(object=>{if(!object.geometry||(!object.isMesh&&!object.isLine))return;let ancestor=object,background=false;while(ancestor){if(ancestor.userData.background)background=true;ancestor=ancestor.parent;}const geometry=object.geometry,positions=geometry.attributes.position;if(!positions)return;const mvp=new T.Matrix4().multiplyMatrices(vp,object.matrixWorld),verts=[];if(!geometry.boundingSphere)geometry.computeBoundingSphere();const center=geometry.boundingSphere.center.clone().applyMatrix4(mvp);const sortZ=object.userData.ground?2:center.z;
   for(let i=0;i<positions.count;i++)verts.push(this.project(positions.getX(i),positions.getY(i),positions.getZ(i),mvp));
   if(object.isLine){const mat=object.material;if(!mat.visible)return;const idx=geometry.index,step=object.isLineSegments?2:1,count=idx?.count||positions.count;for(let i=0;i<count-1;i+=step){const a=verts[idx?idx.getX(i):i],b=verts[idx?idx.getX(i+1):i+1];if(a.z<-1||b.z<-1||a.z>1||b.z>1)continue;items.push({line:true,background,sortZ:background?1.5:mat.depthTest===false?-2:sortZ,p:[a,b],z:mat.depthTest===false?-2:(a.z+b.z)/2,mat});}return;}
   const index=geometry.index,count=index?.count||positions.count,normals=geometry.attributes.normal,uv=geometry.attributes.uv;this.normalMatrix.getNormalMatrix(object.matrixWorld);
   for(let i=0;i<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2,p=[verts[a],verts[b],verts[c]];if(p.some(v=>!v))continue;if(p.some(v=>v.z<-1||v.z>1)){if(object.userData.ground){const clip=[a,b,c].map(n=>new T.Vector4(positions.getX(n),positions.getY(n),positions.getZ(n),1).applyMatrix4(mvp));let polygon=clip;for(const sign of [1,-1]){const result=[];for(let k=0;k<polygon.length;k++){const aa=polygon[k],bb=polygon[(k+1)%polygon.length],da=aa.w+sign*aa.z,db=bb.w+sign*bb.z;if(da>=0)result.push(aa);if((da>=0)!==(db>=0))result.push(aa.clone().lerp(bb,da/(da-db)));}polygon=result;}if(polygon.length>=3){const points=polygon.map(v=>({x:(v.x/v.w*.5+.5)*this.width,y:(.5-v.y/v.w*.5)*this.height}));for(let k=1;k<points.length-1;k++)items.push({p:[points[0],points[k],points[k+1]],background:true,sortZ:2,z:2,mat:object.material,color:object.material.color.getStyle()});}}continue;}if(p.every(v=>v.x<0)||p.every(v=>v.x>this.width)||p.every(v=>v.y<0)||p.every(v=>v.y>this.height))continue;
    let mat=object.material;if(Array.isArray(mat)){const group=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count);mat=mat[group?.materialIndex||0];}if(!mat?.visible||mat.opacity<=0)continue;
    const signed=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x);if(mat.side!==T.DoubleSide&&(mat.side===T.BackSide?signed<0:signed>0))continue;
    const normal=normals?new T.Vector3((normals.getX(a)+normals.getX(b)+normals.getX(c))/3,(normals.getY(a)+normals.getY(b)+normals.getY(c))/3,(normals.getZ(a)+normals.getZ(b)+normals.getZ(c))/3).applyNormalMatrix(this.normalMatrix):new T.Vector3(0,1,0);
    let shade=mat.isMeshBasicMaterial?1:.53+.42*Math.max(0,normal.dot(this.light))+.1*Math.max(0,normal.y);if(mat.metalness>0)shade+=.11*mat.metalness*Math.pow(Math.max(0,normal.z),4);
    const color=(mat.color||new T.Color('#ccc')).clone().multiplyScalar(shade);if(mat.emissive)color.add(mat.emissive.clone().multiplyScalar((mat.emissiveIntensity||0)*.3));
    items.push({p,background,sortZ,z:(p[0].z+p[1].z+p[2].z)/3,mat,color:color.getStyle(),image:mat.map?this.textureImage(mat.map):null,uv:uv?[[uv.getX(a),uv.getY(a)],[uv.getX(b),uv.getY(b)],[uv.getX(c),uv.getY(c)]]:null});
   }
  });items.sort((a,b)=>Number(b.background)-Number(a.background)||b.sortZ-a.sortZ||b.z-a.z);
  for(const item of items){const {p,mat}=item;ctx.globalAlpha=mat.opacity??1;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);ctx.lineTo(p[1].x,p[1].y);if(item.line){ctx.strokeStyle=mat.color.getStyle();ctx.lineWidth=mat.linewidth||1;ctx.stroke();continue;}ctx.lineTo(p[2].x,p[2].y);ctx.closePath();ctx.fillStyle=item.color;ctx.fill();if(item.image&&item.uv)this.drawTexture(item);else if(!mat.transparent){ctx.strokeStyle=item.color;ctx.lineWidth=.4;ctx.stroke();}}
  ctx.globalAlpha=1;
 }
 drawTexture({p,image,uv}){const ctx=this.ctx,u=uv.map(v=>[v[0]*image.width,(1-v[1])*image.height]),[a,b,c]=u;const det=a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);if(Math.abs(det)<.00001)return;
  const solve=key=>[(p[0][key]*(b[1]-c[1])+p[1][key]*(c[1]-a[1])+p[2][key]*(a[1]-b[1]))/det,(p[0][key]*(c[0]-b[0])+p[1][key]*(a[0]-c[0])+p[2][key]*(b[0]-a[0]))/det,(p[0][key]*(b[0]*c[1]-c[0]*b[1])+p[1][key]*(c[0]*a[1]-a[0]*c[1])+p[2][key]*(a[0]*b[1]-b[0]*a[1]))/det];const x=solve('x'),y=solve('y');ctx.save();ctx.clip();ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(image,0,0);ctx.restore();
 }
 dispose(){}
}
