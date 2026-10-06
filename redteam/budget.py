"""Hard limits for a testing run, so it can never go on longer or cost more than you chose."""

import time


class BudgetExceeded(Exception):
    """Raised when a limit is reached. The run stops and reports what it has so far."""


class Budget:
    def __init__(self, max_requests=150, max_minutes=25, max_model_calls=80, clock=time.monotonic):
        self.max_requests = max_requests
        self.max_minutes = max_minutes
        self.max_model_calls = max_model_calls
        self._clock = clock
        self._started = clock()
        self.requests = 0
        self.model_calls = 0

    def _check_time(self):
        minutes = (self._clock() - self._started) / 60
        if minutes >= self.max_minutes:
            raise BudgetExceeded(f"the time limit of {self.max_minutes} minutes was reached")

    def check_request(self):
        """Call before every request to the site."""
        self._check_time()
        if self.requests >= self.max_requests:
            raise BudgetExceeded(f"the limit of {self.max_requests} requests was reached")
        self.requests += 1

    def check_model_call(self):
        """Call before every Gemini call the tester makes itself."""
        self._check_time()
        if self.model_calls >= self.max_model_calls:
            raise BudgetExceeded(f"the limit of {self.max_model_calls} tester Gemini calls was reached")
        self.model_calls += 1

    def used(self):
        minutes = (self._clock() - self._started) / 60
        return f"{self.requests} requests, {self.model_calls} tester Gemini calls, {minutes:.1f} minutes"
