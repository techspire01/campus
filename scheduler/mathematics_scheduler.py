import json
import random
import sys


def build_occupied_map(raw_occupied):
    """Build a set of (day_order, period) tuples that are already occupied per class."""
    occupied = {}
    for class_id_str, slots in raw_occupied.items():
        class_id = int(class_id_str)
        occupied[class_id] = set()
        for item in slots:
            occupied[class_id].add((int(item["day_order"]), int(item["period"])))
    return occupied


def build_staff_occupied_map(raw_occupied):
    """Build a set of (day_order, period) tuples that are already occupied per staff."""
    occupied = {}
    for staff_id_str, slots in raw_occupied.items():
        staff_id = int(staff_id_str)
        occupied[staff_id] = set()
        for item in slots:
            occupied[staff_id].add((int(item["day_order"]), int(item["period"])))
    return occupied


def split_hours_between_halves(hours):
    """Split hours between morning (1-3) and afternoon (4-6) halves."""
    if hours <= 0:
        return 0, 0

    hours_per_half = hours // 2
    remainder = hours % 2
    first_half = hours_per_half + remainder
    second_half = hours - first_half
    return first_half, second_half


def get_available_single_slots(class_slots, days, periods_per_day):
    """Return free single-period slots for a class."""
    available = []
    for day in days:
        for period in range(1, periods_per_day + 1):
            if (day, period) not in class_slots:
                available.append((day, period))
    return available


def get_slots_in_period_range(available_slots, min_period, max_period):
    return [(day, period) for day, period in available_slots if min_period <= period <= max_period]


def solve_mathematics_scheduling(assignments, days, periods_per_day, occupied, staff_occupied):
    """Allocate mathematics slots across multiple class-subject assignments."""
    result_slots = []
    class_schedule = {class_id: set(slots) for class_id, slots in occupied.items()}
    staff_schedule = {staff_id: set(slots) for staff_id, slots in staff_occupied.items()}
    unscheduled_assignments = []

    assignment_list = list(assignments)
    random.shuffle(assignment_list)

    for assignment in assignment_list:
        class_id = int(assignment["class_id"])
        subject_id = int(assignment["subject_id"])
        total_hours = int(assignment.get("hours_per_week", 1))
        staff_id = assignment.get("staff_id")
        staff_id_int = int(staff_id) if staff_id else None
        subject_label = assignment.get("subject_name") or f"subject {subject_id}"
        class_label = assignment.get("class_name") or f"class {class_id}"

        available = get_available_single_slots(class_schedule.get(class_id, set()), days, periods_per_day)
        if not available:
            unscheduled_assignments.append(
                f"{class_label} / {subject_label}: allocated 0 of {total_hours} Mathematics hour(s)"
            )
            continue

        morning_needed, afternoon_needed = split_hours_between_halves(total_hours)
        morning_slots = get_slots_in_period_range(available, 1, min(3, periods_per_day))
        afternoon_slots = get_slots_in_period_range(available, 4, periods_per_day)
        random.shuffle(morning_slots)
        random.shuffle(afternoon_slots)

        allocated_total = 0

        def try_allocate(slot_pool, limit, allow_second_on_day):
            nonlocal allocated_total
            count = 0
            for day, period in slot_pool:
                if count >= limit:
                    break

                day_count = sum(
                    1
                    for slot in result_slots
                    if slot["class_id"] == class_id and slot["day_order"] == day
                )
                if day_count >= (2 if allow_second_on_day else 1):
                    continue

                if (day, period) in class_schedule.get(class_id, set()):
                    continue

                if staff_id_int:
                    if (day, period) in staff_schedule.get(staff_id_int, set()):
                        continue

                result_slots.append({
                    "class_id": class_id,
                    "subject_id": subject_id,
                    "day_order": day,
                    "period": period,
                    "staff_id": staff_id_int,
                })

                class_schedule.setdefault(class_id, set()).add((day, period))
                if staff_id_int:
                    staff_schedule.setdefault(staff_id_int, set()).add((day, period))
                count += 1
                allocated_total += 1

            return count

        try_allocate(morning_slots, morning_needed, False)

        refreshed_available = get_available_single_slots(class_schedule.get(class_id, set()), days, periods_per_day)
        afternoon_slots = get_slots_in_period_range(refreshed_available, 4, periods_per_day)
        random.shuffle(afternoon_slots)
        try_allocate(afternoon_slots, afternoon_needed, True)

        remaining = total_hours - allocated_total
        if remaining > 0:
            fallback_slots = get_available_single_slots(class_schedule.get(class_id, set()), days, periods_per_day)
            random.shuffle(fallback_slots)
            try_allocate(fallback_slots, remaining, True)

        if allocated_total < total_hours:
            unscheduled_assignments.append(
                f"{class_label} / {subject_label}: allocated {allocated_total} of {total_hours} Mathematics hour(s)"
            )

    if unscheduled_assignments:
        return {
            "error": "Insufficient free slots for Mathematics scheduling. " + "; ".join(unscheduled_assignments)
        }

    return {"scheduled_slots": result_slots}


if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        result = solve_mathematics_scheduling(
            assignments=input_data.get("assignments", []),
            days=input_data.get("days", list(range(1, 7))),
            periods_per_day=input_data.get("periods_per_day", 8),
            occupied=build_occupied_map(input_data.get("occupied_slots", {})),
            staff_occupied=build_staff_occupied_map(input_data.get("occupied_staff_slots", {})),
        )
        print(json.dumps(result))
        sys.stdout.flush()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.stdout.flush()
        sys.exit(1)
