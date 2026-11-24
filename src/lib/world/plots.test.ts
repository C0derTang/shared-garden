import { describe, expect, it } from "vitest";
import { gardenFovY, gardenPose, gardenViewProjection } from "./garden-camera";
import { journeyPose, plotPose } from "./journey";
import { bedAt, spotPosition } from "./layout";
import { projectToNdc } from "./camera";
import { bedOfSpot, bedSpotOrder, plotOrder, spotRow, stepBed, stepPlot } from "./plots";

describe("plot navigator order", () => {
  it("lists every spot exactly once, bed by bed in the order the beds opened", () => {
    const order = plotOrder(36);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(order.map(bedOfSpot)).toEqual([...Array(12).fill(0), ...Array(12).fill(1), ...Array(12).fill(2)]);
  });

  it("reads each bed row by row, from its back row to its front, left to right", () => {
    for (const bed of [0, 1, 4]) {
      const spots = bedSpotOrder(bed);
      expect(spots).toHaveLength(12);
      for (let i = 1; i < spots.length; i += 1) {
        const previous = spots[i - 1]!;
        const spot = spots[i]!;
        expect(spotRow(spot)).toBeGreaterThanOrEqual(spotRow(previous));
        if (spotRow(spot) === spotRow(previous)) expect(spotPosition(spot).position[0]).toBeGreaterThan(spotPosition(previous).position[0]);
      }
      // Rows run from the back of the bed (further from the camera, smaller z) to the front.
      const first = spotPosition(spots[0]!).position[2];
      const last = spotPosition(spots.at(-1)!).position[2];
      expect(first).toBeLessThan(last);
      expect(new Set(spots.map(spotRow)).size).toBeGreaterThan(2);
    }
  });

  it("stops at the garden's capacity", () => {
    expect(plotOrder(12)).toHaveLength(12);
    expect(plotOrder(18).every((spot) => spot <= 18)).toBe(true);
    expect(plotOrder(18)).toHaveLength(18);
    expect(plotOrder(0)).toEqual([]);
  });

  it("steps one plot at a time without wrapping, starting at the first", () => {
    expect(stepPlot(5, -1, 1)).toBe(0);
    expect(stepPlot(5, -1, -1)).toBe(0);
    expect(stepPlot(5, 2, 1)).toBe(3);
    expect(stepPlot(5, 2, -1)).toBe(1);
    expect(stepPlot(5, 4, 1)).toBe(4);
    expect(stepPlot(5, 0, -1)).toBe(0);
    expect(stepPlot(0, -1, 1)).toBe(-1);
  });

  it("jumps between beds to each bed's first plot", () => {
    const order = plotOrder(36);
    expect(stepBed(order, -1, 1)).toBe(0);
    expect(stepBed(order, 3, 1)).toBe(12);
    expect(stepBed(order, 15, 1)).toBe(24);
    expect(stepBed(order, 30, 1)).toBe(30);
    expect(stepBed(order, 30, -1)).toBe(12);
    expect(stepBed(order, 12, -1)).toBe(0);
    expect(stepBed(order, 5, -1)).toBe(0);
    expect(stepBed([], -1, 1)).toBe(-1);
  });
});

describe("the navigator's camera framing", () => {
  it.each([
    [1280, 800],
    [390, 844],
    [1920, 1080],
    [768, 1024],
  ])("frames the whole bed at %i×%i and leans toward the selected plot", (width, height) => {
    const aspect = width / height;
    const fovY = gardenFovY(aspect);
    for (const bed of [0, 1, 3]) {
      const centre = bedAt(bed).center;
      const left = spotPosition(bed * 12 + 1).position;
      const pose = plotPose({ position: left, height: 0.5, bedCenter: centre }, aspect, fovY);
      const viewProjection = gardenViewProjection(width, height, gardenPose({ journey: 0, pan: 0, browse: pose, browseWeight: 1 }, aspect, fovY));
      // The bed's rim all round stays inside the frame.
      for (let k = 0; k < 16; k += 1) {
        const angle = (k * Math.PI) / 8;
        const rim: [number, number, number] = [centre[0] + Math.cos(angle) * 1.3, centre[1], centre[2] + Math.sin(angle) * 1.3];
        const ndc = projectToNdc(viewProjection, rim)!;
        expect(Math.abs(ndc[0])).toBeLessThan(1);
        expect(Math.abs(ndc[1])).toBeLessThan(1);
      }
      // The camera looks down on the bed from in front of it.
      expect(pose.eye[2]).toBeGreaterThan(centre[2]);
      expect(pose.eye[1]).toBeGreaterThan(centre[1] + 1);
    }
  });

  it("blends from the walk to the framing and adds no portrait tilt once framed", () => {
    const aspect = 390 / 844;
    const fovY = gardenFovY(aspect);
    const pose = plotPose({ position: spotPosition(3).position, height: 0, bedCenter: bedAt(0).center }, aspect, fovY);
    const walked = journeyPose(0.4);
    const start = gardenPose({ journey: 0.4, pan: 0 }, aspect, fovY);
    expect(start.eye).toEqual(walked.eye);
    expect(start.look[1]).toBeLessThan(walked.look[1]);
    const framed = gardenPose({ journey: 0.4, pan: 0, browse: pose, browseWeight: 1 }, aspect, fovY);
    framed.eye.forEach((v, i) => expect(v).toBeCloseTo(pose.eye[i]!, 6));
    framed.look.forEach((v, i) => expect(v).toBeCloseTo(pose.look[i]!, 6));
  });
});
