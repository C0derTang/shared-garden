import {expect,it} from 'vitest';
import {placeGardenCue,type CueRect} from './cue-placement';
const bounds={left:16,top:16,right:784,bottom:584};
const lowerLeft={x:16,y:534,width:160,height:50};
it('keeps its safe margin when clear, moves away from a real target, and retains a safe chosen slot',()=>{
 expect(placeGardenCue(bounds,{width:160,height:50},[],[])).toEqual(lowerLeft);
 const target={x:30,y:540,width:48,height:48};
 const moved=placeGardenCue(bounds,{width:160,height:50},[],[target]);
 expect(moved).toEqual({x:624,y:534,width:160,height:50});
 // Clearing the old target does not make the note jump back on the next frame.
 expect(placeGardenCue(bounds,{width:160,height:50},[],[],moved)).toEqual(moved);
});
it('clears chrome and reserved text, and suppresses when every safe margin is occupied',()=>{
 const whole:CueRect={x:0,y:0,width:800,height:600};
 expect(placeGardenCue(bounds,{width:160,height:50},[whole],[])).toBeNull();
 const result=placeGardenCue(bounds,{width:160,height:50},[{x:0,y:520,width:800,height:80},{x:0,y:0,width:400,height:80}],[]);
 expect(result).toEqual({x:16,y:92,width:160,height:50});
});

import {perspective} from './camera';
import {visibleCueFootprints} from './cue-placement';
it('rejects singular offscreen bounds while retaining a stem crossing the viewport',()=>{
 const view={width:800,height:600,viewProjection:perspective(Math.PI/2,4/3,.1,420)};
 const visible=visibleCueFootprints(view,[{spot:1,position:[0,0,-2]},{spot:2,position:[100,0,-.11]}],[{id:'crossing',position:[0,-3,-2],height:4,radius:.1},{id:'offscreen',position:[100,0,-.11],height:1,radius:.05}]);
 expect(visible.map(footprint=>footprint.target)).toEqual([{kind:'flower',id:'crossing'},{kind:'spot',spot:1}]);
});
