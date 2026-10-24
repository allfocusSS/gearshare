"""#12: simultaneous independent clients against one real file-backed SQLite database.

Every contender runs on its own thread with its own SQLAlchemy engine, session,
``SQLAlchemyRepository`` and FastAPI app, all pointing at the same migrated file.
A barrier plus a seeded random start jitter releases them together. Each scenario
is repeated ``GEARSHARE_RACE_ITERATIONS`` times (default 30) on a fresh copy of a
migrated template file, and the invariant auditor re-reads the physical database
after every iteration. Who wins varies run to run; the asserted invariants do not:
one coherent winner, 409 for everyone else, one event, one version increment, one
allocation set and at most one active loan.
"""

import os
from datetime import timedelta

import pytest

import invariants as inv
from app.calendar import club_today
from persistence_support import (Call, ITERATIONS, REPORTER, Template, cancel_call, create_call, maintenance_call, staff_call)
from test_booking_api import BASE, NOW, TODAY, Clock, body, day, request
from test_catalogue_api import validate
from test_staff_api import STAFF

LATE = NOW + timedelta(hours=23)  # 2026-10-23 00:00 in Asia/Almaty: the next club day, tokens still valid
pytestmark = pytest.mark.persistence


@pytest.fixture(scope="module")
def template(tmp_path_factory):
    return Template(tmp_path_factory.mktemp("race-template"), students=8,
                    extra_assets=(("unit-c", "UNIT-C", "active"), ("unit-d", "UNIT-D", "active")))


@pytest.fixture(scope="module", autouse=True)
def report():
    yield
    REPORTER.flush()


def iterate(template, tmp_path, scenario, step):
    """Run ``step(env, index)`` on a fresh database ITERATIONS times and record its outcome."""
    for index in range(ITERATIONS):
        env = template.fresh(tmp_path, index)
        try:
            outcome, elapsed = step(env, index)
            REPORTER.record(scenario, outcome, elapsed)
        finally:
            env.close()
            os.remove(env.url.removeprefix("sqlite:///"))


def counts(results):
    tally = {}
    for result in results:
        tally[result.status] = tally.get(result.status, 0) + 1
    return tuple(f"{status}x{number}" for status, number in sorted(tally.items()))


def slowest(results):
    return max(result.elapsed for result in results)


def make_booking(env, template, session, *, asset="unit-a", start=0, end=0, steps=(), clock=None, purpose="Student film session"):
    """Create (and optionally advance) a booking serially through the HTTP API."""
    _, app = env.stack(clock)
    created = validate(request(app, "POST", BASE, session=session, json=body(assetId=asset, startDate=day(start), endDate=day(end), purpose=purpose)), "Booking", 201)
    version = 1
    for verb in steps:
        payload = {"expectedVersion": version} if verb == "approve" else {"expectedVersion": version, "note": "Complete working kit"}
        updated = validate(request(app, "POST", f"{STAFF}/bookings/{created['id']}/{verb}", session=template.coordinator, json=payload), "Booking")
        version = updated["version"]
    return created["id"], version


def only(results, status):
    return [result for result in results if result.status == status]


def assert_stale_conflict(result):
    assert result.status == 409 and result.json["code"] == "CONFLICT", result.text
    assert set(result.json) == {"code", "message", "fields"} and set(result.json["fields"]) == {"expectedVersion"}


def assert_plain_conflict(result):
    assert result.status == 409 and result.json["code"] == "CONFLICT" and "fields" not in result.json


def view(env, booking_id):
    state = env.snapshot()
    return state.booking(booking_id), state.events_of(booking_id), [row for row in state.slots if row["booking_id"] == booking_id], state


# ---------------------------------------------------------------- reservations

def test_eight_simultaneous_conflicting_reservations_create_exactly_one_booking(template, tmp_path):
    def step(env, index):
        calls = [create_call(f"racer{k}", template.students[k], purpose=f"Purpose of racer {k} filming") for k in range(8)]
        results = env.race(calls, seed=index)
        winners, losers = only(results, 201), only(results, 409)
        assert (len(winners), len(losers)) == (1, 7), counts(results)
        winner = validate_booking(winners[0])
        state = env.audit(context=f"iteration {index}")
        assert [row["id"] for row in state.bookings] == [winner["id"]] and len(state.events) == len(state.slots) == 1
        assert state.events[0]["action"] == "create" and state.events[0]["booking_id"] == winner["id"]
        assert state.slots == [{"asset_id": "unit-a", "day": TODAY, "booking_id": winner["id"]}]
        assert state.bookings[0]["user_id"] == template.students[int(winners[0].label.removeprefix("racer"))]["user"]["id"]
        private = [winner["id"], winner["userId"], *(f"Purpose of racer {k}" for k in range(8)), *(f"racer{k}" for k in range(8))]
        private += [student["user"]["id"] for student in template.students]
        for loser in losers:
            assert set(loser.json) == {"code", "message", "unavailableDates"} and loser.json["code"] == "CONFLICT"
            assert loser.json["unavailableDates"] == [day()]
            assert not [value for value in private if value in loser.text], loser.text
        return counts(results), slowest(results)

    iterate(template, tmp_path, "reserve: 8 clients, same unit and day", step)


