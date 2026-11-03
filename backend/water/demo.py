"""
The demo database for Journey A: a Karachi water utility's bulk consumers,
twelve months of billing and payment, a few reductions, and the recovery
cases the arrears have opened.

Everything goes in through the data layer (`foundation.actions`) and the
workflow transitions, as the staff member who would have done it, so the
activity trail on every record is real: who, when, and what it did. Nothing
is faked with direct inserts.

Idempotent: every record is found by a natural key (a name, a connection
number, a payment reference, a run's month) and left alone if it exists, so
running it again adds only what is missing, and a month later adds the new
month. All consumers and organisations are fictional and marked "(demo)".

Passwords for the staff accounts are generated into the local `.env` (keys
`DEMO_PASSWORD_<USERNAME>`), never printed, never committed; running it
against another database reuses the same passwords from the same file.
"""
import datetime
import random
import re
import secrets
from collections import defaultdict, deque
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Sum

from billing.models import Adjustment, Bill, Payment
from core.models import Contact, Country, Staff
from foundation import actions, automation, computed
from foundation.money import quantize
from foundation.roles import seed_roles

from .models import BillingRun, Connection, RecoveryCase, Tariff

STAFF = [
    # username, first, last, role
    ('ayesha.khan', 'Ayesha', 'Khan', 'Manager'),
    ('bilal.ahmed', 'Bilal', 'Ahmed', 'Billing officer'),
    ('sana.malik', 'Sana', 'Malik', 'Billing officer'),
    ('imran.siddiqui', 'Imran', 'Siddiqui', 'Cashier'),
    ('farhan.raza', 'Farhan', 'Raza', 'Recovery officer'),
    ('nida.hussain', 'Nida', 'Hussain', 'Recovery officer'),
    ('zainab.qureshi', 'Zainab', 'Qureshi', 'Auditor'),
]

# name, category, rate per 1,000 gallons, sewerage %
TARIFFS = [
    ('Federal government 2025/26', 'federal', '285.00', '35.00'),
    ('Provincial government 2025/26', 'provincial', '265.00', '35.00'),
    ('Military 2025/26', 'military', '240.00', '35.00'),
    ('Port & utility 2025/26', 'port_utility', '310.00', '40.00'),
    ('Industrial 2025/26', 'industrial', '380.00', '40.00'),
    ('Commercial 2025/26', 'commercial', '340.00', '35.00'),
]

# category: (connections each (min, max), kgal a month (median), payment terms, districts)
PROFILES = {
    'federal': ((1, 2), 14000, 45, ['central', 'south', 'east']),
    'provincial': ((1, 2), 2200, 45, ['central', 'east', 'west']),
    'military': ((1, 2), 3500, 30, ['malir', 'korangi', 'keamari']),
    'port_utility': ((1, 3), 2500, 30, ['keamari', 'south']),
    'industrial': ((1, 2), 1300, 30, ['korangi', 'west', 'malir']),
    'commercial': ((1, 1), 500, 30, ['south', 'east', 'central', 'west']),
}

