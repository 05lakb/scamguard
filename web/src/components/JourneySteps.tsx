import { Icon, type IconName } from "./Icon";

const STEPS: { title: string; where: string; icon: IconName }[] = [
  { title: "Payment checked", where: "Transactions", icon: "activity" },
  { title: "Customer's call", where: "Voice AI", icon: "mic" },
  { title: "Agent's recommendation", where: "Transactions", icon: "brain" },
  { title: "Analyst's decision", where: "Cases", icon: "user" },
];

// The four stages of one held payment, so anyone testing can see where they are and what comes next.
export function JourneySteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="journey" aria-label="Stages of a held payment">
      {STEPS.map((step, index) => {
        const number = index + 1;
        const state = number < current ? "done" : number === current ? "now" : "todo";
        return (
          <li key={step.title} className={`journey-step ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="journey-no">{state === "done" ? <Icon name="check" size={13} /> : number}</span>
            <span><strong>{step.title}</strong><small>{step.where}</small></span>
          </li>
        );
      })}
    </ol>
  );
}
