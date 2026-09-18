import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import { DandelionWish } from "./dandelion-wish";
it("requires explicit confirmation, keeps failed action retryable, and sends only flower identity", async () => {
  const flower = { ...gardenFixture().plants[0].flower, type_key: "dandelion" as const, shared_wish: "Watch the sunrise", first_bloom_at: "2026-09-18T12:00:00Z", fulfilled_at: null, fulfilled_by: null };
  const mutate = vi.fn().mockResolvedValue({saved:false,error:"Try again",state:null});
  render(<DandelionWish flower={flower} memberId={1} busy={false} mutate={mutate}/>);
  fireEvent.click(screen.getByRole("button",{name:"Fulfill our wish"}));
  expect(mutate).not.toHaveBeenCalled();
  expect(screen.getByText(/permanent keepsake/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Confirm and blow seeds"}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledWith({kind:"fulfillDandelion",flowerId:flower.id}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
});
it("keeps fulfilled wish and actor visible without an undo or repeated action",()=>{
  const flower = {...gardenFixture().plants[0].flower,type_key:"dandelion" as const,shared_wish:"Watch the sunrise",first_bloom_at:"2026-09-18T12:00:00Z",fulfilled_at:"2026-09-18T17:00:00Z",fulfilled_by:2 as const};
  render(<DandelionWish flower={flower} memberId={1} busy={false} mutate={vi.fn()}/>);
  expect(screen.getByRole("status")).toHaveTextContent(/Your partner fulfilled/);
  expect(screen.getByText("Watch the sunrise")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("offers no fulfillment before bloom and synchronously ignores repeated confirmation", async () => {
  const flower = { ...gardenFixture().plants[0].flower, type_key:"dandelion" as const, shared_wish:"Watch the sunrise" };
  const mutate = vi.fn(() => new Promise<never>(() => {}));
  const view = render(<DandelionWish flower={flower} memberId={1} busy={false} mutate={mutate}/>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  view.rerender(<DandelionWish flower={{...flower,first_bloom_at:"2026-09-18T12:00:00Z"}} memberId={1} busy={false} mutate={mutate}/>);
  fireEvent.click(screen.getByRole("button",{name:"Fulfill our wish"}));
  const confirm = screen.getByRole("button",{name:"Confirm and blow seeds"});
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(mutate).toHaveBeenCalledTimes(1);
});