FEDERAL = [
    'Federal Steel Corporation', 'Federal Housing Authority', 'Federal Railways Workshop', 'Federal Customs House',
    'Federal Aviation Services', 'Federal Marine Directorate', 'Federal Highway Directorate', 'Federal Standards Laboratory',
    'Federal Revenue Complex', 'Federal Telecom Regulator', 'Federal Fertiliser Plant', 'Federal Ordnance Stores',
    'National Shipping Agency', 'National Archives Complex',
]
PROVINCIAL = [
    'Provincial Hospitals Board', 'Provincial Education Complex', 'Provincial Police Lines', 'Provincial Jails Directorate',
    'Provincial Secretariat', 'Provincial Fisheries Department', 'Provincial Irrigation Colony', 'Provincial Transport Depot',
    'Provincial Agriculture Station', 'Provincial Cultural Centre', 'Provincial Revenue Office', 'Provincial Sports Complex',
]
MILITARY = [
    'Garrison Engineers Malir', 'Garrison Engineers Korangi', 'Garrison Engineers Clifton', 'Garrison Engineers Saddar',
    'Cantonment Works Drigh Road', 'Cantonment Works Faisal', 'Naval Stores Depot', 'Naval Dockyard Annex',
    'Air Maintenance Depot', 'Ordnance Factory Annex', 'Army Supply Depot', 'Military Hospital Complex',
    'Defence Housing Works', 'Coastal Command Quarters',
]
PORT_UTILITY = [
    'Port Authority', 'Container Terminal One', 'Container Terminal Two', 'Bulk Cargo Terminal', 'Southern Gas Co.',
    'Karachi Power Co.', 'Coastal Telecom Co.', 'Harbour Fuel Terminal', 'Oil Jetty Operators', 'Shipyard Services Co.',
    'Metro Rail Authority', 'Sea Mail Logistics',
]
INDUSTRY_AREAS = ['Korangi', 'SITE', 'Landhi', 'Port Qasim']
INDUSTRY_KINDS = [
    'Textiles', 'Steel Rolling', 'Chemicals', 'Beverages', 'Pharma', 'Paper Mills', 'Cement', 'Packaging', 'Tyres',
    'Rice Exports', 'Leather Goods', 'Ceramics', 'Plastics', 'Fertiliser', 'Cables', 'Foods', 'Dairy', 'Surgical Goods',
    'Auto Parts', 'Garments',
]
COMMERCIAL_NAMES = [
    'Seaview Heights', 'Clifton Plaza', 'Bay Mall', 'Gulshan Tower', 'Saddar Arcade', 'Bahria Square', 'Metro Hotel',
    'Harbour Hotel', 'Crescent Hospital', 'Lakeside Hospital', 'Civic University', 'Coastal Institute', 'North Nazimabad Mall',
    'Defence Towers', 'Sunset Residency', 'Karsaz Complex', 'City Convention Centre', 'Marina Club', 'Garden Apartments',
    'Business Bay', 'Tariq Road Plaza', 'Boulevard Tower', 'Palm Court', 'Airport Hotel', 'Pearl Residency', 'Union Mart',
    'Central Hospital', 'Skyline Offices', 'Frere Court', 'Shahrah Plaza', 'Ocean Tower', 'Delta Mall', 'Capital Chambers',
    'Meridian Hotel', 'Sea Breeze Apartments', 'Oasis Mall', 'Anchor Offices', 'Falcon Tower', 'Zamzama Arcade',
    'Horizon Hospital', 'Jubilee Heights', 'Regent Plaza', 'Beacon Chambers', 'Summit Hotel', 'Orchard Residency',
    'Dockside Offices', 'Kohinoor Plaza', 'Gateway Mall',
]

DISTRICT_CODE = {
    'central': 'CEN', 'east': 'EAS', 'west': 'WES', 'south': 'SOU', 'korangi': 'KOR', 'malir': 'MAL', 'keamari': 'KEA',
}


def _consumers():
    """The roster: (name, category, vendor?). 150 of them, fixed, all "(demo)"."""
    roster = []
    roster += [(f'{n} (demo)', 'federal', False) for n in FEDERAL]
    roster += [(f'{n} (demo)', 'provincial', False) for n in PROVINCIAL]
    roster += [(f'{n} (demo)', 'military', False) for n in MILITARY]
    roster += [(f'{n} (demo)', 'port_utility', n == 'Karachi Power Co.') for n in PORT_UTILITY]
    kinds = [(area, kind) for kind in INDUSTRY_KINDS for area in INDUSTRY_AREAS]
    random.Random(11).shuffle(kinds)
    roster += [(f'{area} {kind} (Pvt) Ltd (demo)', 'industrial', False) for area, kind in kinds[:50]]
    roster += [(f'{n} (demo)', 'commercial', False) for n in COMMERCIAL_NAMES]
    return roster


# ------------------------------------------------------------------ passwords


def _env_values(path):
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
            if match:
                values[match.group(1)] = match.group(2)
    return values


def _env_append(path, lines):
    existing = path.read_text(encoding='utf-8') if path.exists() else ''
    separator = '' if existing.endswith('\n') or not existing else '\n'
    path.write_text(existing + separator + '\n'.join(lines) + '\n', encoding='utf-8')


