"""Assessment pipeline shared by JSON responses and live execution events."""
from backend.risk import clarify
from backend.risk.behaviour import check_behaviour
from backend.risk.network import investigate_network
from backend.risk.decision import decide
from backend.risk.evidence import load_scam_types, read_message


def assess_steps(payment, customer, message=None, questions=None, answer=None,
                 reader=read_message, asker=clarify.ask_questions, scam_types=None, network=None):
    """Yield observed stage transitions; return the decision through the generator.

    No timers or fabricated progress. Model text is shown only after validation.
    """
    scam_types = scam_types if scam_types is not None else load_scam_types()
    def event(stage, status, detail, **extra):
        return {"stage": stage, "status": status, "detail": detail, **extra}

    yield event("behaviour", "running", "Checking amount, payee, device and payment history.")
    behaviour = check_behaviour(payment, customer)
    yield event("behaviour", "complete", f"{len(behaviour['signals'])} payment signals found.", score=behaviour["score"],
                summary=" ".join(signal["reason"] for signal in sorted(behaviour["signals"], key=lambda s: -s["points"])[:3]))

    yield event("network", "running", "Checking the supplied account links.")
    network_result = investigate_network(network)
    yield event("network", "complete" if network_result["available"] else "skipped",
                f"{len(network_result['signals'])} network signals found." if network_result["available"] else "No account graph supplied for this case.", score=network_result["score"],
                summary=" ".join(signal["reason"] for signal in sorted(network_result["signals"], key=lambda s: -s["points"])[:3]))

    reading = None
    if message or answer is not None:
        yield event("message", "running", "Reading the customer story; checking for a saved analysis first.")
        text = clarify.combine(message, questions or [], answer.strip() or "(the customer declined to answer)") if answer is not None else message
        reading = reader(text, scam_types)
        mode = "test" if reader is not read_message else "cached" if reading.get("from_cache") else "live"
        detail = {"test": "Automated test reader completed.", "cached": "Saved Gemini reading reused; no new reading call.", "live": "Fresh Gemini reading returned and validated."}[mode]
        yield event("message", "complete", detail, mode=mode, summary=reading.get("explanation", ""))
    else:
        yield event("message", "skipped", "No customer note to analyse.")

    yield event("decision", "running", "Combining available signals with the decision rules.")
    outcome = decide(payment, customer, reading, scam_types, asked=answer is not None, network=network,
                     behaviour_result=behaviour, network_result=network_result)
    outcome["round"] = 2 if answer is not None else 1
    if answer is None and clarify.should_ask(message, reading, outcome):
        yield event("clarify", "running", "More evidence is needed. Preparing the follow-up question.")
        outcome["provisional_action"] = outcome["action"]
        outcome["action"] = "ask"
        outcome["questions"] = asker(message, payment)
        outcome["customer_warning"] = ""
        yield event("clarify", "complete", "Question ready; waiting for the customer's answer.")
    else:
        yield event("clarify", "skipped", "No further question needed in this round.")
    return outcome


def assess(*args, **kwargs):
    """Retain the existing non-streaming interface for evaluations and callers."""
    steps = assess_steps(*args, **kwargs)
    while True:
        try:
            next(steps)
        except StopIteration as finished:
            return finished.value