def validate_booking(result):
    from jsonschema import Draft202012Validator, FormatChecker
    from test_catalogue_api import SPEC
    Draft202012Validator({"$ref": "#/components/schemas/Booking", "components": SPEC["components"]}, format_checker=FormatChecker()).validate(result.json)
    assert result.json["state"] == "pending" and result.json["version"] == len(result.json["events"]) == 1
    return result.json


SHAPES = [
    ("same-day", (2, 2), (2, 2), "unit-a", "unit-a", [2]),
    ("identical-range", (2, 4), (2, 4), "unit-a", "unit-a", [2, 3, 4]),
    ("partial-overlap", (2, 4), (3, 5), "unit-a", "unit-a", [3, 4]),
    ("enclosing", (1, 5), (2, 3), "unit-a", "unit-a", [2, 3]),
    ("enclosed", (2, 3), (1, 5), "unit-a", "unit-a", [2, 3]),
    ("adjacent-allowed", (2, 3), (4, 5), "unit-a", "unit-a", None),
    ("different-units-allowed", (2, 4), (2, 4), "unit-a", "unit-b", None),
]


@pytest.mark.parametrize("name,first,second,unit_one,unit_two,overlap", SHAPES, ids=[shape[0] for shape in SHAPES])
def test_overlap_shapes_race_to_one_winner_or_both_succeed(template, tmp_path, name, first, second, unit_one, unit_two, overlap):
    ranges = {"a": first, "b": second}

    def step(env, index):
        calls = [
            create_call("a", template.students[0], assetId=unit_one, startDate=day(first[0]), endDate=day(first[1]), purpose="Purpose of racer a"),
            create_call("b", template.students[1], assetId=unit_two, startDate=day(second[0]), endDate=day(second[1]), purpose="Purpose of racer b"),
        ]
        results = env.race(calls, seed=index)
        state = env.audit(context=f"{name} iteration {index}")
        if overlap is None:
            assert [result.status for result in results] == [201, 201], counts(results)
            assert len(state.bookings) == len(state.events) == 2
            assert len(state.slots) == (first[1] - first[0] + 1) + (second[1] - second[0] + 1)
            return ("201x2",), slowest(results)
        winners, losers = only(results, 201), only(results, 409)
        assert (len(winners), len(losers)) == (1, 1), counts(results)
        won, lost = ranges[winners[0].label], ranges[losers[0].label]
        shared = [day(offset) for offset in range(max(won[0], lost[0]), min(won[1], lost[1]) + 1)]
        assert shared == [day(offset) for offset in overlap]
        assert losers[0].json["unavailableDates"] == shared and set(losers[0].json) == {"code", "message", "unavailableDates"}
        assert len(state.bookings) == len(state.events) == 1 and state.bookings[0]["id"] == winners[0].json["id"]
        assert {row["day"] for row in state.slots} == {TODAY + timedelta(days=offset) for offset in range(won[0], won[1] + 1)}
        assert winners[0].json["id"] not in losers[0].text and winners[0].json["userId"] not in losers[0].text and "Purpose of racer" not in losers[0].text
        return ("201x1", "409x1"), slowest(results)

    iterate(template, tmp_path, f"reserve: {name}", step)


