import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenicRoute } from "@/lib/world/scenic-route";
import type { WorldRendererCallbacks } from "./renderer";

// The real renderer needs WebGPU and .wgsl imports; record its callbacks instead.
const created: WorldRendererCallbacks[] = [];
const disposals = vi.fn();
const moves = { travel: vi.fn(), pan: vi.fn() };
const updates: unknown[] = [];
vi.mock("./renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, _state: unknown, callbacks: WorldRendererCallbacks) => {
    created.push(callbacks);
    return { update: (next: unknown) => updates.push(next), travel: moves.travel, pan: moves.pan, dispose: disposals };
  },
}));

const { DEVICE_LOSS_RECOVERIES, GardenWorld, hasWebGpu } = await import("./garden-world");

const lost = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("GardenWorld without WebGPU", () => {
  it("shows a notice linking to the legacy garden", async () => {
    expect(hasWebGpu()).toBe(false);
    render(<GardenWorld />);
    expect(await screen.findByText("This garden is painted with WebGPU.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the earlier garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("GardenWorld with WebGPU", () => {
  beforeEach(() => {
    created.length = 0;
    disposals.mockClear();
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects WebGPU and starts the renderer", async () => {
    expect(hasWebGpu()).toBe(true);
    render(<GardenWorld />);
    await flush();
    expect(created).toHaveLength(1);
    act(() => created[0]!.onReady());
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("recreates the GPU context once after a device loss, then shows the stopped notice", async () => {
    expect(DEVICE_LOSS_RECOVERIES).toBe(1);
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());

    act(() => created[0]!.onLost(lost));
    await flush();
    expect(created).toHaveLength(2);
    act(() => created[1]!.onReady());
    expect(screen.getByRole("img")).toBeInTheDocument();

    act(() => created[1]!.onLost(lost));
    await flush();
    expect(created).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("The painted garden stopped.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the earlier garden" })).toHaveAttribute("href", "/legacy");
  });

  it("distinguishes a runtime error from an unsupported browser", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onError(new Error("boom")));
    expect(screen.getByText("The painted garden stopped.")).toBeInTheDocument();
    expect(screen.queryByText("This garden is painted with WebGPU.")).not.toBeInTheDocument();
  });

  it("shows the unsupported notice when no adapter is available", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onUnsupported(new Error("no adapter")));
    expect(screen.getByText("This garden is painted with WebGPU.")).toBeInTheDocument();
  });

  it("disposes the renderer on unmount", async () => {
    const { unmount } = render(<GardenWorld />);
    await flush();
    unmount();
    expect(disposals).toHaveBeenCalled();
  });

  it("shows the stopped notice, not the unsupported one, when the restart after a loss finds no GPU", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());
    act(() => created[0]!.onLost(lost));
    await flush();
    act(() => created[1]!.onUnsupported(new Error("no adapter after the loss")));
    expect(screen.getByRole("alert")).toHaveTextContent("The painted garden stopped.");
    expect(screen.queryByText("This garden is painted with WebGPU.")).not.toBeInTheDocument();
  });

  it("walks in with up and down and along the beds with left and right", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());
    moves.travel.mockClear();
    moves.pan.mockClear();
    const world = screen.getByLabelText(/left and right to walk along the beds/);
    act(() => {
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(moves.travel).toHaveBeenCalledWith(expect.any(Number));
    expect(moves.pan.mock.calls.map(([d]) => Math.sign(d as number))).toEqual([-1, 1]);
  });

  it("passes the camera focus and pause to the renderer", async () => {
    const focus = { position: [1, 0, 2] as [number, number, number], height: 0.8 };
    const { rerender } = render(<GardenWorld />);
    await flush();
    updates.length = 0;
    rerender(<GardenWorld focus={focus} paused />);
    expect(updates.at(-1)).toMatchObject({ focus, paused: true });
  });

  it("renders link captions that still work as links and run their handler on a plain click", async () => {
    const select = vi.fn();
    render(<GardenWorld captions={[{ id: "come-in", text: "come in", position: [0, 1, 0], href: "/garden", onSelect: select }]} />);
    await flush();
    const link = screen.getByRole("link", { name: "come in" });
    expect(link).toHaveAttribute("href", "/garden");
    expect(link).toHaveAttribute("data-caption", "come-in");
    act(() => link.click());
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("floats a decorative mark that never takes a pick and glows at the plots' display level (#214)", async () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    render(<GardenWorld captions={[{ id: "care-1", text: "♡", position: [0, 0, 0.5], size: "mark" }]} />);
    await flush();
    const mark = document.querySelector<HTMLElement>('[data-caption="care-1"]')!;
    expect(mark.tagName).toBe("SPAN");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("♡")?.closest("button, a, form")).toBeNull();
    act(() => created[0]!.onFrame?.({ viewProjection: identity, width: 200, height: 100, entryFade: 0, arrival: null, glow: 0.55 }));
    expect(mark.style.visibility).toBe("visible");
    expect(mark.parentElement!.style.getPropertyValue("--plot-glow")).toBe("0.55");
    act(() => created[0]!.onFrame?.({ viewProjection: identity, width: 200, height: 100, entryFade: 0, arrival: null }));
    expect(mark.parentElement!.style.getPropertyValue("--plot-glow")).toBe("1.00");
  });
});

