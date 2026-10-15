// Plain-text versions of a kit and a session note, and a WhatsApp share link. No API, no account:
// the link opens WhatsApp with the text filled in, and the caregiver chooses whether to send it.

import type { Kit } from "./types";

export function kitAsText(kit: Kit): string {
  const name = kit.profile.displayName;
  const lines: string[] = [`Memory Lane session kit for ${name} (music, films and places from ${kit.era.start}–${kit.era.end})`];
  if (kit.music.items.length) {
    lines.push("", "Songs:");
    for (const m of kit.music.items) lines.push(`• ${m.title}: ${m.searchUrl}`);
  }
  if (kit.screen.items.length) {
    lines.push("", "To watch:");
    for (const m of kit.screen.items) lines.push(`• ${m.title}${m.year ? ` (${m.year})` : ""}: ${m.searchUrl}`);
  }
  if (kit.place.items.length) lines.push("", `A place to talk about: ${kit.place.items.map((p) => p.name).join(", ")}`);
  if (kit.dish.items.length) lines.push("", `A dish to talk about: ${kit.dish.items.map((d) => d.name).join(", ")} (to talk about, not to serve)`);
  if (kit.prompts.length) {
    lines.push("", kit.profile.supportLevel === "late" ? "Things to say:" : "Questions, one at a time:");
    for (const p of kit.prompts) lines.push(`• ${p}`);
  }
  if (kit.activityIdeas.length) {
    lines.push("", "Ideas to try:");
    for (const i of kit.activityIdeas) lines.push(`• ${i.text}`);
  }
  lines.push("", "If they seem upset or tired, pause or stop. Stopping is a good outcome.");
  return lines.join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
