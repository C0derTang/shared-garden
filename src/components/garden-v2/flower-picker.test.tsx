import {fireEvent,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {compactAreaLayout} from '@/lib/garden-v2/compact-areas';
import {v2GardenFixture} from '@/test/garden-v2-fixture';
import {FlowerPicker} from './flower-picker';

it('focuses and identifies the current actual flower without adding content to any of13 rows',()=>{
 const areas=compactAreaLayout(v2GardenFixture()).areas;
 render(<FlowerPicker areas={areas} currentType="bluebell" open onOpenChange={vi.fn()} onSelect={vi.fn()}/>);
 const rows=within(screen.getByRole('dialog')).getAllByRole('button');
 expect(rows).toHaveLength(13);
 expect(screen.getByRole('button',{name:'bluebell'})).toHaveFocus();
 expect(rows.filter(row=>row.getAttribute('aria-current')==='location')).toEqual([screen.getByRole('button',{name:'bluebell'})]);
 for(const [index,row] of rows.entries()){
  expect(row.textContent).toBe(areas[index]!.name);
  expect([...row.children].map(child=>child.tagName)).toEqual(['IMG','SPAN']);
  expect(row.querySelector('img')).toHaveAttribute('src',`/flowers/picker/${areas[index]!.type}.webp`);
 }
});
it('reads the newly current option on reopening, keeps focus inside and restores its trigger on Escape',async()=>{
 const user=userEvent.setup(),areas=compactAreaLayout(v2GardenFixture()).areas,onOpenChange=vi.fn();
 const {rerender}=render(<FlowerPicker areas={areas} currentType={null} open onOpenChange={onOpenChange} onSelect={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'rose'})).toHaveFocus();
 await user.tab({shift:true});expect(screen.getByRole('button',{name:'peony'})).toHaveFocus();
 await user.tab();expect(screen.getByRole('button',{name:'rose'})).toHaveFocus();
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(onOpenChange).toHaveBeenLastCalledWith(false);
 expect(screen.getByRole('button',{name:'Choose a flower'})).toHaveFocus();
 rerender(<FlowerPicker areas={areas} currentType="cactus" open={false} onOpenChange={onOpenChange} onSelect={vi.fn()}/>);
 rerender(<FlowerPicker areas={areas} currentType="cactus" open onOpenChange={onOpenChange} onSelect={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'cactus'})).toHaveFocus();
});

it('does not steal newer focus when the actual place refreshes while the drawer is open',()=>{
 const areas=compactAreaLayout(v2GardenFixture()).areas,onOpenChange=vi.fn(),onSelect=vi.fn();
 const {rerender}=render(<FlowerPicker areas={areas} currentType="rose" open onOpenChange={onOpenChange} onSelect={onSelect}/>);
 screen.getByRole('button',{name:'tulip'}).focus();
 rerender(<FlowerPicker areas={areas} currentType="cactus" open onOpenChange={onOpenChange} onSelect={onSelect}/>);
 expect(screen.getByRole('button',{name:'tulip'})).toHaveFocus();
 expect(screen.getByRole('button',{name:'cactus'})).toHaveAttribute('aria-current','location');
});
