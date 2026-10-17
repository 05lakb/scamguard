import { useState } from "react";
import { Icon } from "./Icon";

// What the customer sees in the bank's app when a payment is held: a notification asking them to
// call the bank, never a call from the bank. Simulated: no message is sent and no call is placed.
export function HoldNotification({ amount, currency, reference }: { amount: number; currency: string; reference: string | null }) {
  const [calling, setCalling] = useState(false);
  return (
    <div className="hold-notification" role="status" aria-label="Simulated in-app notification to the customer">
      <div className="hold-notification-top">
        <span><Icon name="bell" size={15} /> Your bank · now</span>
        <span className="tag">Simulated</span>
      </div>
      <p className="hold-notification-title">We've paused your payment to protect you</p>
      <p>
        Your {amount.toLocaleString()} {currency} payment has not been sent. Please call our fraud team on the number on the back of
        your card, or use the button below{reference ? <>, and quote reference <strong className="mono">{reference}</strong></> : null}.
      </p>
      <p className="muted small">We will never call or message you asking you to move money. Do not use a number someone gave you.</p>
      {calling ? (
        <p className="hold-notification-calling" aria-live="polite">
          <Icon name="user" size={15} /> Simulated call: you are through to the fraud team.{reference ? ` Quote ${reference}.` : ""} The analyst finds your case with it on the Cases page.
        </p>
      ) : (
        <button className="btn small primary" onClick={() => setCalling(true)}><Icon name="user" size={14} /> Call fraud team</button>
      )}
    </div>
  );
}
