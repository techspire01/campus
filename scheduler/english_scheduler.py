import json
import sys
import random


def build_occupied_map(raw_occupied):
    """Build a set of (day_order, period) tuples that are already occupied per class."""
    occupied = {}
    for class_id_str, slots in raw_occupied.items():
        class_id = int(class_id_str)
        occupied[class_id] = set()
        for item in slots:
            day_order = int(item["day_order"])
            period = int(item["period"])
            occupied[class_id].add((day_order, period))
    return occupied


def build_staff_occupied_map(raw_occupied):
    """Build a set of (day_order, period) tuples that are already occupied per staff."""
    occupied = {}
    for staff_id_str, slots in raw_occupied.items():
        staff_id = int(staff_id_str)
        occupied[staff_id] = set()
        for item in slots:
            day_order = int(item["day_order"])
            period = int(item["period"])
            occupied[staff_id].add((day_order, period))
    return occupied


def get_available_slots(class_id, days, periods_per_day, hours_needed, occupied):
    """Return all possible slot combinations (day, start_period) for consecutive hours."""
    class_occupied = occupied.get(class_id, set())
    available = []

    for day in days:
        max_start = periods_per_day - hours_needed + 1
        for start in range(1, max_start + 1):
            end = start + hours_needed - 1
            if all((day, p) not in class_occupied for p in range(start, end + 1)):
                available.append((day, start))

    return available


def split_hours_between_halves(hours, half1_periods, half2_periods):
    """Split hours between morning (1-3) and afternoon (4-6) halves."""
    if hours <= 0:
        return [], []

    # Calculate how many hours per half
    hours_per_half = hours // 2
    remainder = hours % 2

    # First half gets base hours + remainder if exists
    h1_hours = hours_per_half + remainder
    h2_hours = hours - h1_hours

    return h1_hours, h2_hours


def get_slots_in_period_range(available_slots, min_period, max_period):
    """Filter slots that fit within a period range."""
    filtered = []
    for day, start_period in available_slots:
        if min_period <= start_period <= max_period:
            filtered.append((day, start_period))
    return filtered


def solve_english_scheduling_split(selected_classes, staff_assignments, hours_assignments, days, periods_per_day, occupied, staff_occupied):
    """Allocate English slots split between morning and afternoon halves with staff constraints."""
    result_slots = []
    staff_schedule = {staff_id: set(slots) for staff_id, slots in staff_occupied.items()}  # staff_id -> set of (day, period)
    unscheduled_classes = []

    # Shuffle classes for random allocation
    class_list = list(selected_classes)
    random.shuffle(class_list)

    for class_data in class_list:
        class_id = class_data["id"]
        total_hours = int(hours_assignments.get(str(class_id), 1))
        staff_id = staff_assignments.get(str(class_id))

        available = get_available_slots(class_id, days, periods_per_day, 1, occupied)
        if not available:
            class_label = class_data.get("name") or f'class {class_id}'
            unscheduled_classes.append(
                f"{class_label}: allocated 0 of {total_hours} English hour(s)"
            )
            continue

        # Split hours between morning and afternoon
        h1_hours, h2_hours = split_hours_between_halves(total_hours, [1, 2, 3], [4, 5, 6])

        morning_slots = get_slots_in_period_range(available, 1, 3)
        afternoon_slots = get_slots_in_period_range(available, 4, 6)

        # Randomly shuffle available slots
        random.shuffle(morning_slots)
        random.shuffle(afternoon_slots)

        allocated_days = set()
        staff_id_int = int(staff_id) if staff_id else None

        # Allocate morning slots
        morning_count = 0
        for day, start in morning_slots:
            if morning_count >= h1_hours:
                break

            # Check if class already has this day
            if day in allocated_days:
                continue

            # Check staff overlap
            if staff_id_int:
                staff_slots = staff_schedule.get(staff_id_int, set())
                if any((day, p) in staff_slots for p in range(start, start + 1)):
                    continue

            # Allocate
            result_slots.append({
                "class_id": class_id,
                "day_order": day,
                "period": start,
                "staff_id": staff_id_int,
            })

            allocated_days.add(day)
            morning_count += 1

            if staff_id_int:
                if staff_id_int not in staff_schedule:
                    staff_schedule[staff_id_int] = set()
                staff_schedule[staff_id_int].add((day, start))

        # Allocate afternoon slots
        afternoon_count = 0
        for day, start in afternoon_slots:
            if afternoon_count >= h2_hours:
                break

            # Check if class already has this day (max 2 per day)
            day_count = sum(1 for slot in result_slots if slot["class_id"] == class_id and slot["day_order"] == day)
            if day_count >= 2:
                continue

            # Check staff overlap
            if staff_id_int:
                staff_slots = staff_schedule.get(staff_id_int, set())
                if any((day, p) in staff_slots for p in range(start, start + 1)):
                    continue

            # Allocate
            result_slots.append({
                "class_id": class_id,
                "day_order": day,
                "period": start,
                "staff_id": staff_id_int,
            })

            allocated_days.add(day)
            afternoon_count += 1

            if staff_id_int:
                if staff_id_int not in staff_schedule:
                    staff_schedule[staff_id_int] = set()
                staff_schedule[staff_id_int].add((day, start))

        allocated_total = morning_count + afternoon_count
        if allocated_total < total_hours:
            class_label = class_data.get("name") or f'class {class_id}'
            unscheduled_classes.append(
                f"{class_label}: allocated {allocated_total} of {total_hours} English hour(s)"
            )

    if unscheduled_classes:
        return {
            "error": "Insufficient free slots for English scheduling. " + "; ".join(unscheduled_classes)
        }

    return {"scheduled_slots": result_slots}


if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        result = solve_english_scheduling_split(
            selected_classes=input_data.get("selected_classes", []),
            staff_assignments=input_data.get("staff_assignments", {}),
            hours_assignments=input_data.get("hours_assignments", {}),
            days=input_data.get("days", list(range(1, 6))),
            periods_per_day=input_data.get("periods_per_day", 8),
            occupied=build_occupied_map(input_data.get("occupied_slots", {})),
            staff_occupied=build_staff_occupied_map(input_data.get("occupied_staff_slots", {})),
        )
        print(json.dumps(result))
        sys.stdout.flush()
    except Exception as e:
        error_result = {"error": str(e)}
        print(json.dumps(error_result))
        sys.stdout.flush()
        sys.exit(1)
