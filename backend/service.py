"""The one entry point the website calls to assess a payment.

Flow:
  1. Read the customer's note (if any) and decide.
  2. If the note is too thin and the payment looks a bit unusual, ask a question.
  3. When the customer answers, read the answer together with the note and decide again.
"""

from backend.risk import clarify
from backend.risk.decision import decide
from backend.risk.evidence import load_scam_types, read_message


def assess(payment, customer, message=None, questions=None, answer=None,
           reader=read_message, asker=clarify.ask_questions, scam_types=None):
    """Assess one payment. Pass `questions` and `answer` for the second round.

    `reader` and `asker` can be swapped out in tests so no internet is needed.
    """
    scam_types = scam_types if scam_types is not None else load_scam_types()

    # Second round: the customer has answered our questions.
    if answer:
        text = clarify.combine(message, questions or [], answer)
        reading = reader(text, scam_types)
        outcome = decide(payment, customer, reading, scam_types)
        outcome["round"] = 2
        return outcome

    reading = reader(message, scam_types) if message else None
    outcome = decide(payment, customer, reading, scam_types)
    outcome["round"] = 1

    if clarify.should_ask(message, reading, outcome):
        outcome["provisional_action"] = outcome["action"]
        outcome["action"] = "ask"
        outcome["questions"] = asker(message, payment)
        outcome["customer_warning"] = ""
    return outcome
