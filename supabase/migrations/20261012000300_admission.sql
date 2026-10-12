-- expand-only: allow the application role to take a row lock on the admission gate.
grant update on private.admission_lock to dartspoint_app;
