import { describe, expect, it } from "vitest";
import { localVoice, spokenText } from "@/lib/read-aloud";

// Read aloud in session mode uses only a voice that runs on the device, so a card's words (which
// can include the person's name) never go to an online speech service.

const voice = (name: string, lang: string, localService: boolean, isDefault = false) =>
  ({ name, voiceURI: name, lang, localService, default: isDefault }) as SpeechSynthesisVoice;

describe("localVoice", () => {
  it("chooses an English voice that runs on this device, preferring the device's default", () => {
    const voices = [voice("Online English", "en-US", false, true), voice("Samantha", "en-US", true), voice("Daniel", "en-GB", true, true), voice("Amélie", "fr-CA", true)];
    expect(localVoice(voices)?.name).toBe("Daniel");
    expect(localVoice(voices.slice(0, 2))?.name).toBe("Samantha");
  });

  it("chooses nothing when the only voices are online ones, so there's no button", () => {
    expect(localVoice([voice("Google US English", "en-US", false, true)])).toBeNull();
    expect(localVoice([])).toBeNull();
  });
});

describe("spokenText", () => {
  it("reads a question as written, and anything else with its label", () => {
    expect(spokenText({ id: "q", kind: "question", title: "Rosa, what comes to mind when you hear Ella Fitzgerald?" })).toBe(
      "Rosa, what comes to mind when you hear Ella Fitzgerald?",
    );
    expect(spokenText({ id: "p", kind: "place", title: "Maxwell Street Market" })).toBe("A place to talk about: Maxwell Street Market");
  });
});
