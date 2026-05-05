import { describe, expect, it } from "vitest";
import fixtures from "../../../../tests/search_cases.json";
import { searchLocal } from "./search";
import type { Device, Endpoint } from "./types";

const devices = fixtures.devices as unknown as Device[];
const endpoints = fixtures.endpoints as unknown as Endpoint[];

describe("search parity (frontend vs shared fixtures)", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const got = searchLocal(c.q, devices, endpoints);
      expect([...got.devices].sort((a, b) => a - b)).toEqual([...c.devices].sort((a, b) => a - b));
      expect([...got.endpoints].sort((a, b) => a - b)).toEqual(
        [...c.endpoints].sort((a, b) => a - b),
      );
    });
  }
});
