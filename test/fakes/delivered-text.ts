/**
 * Extracted from `v1:test/fakes/telegram.ts:43-49` (`FakeTelegramClient`'s companion helper).
 *
 * Split out into its own module so `test/shared/envelope.test.ts` (PR-02) can vendor as an
 * AS-IS whole-file copy and compile before the SEAM `test/fakes/telegram-client.ts` lands in
 * PR-18 — that fake needs `TelegramClient` types that do not exist yet. PR-18's fake imports
 * `deliveredText` from here instead of redefining it.
 *
 * Models what Telegram stores as `Message.text` after parsing a `parse_mode:"HTML"` payload:
 * markup becomes `MessageEntity` metadata and the text itself is the un-escaped inner text.
 */
export function deliveredText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
