"""Does anything back up who the payee is? A claimed relationship alone is not proof."""


def payee_unexplained(reading):
    """True if nothing backs up who the payee is.

    Corroboration means the customer met the payee in person, was introduced by someone they trust,
    or checked the details independently.
    """
    if reading is None:
        return True
    corroborated = (
        reading.get("customer_verified_independently")
        or reading.get("met_payee_in_person", "unknown") == "yes"
        or reading.get("contact_source", "unknown") in ("in_person", "referral")
    )
    return not corroborated
