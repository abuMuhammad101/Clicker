"""
The demo database for Journey B: "Harbour Gate Clearing (demo)", a customs clearing agency at Karachi port.

Twelve clients, forty-two jobs in every stage (weighted to the middle of the pipeline, where the work
and the risk are), twenty-eight containers on a free-days countdown, disbursements waiting for
Accounts, nine closed jobs with posted invoices and some payments, and one job at Released that is set
up for the live gate-out: three approved disbursements, one not yet approved, and a client with a clean
history, so the invoice it drafts is easy to read.

Everything goes in through the data layer and the workflow, as the person who would have done it, so
every record has a real activity trail. Idempotent: jobs are found by bill-of-lading number,
containers by number, disbursements by (job, kind, receipt), so running it again adds nothing.
All names are fictional and marked "(demo)". Passwords go to the local `.env` (keys
`DEMO_PASSWORD_<USERNAME>`), never printed, never committed.
"""
import datetime
import random
import secrets
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Sum

from billing.models import Bill, Payment
from core.models import Contact, Country, Staff
from foundation import actions, computed
from foundation.money import format_money, quantize
from foundation.roles import seed_roles
from water.demo import _env_append, _env_values

from .models import Container, Disbursement, Job

STAFF = [
    # username, first, last, role
    ('hamza.farooqui', 'Hamza', 'Farooqui', 'Owner'),
    ('mehwish.rauf', 'Mehwish', 'Rauf', 'Coordinator'),
    ('sadia.anwar', 'Sadia', 'Anwar', 'Documentation'),
    ('rashid.baloch', 'Rashid', 'Baloch', 'Field agent'),
    ('ibrahim.qazi', 'Ibrahim', 'Qazi', 'Accounts'),
]
# Works in the field, doesn't sign in to the app: a job can still be assigned to him.
RUNNER = ('Kamran Lashari', 'Field agent')

CLIENTS = [
    # name, goods, a plausible service fee range (rupees)
    ('Indus Textile Mills (demo)', 'Cotton yarn', (140_000, 260_000)),
    ('Karachi Pharma Distributors (demo)', 'Pharmaceutical raw materials', (180_000, 320_000)),
    ('Sindh Auto Parts Traders (demo)', 'Automotive spare parts', (110_000, 210_000)),
    ('Hilal Steel Re-Rolling Mills (demo)', 'Steel billets', (200_000, 350_000)),
    ('Mehran Edible Oils (demo)', 'Crude palm oil', (150_000, 280_000)),
    ('Lyari Electronics Importers (demo)', 'Consumer electronics', (95_000, 190_000)),
    ('Bolan Chemicals (Pvt) Ltd (demo)', 'Industrial chemicals', (170_000, 300_000)),
    ('Gulshan Paper & Board (demo)', 'Paper board reels', (90_000, 170_000)),
    ('Quetta Dry Fruit Traders (demo)', 'Dried fruit', (80_000, 150_000)),
    ('Orient Tyres & Rubber (demo)', 'Truck tyres', (120_000, 230_000)),
    ('Makran Machinery Importers (demo)', 'Packaging machinery', (160_000, 270_000)),
    ('Crescent Home Appliances (demo)', 'Household appliances', (100_000, 200_000)),
]
VESSELS = ['MV Seaview Alpha', 'MV Harbour Pearl', 'MV Arabian Dawn', 'MV Indus Voyager', 'MV Manora Star', 'MV Clifton Bay']
ORIGINS = ['Shanghai', 'Jebel Ali', 'Port Klang', 'Singapore', 'Colombo', 'Nhava Sheva', 'Jeddah', 'Qingdao']
BOX_PREFIX = ['MSKU', 'TGHU', 'CMAU', 'HLXU', 'OOLU', 'TCLU', 'SEGU', 'BMOU']
RATE = {'20': Decimal('12000.00'), '40': Decimal('22000.00'), '40hc': Decimal('24000.00')}

