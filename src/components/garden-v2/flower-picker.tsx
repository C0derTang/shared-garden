"use client";
import {useEffect,useRef} from 'react';
import type {FlowerType} from '@/lib/garden-v2/model';
import type {TypeArea} from '@/lib/garden-v2/type-areas';
import styles from './garden-v2.module.css';
export function FlowerPicker({areas,open,onOpenChange,onSelect}:{areas:readonly TypeArea[];open:boolean;onOpenChange:(open:boolean)=>void;onSelect:(type:FlowerType)=>void}){
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const pointer=useRef({x:0,y:0,dragged:false});
 const close=()=>{onOpenChange(false);trigger.current?.focus({preventScroll:true});};
 useEffect(()=>{if(open)panel.current?.querySelector('button')?.focus({preventScroll:true});},[open]);
 return <div className={styles.flowerPicker} data-world-reserved>
  <button ref={trigger} className={styles.pickerTab} type="button" aria-label="Choose a flower" aria-expanded={open} aria-controls="flower-picker" onClick={()=>onOpenChange(!open)}><span aria-hidden>✿</span></button>
  {open&&<>
   <button className={styles.pickerBackdrop} type="button" tabIndex={-1} aria-label="Close flower picker" onClick={close}/>
   <div ref={panel} id="flower-picker" className={styles.pickerPanel} role="dialog" aria-modal="true" aria-label="Choose a flower" onPointerDownCapture={event=>{pointer.current={x:event.clientX,y:event.clientY,dragged:false};const button=(event.target as HTMLElement).closest("button");if(event.isPrimary&&event.button===0)button?.setPointerCapture?.(event.pointerId);}} onPointerMoveCapture={event=>{if(Math.hypot(event.clientX-pointer.current.x,event.clientY-pointer.current.y)>8)pointer.current.dragged=true;}} onPointerCancelCapture={()=>{pointer.current.dragged=true;}} onClickCapture={event=>{if(event.detail>0&&pointer.current.dragged){event.preventDefault();event.stopPropagation();}}} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
   }}>
    {areas.map(area=><button key={area.type} type="button" onClick={()=>{onSelect(area.type);trigger.current?.focus({preventScroll:true});}}>
     {/* Static portraits of canonical mature GPU models; no live context per option. */}
     {/* eslint-disable-next-line @next/next/no-img-element -- small local immutable portraits */}
     <img src={`/flowers/picker/${area.type}.webp`} alt="" width="64" height="80"/><span>{area.name}</span>
    </button>)}
   </div>
  </>}
 </div>;
}