class Seeder:
    def __init__(self, out, env_file, today=None, months=12, seed=7):
        self.out = out
        self.env_file = Path(env_file)
        self.today = today or computed.today()
        self.months = months
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
        self.users, self.ctx, self.staff = {}, {}, {}
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
            self.ctx[username] = actions.Context(user)
            staff, was_new = Staff.objects.get_or_create(user=user, defaults={'display_name': f'{first} {last}'})
            self.staff[username] = staff
            self.created['staff'] += was_new
        if new_lines:
            _env_append(self.env_file, ['# Demo staff logins (generated; never commit this file)', *new_lines])
        self.manager = self.ctx['ayesha.khan']
        self.officers = [self.ctx['bilal.ahmed'], self.ctx['sana.malik']]
        self.cashier = self.ctx['imran.siddiqui']
        self.recovery = [self.ctx['farhan.raza'], self.ctx['nida.hussain']]

    # ------------------------------------------------------------- reference

    def reference(self):
        self.pakistan, _ = Country.objects.get_or_create(code='PK', defaults={'name': 'Pakistan'})
        self.tariffs = {}
        for name, category, rate, sewerage in TARIFFS:
            tariff = Tariff.objects.filter(name=name).first()
            if tariff is None:
                tariff = actions.create(
                    self.officers[0],
                    Tariff,
                    name=name,
                    category=category,
                    rate_per_kgal=Decimal(rate),
                    sewerage_percent=Decimal(sewerage),
                    effective_from=datetime.date(2025, 7, 1),
                )
                self.created['tariffs'] += 1
            self.tariffs[category] = tariff

    # ------------------------------------------------------------- consumers

    def consumers(self):
        self.profile = {}
        sequence = defaultdict(int)
        for connection in Connection.objects.values_list('number', flat=True):
            sequence[connection.split('-')[1]] = max(sequence[connection.split('-')[1]], int(connection.split('-')[2]))
        officers = list(self.staff.values())[1:3]
        for index, (name, category, vendor) in enumerate(_consumers()):
            (low, high), median, terms, districts = PROFILES[category]
            # Each consumer has its own stream, so what they get never depends on who
            # already existed: running the seed again changes nothing.
            rng = random.Random(f'{self.seed}:{name}')
            wanted = rng.randint(low, high)
            consumer = Contact.objects.filter(name=name).first()
            if consumer is None:
                consumer = actions.create(
                    self.officers[index % 2],
                    Contact,
                    name=name,
                    type='company',
                    is_customer=True,
                    is_vendor=vendor,
                    country=self.pakistan,
                    city='Karachi',
                    tax_id=f'NTN-{1000000 + index * 137:07d}',
                    payment_terms_days=terms,
                    customer_since=datetime.date(2015 + index % 9, 1 + index % 12, 1),
                )
                self.created['consumers'] += 1
            self.profile[consumer.pk] = {'category': category, 'offset': rng.randint(0, 3), 'name': name}
            have = consumer.connections.count()
            for n in range(wanted):
                district = districts[(index + n) % len(districts)]
                size = rng.choice([75, 100, 150, 200, 300, 450, 600])
                kgal = Decimal(str(round(median * rng.lognormvariate(0, 0.7), 3)))
                if n < have:
                    continue
                code = DISTRICT_CODE[district]
                sequence[code] += 1
                metered = (index + n) % 10 == 0
                actions.create(
                    self.officers[(index + n) % 2],
                    Connection,
                    number=f'CON-{code}-{sequence[code]:05d}',
                    consumer=consumer,
                    district=district,
                    tariff=self.tariffs[category],
                    size_mm=size,
                    billing_basis='metered' if metered else 'average',
                    meter_number=f'MTR-{code}-{sequence[code]:05d}' if metered else '',
                    assessed_monthly_kgal=kgal,
                    account_officer=officers[(index + n) % 2],
                )
                self.created['connections'] += 1

    # ----------------------------------------------------------- twelve months

    def periods(self):
        first = self.today.replace(day=1)
        months = []
        year, month = first.year, first.month
        for _ in range(self.months):
            month -= 1
            if month == 0:
                year, month = year - 1, 12
            months.append(datetime.date(year, month, 1))
        return sorted(months)

    @staticmethod
    def _last_day(period):
        following = (period.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        return following - datetime.timedelta(days=1)

    def step(self, ctx, obj, name):
        actions.require_grant(ctx, type(obj), name)
        return actions.perform_transition(ctx, obj, name)

    def billing_and_payments(self):
        """
        Month by month, oldest first: what each consumer pays (by how their
        kind of consumer behaves), then that month's bills. Payments are made
        before the month's bills, so each is allocated against the bills that
        existed when it was paid.
        """
        rng = random.Random(self.seed + 1)
        periods = self.periods()
        ledger = defaultdict(deque)  # consumer id → deque of [month index, amount still owed]
        last_bill = defaultdict(Decimal)
        for index, period in enumerate(periods):
            if index:
                self.pay_month(rng, ledger, last_bill, index, periods[index])
            run = BillingRun.objects.filter(period=period, district='').first()
            if run is None or run.state != 'posted':
                self.bill_month(period, run)
            # The month's bills go on the ledger whether this run made them or an earlier
            # one did, so the same choices are replayed and nothing is paid twice.
            for bill in Bill.objects.filter(issue_date=self._last_day(period), state='posted'):
                ledger[bill.customer_id].append([index, bill.amount_total])
                last_bill[bill.customer_id] = bill.amount_total
        # The current month so far: payments dated up to today.
        self.pay_month(rng, ledger, last_bill, len(periods), self.today.replace(day=1))

    def bill_month(self, period, run):
        if run is None:
            run = actions.create(
                self.officers[0], BillingRun, period=period, issue_date=self._last_day(period)
            )
            self.created['runs'] += 1
        if run.state == 'draft':
            self.step(self.officers[0], run, 'generate')
            run.refresh_from_db()
        if run.state == 'generated':
            self.step(self.officers[0], run, 'post_all')

    def pay_month(self, rng, ledger, last_bill, index, month_start):
        for consumer_id, profile in self.profile.items():
            queue = ledger[consumer_id]
            owed = sum(remaining for _, remaining in queue)
            if owed <= 0:
                continue
            amount = self.planned(profile, queue, owed, last_bill[consumer_id], index, rng)
            amount = (Decimal(amount) / 100).quantize(Decimal('1')) * 100
            if amount <= 0:
                continue
            day = rng.randint(4, 26)
            paid_on = month_start.replace(day=min(day, 27))
            if paid_on > self.today:
                continue
            reference = f'DEMO-{consumer_id}-{paid_on:%Y%m}'
            method = (
                'cheque' if profile['category'] in ('federal', 'provincial')
                else 'bank_transfer' if profile['category'] == 'military' else 'onelink'
            )
            if Payment.objects.filter(method=method, reference=reference).exists():
                self._apply_to_ledger(queue, amount)
                continue
            payment = actions.create(
                self.cashier,
                Payment,
                customer_id=consumer_id,
                payment_date=paid_on,
                amount=amount,
                method=method,
                reference=reference,
            )
            self.step(self.cashier, payment, 'post')
            self.created['payments'] += 1
            self._apply_to_ledger(queue, amount)

    @staticmethod
    def _apply_to_ledger(queue, amount):
        remaining = Decimal(amount)
        while remaining > 0 and queue:
            take = min(queue[0][1], remaining)
            queue[0][1] -= take
            remaining -= take
            if queue[0][1] <= 0:
                queue.popleft()

    @staticmethod
    def planned(profile, queue, owed, last, index, rng):
        """How much this consumer pays this month: the story of who pays how."""
        category = profile['category']
        old = sum(remaining for month, remaining in queue if month <= index - 3)
        if category == 'federal':  # rarely pays, and then a little
            return min(owed, last * Decimal(rng.uniform(0.4, 1.0))) if rng.random() < 0.06 else 0
        if category == 'provincial':
            return min(owed, last * Decimal(rng.uniform(0.8, 1.4))) if rng.random() < 0.6 else 0
        if category == 'military':  # pays late, in lumps
            return min(owed, old * Decimal(rng.uniform(0.6, 0.95))) if (index + profile['offset']) % 4 == 0 and old > 0 else 0
        if category == 'port_utility':  # mostly on time, and catches up after a missed month
            pace = Decimal('1.0') if owed < Decimal('1.8') * last else Decimal('1.6')
            return min(owed, last * pace * Decimal(rng.uniform(0.95, 1.05))) if rng.random() < 0.85 else 0
        if category == 'industrial':  # partly
            return min(owed, last * Decimal(rng.uniform(0.7, 1.05))) if rng.random() < 0.8 else 0
        if rng.random() < 0.03:  # a commercial consumer paying ahead: an advance
            return last * Decimal('1.15')
        return min(owed, last) if rng.random() < 0.92 else 0

    # ------------------------------------------------------------ adjustments

    def adjustments(self):
        """A handful of reductions: approved, rejected, and one waiting for the Manager."""
        plan = [
            # (category, nth consumer in it, kind, share of the bill, reason, outcome, requested by)
            ('federal', 2, 'write_off', 0.35, 'Meter found faulty on inspection; the average was assessed too high.', 'approve', 0),
            ('industrial', 3, 'correction', 0.12, 'Consumption assessed twice for the same month; one assessment cancelled.', 'approve', 1),
            ('military', 1, 'credit', 0.08, 'Goodwill credit after a main burst interrupted supply for nine days.', 'approve', 0),
            ('provincial', 4, 'write_off', 0.6, 'Requested write-off of a disputed balance.', 'reject', 1),
            ('commercial', 5, 'credit', 0.5, 'Credit requested without a supporting inspection report.', 'reject', 0),
            ('port_utility', 2, 'correction', 0.2, 'Sewerage charged on a connection that has no sewer; awaiting approval.', 'wait', 1),
        ]
        by_category = defaultdict(list)
        for consumer_id, profile in self.profile.items():
            by_category[profile['category']].append(consumer_id)
        for category, nth, kind, share, reason, outcome, who in plan:
            candidates = sorted(by_category[category])
            if nth >= len(candidates):
                continue
            consumer_id = candidates[nth]
            if Adjustment.objects.filter(customer_id=consumer_id, reason=reason).exists():
                continue
            bill = (
                Bill.objects.filter(customer_id=consumer_id, state='posted', amount_total__gt=0)
                .order_by('due_date', 'id')
                .first()
            )
            if bill is None:
                continue
            amount = quantize(bill.balance_value * Decimal(str(share)))
            if amount <= 0:
                continue
            requester = self.officers[who]
            adjustment = actions.create(requester, Adjustment, bill=bill, kind=kind, amount=amount, reason=reason)
            self.step(requester, adjustment, 'request')
            if outcome == 'approve':
                self.step(self.manager, adjustment, 'approve')
            elif outcome == 'reject':
                self.step(self.manager, adjustment, 'reject')
            self.created['adjustments'] += 1

    # --------------------------------------------------------------- recovery

    def recovery_cases(self):
        """Run the automation, then let people do what people do with the cases it opened."""
        report = dict(automation.run_all())['open_recovery_cases']
        self.say(f'  automation: {report}')
        # Ranked by what was owed the day each case opened, which never changes, so a
        # case's place in the story is the same however many times this runs.
        cases = list(RecoveryCase.objects.select_related('consumer').order_by('-amount_opened', 'id'))
        # A few stay without an owner, so "Needs an owner" has something in it.
        unowned = {case.pk for case in cases if case.pk % 23 == 5}
        for position, case in enumerate(cases):
            if case.pk in unowned or case.state != 'open':
                continue
            owner_ctx = self.recovery[0 if self.profile.get(case.consumer_id, {}).get('category') in ('federal', 'provincial', 'military') else 1]
            staff = owner_ctx.user.staff
            if case.owner_id is None:
                actions.change(self.manager, case, owner=staff, summary=f'Assigned to {staff.display_name}')
            # How far each case has got: the biggest balances are furthest along.
            share = position / max(len(cases), 1)
            stages = (
                ['notice_1', 'notice_2', 'legal'] if share < 0.18
                else ['notice_1', 'notice_2', 'instalment'] if share < 0.28
                else ['notice_1', 'notice_2'] if share < 0.5
                else ['notice_1'] if share < 0.75
                else []
            )
            current = RecoveryCase.objects.get(pk=case.pk)
            for name in stages:
                if current.state in RecoveryCase.Schema.workflow['transitions'][name]['from']:
                    self.step(owner_ctx, current, name)
                    current = RecoveryCase.objects.get(pk=case.pk)
            if current.next_action_date is None:
                actions.change(
                    owner_ctx,
                    current,
                    next_action=self._next_action(current.state),
                    next_action_date=self.today + datetime.timedelta(days=3 + (position * 7) % 28),
                )
        # Two federal cases the Manager has taken as far as ordering a disconnection.
        if not RecoveryCase.objects.filter(state='disconnection_ordered').exists():
            for case in RecoveryCase.objects.filter(state='legal', owner__isnull=False).order_by('-id')[:2]:
                self.step(self.manager, case, 'order_disconnection')
        self.created['cases'] = RecoveryCase.objects.count()

    @staticmethod
    def _next_action(state):
        return {
            'open': 'Send the first notice',
            'notice_1': 'Follow up by phone, then send notice 2',
            'notice_2': 'Meet the finance officer; prepare the legal file',
            'legal': 'Chase the legal notice reply',
            'instalment': 'Check the instalment was received',
        }.get(state, 'Review')

    def written_off_example(self):
        """One small case closed the honest way: write-offs approved bill by bill, then the Manager closes it."""
        if RecoveryCase.objects.filter(state='written_off').exists():
            return
        case = (
            computed.annotate(RecoveryCase.objects.select_related('consumer'), RecoveryCase)
            .filter(state__in=('notice_2', 'legal', 'instalment'), owner__isnull=False)
            .order_by('outstanding')
            .first()
        )
        if case is None:
            return
        requester = self.officers[0]
        for bill in Bill.objects.filter(customer_id=case.consumer_id, state='posted').order_by('due_date', 'id'):
            if bill.balance_value <= 0:
                continue
            adjustment = actions.create(
                requester, Adjustment, bill=bill, kind='write_off', amount=bill.balance_value,
                reason='Consumer wound up; balance irrecoverable (legal notice returned undelivered).',
            )
            self.step(requester, adjustment, 'request')
            self.step(self.manager, adjustment, 'approve')
        self.step(self.manager, RecoveryCase.objects.get(pk=case.pk), 'write_off')

    # ----------------------------------------------------------------- finish

    def connections_status(self):
        """Late in the story, a few connections are disputed and one is disconnected."""
        if Connection.objects.exclude(status='active').exists():
            return
        picks = list(Connection.objects.filter(billing_basis='average').order_by('number')[9::17][:8])
        for position, connection in enumerate(picks):
            actions.change(
                self.officers[position % 2],
                connection,
                status='disputed' if position < 7 else 'disconnected',
                summary='Consumer disputes the assessed consumption' if position < 7 else 'Disconnected after the court order',
            )

    def report(self):
        outstanding = sum((b.balance_value for b in Bill.objects.filter(state='posted')), Decimal('0'))
        today = self.today
        over_180 = sum(
            (b.balance_value for b in Bill.objects.filter(state='posted', due_date__lt=today - datetime.timedelta(days=180))),
            Decimal('0'),
        )
        crore = Decimal('10000000')
        self.say(
            f'  outstanding Rs {outstanding / crore:,.1f} crore, of which {over_180 / crore:,.1f} crore is more than 180 days overdue'
        )
        advance = Payment.objects.filter(state='posted').aggregate(t=Sum('amount'))['t'] or 0
        self.say(f'  {Bill.objects.count()} bills, {Payment.objects.count()} payments ({advance / crore:,.1f} crore), '
                 f'{Adjustment.objects.count()} adjustments, {RecoveryCase.objects.count()} recovery cases')
        self.say('  logins: ' + ', '.join(f'{u} ({r})' for u, _, _, r in STAFF) + f'; passwords are in {self.env_file.name}')

    def run(self):
        steps = [
            ('people', self.people),
            ('reference data', self.reference),
            ('consumers and connections', self.consumers),
            ('twelve months of billing and payments', self.billing_and_payments),
            ('adjustments', self.adjustments),
            ('recovery', self.recovery_cases),
            ('a write-off', self.written_off_example),
            ('connection status', self.connections_status),
        ]
        for label, function in steps:
            self.say(f'{label}…')
            function()
        self.report()