# The pipeline's shape: (state, how many jobs). The middle is where the work is.
SHAPE = [
    ('booked', 2), ('documents_in', 2), ('gd_filed', 3), ('assessed', 8), ('duty_paid', 7),
    ('examined', 6), ('released', 2), ('gate_out', 2), ('closed', 9), ('cancelled', 1),
]
ORDER = ['booked', 'documents_in', 'gd_filed', 'assessed', 'duty_paid', 'examined', 'released', 'gate_out', 'closed']
STEPS = {  # state reached → (transition, who)
    'documents_in': ('documents_in', 'documentation'),
    'gd_filed': ('file_gd', 'documentation'),
    'assessed': ('assess', 'documentation'),
    'duty_paid': ('pay_duty', 'coordinator'),
    'examined': ('examine', 'agent'),
    'released': ('release', 'agent'),
    'gate_out': ('gate_out', 'coordinator'),
    'closed': ('close', 'coordinator'),
}
# What has been paid out by the time a job is this far.
DISBURSEMENT_PLAN = {
    'documents_in': ['shipping_line_do'],
    'gd_filed': ['shipping_line_do'],
    'assessed': ['shipping_line_do', 'terminal_handling'],
    'duty_paid': ['shipping_line_do', 'terminal_handling', 'customs_duty'],
    'examined': ['shipping_line_do', 'terminal_handling', 'customs_duty', 'examination_labour'],
    'released': ['shipping_line_do', 'terminal_handling', 'customs_duty', 'port_charges'],
}
AMOUNT = {
    'customs_duty': (350_000, 3_200_000), 'port_charges': (45_000, 120_000), 'shipping_line_do': (25_000, 62_000),
    'terminal_handling': (30_000, 92_000), 'examination_labour': (8_000, 21_000), 'transport': (32_000, 96_000),
}
# The live demo job: the 7th created, so its number reads JOB-<year>-0007.
LIVE_INDEX = 7


def _plan():
    """Every job's target state, in a fixed, shuffled order (so the numbers aren't sorted by stage)."""
    states = [state for state, count in SHAPE for _ in range(count)]
    random.Random(42).shuffle(states)
    # The live job sits at Released, in position 7.
    released_at = next(i for i, s in enumerate(states) if s == 'released')
    states[LIVE_INDEX - 1], states[released_at] = states[released_at], states[LIVE_INDEX - 1]
    return states