describe("fixed scenic route controls",()=>{
 beforeEach(()=>{created.length=0;moves.travel.mockClear();moves.pan.mockClear();vi.stubGlobal("navigator",{...navigator,gpu:{}});});
 afterEach(()=>vi.unstubAllGlobals());
 it("keeps back/onward selectable independently of projection and blocks free movement and return input",async()=>{
  const route=scenicRoute([]),select=vi.fn();
  const view=render(<GardenWorld scenicRoute={route} scenicStop="house-rear" onSelectScenicStop={select} />);await flush();act(()=>created[0]!.onReady());
  const nav=screen.getByRole('navigation',{name:'Garden path'});
  expect(within(nav).getByRole('button',{name:'Back to peony outskirts'})).toBeInTheDocument();
  fireEvent.click(within(nav).getByRole('button',{name:'Onward to lakeside'}));expect(select).toHaveBeenLastCalledWith('lake');
  fireEvent.keyDown(screen.getByLabelText(/Choose scenic stops/),{key:'ArrowRight'});fireEvent.keyDown(screen.getByLabelText(/Choose scenic stops/),{key:'w'});
  expect(moves.pan).not.toHaveBeenCalled();expect(moves.travel).not.toHaveBeenCalled();
  act(()=>created[0]!.onFrame?.({viewProjection:new Float32Array(16),width:390,height:844,arrival:null,entryFade:0,scenicReady:false}));
  expect(screen.queryByRole('navigation',{name:'Garden path'})).not.toBeInTheDocument();
  act(()=>created[0]!.onFrame?.({viewProjection:new Float32Array(16),width:390,height:844,arrival:null,entryFade:0,scenicReady:true}));
  expect(screen.getByRole('navigation',{name:'Garden path'})).toBeInTheDocument();
  view.rerender(<GardenWorld scenicRoute={route} scenicStop="house-rear" scenicBlocked onSelectScenicStop={select} />);await flush();
  expect(screen.queryByRole('navigation',{name:'Garden path'})).not.toBeInTheDocument();
  view.rerender(<GardenWorld scenicRoute={route} scenicStop="house-rear" onSelectScenicStop={select} />);await flush();
  act(()=>created[0]!.onLost(lost));await flush();act(()=>created[1]!.onReady());
  expect(screen.getByRole('combobox',{name:'Scenic stop'})).toHaveValue('house-rear');
 });
 it("rejects an out-and-back route button drag and culls distant area labels without removing keyboard access",async()=>{
  const route=scenicRoute([]),select=vi.fn();
  render(<GardenWorld scenicRoute={route} scenicStop="pocket:0:0" onSelectScenicStop={select} captions={[{id:'distant',text:'far garden',size:'label',position:[0,0,0],maxDistance:3,onSelect:vi.fn()}]} />);await flush();act(()=>created[0]!.onReady());
  const onward=screen.getByRole('button',{name:/Onward to/});
  fireEvent.pointerDown(onward,{clientX:10,clientY:10});fireEvent.pointerMove(onward,{clientX:40,clientY:40});fireEvent.pointerMove(onward,{clientX:10,clientY:10});fireEvent.click(onward,{detail:1});expect(select).not.toHaveBeenCalled();
  const matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  act(()=>created[0]!.onFrame?.({viewProjection:matrix,eye:[10,2,0],width:390,height:844,arrival:null,entryFade:0}));
  const far=screen.getByRole('button',{name:'far garden'});expect(far).toHaveAttribute('data-offscreen');expect(far.style.opacity).toBe('0');
 });
});

describe('scenic projected-control bounds',()=>{
 beforeEach(()=>{created.length=0;vi.stubGlobal('navigator',{...navigator,gpu:{}});});afterEach(()=>vi.unstubAllGlobals());
 it('pins a partially clipped world control accessibly instead of showing an unreadable edge fragment',async()=>{
  render(<GardenWorld scenicRoute={scenicRoute([])} scenicStop="pocket:0:0" captions={[{id:'edge-stop',text:'edge stop',position:[.95,0,0],size:'label',onSelect:vi.fn()}]} />);await flush();act(()=>created[0]!.onReady());
  const button=screen.getByRole('button',{name:'edge stop'});Object.defineProperty(button,'offsetWidth',{configurable:true,value:120});Object.defineProperty(button,'offsetHeight',{configurable:true,value:44});
  act(()=>created[0]!.onFrame?.({viewProjection:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),width:390,height:844,arrival:null,entryFade:0}));
  expect(button).toHaveAttribute('data-offscreen');expect(button.style.opacity).toBe('0');expect(button.style.transform).toContain('318.0px');
 });
});