def test_unacknowledged_requests_leave_nothing_and_acknowledged_ones_persist_under_non_conflicting_load(template, tmp_path):
    """Six simultaneous writers on one unit but different days: SQLite serializes them.

    Bounded retries may legitimately end in the documented 503; the invariant is that
    acknowledged work is persisted exactly and refused work leaves no trace.
    """
    def step(env, index):
        calls = [create_call(f"w{k}", template.students[k], startDate=day(k), endDate=day(k), purpose=f"Purpose of writer {k}") for k in range(6)]
        results = env.race(calls, seed=index)
        assert {result.status for result in results} <= {201, 503}, counts(results)
        for refused in only(results, 503):
            assert refused.json["code"] == "SERVICE_UNAVAILABLE" and set(refused.json) == {"code", "message"}
            assert "sqlite" not in refused.text.lower() and "locked" not in refused.text.lower()
        state = env.audit(context=f"iteration {index}")
        acknowledged = {result.json["id"] for result in only(results, 201)}
        assert {row["id"] for row in state.bookings} == acknowledged and len(state.events) == len(state.slots) == len(acknowledged)
        return counts(results), slowest(results)

    iterate(template, tmp_path, "reserve: 6 clients, same unit, different days (liveness)", step)


# ---------------------------------------------------------------- transitions

def final_state(env, booking_id, expected_events, expected_version):
    row, events, slots, state = view(env, booking_id)
    env.audit(context="after race")
    assert row["version"] == expected_version and len(events) == expected_events
    return row, events, slots, state


def test_approve_versus_cancel_has_one_winner_one_event_and_one_version_increment(template, tmp_path):
    def step(env, index):
        booking_id, version = make_booking(env, template, template.students[0], start=0, end=2)
        calls = [staff_call("approve", template, booking_id, "approve", 1), cancel_call("cancel", template.students[0], booking_id, 1)]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x1"), counts(results)
        assert_stale_conflict(only(results, 409)[0])
        row, events, slots, _ = final_state(env, booking_id, 2, 2)
        winner = only(results, 200)[0].label
        assert row["state"] == {"approve": "approved", "cancel": "cancelled"}[winner] and events[-1]["action"] == winner
        assert len(slots) == (3 if winner == "approve" else 0)
        return (f"winner={winner}",), slowest(results)

    iterate(template, tmp_path, "transition: approve vs cancel", step)


def test_two_approves_and_stale_future_versions(template, tmp_path):
    def step(env, index):
        booking_id, _ = make_booking(env, template, template.students[0], start=0, end=1)
        calls = [staff_call("approve-1", template, booking_id, "approve", 1), staff_call("approve-1b", template, booking_id, "approve", 1),
                 staff_call("approve-future", template, booking_id, "approve", 2), staff_call("approve-far", template, booking_id, "approve", 99)]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x3"), counts(results)
        assert only(results, 200)[0].label in {"approve-1", "approve-1b"}  # a future/never-observed version can never win
        row, events, slots, _ = final_state(env, booking_id, 2, 2)
        assert row["state"] == "approved" and len(slots) == 2 and events[-1]["action"] == "approve"
        return ("200x1", "409x3"), slowest(results)

    iterate(template, tmp_path, "transition: 2 approves + 2 stale/future versions", step)


def test_four_way_incompatible_transitions_commit_exactly_one(template, tmp_path):
    def step(env, index):
        booking_id, _ = make_booking(env, template, template.students[0], start=0, end=2)
        calls = [staff_call("approve", template, booking_id, "approve", 1), staff_call("approve2", template, booking_id, "approve", 1),
                 cancel_call("cancel", template.students[0], booking_id, 1), staff_call("reject", template, booking_id, "reject", 1, "Dates are reserved for a screening.")]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x3"), counts(results)
        for loser in only(results, 409):
            assert_stale_conflict(loser)
        winner = only(results, 200)[0].label.rstrip("2")
        row, events, slots, _ = final_state(env, booking_id, 2, 2)
        assert row["state"] == {"approve": "approved", "cancel": "cancelled", "reject": "rejected"}[winner]
        assert events[-1]["action"] == winner and len(slots) == (3 if winner == "approve" else 0)
        return (f"winner={winner}",), slowest(results)

    iterate(template, tmp_path, "transition: approve x2, cancel, reject", step)


def test_approved_booking_cancel_versus_checkout_has_one_winner(template, tmp_path):
    def step(env, index):
        booking_id, version = make_booking(env, template, template.students[0], start=0, end=1, steps=("approve",))
        calls = [cancel_call("cancel-owner", template.students[0], booking_id, version), cancel_call("cancel-staff", template.coordinator, booking_id, version),
                 staff_call("checkout", template, booking_id, "checkout", version)]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x2"), counts(results)
        for loser in only(results, 409):
            assert_stale_conflict(loser)
        row, events, slots, state = final_state(env, booking_id, 3, 3)
        winner = only(results, 200)[0].label
        if winner == "checkout":
            assert row["state"] == "checked_out" and len(slots) == 2 and state.active_loans == [{"asset_id": "unit-a", "booking_id": booking_id}]
        else:
            assert row["state"] == "cancelled" and not slots and not state.active_loans
        return (f"winner={winner}",), slowest(results)

    iterate(template, tmp_path, "transition: cancel x2 vs checkout", step)


