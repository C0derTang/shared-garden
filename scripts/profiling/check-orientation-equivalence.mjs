/* global structuredClone */
/** Prove geometry/camera/shader/plant inputs match the exact merged prerequisite. */
import process from 'node:process';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import ts from 'typescript';
import {compactFixture} from './compact-browser-fixture.mjs';
const base='4cbf8e8384ca9c35cb29cba3fda2265096052ede',out=process.env.PROFILE_OUTPUT||'/tmp/ccapp-228-parity';mkdirSync(out,{recursive:true});
const v=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false,ws:false}});
try{
 const compact=await v.ssrLoadModule('/src/lib/garden-v2/compact-areas.ts'),geography=await v.ssrLoadModule('/src/lib/world/site-geography.ts'),scenic=await v.ssrLoadModule('/src/lib/world/scenic-route.ts'),now=await v.ssrLoadModule('/src/lib/world/garden-tour.ts');
 const source=execFileSync('git',['show',`${base}:src/lib/world/garden-tour.ts`],{encoding:'utf8'}),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,old={},dependencies={'./site-geography':geography,'@/lib/garden-v2/compact-areas':compact,'./scenic-route':scenic};new Function('require','exports',compiled)(name=>{assert(name in dependencies);return dependencies[name]},old);
 const {buildScenicPath}=await v.ssrLoadModule('/src/lib/world/scenic-path.ts'),{buildScenicGroundMesh}=await v.ssrLoadModule('/src/lib/world/scenic-ground.ts'),{buildScenicMeadowStrokes}=await v.ssrLoadModule('/src/lib/world/scenic-scenery.ts'),{packStrokes}=await v.ssrLoadModule('/src/lib/world/strokes.ts'),{lookAt,perspective,multiply}=await v.ssrLoadModule('/src/lib/world/camera.ts');
 const hash=(...arrays)=>{const h=createHash('sha256');for(const a of arrays)h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));return h.digest('hex')},mesh=m=>hash(m.vertices,m.indices),results=[];
 for(const kind of ['empty','mixed','full','sparse','occupied']){
  const state=compactFixture(kind==='occupied'?'full':kind);
  if(kind==='occupied')for(let i=0;i<13;i++){const p=state.plants[0],spot=state.garden.next_spot++;state.plants.push({...structuredClone(p),flower:{...p.flower,id:`synthetic-${i}`,spot,planted_at:new Date(Date.UTC(2099,0,1,0,0,i)).toISOString()}})}
  const layout=compact.compactAreaLayout(state),a=old.gardenTour(layout.beds),b=now.gardenTour(layout.beds),withoutPlaces=t=>({...t,stops:t.stops.map(stop=>{const copy={...stop};delete copy.place;return copy;})});assert.deepEqual(withoutPlaces(b),a,`${kind} exact tour geometry/pose/arc/native mapping`);
  const buffers=t=>({path:mesh(buildScenicPath(t)),ground:mesh(buildScenicGroundMesh(t,layout.beds)),meadow:hash(packStrokes(buildScenicMeadowStrokes(t,layout.beds)))}),actual=buffers(b);assert.deepEqual(actual,buffers(a));
  const camera=module=>{const t=module.gardenTour(layout.beds);return t.legs.flatMap(leg=>[0,.1,.25,.5,.75,.9,1].flatMap(f=>[1280/800,390/844,844/390,800/600].flatMap(aspect=>{const pose=module.tourPose(t,leg.start+leg.length*f);return [new Float32Array(pose.eye),multiply(perspective(module.tourFovY(pose,aspect),aspect,.1,420),lookAt(pose.eye,pose.look,[0,1,0]))]})))};const c=camera(now);assert.deepEqual(c,camera(old));results.push({kind,plants:state.plants.length,exactTourExceptAddedPlaceMetadata:true,gpuMeshes:actual,cameraBufferSha256:hash(...c),cameraCases:c.length/2});
 }
 const originalUI=execFileSync('git',['show',`${base}:src/components/garden-v2/garden-v2.tsx`],{encoding:'utf8'}),currentUI=readFileSync('src/components/garden-v2/garden-v2.tsx','utf8');
 const nodes=(text,predicate)=>{const found=[];const visit=node=>{if(predicate(node))found.push(node.getText());ts.forEachChild(node,visit);};visit(ts.createSourceFile('garden-v2.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX));return found;};
 for(const name of ['onScroll','onSelect','onWheelCapture','onPointerDownCapture','onKeyDownCapture','tour','tourDistance','scenicRoute'])assert.deepEqual(nodes(currentUI,node=>ts.isJsxAttribute(node)&&node.name.getText()===name),nodes(originalUI,node=>ts.isJsxAttribute(node)&&node.name.getText()===name),`Exact native/camera attribute:${name}`);
 assert.deepEqual(nodes(currentUI,node=>ts.isVariableDeclaration(node)&&node.name.getText()==='interruptScrollGlide'),nodes(originalUI,node=>ts.isVariableDeclaration(node)&&node.name.getText()==='interruptScrollGlide'));
 assert.deepEqual(nodes(currentUI,node=>ts.isCallExpression(node)&&node.expression.getText()==='useEffect'&&node.getText().includes('const freeze=')),nodes(originalUI,node=>ts.isCallExpression(node)&&node.expression.getText()==='useEffect'&&node.getText().includes('const freeze=')));
 assert.deepEqual(nodes(currentUI,node=>ts.isCallExpression(node)&&node.expression.getText()==='useLayoutEffect'),nodes(originalUI,node=>ts.isCallExpression(node)&&node.expression.getText()==='useLayoutEffect'));
 for(const name of ['retainTourDistance','tourCoordinate','pixelsToTourDistance','tourDistanceToPixels','tourPose','tourFovY'])assert.deepEqual(nodes(readFileSync('src/lib/world/garden-tour.ts','utf8'),node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),nodes(source,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),`Exact retained/native/sampling function:${name}`);
 const allowed=new Set(['src/components/garden-v2/flower-picker.tsx','src/components/garden-v2/away-note.tsx','src/components/garden-v2/garden-v2.module.css','src/components/garden-v2/garden-v2.tsx','src/components/garden-v2/overlays/guide-view.tsx','src/lib/world/scenic-route.ts','src/lib/world/garden-tour.ts']);
 const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','src','public/flowers/picker','package.json','package-lock.json','scripts/fixtures/kuwahara-reference.wgsl'],{encoding:'utf8'}).trim().split('\n').filter(f=>!f.includes('.test.')&&!allowed.has(f));const h=createHash('sha256');for(const f of files){const prior=execFileSync('git',['show',`${base}:${f}`],{maxBuffer:64*1024*1024}),current=readFileSync(f);assert.deepEqual(current,prior,`Byte identical:${f}`);h.update(f).update(current)}
 writeFileSync(`${out}/equivalence.json`,JSON.stringify({base,method:'Execute base Git object against unchanged dependency runtime; strip ONLY new semantic place metadata before exact deep equality; compare actual GPU mesh/stroke and Float32 camera buffers across all legs/fractions/four aspects. Other renderer/shader/paint/site/plant/picking/native-input source files, portraits and locked dependencies are byte identical.',nativeInputAndRemapCodeByteIdentical:true,unchangedFiles:files.length,unchangedSha256:h.digest('hex'),results},null,2));
}finally{await v.close()}
