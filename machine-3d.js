import * as T from './vendor/three.module.min.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {Canvas3DRenderer} from './canvas-3d-renderer.js';
import {getMachineViewState,WORLD} from './view-state.js';

const V=(x,y,z)=>new T.Vector3(x,y,z);
const PRESETS={overview:{position:[-1300,1250,1950],target:[0,600,0]},operator:{position:[70,1050,1900],target:[20,630,0]},top:{position:[0,2350,1],target:[0,650,0]},sealing:{position:[-350,1100,830],target:[30,860,0]}};
export class Machine3D{
 constructor(host,{onInspect=()=>{},onError=()=>{}}={}){
  this.host=host;this.onInspect=onInspect;this.onError=onError;this.products=new Map();this.partGroups={};this.labels=[];this.view=null;this.selected=null;this.labelsOn=true;this.showGuards=true;this.visible=true;this.dirty=true;
  this.scene=new T.Scene();this.scene.background=new T.Color('#e8edef');this.scene.fog=new T.Fog('#e8edef',3800,8500);
  try{this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{this.renderer=new Canvas3DRenderer();}this.software=!!this.renderer.isSoftware;
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  this.renderer.domElement.setAttribute('aria-label','Interactive 3D packing machine. Drag to orbit, scroll to zoom, click equipment to inspect.');this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.tabIndex=0;
  host.prepend(this.renderer.domElement);
  this.camera=new T.PerspectiveCamera(38,1,5,15000);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=350;this.controls.maxDistance=4300;this.controls.maxPolarAngle=Math.PI*.485;this.controls.minPolarAngle=.02;this.controls.target.set(0,560,0);this.controls.addEventListener('change',()=>this.dirty=true);
  if(!this.software){const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(environment,.04).texture;this.scene.environment=this.environment;environment.dispose();pmrem.dispose();}
  this.scene.add(new T.HemisphereLight(0xe7f3ff,0x909c9b,2));
  const sun=new T.DirectionalLight(0xfff5e9,3.6);sun.position.set(-900,2300,1300);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1600,right:1600,top:1600,bottom:-1600,near:100,far:5000});sun.shadow.bias=-.00015;sun.shadow.normalBias=1;sun.shadow.radius=4;this.scene.add(sun);
  const rim=new T.DirectionalLight(0xe3f2ff,2);rim.position.set(900,1400,-1000);this.scene.add(rim);
  this.makeMaterials();this.buildFactory();this.buildConveyor();this.buildSealer();this.buildSensor();this.buildCabinet();this.buildProducts();this.buildAnnotations();
  this.selectionBox=new T.Box3Helper(new T.Box3(),0x16838b);this.selectionBox.visible=false;this.selectionBox.material.depthTest=false;this.selectionBox.material.transparent=true;this.selectionBox.material.opacity=.65;this.scene.add(this.selectionBox);
  this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();this.bindPicking();
  this.resizeObserver=new ResizeObserver(()=>{this.resize();});this.resizeObserver.observe(host);
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError('Konteks 3D terhenti. Reload halaman untuk memulihkan WebGL.');});
  this.preset('overview');this.resize();
 }
 material(color,metalness=0,roughness=.6,extras={}){return new T.MeshStandardMaterial({color,metalness,roughness,...extras});}
 makeMaterials(){
  this.mat={steel:this.material('#bdc9cc',.72,.29),bright:this.material('#dbe3e4',.82,.19),darkSteel:this.material('#536469',.65,.4),black:this.material('#242d30',.2,.5),belt:this.material('#2b656a',.05,.73),teal:this.material('#236f79',.55,.31),yellow:this.material('#efbc38',.15,.4),red:this.material('#a5312c',.12,.42),floor:this.material('#b8c3c4',.08,.8),wall:this.material('#d6dfe1',.1,.85),plastic:this.material('#eef2f0',.05,.5),rubber:this.material('#303638',0,.9),glass:new T.MeshPhysicalMaterial({color:'#c9e5e7',metalness:0,roughness:.12,transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide}),seal:this.material('#cfb689',.7,.32)};
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#305b5e';ctx.fillRect(0,0,128,64);ctx.fillStyle='#24494c';ctx.fillRect(0,0,4,64);ctx.fillStyle='#487577';ctx.fillRect(4,0,2,64);for(let y=0;y<64;y+=4){ctx.fillStyle=y%8?'#355f61':'#396366';ctx.fillRect(7,y,121,1);}
  this.beltTexture=new T.CanvasTexture(canvas);this.beltTexture.colorSpace=T.SRGBColorSpace;this.beltTexture.wrapS=this.beltTexture.wrapT=T.RepeatWrapping;this.beltTexture.repeat.set(1100/40,2);this.beltTexture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.beltTopMaterial=this.material('#ffffff',.05,.75,{map:this.beltTexture});
 }
 group(parent=this.scene,part){const g=new T.Group();parent.add(g);if(part){g.userData.part=part;this.partGroups[part]=g;}return g;}
 box(w,h,d,x,y,z,mat,parent=this.scene){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 cylinder(radius,height,x,y,z,mat,parent=this.scene,axis='y',segments=24){const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,height,this.software?Math.min(segments,12):segments),mat);mesh.position.set(x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;if(axis==='x')mesh.rotation.z=Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 rod(a,b,r,mat,parent=this.scene){const direction=new T.Vector3().subVectors(b,a),mesh=this.cylinder(r,direction.length(),0,0,0,mat,parent);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(V(0,1,0),direction.normalize());return mesh;}
 hose(points,r=4,color='#263b43',parent=this.scene){const curve=new T.CatmullRomCurve3(points.map(p=>V(...p)));const mesh=new T.Mesh(new T.TubeGeometry(curve,this.software?16:32,r,this.software?4:6,false),this.material(color,.1,.5));parent.add(mesh);return mesh;}
 plaque(text,w,h,x,y,z,{bg='#e7edeb',color='#344e56',size=40,parent=this.scene}={}){const c=document.createElement('canvas');c.width=512;c.height=Math.max(64,Math.round(512*h/w));const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.font=`600 ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';text.split('\n').forEach((line,i,lines)=>ctx.fillText(line,256,c.height/2+(i-(lines.length-1)/2)*(size+10)));const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 bolt(x,y,z,parent=this.scene){const b=this.cylinder(4,3,x,y,z,this.mat.darkSteel,parent,'z',6);return b;}
 buildFactory(){
  this.factory=this.group();this.factory.userData.background=true;const floor=new T.Mesh(new T.PlaneGeometry(14000,14000),this.mat.floor);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.userData.ground=true;this.factory.add(floor);
  const grid=new T.GridHelper(14000,28,0x9eacad,0xaab7b8);grid.position.y=.4;grid.material.opacity=.25;grid.material.transparent=true;this.factory.add(grid);
  const stripe=this.material('#d8ad37',0,.8);for(const z of [-620,620])this.box(1900,1.1,22,0,1,z,stripe,this.factory);for(const x of [-950,950])this.box(22,1.1,1260,x,1,0,stripe,this.factory);
  this.floorLabel=this.plaque('PACKING CELL 01',450,70,0,2,530,{bg:'#b8c3c4',color:'#657f83',size:35,parent:this.factory});this.floorLabel.rotation.x=-Math.PI/2;
  this.box(6500,2200,60,0,1100,-1900,this.mat.wall,this.factory);this.box(6500,25,80,0,250,-1850,this.mat.teal,this.factory);
  for(const x of [-2800,-1400,0,1400,2800]){this.box(110,2200,100,x,1100,-1840,this.mat.steel,this.factory);this.box(1200,350,8,x,1600,-1860,this.material('#a8c3cd',.1,.35),this.factory);}
  for(const x of [-1700,1700]){this.box(450,700,350,x,350,-1150,this.mat.steel,this.factory);for(let y=150;y<650;y+=140)this.box(420,4,370,x,y,-1140,this.mat.darkSteel,this.factory);}
  // Neighbouring service cart: contextual scenery, not an extra simulated line.
  this.box(520,25,320,-1450,560,100,this.mat.bright,this.factory);for(const x of [-1650,-1250])for(const z of [-15,215]){this.box(25,500,25,x,290,z,this.mat.steel,this.factory);this.cylinder(28,15,x,42,z,this.mat.rubber,this.factory,'z');}this.box(450,18,250,-1450,170,100,this.mat.steel,this.factory);
 }
 buildConveyor(){
  const c=this.group(this.scene,'motor');
  this.box(1100,65,255,0,681,0,this.mat.steel,c);this.box(1080,10,220,0,715,0,this.mat.belt,c);
  const belt=new T.Mesh(new T.PlaneGeometry(1100,220),this.beltTopMaterial);belt.rotation.x=-Math.PI/2;belt.position.y=WORLD.beltY+.6;belt.receiveShadow=true;c.add(belt);
  for(const z of [-135,135]){this.box(1120,43,14,0,693,z,this.mat.bright,c);for(let x=-480;x<=480;x+=160)this.bolt(x,696,z+(z>0?8:-8),c);}
  for(const x of [-420,420])for(const z of [-105,105]){this.box(35,610,35,x,349,z,this.mat.steel,c);this.cylinder(10,45,x,40,z,this.mat.bright,c);this.cylinder(34,14,x,14,z,this.mat.rubber,c);this.box(245,25,25,x,245,0,this.mat.steel,c).rotation.y=Math.PI/2;}
  for(const z of [-105,105]){this.box(865,25,25,0,250,z,this.mat.steel,c);this.rod(V(-405,270,z),V(405,635,z),8,this.mat.darkSteel,c);}
  this.rollers=[];for(const x of [-535,535]){const roller=this.group(c);roller.position.set(x,690,0);this.cylinder(29,237,0,0,0,this.mat.darkSteel,roller,'z');for(const z of [-124,124]){this.cylinder(34,6,0,0,z,this.mat.steel,roller,'z');this.box(5,40,2,0,0,z+(z>0?4:-4),this.mat.black,roller);}this.rollers.push(roller);}
  // Guide rails and adjustable brackets leave the pack trajectory visible.
  for(const z of [-85,85]){for(const x of [-460,-220,300,490]){this.rod(V(x,697,z>0?146:-146),V(x,758,z>0?146:-146),5,this.mat.steel,c);this.rod(V(x,750,z>0?146:-146),V(x,750,z),4,this.mat.steel,c);this.cylinder(9,7,x,735,z>0?147:-147,this.mat.black,c,'z');}this.rod(V(-530,752,z),V(540,752,z),5,this.mat.bright,c);}
  const drive=this.group(c);drive.position.set(-455,628,206);this.cylinder(38,100,0,0,0,this.mat.teal,drive,'z');for(let z=-45;z<=45;z+=10)this.cylinder(41,3,0,0,z,this.mat.teal,drive,'z');this.cylinder(32,12,0,0,58,this.mat.black,drive,'z');this.box(45,18,37,0,42,0,this.mat.teal,drive);this.box(70,65,45,0,7,-77,this.mat.steel,drive);this.rod(V(-455,635,110),V(-455,635,150),12,this.mat.bright,c);this.hose([[-455,674,206],[-460,600,230],[-350,420,200],[380,410,270]],5,'#263638',c);
  this.plaque('M1  /  CONVEYOR DRIVE',190,25,-270,678,146,{parent:c,size:28});
  this.plaque('INFEED  →',125,25,-440,634,149,{parent:c,bg:'#e6ecec',color:'#3b656f',size:38});this.plaque('OUTFEED  →',135,25,450,634,149,{parent:c,bg:'#e6ecec',color:'#3b656f',size:35});
 }
 buildSealer(){
  const g=this.group(this.scene,'jaw');g.position.x=50;
  for(const z of [-180,180]){this.box(40,840,40,0,630,z,this.mat.steel,g);this.box(140,20,70,0,218,z,this.mat.darkSteel,g);this.bolt(0,1020,z+(z>0?22:-22),g);this.bolt(0,255,z+(z>0?22:-22),g);}
  this.box(170,60,410,0,1060,0,this.mat.bright,g);
  for(const z of [-120,120]){this.cylinder(10,310,0,890,z,this.mat.bright,g);this.cylinder(18,20,0,1030,z,this.mat.darkSteel,g);}
  const cylinder=this.group(g);this.box(92,130,92,0,1155,0,this.mat.steel,cylinder);for(const y of [1090,1220])this.box(102,16,102,0,y,0,this.mat.darkSteel,cylinder);for(const x of [-37,37])for(const z of [-37,37])this.cylinder(4,145,x,1155,z,this.mat.bright,cylinder);this.plaque('PNEUMATIC\nCYLINDER',74,45,0,1155,47,{parent:cylinder,size:45});
  this.movingJaw=this.group(g);this.movingJaw.position.y=WORLD.jawOpenY;
  this.box(92,35,320,0,0,0,this.mat.darkSteel,this.movingJaw);this.box(70,8,285,0,-13,0,this.mat.seal,this.movingJaw);for(const z of [-120,120])this.cylinder(21,55,0,5,z,this.mat.steel,this.movingJaw);this.piston=this.cylinder(14,200,0,1000,0,this.mat.bright,g);
  this.box(80,16,285,0,710,0,this.mat.seal,g);for(let z=-130;z<=130;z+=13)this.box(72,1,1.5,0,719,z,this.mat.darkSteel,g);
  this.guards=this.group(g);for(const x of [-105,105]){this.box(4,290,405,x,874,0,this.mat.glass,this.guards);for(const z of [-202,202])this.box(12,300,12,x,877,z,this.mat.yellow,this.guards);this.box(12,12,415,x,1025,0,this.mat.yellow,this.guards);}
  this.box(210,110,4,0,970,205,this.mat.glass,this.guards);this.plaque('⚠  HOT SURFACE',125,24,0,998,209,{parent:this.guards,bg:'#ebc348',color:'#423b24',size:38});
  this.solenoidBody=this.group(g);this.box(70,24,28,0,1015,-232,this.mat.steel,this.solenoidBody);this.box(23,28,32,45,1015,-232,this.mat.black,this.solenoidBody);this.solenoidLED=this.cylinder(4,3,45,1017,-214,this.material('#384b3e',0,.3),g,'z');
  this.hose([[45,1015,-232],[140,1040,-235],[155,1160,-150],[50,1200,-40]],4,'#2c788e',g);this.hose([[0,1015,-232],[-145,1040,-240],[-140,1150,-70],[-48,1115,0]],4,'#2c788e',g);
  for(const y of [904,778]){this.box(13,24,18,49,y,153,this.mat.black,g);this.box(5,10,8,58,y,153,this.mat.yellow,g);}
  this.plaque('S1  /  INTERMITTENT SEALER',190,26,0,1062,207,{parent:g,bg:'#d8e1e3',size:28});
  const zone=new T.Mesh(new T.PlaneGeometry(50,190),new T.MeshBasicMaterial({color:0x23aaa9,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide}));zone.rotation.x=-Math.PI/2;zone.position.set(50,721,0);this.scene.add(zone);this.sealZone=zone;
 }
 buildSensor(){
  const g=this.group(this.scene,'sensor');g.position.x=-150;this.sensorGroup=g;
  this.box(25,12,65,0,710,155,this.mat.steel,g);this.cylinder(6,105,0,765,166,this.mat.bright,g);this.box(50,10,20,0,800,152,this.mat.steel,g);this.box(30,38,21,0,780,133,this.mat.yellow,g);this.box(21,27,3,0,780,121,this.mat.black,g);this.cylinder(5,4,0,773,118,this.mat.red,g,'z');this.sensorLED=this.cylinder(3,3,9,790,145,this.material('#343e30',0,.3),g,'z');
  this.box(25,43,8,0,775,-125,this.mat.steel,g);this.box(18,30,3,0,775,-119,this.mat.plastic,g);
  this.beam=new T.Mesh(new T.CylinderGeometry(.9,.9,242,8),new T.MeshBasicMaterial({color:0xef5c4d,transparent:true,opacity:.4,depthWrite:false}));this.beam.rotation.x=Math.PI/2;this.beam.position.set(0,741,0);g.add(this.beam);
  this.hose([[0,800,145],[0,850,190],[35,820,215],[35,650,230]],3,'#303b3b',g);
 }
 buildCabinet(){
  const g=this.group(this.scene,'panel');g.position.set(415,0,330);
  this.box(210,450,165,0,350,0,this.mat.plastic,g);this.box(195,430,5,0,350,86,this.mat.steel,g);for(const x of [-75,75]){this.box(25,120,25,x,65,0,this.mat.steel,g);this.box(65,8,100,x,8,0,this.mat.darkSteel,g);}for(const y of [205,495])this.box(14,35,7,-102,y,88,this.mat.darkSteel,g);this.box(10,55,12,80,365,93,this.mat.black,g);
  for(let y=195;y<260;y+=9)this.box(80,2,2,-25,y,90,this.mat.darkSteel,g);
  this.plaque('PLC / CONTROL',160,25,0,535,90,{parent:g,bg:'#e0e9e9',color:'#47626b',size:35});
  this.cylinder(17,310,0,730,-25,this.mat.steel,g);this.box(210,145,48,0,940,-25,this.mat.darkSteel,g);this.box(180,108,2,0,949,0,this.mat.black,g);
  this.hmiCanvas=document.createElement('canvas');this.hmiCanvas.width=512;this.hmiCanvas.height=300;this.hmiTexture=new T.CanvasTexture(this.hmiCanvas);this.hmiTexture.colorSpace=T.SRGBColorSpace;const screen=new T.Mesh(new T.PlaneGeometry(168,98),new T.MeshBasicMaterial({map:this.hmiTexture}));screen.position.set(0,949,2);g.add(screen);
  this.cylinder(9,6,-65,881,4,this.material('#2c8554'),g,'z');this.cylinder(9,6,-30,881,4,this.mat.black,g,'z');this.cylinder(14,6,65,881,4,this.mat.yellow,g,'z');this.cylinder(10,14,65,881,10,this.mat.red,g,'z');
  this.stackBase=this.cylinder(7,120,82,1080,-45,this.mat.steel,g);this.lamps={};for(const [key,y,color]of [['red',1190,'#7c3c36'],['amber',1150,'#b59039'],['green',1110,'#39785b']]){const material=this.material(color,.05,.25,{emissive:color,emissiveIntensity:.03});this.lamps[key]=material;this.cylinder(18,33,82,y,-45,material,g);this.cylinder(19,5,82,y+19,-45,this.mat.black,g);}this.cylinder(20,9,82,1212,-45,this.mat.black,g);
  this.hose([[0,580,-40],[-35,620,-100],[-65,650,-130],[-50,700,-190]],10,'#29393b',g);
 }
 buildProducts(){
  const shape=new T.Shape(),w=56,h=32,r=6;shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  this.pouchGeometry=new T.ExtrudeGeometry(shape,{depth:86,bevelEnabled:true,bevelThickness:2,bevelSize:2,bevelSegments:2,steps:1,curveSegments:5});this.pouchGeometry.translate(0,0,-43);
  this.pouchMaterials={raw:this.material('#e7d4ac',.25,.4),good:this.material('#b4cdb7',.28,.38),reject:this.material('#d0a58a',.25,.4)};
  this.pouchLabelGeometry=new T.PlaneGeometry(35,60);
  const c=document.createElement('canvas');c.width=128;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#eae4d6';ctx.fillRect(0,0,128,256);ctx.fillStyle='#22636c';ctx.fillRect(0,25,128,52);ctx.fillStyle='#fff';ctx.font='bold 26px Arial';ctx.textAlign='center';ctx.fillText('PACK',64,60);ctx.fillStyle='#5b6766';ctx.font='14px Arial';ctx.fillText('LINE 01',64,113);ctx.font='11px Arial';ctx.fillText('PRODUCT',64,139);for(let i=0;i<20;i++){ctx.fillStyle='#52615f';ctx.fillRect(25+i*4,175,i%3?1:2,32);}const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;this.pouchLabelMaterial=new T.MeshStandardMaterial({map:tex,roughness:.5});
  this.crimpGeometry=new T.BoxGeometry(4,15,92);this.crimpMaterial=this.material('#dac9ab',.5,.4);
 }
 makeProduct(id){const g=this.group(this.scene);g.userData.part='product';g.userData.productId=id;const body=new T.Mesh(this.pouchGeometry,this.pouchMaterials.raw);body.castShadow=true;body.receiveShadow=true;g.add(body);g.userData.body=body;const label=new T.Mesh(this.pouchLabelGeometry,this.pouchLabelMaterial);label.rotation.x=-Math.PI/2;label.position.y=18.2;g.add(label);for(const x of [-28,28]){const seal=new T.Mesh(this.crimpGeometry,this.crimpMaterial);seal.position.set(x,-4,0);g.add(seal);}return g;}
 buildAnnotations(){
  this.labelLayer=document.createElement('div');this.labelLayer.className='scene-label-layer';this.host.append(this.labelLayer);
  for(const [key,title,anchor]of [['motor','M1 · CONVEYOR',[-390,530,260]],['sensor','B1 · PHOTOEYE',[-150,870,155]],['jaw','Y1 · SEALING JAW',[50,1270,0]],['panel','PLC · CONTROL',[490,1040,400]]]){const el=document.createElement('button');el.className='scene-label';el.innerHTML=`<i></i><span>${title}</span><b>OFF</b>`;el.onclick=()=>this.select(key);this.labelLayer.append(el);this.labels.push({key,el,anchor:V(...anchor)});}
 }
 bindPicking(){let down=null;const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const rect=canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects([...Object.values(this.partGroups),...this.products.values()],true);if(!hits.length){this.select(null);return;}let object=hits[0].object;while(object&&!object.userData.part)object=object.parent;if(object)this.select(object.userData.part,object.userData.productId);});}
 select(key,id=null){this.selected=key?{key,id}:null;this.dirty=true;this.onInspect(this.inspection());}
 inspection(){if(!this.selected||!this.view)return null;const {key,id}=this.selected,v=this.view,w=v.connections;
  if(key==='product'){const p=v.products.find(p=>p.id===id);return {key,title:`Product ${id}`,tag:'PACK',status:p?(p.sealed?(p.good?'GOOD':'REJECT'):'IN PROCESS'):'COMPLETED',detail:p?`Center: ${(p.x+550).toFixed(1)} mm · ${p.reason}`:'Produk sudah keluar dari conveyor.',connection:'Result dihitung saat melewati outfeed.'};}
  const descriptions={motor:{title:'Conveyor gearmotor',tag:'M1',status:v.speed>0?'RUNNING':'STOPPED',detail:`Actual belt speed: ${v.speed} mm/s. Roller dan belt mengikuti jarak gerak aktual.`,connection:`PLC output: ${w.motor||'UNWIRED'}`},sensor:{title:'Photoelectric product sensor',tag:'B1',status:v.sensor?'ON':'OFF',detail:`Beam position: ${(v.sensorX+550).toFixed(0)} mm. Status sudah mencakup response delay dan fault.`,connection:`PLC input: ${w.sensor||'UNWIRED'}`},jaw:{title:'Pneumatic sealing assembly',tag:'Y1',status:v.jawRatio===0?'OPEN':v.jawRatio===1?'CLOSED':`${Math.round(v.jawRatio*100)}% CLOSED`,detail:`Solenoid ${v.solenoid?'ON':'OFF'} · Seal center 600 ± 25 mm. Minimum full-closed dwell 500 ms.`,connection:`PLC output: ${w.solenoid||'UNWIRED'}`},panel:{title:'PLC & operator station',tag:'CP1',status:v.state,detail:`Good ${v.good} · Reject ${v.reject}. Lamp status berasal dari output yang terhubung.`,connection:`Run lamp: ${w.running||'UNWIRED'} · Alarm lamp: ${w.alarmLamp||'UNWIRED'}`}};
  return {key,...descriptions[key]};
 }
 sync(sim){const v=getMachineViewState(sim);this.view=v;this.sensorGroup.position.x=v.sensorX;this.beam.material.color.set(v.sensor?'#36df81':'#e85f50');this.beam.material.opacity=v.sensor?.78:.26;this.sensorLED.material.color.set(v.sensor?'#52d985':'#384631');this.sensorLED.material.emissive.set(v.sensor?'#18aa4b':'#000000');
  this.movingJaw.position.y=v.jawY;const top=1085,bottom=v.jawY+18;this.piston.position.y=(top+bottom)/2;this.piston.scale.y=(top-bottom)/200;
  this.solenoidLED.material.color.set(v.solenoid?'#f8be45':'#3c453b');this.solenoidLED.material.emissive.set(v.solenoid?'#ad6b08':'#000000');
  this.beltTexture.offset.x=-v.travel/40;this.rollers.forEach(r=>r.rotation.z=-v.travel/29);
  const ids=new Set(v.products.map(p=>p.id));for(const [id,obj]of this.products)if(!ids.has(id)){this.scene.remove(obj);this.products.delete(id);}
  for(const p of v.products){let object=this.products.get(p.id);if(!object){object=this.makeProduct(p.id);this.products.set(p.id,object);}object.position.set(p.x,p.y,p.z);object.userData.body.material=p.sealed?(p.good?this.pouchMaterials.good:this.pouchMaterials.reject):this.pouchMaterials.raw;}
  this.lamps.green.emissiveIntensity=v.running?1.1:.02;this.lamps.red.emissiveIntensity=v.alarmLamp?1.3:.02;this.lamps.amber.emissiveIntensity=.02;
  const key=[v.state,v.good,v.reject,v.speed,v.tripped].join('|');if(key!==this.hmiKey){this.hmiKey=key;const ctx=this.hmiCanvas.getContext('2d');ctx.fillStyle='#122e38';ctx.fillRect(0,0,512,300);ctx.fillStyle='#8bc4ca';ctx.font='22px Arial';ctx.fillText('PACKING CELL / 01',24,40);ctx.fillStyle=v.tripped?'#f2a29a':'#e6f4f4';ctx.font='bold 34px Arial';ctx.fillText(v.tripped?'E-STOP':v.state,24,95);ctx.fillStyle='#8fc9b6';ctx.font='26px monospace';ctx.fillText(`${v.speed} mm/s`,24,152);ctx.fillStyle='#b9ccce';ctx.font='22px monospace';ctx.fillText(`GOOD ${v.good}   REJECT ${v.reject}`,24,215);ctx.fillStyle='#267680';ctx.fillRect(24,250,464,7);this.hmiTexture.needsUpdate=true;}
  for(const a of this.labels){const on=a.key==='motor'?v.speed>0:a.key==='sensor'?v.sensor:a.key==='jaw'?v.solenoid:v.running;a.el.classList.toggle('on',on);a.el.querySelector('b').textContent=a.key==='motor'?`${v.speed} mm/s`:a.key==='jaw'?v.jawRatio===0?'OPEN':v.jawRatio===1?'CLOSED':'MOVING':on?'ON':'OFF';if(a.key==='sensor')a.anchor.x=v.sensorX;}
  this.dirty=true;
 }
 draw(){if(this.software&&performance.now()-(this.lastDraw||0)<50)return;this.lastDraw=performance.now();if(!this.visible||this.host.clientWidth===0)return;const changed=this.controls.update();if(!this.dirty&&!changed)return;this.scene.updateMatrixWorld(true);
  if(this.selected){const object=this.selected.key==='product'?this.products.get(this.selected.id):this.partGroups[this.selected.key];if(object){this.selectionBox.box.setFromObject(object);this.selectionBox.visible=true;}else this.selectionBox.visible=false;}else this.selectionBox.visible=false;
  this.renderer.render(this.scene,this.camera);for(const a of this.labels){const p=a.anchor.clone().project(this.camera),visible=this.labelsOn&&p.z<1&&p.z>-1&&Math.abs(p.x)<1&&Math.abs(p.y)<1;a.el.hidden=!visible;if(visible){a.el.style.left=`${(p.x*.5+.5)*this.width}px`;a.el.style.top=`${(-p.y*.5+.5)*this.height}px`;}}
  this.dirty=false;
 }
 resize(){const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.dirty=true;}
 preset(name){const p=PRESETS[name]||PRESETS.overview;this.controls.target.set(...p.target);this.camera.position.set(...p.position);this.controls.update();this.dirty=true;}
 zoom(factor){this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update();this.dirty=true;}
 setLabels(value){this.labelsOn=value;this.dirty=true;}
 setGuards(value){this.guards.visible=value;this.showGuards=value;this.dirty=true;}
 setFactory(value){this.factory.visible=value;this.dirty=true;}
 dispose(){this.resizeObserver.disconnect();this.controls.dispose();this.scene.traverse(o=>o.geometry?.dispose());this.environment?.dispose();this.renderer.dispose();}
}