it('hides a projected route control covered by product navigation while retaining keyboard access',async()=>{
 created.length=0;vi.stubGlobal('navigator',{...navigator,gpu:{}});
 render(<><nav aria-label="Leave the garden"><span>home</span></nav><GardenWorld scenicRoute={scenicRoute([])} scenicStop="pocket:0:0" captions={[{id:'covered-stop',text:'covered stop',position:[.5,.9,0],size:'label',onSelect:vi.fn()}]} /></>);await flush();act(()=>created[0]!.onReady());
 const button=screen.getByRole('button',{name:'covered stop'});Object.defineProperty(button,'offsetWidth',{configurable:true,value:120});Object.defineProperty(button,'offsetHeight',{configurable:true,value:44});
 vi.spyOn(screen.getByRole('navigation',{name:'Leave the garden'}),'getBoundingClientRect').mockReturnValue({x:260,y:20,left:260,top:20,right:380,bottom:70,width:120,height:50,toJSON:()=>({})});
 act(()=>created[0]!.onFrame?.({viewProjection:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),width:390,height:844,arrival:null,entryFade:0}));
 expect(button).toHaveAttribute('data-offscreen');expect(button.style.opacity).toBe('0');vi.unstubAllGlobals();
});

it('hides a projected route control covered by the initial garden hint while retaining keyboard access',async()=>{
 created.length=0;vi.stubGlobal('navigator',{...navigator,gpu:{}});
 render(<><p data-world-reserved>choose a stop</p><GardenWorld scenicRoute={scenicRoute([])} scenicStop="pocket:0:0" captions={[{id:'covered-stop',text:'covered stop',position:[.5,.9,0],size:'label',onSelect:vi.fn()}]} /></>);await flush();act(()=>created[0]!.onReady());
 const button=screen.getByRole('button',{name:'covered stop'});Object.defineProperty(button,'offsetWidth',{configurable:true,value:120});Object.defineProperty(button,'offsetHeight',{configurable:true,value:44});
 vi.spyOn(screen.getByText('choose a stop'),'getBoundingClientRect').mockReturnValue({x:260,y:20,left:260,top:20,right:380,bottom:70,width:120,height:50,toJSON:()=>({})});
 act(()=>created[0]!.onFrame?.({viewProjection:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),width:390,height:844,arrival:null,entryFade:0}));
 expect(button).toHaveAttribute('data-offscreen');expect(button.style.opacity).toBe('0');vi.unstubAllGlobals();
});

it('suppresses decorative scenic due-hearts over reserved tabs and recovers them without changing default-world marks',async()=>{
 created.length=0;vi.stubGlobal('navigator',{...navigator,gpu:{}});
 const markCaption={id:'care-reserved',text:'♡',position:[.8,-.8,0] as [number,number,number],size:'mark' as const},route=scenicRoute([]);
 const {rerender}=render(<><button data-world-reserved>Choose a flower</button><GardenWorld scenicRoute={route} captions={[markCaption]}/></>);await flush();act(()=>created[0]!.onReady());
 const mark=document.querySelector<HTMLElement>('[data-caption="care-reserved"]')!;Object.defineProperty(mark,'offsetWidth',{configurable:true,value:20});Object.defineProperty(mark,'offsetHeight',{configurable:true,value:24});
 const bounds=vi.spyOn(screen.getByRole('button',{name:'Choose a flower'}),'getBoundingClientRect').mockReturnValue({x:350,y:740,left:350,top:740,right:390,bottom:820,width:40,height:80,toJSON:()=>({})});
 const frame={viewProjection:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),width:390,height:844,arrival:null,entryFade:0};
 act(()=>created[0]!.onFrame?.(frame));expect(mark.tagName).toBe('SPAN');expect(mark).toHaveAttribute('aria-hidden','true');expect(mark.style.visibility).toBe('hidden');
 bounds.mockReturnValue({x:0,y:0,left:0,top:0,right:40,bottom:50,width:40,height:50,toJSON:()=>({})});act(()=>created[0]!.onFrame?.(frame));expect(mark.style.visibility).toBe('visible');
 bounds.mockReturnValue({x:350,y:740,left:350,top:740,right:390,bottom:820,width:40,height:80,toJSON:()=>({})});rerender(<><button data-world-reserved>Choose a flower</button><GardenWorld captions={[markCaption]}/></>);await flush();act(()=>created.at(-1)!.onFrame?.(frame));expect(mark.style.visibility).toBe('visible');vi.unstubAllGlobals();
});
