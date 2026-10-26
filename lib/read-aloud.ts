// Read aloud in session mode: the browser's own speech, with a voice that runs on this device.
// Voices that use an online service are never chosen, so the words on a card (which can include
// the person's name) don't leave the device. With no on-device voice, there's no button.

import { CARD_LABEL, type SessionCard } from "./session";

/** An on-device voice for the language (English by default), preferring the device's default. */
export function localVoice(voices: readonly SpeechSynthesisVoice[], lang = "en"): SpeechSynthesisVoice | null {
  const local = voices.filter((v) => v.localService && v.lang.toLowerCase().startsWith(lang));
  return local.find((v) => v.default) ?? local[0] ?? null;
}

/** What to say for a card: a question or comment as written; anything else with its label. */
export function spokenText(card: SessionCard): string {
  return card.kind === "question" || card.kind === "comment" ? card.title : `${CARD_LABEL[card.kind]}: ${card.title}`;
}