class Seeder:
    def __init__(self, out, env_file, today=None, months=12, seed=11):
        self.out = out
        self.env_file = Path(env_file)
        self.today = today or computed.today()
        self.seed = seed
        self.created = defaultdict(int)

    def say(self, text):
        self.out.write(text)

    # ---------------------------------------------------------------- people

    def people(self):
        seed_roles()
        user_model = get_user_model()
        env = _env_values(self.env_file)
        new_lines = []
        self.ctx, self.users = {}, {}
        for username, first, last, role in STAFF:
            key = f'DEMO_PASSWORD_{username.upper().replace(".", "_")}'
            password = env.get(key)
            if not password:
                password = secrets.token_urlsafe(18)
                new_lines.append(f'{key}={password}')
            user, made = user_model.objects.get_or_create(
                username=username, defaults={'first_name': first, 'last_name': last, 'is_active': True}
            )
            if made or not user.check_password(password):
                user.set_password(password)
            user.first_name, user.last_name, user.is_active = first, last, True
            user.save()
            user.groups.set([Group.objects.get(name=role)])
            self.users[username] = user
            staff, was_new = Staff.objects.get_or_create(
                user=user, defaults={'display_name': f'{first} {last}', 'role': role}
            )
            if staff.role != role:
                Staff.objects.filter(pk=staff.pk).update(role=role)
            self.created['team'] += was_new
        if new_lines:
            _env_append(self.env_file, ['# Demo staff logins (generated; never commit this file)', *new_lines])
        by_role = {role: self.users[username] for username, _, _, role in STAFF}
        self.owner = actions.Context(by_role['Owner'])
        self.coordinator = actions.Context(by_role['Coordinator'])
        self.documentation = actions.Context(by_role['Documentation'])
        self.agent = actions.Context(by_role['Field agent'])
        self.accounts = actions.Context(by_role['Accounts'])
        self.agent_staff = Staff.objects.get(user=by_role['Field agent'])
        runner, was_new = Staff.objects.get_or_create(display_name=RUNNER[0], defaults={'role': RUNNER[1]})
        self.runner_staff = runner
        self.created['team'] += was_new

    # --------------------------------------------------------------- clients

    def clients(self):
        pakistan, _ = Country.objects.get_or_create(code='PK', defaults={'name': 'Pakistan'})
        self.client_by_name = {}
        for number, (name, goods, fee) in enumerate(CLIENTS, start=1):
            contact = Contact.objects.filter(name=name).first()
            if contact is None:
                contact = actions.create(
                    self.coordinator, Contact, name=name, type='company', is_customer=True, payment_terms_days=30,
                    tax_id=f'NTN-{2400000 + number * 137:07d}', city='Karachi', country=pakistan,
                    customer_since=datetime.date(2019 + number % 6, 1 + number % 12, 1 + number % 27),
                )
                self.created['clients'] += 1
            self.client_by_name[name] = contact

    # ------------------------------------------------------------------ jobs

    def step(self, ctx, obj, name):
        actions.require_grant(ctx, type(obj), name)
        return actions.perform_transition(ctx, obj, name)

    def advance(self, job, target, rng):
        """Move a job along the main line to `target`, each step by the person who would do it."""
        current = job.state
        if current == 'cancelled' or ORDER.index(current) >= ORDER.index(target):
            return
        for state in ORDER[ORDER.index(current) + 1: ORDER.index(target) + 1]:
            name, who = STEPS[state]
            if state == 'closed':
                break  # closing needs its invoice posted: done with the money, below
            if state == 'gate_out':
                self.gate_out(job)
                continue
            ctx = {'documentation': self.documentation, 'coordinator': self.coordinator}.get(who)
            if who == 'agent':
                ctx = self.agent if job.assigned_to_id == self.agent_staff.pk else self.coordinator
            self.step(ctx, job, name)
            job.refresh_from_db()

    def gate_out(self, job):
        """Gate-out drafts the invoice (the point of Journey B); every other step is a plain transition."""
        self.step(self.coordinator, job, 'gate_out')
        job.refresh_from_db()

    def make_jobs(self):
        states = _plan()
        self.jobs, self.targets = [], {}
        today = self.today
        for index, target in enumerate(states, start=1):
            rng = random.Random(self.seed * 1000 + index)
            name, goods, (fee_low, fee_high) = CLIENTS[(index * 5) % len(CLIENTS)]
            if index == LIVE_INDEX:
                name, goods, (fee_low, fee_high) = CLIENTS[10]
            bl = f'MAEU{2026000 + index:08d}'
            job = Job.objects.filter(bl_number=bl).first()
            if job is None:
                eta_ago = {'booked': -rng.randint(3, 9)}.get(target, rng.randint(6, 24))
                fee = Decimal(rng.randrange(fee_low, fee_high, 5000))
                if index == LIVE_INDEX:
                    fee = Decimal('185000')
                job = actions.create(
                    self.coordinator, Job,
                    client=self.client_by_name[name], bl_number=bl, reference=f'PO-{4100 + index}',
                    vessel=VESSELS[index % len(VESSELS)], terminal=['kict', 'pict', 'kpt_east'][index % 3],
                    goods=goods, port_of_origin=ORIGINS[index % len(ORIGINS)], service_fee=fee,
                    eta=today - datetime.timedelta(days=eta_ago),
                    assigned_to=self.agent_staff if index % 3 != 0 else self.runner_staff,
                )
                self.created['jobs'] += 1
            self.jobs.append(job)
            self.targets[job.pk] = target
        # A cancelled job was cancelled early in its life.
        for job in self.jobs:
            if self.targets[job.pk] == 'cancelled' and job.state != 'cancelled':
                self.step(self.documentation, job, 'documents_in')
                job.refresh_from_db()
                self.step(self.coordinator, job, 'cancel')

    # ----------------------------------------------------------- containers

    def containers_and_money(self):
        """Containers on a countdown, disbursements waiting for Accounts, and the invoices of the finished jobs."""
        plan = self.container_plan()
        for index, job in enumerate(self.jobs, start=1):
            target = self.targets[job.pk]
            rng = random.Random(self.seed * 7000 + index)
            if target in ('booked', 'cancelled'):
                continue
            for number, size, discharged_ago, free_days in plan.get(job.pk, []):
                self.container(job, number, size, discharged_ago, free_days, rng)
            self.disbursements(job, index, target, rng)
            self.advance(job, target if target != 'closed' else 'gate_out', rng)
            job.refresh_from_db()
        for job in self.jobs:
            self.finish(job, self.targets[job.pk])

    def container_plan(self):
        """{job pk: [(number, size, days since discharge, free days)]}: the countdown story, chosen on purpose."""
        open_states = ('documents_in', 'gd_filed', 'assessed', 'duty_paid', 'examined', 'released')
        open_jobs = [j for j in self.jobs if self.targets[j.pk] in open_states and not self._live(j)]
        by_state = defaultdict(list)
        for job in open_jobs:
            by_state[self.targets[job.pk]].append(job)
        plan = defaultdict(list)
        serial = [0]

        def box(size='40'):
            serial[0] += 1
            return (f'{BOX_PREFIX[serial[0] % len(BOX_PREFIX)]}{7000000 + serial[0] * 131:07d}', size)

        def add(job, ago, free, size='40'):
            number, size = box(size)
            plan[job.pk].append((number, size, ago, free))

        # Two already accruing (waiting on duty, the classic way to lose money), three on their last days.
        assessed = by_state['assessed']
        add(assessed[0], 10, 7)           # 3 days past: accruing
        add(assessed[1], 11, 7, '20')     # 4 days past: accruing
        add(by_state['duty_paid'][0], 5, 7)   # 2 days left
        add(by_state['duty_paid'][1], 6, 7, '40hc')  # 1 day left
        add(by_state['examined'][0], 7, 7)    # 0 days left: the last free day
        # The rest comfortable: fresh discharges, or long free-day agreements.
        comfortable = [
            (by_state['documents_in'][0], 0, 7), (by_state['documents_in'][1], 1, 10), (by_state['gd_filed'][0], 2, 14),
            (by_state['gd_filed'][1], 1, 7), (by_state['gd_filed'][2], 3, 14), (assessed[2], 2, 10), (assessed[3], 3, 14),
            (by_state['duty_paid'][2], 4, 14), (by_state['duty_paid'][3], 2, 14),
            (by_state['examined'][1], 3, 14), (by_state['released'][0] if by_state['released'] else assessed[5], 1, 14),
        ]
        for job, ago, free in comfortable:
            add(job, ago, free, '40' if (ago + free) % 2 else '20')
        # The live demo job's one container (it goes out at gate-out).
        live = next(j for j in self.jobs if self._live(j))
        add(live, 3, 10)
        # Finished jobs each brought one container through the gate.
        for job in self.jobs:
            if self.targets[job.pk] in ('gate_out', 'closed'):
                add(job, 12, 14)
        return plan

    def _live(self, job):
        return job.bl_number == f'MAEU{2026000 + LIVE_INDEX:08d}'

    def container(self, job, number, size, discharged_ago, free_days, rng):
        if Container.objects.filter(number=number, job=job).exists():
            return
        actions.create(
            self.coordinator, Container, job=job, number=number, size=size,
            discharged_on=self.today - datetime.timedelta(days=discharged_ago), free_days=free_days,
            demurrage_rate_per_day=RATE[size],
        )
        self.created['containers'] += 1

    def disbursements(self, job, index, target, rng):
        kinds = DISBURSEMENT_PLAN.get(target) or (DISBURSEMENT_PLAN['released'] if target in ('gate_out', 'closed') else [])
        if self._live(job):
            kinds = ['customs_duty', 'port_charges', 'shipping_line_do']  # three, all approved
        recorder = self.agent if job.assigned_to_id == self.agent_staff.pk else self.coordinator
        # Some of the newest payments on open jobs are still waiting for Accounts.
        newest_waits = index in (3, 5, 9, 12, 15, 18, 26, 30, 33) and target not in ('gate_out', 'closed')
        for position, kind in enumerate(kinds):
            low, high = AMOUNT[kind]
            amount = Decimal(rng.randrange(low, high, 500))
            receipt = f'{kind[:3].upper()}-{index:03d}{position}'
            if self._live(job):
                amount = {'customs_duty': Decimal('1425000'), 'port_charges': Decimal('62500'), 'shipping_line_do': Decimal('38000')}.get(kind, amount)
            if Disbursement.objects.filter(job=job, kind=kind, receipt_ref=receipt).exists():
                continue
            paid = actions.create(
                recorder, Disbursement, job=job, kind=kind, amount=amount, receipt_ref=receipt,
                paid_on=self.today - datetime.timedelta(days=max(1, 8 - position * 2)),
            )
            self.created['disbursements'] += 1
            last = position == len(kinds) - 1
            if not (newest_waits and last):
                self.step(self.accounts, paid, 'approve')
        if self._live(job):
            # One more, recorded and left for Accounts: it will be flagged "not yet billed" on the draft.
            if not Disbursement.objects.filter(job=job, kind='transport').exists():
                actions.create(self.agent, Disbursement, job=job, kind='transport', amount=Decimal('45000'),
                               receipt_ref='TRN-007', paid_on=self.today - datetime.timedelta(days=1))
                self.created['disbursements'] += 1

    # ------------------------------------------------------ finished jobs

    def finish(self, job, target):
        """Gate-out and closed jobs: containers out, invoice dated back, posted, paid in part or in full, closed."""
        if target not in ('gate_out', 'closed'):
            return
        job.refresh_from_db()
        if job.state not in ('gate_out', 'closed'):
            return
        finished = [j.pk for j in self.jobs if self.targets[j.pk] in ('gate_out', 'closed')]
        ordinal = finished.index(job.pk)
        gate_out_jobs = [j.pk for j in self.jobs if self.targets[j.pk] == 'gate_out']
        rng = random.Random(self.seed * 9000 + ordinal)
        bill_ago = 6 + ordinal * 7 + rng.randint(0, 3)
        issue = self.today - datetime.timedelta(days=bill_ago)
        bill = Bill.objects.get(pk=job.invoice_id)
        if bill.state == 'draft' and bill.issue_date != issue:
            actions.change(self.coordinator, bill, issue_date=issue, due_date=issue + datetime.timedelta(days=30))
        for container in job.containers.filter(gate_out_on__isnull=True):
            discharged = issue - datetime.timedelta(days=rng.randint(6, 12))
            actions.change(self.coordinator, container, discharged_on=discharged, free_days=14,
                           gate_out_on=issue - datetime.timedelta(days=rng.randint(0, 2)), state='delivered')
        def backdate():
            # Last, because every move starts the stage clock again: the story says when it really got here.
            job.refresh_from_db()
            if job.stage_since != issue:
                actions.change(self.coordinator, job, stage_since=issue)

        if target == 'gate_out' and job.pk == gate_out_jobs[0]:
            backdate()
            return  # left as a draft: Accounts has not posted it yet
        bill.refresh_from_db()
        if bill.state == 'draft':
            self.step(self.accounts, bill, 'post')
            bill.refresh_from_db()
        if target == 'closed':
            self.pay(job, bill, ordinal, rng)
        if target == 'closed':
            job.refresh_from_db()
            if job.state == 'gate_out':
                self.step(self.coordinator, job, 'close')
        backdate()

    def pay(self, job, bill, ordinal, rng):
        """Some invoices are paid in full, one in part; the rest wait (so Accounts has both kinds of history)."""
        if ordinal % 3 == 2:
            return  # on credit: invoiced and posted, not yet paid
        full = ordinal % 4 != 3
        amount = bill.balance_value if full else quantize(bill.balance_value * Decimal('0.6'))
        reference = f'SBP-RTGS-{job.number[-4:]}'
        if Payment.objects.filter(method='bank_transfer', reference=reference).exists():
            return
        when = min(self.today, bill.issue_date + datetime.timedelta(days=rng.randint(9, 34)))
        payment = actions.create(
            self.accounts, Payment, customer=job.client, amount=amount, method='bank_transfer', reference=reference,
            payment_date=when,
        )
        self.step(self.accounts, payment, 'post')
        self.created['payments'] += 1

    # ---------------------------------------------------------------- report

    def report(self):
        crore = Decimal('10000000')
        by_state = Counter(Job.objects.values_list('state', flat=True))
        stages = ', '.join(f'{label} {by_state.get(value, 0)}' for value, label in Job.STATE_CHOICES)
        self.say(f'  {Job.objects.count()} jobs: {stages}')
        inside = Container.objects.filter(gate_out_on__isnull=True)
        self.say(f'  {Container.objects.count()} containers; {inside.count()} still inside the port')
        from foundation import computed as c

        annotated = c.annotate(Container.objects.filter(gate_out_on__isnull=True), Container)
        risk = Counter(annotated.values_list('deadline_status', flat=True))
        accruing = sum((x or Decimal('0') for x in annotated.filter(deadline_status='accruing').values_list('demurrage_accrued', flat=True)), Decimal('0'))
        self.say(
            f'  demurrage: {risk.get("accruing", 0)} accruing ({format_money(accruing)} so far), '
            f'{risk.get("urgent", 0)} on their last 0 to 2 days, {risk.get("soon", 0)} with 3 to 5 days, '
            f'{risk.get("comfortable", 0)} comfortable'
        )
        live = Job.objects.filter(bl_number=f'MAEU{2026000 + LIVE_INDEX:08d}').first()
        if live is not None:
            from .services import invoice_plan

            plan = invoice_plan(live)
            self.say(
                f'  live gate-out: {live.number} ({live.client.name}) is {live.get_state_display()}: '
                f'invoice will be {format_money(plan["total"])} with {len(plan["lines"])} disbursements, '
                f'{len(plan["pending"])} left out until approved'
            )
        waiting = Disbursement.objects.filter(state='recorded')
        total_waiting = waiting.aggregate(t=Sum('amount'))['t'] or 0
        invoiced = Bill.objects.filter(state='posted').aggregate(t=Sum('amount_total'))['t'] or 0
        received = Payment.objects.filter(state='posted').aggregate(t=Sum('amount'))['t'] or 0
        self.say(
            f'  Accounts: {waiting.count()} disbursements waiting for approval ({format_money(total_waiting)}); '
            f'{Bill.objects.filter(state="posted").count()} posted invoices ({format_money(invoiced)}), '
            f'{format_money(received)} received in {Payment.objects.filter(state="posted").count()} payments'
        )
        self.say('  logins: ' + ', '.join(f'{u} ({r})' for u, _, _, r in STAFF) + f'; passwords are in {self.env_file.name}')

    def run(self):
        steps = [
            ('people', self.people),
            ('clients', self.clients),
            ('jobs', self.make_jobs),
            ('containers, disbursements and invoices', self.containers_and_money),
        ]
        for label, function in steps:
            self.say(f'{label}…')
            function()
        self.report()
