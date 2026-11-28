import {describe,expect,it} from 'vitest';
import {v2GardenFixture} from '@/test/garden-v2-fixture';
import {flowerTypes} from '@/lib/garden-v2/model';
import {compactAreaLayout} from '@/lib/garden-v2/compact-areas';
import {gardenTour,retainTourDistance,type GardenTour} from './garden-tour';
import {tourContext} from './tour-context';

const fixture=()=>gardenTour(compactAreaLayout(v2GardenFixture()).beds);
const at=(tour:GardenTour,id:string)=>tour.legs.find(leg=>leg.edge.from===id)?.start??tour.length;
describe('the place read from the actual accepted tour',()=>{
 it('names porch, every woodland stop, overlook, all13 empty type areas and the end',()=>{
  const tour=fixture();
  expect(tourContext(tour,0)).toMatchObject({label:'back porch',type:null,progress:0});
  for(const stop of tour.stops.filter(stop=>stop.id.startsWith('woodland:')))expect(tourContext(tour,at(tour,stop.id)).label).toBe('woodland path');
  expect(tourContext(tour,tour.startDistance)).toMatchObject({label:'garden overlook',type:null});
  for(const [type,index] of flowerTypes.map((type,index)=>[type,index] as const))expect(tourContext(tour,tour.anchors.get(index)!)).toMatchObject({label:`${type} garden`,type});
  expect(tourContext(tour,tour.length)).toMatchObject({label:'meadow edge',type:null,progress:1});
 });
 it('uses semantic metadata without hardcoding stop IDs, woodland counts or type anchors',()=>{
  const tour=fixture(),renamed={...tour,stops:tour.stops.map(stop=>({...stop,id:`remapped-${stop.id}`})),legs:tour.legs.map(leg=>({...leg,edge:{...leg.edge,from:`remapped-${leg.edge.from}`,to:`remapped-${leg.edge.to}`}})),anchors:new Map<number,number>()};
  expect(tourContext(renamed,tour.anchors.get(0)!)).toMatchObject({type:'rose',label:'rose garden'});
  expect(tourContext(renamed,0).label).toBe('back porch');
 });
 it('is direction independent, exact at joins and stable throughout a semantic region',()=>{
  const tour=fixture(),leg=tour.legs.find(leg=>leg.edge.to==='terrace:0')!,join=leg.start+leg.length;
  for(const d of [join+.001,join,join-.001,join,join+.001])expect(tourContext(tour,d).type).toBe('rose');
  const middle=leg.start+leg.length/2;
  expect(tourContext(tour,middle-.01).type).toBe('snapdragon');
  expect(tourContext(tour,middle+.01).type).toBe('rose');
  expect(tourContext(tour,NaN).progress).toBe(0);
  expect(tourContext(tour,-1).progress).toBe(0);
  expect(tourContext(tour,tour.length+100).progress).toBe(1);
 });
 it('distinguishes occupied meadow terraces, bends and return lanes after appends and remaps',()=>{
  const state=v2GardenFixture(),plant=state.plants[0]!;
  state.plants=Array.from({length:13},(_,i)=>({...structuredClone(plant),flower:{...plant.flower,id:`synthetic-${i}`,spot:i===12?12001:i+1,planted_at:new Date(Date.UTC(2026,5,1,0,0,i)).toISOString()}}));
  const before=gardenTour(compactAreaLayout(state).beds);
  expect(tourContext(before,at(before,'terrace:13'))).toMatchObject({type:'rose',label:'rose · meadow 2'});
  expect(tourContext(before,at(before,'terrace:26'))).toMatchObject({type:'rose',label:'rose · meadow 3'});
  expect(tourContext(before,at(before,'return:terrace:26'))).toMatchObject({type:'rose',label:'rose · return path'});
  expect(tourContext(before,at(before,'expansion-turn:terrace:26'))).toMatchObject({type:null,label:'meadow bend'});
  state.plants.push({...structuredClone(plant),flower:{...plant.flower,id:'later',spot:12002,planted_at:'2099-01-01T00:00:00Z'}});
  const after=gardenTour(compactAreaLayout(state).beds),oldDistance=at(before,'terrace:13');
  expect(tourContext(after,retainTourDistance(before,after,oldDistance))).toEqual({...tourContext(before,oldDistance),progress:retainTourDistance(before,after,oldDistance)/after.length});
 });
});
