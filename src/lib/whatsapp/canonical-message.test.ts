import { describe, expect, it } from "vitest";
import {
  parseStoredWhatsAppMessage,
  parseWhatsAppMessage,
} from "./canonical-message";

describe("parseWhatsAppMessage", () => {
  it("parses Evolution API conversation batches into canonical messages", () => {
    const payload = {
      event: "messages.upsert",
      data: [
        {
          key: {
            id: "msg_1",
            remoteJid: "237612345678@s.whatsapp.net",
          },
          message: {
            conversation: "Bonjour Orya",
          },
        },
      ],
    };

    expect(parseWhatsAppMessage(payload)).toEqual([
      {
        provider: "evolution-api",
        providerMessageId: "msg_1",
        phoneE164: "+237612345678",
        text: "Bonjour Orya",
      },
    ]);
  });

  it("parses extended text messages", () => {
    const payload = {
      data: [
        {
          key: {
            id: "msg_2",
            remoteJid: "237698765432@s.whatsapp.net",
          },
          message: {
            extendedTextMessage: {
              text: "Je cherche un plombier a Douala",
            },
          },
        },
      ],
    };

    expect(parseWhatsAppMessage(payload)).toEqual([
      {
        provider: "evolution-api",
        providerMessageId: "msg_2",
        phoneE164: "+237698765432",
        text: "Je cherche un plombier a Douala",
      },
    ]);
  });
});

describe("parseStoredWhatsAppMessage", () => {
  it("accepts already canonical payloads", () => {
    const payload = {
      provider: "evolution-api",
      providerMessageId: "msg_3",
      phoneE164: "+237655000111",
      text: "Code de liaison ABCD1234",
    };

    expect(parseStoredWhatsAppMessage(payload)).toEqual(payload);
  });

  it("returns null when the payload is not canonical", () => {
    expect(parseStoredWhatsAppMessage({ foo: "bar" })).toBeNull();
  });
});
