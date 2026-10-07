"""Does anything back up who the payee is? A claimed relationship alone is not proof."""


def claims_history_only(reading):
    """True if the customer claims to know the payee already, but did not say they met them in person."""
    if reading is None:
        return False
    return bool(reading.get("claims_existing_relationship")) and reading.get("met_payee_in_person", "unknown") != "yes"


def payee_unexplained(reading):
    """True if nothing backs up who the payee is.

    Corroboration means the customer met the payee in person, was introduced by someone they trust,
    or checked the details independently. A claim of history does not count as checking.
    """
    if reading is None:
        return True
    verified = reading.get("customer_verified_independently") and not claims_history_only(reading)
    corroborated = (
        verified
        or reading.get("met_payee_in_person", "unknown") == "yes"
        or reading.get("contact_source", "unknown") in ("in_person", "referral")
    )
    return not corroborated
