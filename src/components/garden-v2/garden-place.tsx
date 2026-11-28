"use client";
import {useCallback,useLayoutEffect,useRef,type RefCallback} from 'react';
import type {TourContext} from '@/lib/world/tour-context';
import {type FlowerAnchor,type SpotTarget} from '@/lib/world/picking';
import {placeGardenCue,visibleCueFootprints,type CueRect} from '@/lib/world/cue-placement';
import type {WorldView} from '@/components/world/renderer';
import styles from './garden-v2.module.css';

/** Position a note from the actual submitted view, never another camera state. */
export function useGardenPlace(flowers:readonly FlowerAnchor[],seeds:readonly SpotTarget[]){
 const element=useRef<HTMLDivElement|null>(null),previous=useRef<CueRect|null>(null),last=useRef(''),observer=useRef<ResizeObserver|null>(null),treeObserver=useRef<MutationObserver|null>(null);
 // A React commit can change wording, targets or global chrome. Font loading
 // can resize the note independently. Invalidate then, not with layout reads
 // on every submitted frame.
 useLayoutEffect(()=>{last.current='';});
 const layer=useCallback((node:HTMLDivElement|null)=>{
  element.current=node;last.current='';observer.current?.disconnect();treeObserver.current?.disconnect();
  if(node&&typeof ResizeObserver!=='undefined'){
   observer.current=new ResizeObserver(()=>{last.current='';});
   observer.current.observe(node.firstElementChild!);
  }
  // Notices/fireworks can update in a sibling component without a parent
  // React commit. Observe content, never per-frame caption style attributes.
  if(node?.parentElement&&typeof MutationObserver!=='undefined'){
   treeObserver.current=new MutationObserver(()=>{last.current='';});
   treeObserver.current.observe(node.parentElement,{childList:true,subtree:true,characterData:true});
  }
 },[]);
 const onView=useCallback((view:WorldView)=>{
  const root=element.current;if(!root)return;
  const signature=[...view.viewProjection,view.width,view.height].join(',');
  if(signature===last.current)return;last.current=signature;
  const note=root.firstElementChild as HTMLElement;
  const box=note.getBoundingClientRect();
  // Projection does not change with painted breeze/light. Only camera, actual
  // targets, note wording/size or reserved DOM bounds can require placement.
  const chrome=[...document.querySelectorAll<HTMLElement>('nav, [data-world-reserved], [role="status"], [data-private-notice-host="garden"], main > button')].filter(element=>element!==note&&!root.contains(element)).map(element=>element.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
  const style=getComputedStyle(root),bounds={left:parseFloat(style.paddingLeft),top:parseFloat(style.paddingTop),right:view.width-parseFloat(style.paddingRight),bottom:view.height-parseFloat(style.paddingBottom)};
  const targets=visibleCueFootprints(view,seeds,flowers).flatMap(footprint=>footprint.parts.map(part=>{
   // Include the existing48px hit region and the heart directly above a plant.
   const radius=Math.max(24,part.core);
   return {x:Math.min(part.a[0],part.b[0])-radius,y:Math.min(part.a[1],part.b[1])-radius,width:Math.abs(part.a[0]-part.b[0])+radius*2,height:Math.abs(part.a[1]-part.b[1])+radius*2};
  }));
  const placed=placeGardenCue(bounds,{width:box.width,height:box.height},chrome,targets,previous.current);
  previous.current=placed;
  note.dataset.placeSuppressed=String(!placed);
  note.style.visibility=placed?'visible':'hidden';
  note.toggleAttribute('data-world-reserved',Boolean(placed));
  if(placed){note.style.left=`${placed.x}px`;note.style.top=`${placed.y}px`;note.style.bottom='auto';}
 },[flowers,seeds]);
 return {layer,onView};
}
/** Quiet ink on the walk, never a navigation control or live announcement. */
export function GardenPlace({context,layer}:{context:TourContext;layer:RefCallback<HTMLDivElement>}){
 return <div ref={layer} className={styles.placeLayer}>
  <aside className={styles.gardenPlace} aria-label="Along the garden walk" data-garden-place>
   <p><span className={styles.srOnly}>Current place: </span><span data-place-label>{context.label}</span></p>
   <svg width="112" height="12" viewBox="0 0 112 12" aria-hidden="true" data-route-progress={context.progress.toFixed(4)}>
    <path d="M4 7 Q30 3 55 7 T108 6" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round"/>
    <circle cx={4+104*context.progress} cy={6} r="3" fill="currentColor"/>
   </svg>
  </aside>
 </div>;
}