def test_simultaneous_checkout_of_the_same_booking_creates_one_active_loan(template, tmp_path):
    def step(env, index):
        booking_id, version = make_booking(env, template, template.students[0], start=0, end=1, steps=("approve",))
        calls = [staff_call(f"checkout{k}", template, booking_id, "checkout", version) for k in range(3)]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x2"), counts(results)
        for loser in only(results, 409):
            assert_stale_conflict(loser)
        row, events, slots, state = final_state(env, booking_id, 3, 3)
        assert row["state"] == "checked_out" and state.active_loans == [{"asset_id": "unit-a", "booking_id": booking_id}]
        return ("200x1", "409x2"), slowest(results)

    iterate(template, tmp_path, "custody: 3 checkouts of one booking", step)


def test_checkouts_of_two_bookings_for_one_unit_across_midnight_create_at_most_one_loan(template, tmp_path):
    """Two approved bookings on adjacent club days; the second desk clock has just rolled over."""
    def step(env, index):
        first, _ = make_booking(env, template, template.students[0], start=0, end=0, steps=("approve",))
        second, _ = make_booking(env, template, template.students[1], start=1, end=1, steps=("approve",))
        calls = [staff_call("day-one", template, first, "checkout", 2, clock=Clock(NOW)), staff_call("day-two", template, second, "checkout", 2, clock=Clock(LATE))]
        results = env.race(calls, seed=index)
        assert counts(results) == ("200x1", "409x1"), counts(results)
        loser = only(results, 409)[0]
        assert_plain_conflict(loser)
        assert "on loan" in loser.json["message"]
        state = env.audit(today=club_today(Clock(LATE)), context=f"iteration {index}")
        winner_id = first if only(results, 200)[0].label == "day-one" else second
        assert state.active_loans == [{"asset_id": "unit-a", "booking_id": winner_id}]
        assert sorted(row["state"] for row in state.bookings) == ["approved", "checked_out"]
        return (f"winner={only(results, 200)[0].label}",), slowest(results)

    iterate(template, tmp_path, "custody: two bookings, one unit, across midnight", step)


def test_overdue_active_loan_blocks_the_next_checkout_and_return_versus_checkout_is_coherent(template, tmp_path):
    def step(env, index):
        overdue, _ = make_booking(env, template, template.students[0], start=0, end=0, steps=("approve", "checkout"))
        later, _ = make_booking(env, template, template.students[1], start=1, end=1, steps=("approve",))
        # One club day later the loan is overdue; the next pickup is blocked serially...
        _, desk = env.stack(Clock(LATE))
        before = env.snapshot()
        blocked = request(desk, "POST", f"{STAFF}/bookings/{later}/checkout", session=template.coordinator, json={"expectedVersion": 2, "note": "Complete working kit"})
        assert blocked.status_code == 409 and "on loan" in blocked.json()["message"]
        inv.assert_unchanged(before, env.snapshot(), "blocked checkout")
        # ...and now the return and the pickup race each other.
        calls = [staff_call("return-overdue", template, overdue, "return", 3, clock=Clock(LATE)), staff_call("pickup", template, later, "checkout", 2, clock=Clock(LATE))]
        results = env.race(calls, seed=index)
        returned, pickup = results
        assert returned.status == 200
        assert pickup.status in (200, 409)
        state = env.audit(today=club_today(Clock(LATE)), context=f"iteration {index}")
        loans = [row["booking_id"] for row in state.active_loans]
        assert loans == ([later] if pickup.status == 200 else [])
        assert state.booking(overdue)["state"] == "returned"
        assert state.booking(later)["state"] == ("checked_out" if pickup.status == 200 else "approved")
        if pickup.status == 409:
            assert "on loan" in pickup.json["message"]
        return (f"return=200 pickup={pickup.status}",), slowest(results)

    iterate(template, tmp_path, "custody: overdue loan blocks; return vs checkout", step)


# ---------------------------------------------------------------- maintenance

