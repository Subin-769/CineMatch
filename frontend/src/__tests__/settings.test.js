import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadStoredSettings } from "../lib/settings";

describe("loadStoredSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when saved settings JSON is malformed", () => {
    window.localStorage.setItem("cinematch:settings", "{broken");

    expect(loadStoredSettings()).toEqual(DEFAULT_SETTINGS);
    expect(window.localStorage.getItem("cinematch:settings")).toBeNull();
  });

  it("merges valid stored settings with defaults", () => {
    window.localStorage.setItem(
      "cinematch:settings",
      JSON.stringify({ theme: "light", language: "ne" })
    );

    expect(loadStoredSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
      language: "ne",
    });
  });
});
