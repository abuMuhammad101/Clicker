from foundation import actions, computed
from foundation.automation import automation
from foundation.money import money_token

# More than this many days past the due date, and the consumer gets a case.
OVERDUE_DAYS = 60


@automation(
    'open_recovery_cases',
    f'Open a recovery case for every consumer more than {OVERDUE_DAYS} days overdue who has no open case',
)
def open_recovery_cases(ctx):
    from core.models import Contact

    from .models import OPEN_CASE_STATES, RecoveryCase

    # System work reads every consumer: it isn't a person with a role to narrow.
    late = (
        computed.annotate(Contact.objects.filter(is_customer=True), Contact)
        .filter(oldest_overdue_days__gt=OVERDUE_DAYS)
        .exclude(recovery_cases__state__in=OPEN_CASE_STATES)
        .order_by('-outstanding')
    )
    opened = 0
    for consumer in late:
        actions.create(
            ctx,
            RecoveryCase,
            consumer=consumer,
            next_action='Assign an owner and send the first notice',
            summary=f'Opened by Clicker automation: {money_token(consumer.outstanding)} owed, '
            f'oldest bill {consumer.oldest_overdue_days} days overdue',
        )
        opened += 1
    return f'opened {opened} recovery case{"" if opened == 1 else "s"}'