def test_maintenance_versus_new_booking_never_leaves_a_committed_booking_on_maintenance_equipment(template, tmp_path):
    def step(env, index):
        calls = [maintenance_call("maintenance", template, "unit-c"), create_call("request", template.students[0], assetId="unit-c", startDate=day(1), endDate=day(2))]
        results = env.race(calls, seed=index)
        maintenance, request_result = results
        state = env.audit(context=f"iteration {index}")
        asset = next(row for row in state.assets if row["id"] == "unit-c")
        outcome = (maintenance.status, request_result.status)
        assert outcome in {(200, 409), (409, 201)}, outcome
        if outcome == (200, 409):
            assert asset["state"] == "maintenance" and not state.bookings and not state.slots and not state.events
            assert request_result.json["unavailableDates"] == []
        else:
            assert asset["state"] == "active" and len(state.bookings) == len(state.events) == 1 and len(state.slots) == 2
            assert_plain_conflict(maintenance)
        return (f"maintenance={maintenance.status} request={request_result.status}",), slowest(results)

    iterate(template, tmp_path, "maintenance vs new booking (same unit)", step)


def test_maintenance_of_one_unit_does_not_block_a_booking_of_another_unit(template, tmp_path):
    def step(env, index):
        calls = [maintenance_call("maintenance", template, "unit-c"), create_call("request", template.students[0], assetId="unit-d", startDate=day(1), endDate=day(2))]
        results = env.race(calls, seed=index)
        assert [result.status for result in results] == [200, 201], counts(results)
        state = env.audit(context=f"iteration {index}")
        assert {row["id"]: row["state"] for row in state.assets}["unit-c"] == "maintenance" and len(state.bookings) == 1
        return ("200 201",), slowest(results)

    iterate(template, tmp_path, "maintenance (unit-c) vs booking (unit-d)", step)


def test_maintenance_versus_checkout_keeps_the_unit_active_with_its_loan(template, tmp_path):
    def step(env, index):
        booking_id, version = make_booking(env, template, template.students[0], asset="unit-c", start=0, end=1, steps=("approve",))
        calls = [maintenance_call("maintenance", template, "unit-c"), staff_call("checkout", template, booking_id, "checkout", version)]
        results = env.race(calls, seed=index)
        maintenance, checkout = results
        assert (maintenance.status, checkout.status) == (409, 200), counts(results)  # the approved booking blocks maintenance in either order
        assert_plain_conflict(maintenance)
        state = env.audit(context=f"iteration {index}")
        assert {row["id"]: row["state"] for row in state.assets}["unit-c"] == "active"
        assert state.active_loans == [{"asset_id": "unit-c", "booking_id": booking_id}]
        return ("maintenance=409 checkout=200",), slowest(results)

    iterate(template, tmp_path, "maintenance vs checkout", step)


def test_maintenance_versus_cancel_of_the_last_commitment_is_coherent_in_both_orders(template, tmp_path):
    def step(env, index):
        booking_id, _ = make_booking(env, template, template.students[0], asset="unit-c", start=1, end=2)
        calls = [maintenance_call("maintenance", template, "unit-c"), cancel_call("cancel", template.students[0], booking_id, 1)]
        results = env.race(calls, seed=index)
        maintenance, cancel = results
        assert cancel.status == 200 and maintenance.status in (200, 409), counts(results)
        state = env.audit(context=f"iteration {index}")
        asset_state = {row["id"]: row["state"] for row in state.assets}["unit-c"]
        assert asset_state == ("maintenance" if maintenance.status == 200 else "active")
        assert state.booking(booking_id)["state"] == "cancelled" and not state.slots
        return (f"maintenance={maintenance.status} cancel=200",), slowest(results)

    iterate(template, tmp_path, "maintenance vs cancel of the last commitment", step)


def test_non_conflicting_approvals_of_different_bookings_on_one_unit_are_all_acknowledged_or_refused_cleanly(template, tmp_path):
    def step(env, index):
        ids = [make_booking(env, template, template.students[k], start=k, end=k)[0] for k in range(5)]
        calls = [staff_call(f"approve{k}", template, ids[k], "approve", 1) for k in range(5)]
        results = env.race(calls, seed=index)
        assert {result.status for result in results} <= {200, 503}, counts(results)
        state = env.audit(context=f"iteration {index}")
        for result, booking_id in zip(results, ids):
            assert state.booking(booking_id)["state"] == ("approved" if result.status == 200 else "pending")
            assert state.booking(booking_id)["version"] == (2 if result.status == 200 else 1)
        return counts(results), slowest(results)

    iterate(template, tmp_path, "transition: 5 approvals, different bookings, one unit (liveness)", step)
