"use client";
import {useEffect,useRef} from 'react';
import type {FlowerType} from '@/lib/garden-v2/model';
import type {TypeArea} from '@/lib/garden-v2/type-areas';
import styles from './garden-v2.module.css';
export function FlowerPicker({areas,currentType,open,onOpenChange,onSelect}:{currentType:FlowerType|null;areas:readonly TypeArea[];open:boolean;onOpenChange:(open:boolean)=>void;onSelect:(type:FlowerType)=>void}){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const pointer=useRef({x:0,y:0,dragged:false});
 const close=()=>{onOpenChange(false);trigger.current?.focus({preventScroll:true});};
 // Focus on opening only: a state refresh must not steal a user's focus.
 useEffect(()=>{
  if(!open)return;
  const options=[...panel.current!.querySelectorAll('button')];
  const option=options.find(button=>button.getAttribute('aria-current')==='location')??options[0];
  option?.focus({preventScroll:true});
  // Scroll only the drawer; scrollIntoView could move the underlying tour.
  if(option&&panel.current)panel.current.scrollTop=Math.max(0,option.offsetTop-(panel.current.clientHeight-option.offsetHeight)/2);
 },[open]);
 return <div className={styles.flowerPicker} data-world-reserved>
  <button ref={trigger} className={styles.pickerTab} type="button" aria-label="Choose a flower" aria-expanded={open} aria-controls="flower-picker" onClick={()=>onOpenChange(!open)}><span aria-hidden>✿</span></button>
  {open&&<>
   <button className={styles.pickerBackdrop} type="button" tabIndex={-1} aria-label="Close flower picker" onClick={close}/>
   <div ref={panel} id="flower-picker" className={styles.pickerPanel} role="dialog" aria-modal="true" aria-label="Choose a flower" onPointerDownCapture={event=>{pointer.current={x:event.clientX,y:event.clientY,dragged:false};const button=(event.target as HTMLElement).closest("button");if(event.isPrimary&&event.button===0)button?.setPointerCapture?.(event.pointerId);}} onPointerMoveCapture={event=>{if(Math.hypot(event.clientX-pointer.current.x,event.clientY-pointer.current.y)>8)pointer.current.dragged=true;}} onPointerCancelCapture={()=>{pointer.current.dragged=true;}} onClickCapture={event=>{if(event.detail>0&&pointer.current.dragged){event.preventDefault();event.stopPropagation();}}} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
   }}>
    {areas.map(area=><button key={area.type} data-flower-type={area.type} aria-current={area.type===currentType?"location":undefined} type="button" onClick={()=>{onSelect(area.type);trigger.current?.focus({preventScroll:true});}}>
     {/* Static portraits of canonical mature GPU models; no live context per option. */}
     {/* eslint-disable-next-line @next/next/no-img-element -- small local immutable portraits */}
     <img src={`/flowers/picker/${area.type}.webp`} alt="" width="64" height="80"/><span>{area.name}</span>
    </button>)}
   </div>
  </>}
 </div>;
}
