import { describe, expect, it } from "vitest";
import { buildForm, CONTACTS, newPayee, PERSONAS, randomSignals, story } from "./phoneSim";

const calm = { time: "14:00", recent: 0, onCall: false, remote: false, newDevice: false, locationChanged: false };

describe("the simulated banking app", () => {
  it("gives the same new payee the same history every time", () => {
    expect(newPayee("Asha", "asha.k@okicici")).toEqual(newPayee("Asha", "asha.k@okicici"));
    expect(newPayee("Coinvault", "coinvault@upi").type).toBe("crypto_exchange");
    expect(newPayee("QuickFix Tech Support", "qf@upi").type).toBe("business");
  });

  it("sends a saved contact as a known payee, and a new one as new", () => {
    expect(buildForm(PERSONAS[0], CONTACTS[0], "500", "", calm).newPayee).toBe(false);
    expect(buildForm(PERSONAS[0], newPayee("X", "x@upi"), "500", "", calm).newPayee).toBe(true);
  });

  it("fills in what the phone knows, without the customer typing it", () => {
    const form = buildForm(PERSONAS[1], CONTACTS[2], "12000", "Rent", { ...calm, onCall: true, locationChanged: true });
    expect(form.segment).toBe("retiree");
    expect(form.typical).toBe("5000");
    expect(form.onCall).toBe(true);
    expect(form.location).toBe("Unknown · VPN");
  });

  it("makes random signals that are usually calm", () => {
    const low = () => 0.99;
    expect(randomSignals(low)).toMatchObject({ onCall: false, remote: false, newDevice: false, locationChanged: false, recent: 2 });
    expect(randomSignals(() => 0).onCall).toBe(true);
  });

  it("turns a scam story into a payee, an amount, a note and signals", () => {
    const bank = story("Bank-impersonation call");
    expect(bank?.payee.known).toBe(false);
    expect(bank?.signals.onCall).toBe(true);
    expect(bank?.amount).toBe("98500");
    expect(story("Everyday payment")?.payee.known).toBe(true);
  });
});
