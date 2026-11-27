import {expect,it} from 'vitest';
import {nativeToTourPixels,tourToNativePixels} from './tour-scroll';

it('retains a fractional layout coordinate through native rounding, next input, freeze and anchors',()=>{
  for(const desired of [812.221,8301.749,9100.5]){
    const actual=Math.round(desired),phase=desired-actual,max=10001,tourMax=10000.71;
    expect(nativeToTourPixels(actual,phase,max,tourMax)).toBe(desired);
    expect(tourToNativePixels(desired,phase,max,tourMax)).toBe(actual);
    for(const delta of [-41,1,38])expect(nativeToTourPixels(actual+delta,phase,max,tourMax)-desired).toBeCloseTo(delta,10);
    for(const anchor of [100.25,7621.1])expect(nativeToTourPixels(tourToNativePixels(anchor,phase,max,tourMax),phase,max,tourMax)).toBe(anchor);
    expect(nativeToTourPixels(0,phase,max,tourMax)).toBe(0);
    expect(nativeToTourPixels(max,phase,max,tourMax)).toBe(tourMax);
    expect(tourToNativePixels(0,phase,max,tourMax)).toBe(0);
    expect(tourToNativePixels(tourMax,phase,max,tourMax)).toBe(max);
  }
});
it('keeps original uncalibrated interior mapping unchanged',()=>{
  for(let pixel=1;pixel<10000;pixel+=7){expect(nativeToTourPixels(pixel,0,10001,10000.71)).toBe(pixel);expect(tourToNativePixels(pixel,0,10001,10000.71)).toBe(pixel);}
});
