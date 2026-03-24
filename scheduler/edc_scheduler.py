from itertools import product
from ortools.sat.python import cp_model
import json
import sys


def build_slot_map(raw_slots):
    slot_map = {}
    for class_id_str, slots in raw_slots.items():
        class_id = int(class_id_str)
        slot_map[class_id] = set()
        for item in slots:
            slot_map[class_id].add((int(item["day_order"]), int(item["period"])))
    return slot_map


def build_day_period_map(available_slots, days, periods_per_day):
    per_day = {day: set() for day in days}
    for day, period in available_slots:
        if day in per_day and 1 <= period <= periods_per_day:
            per_day[day].add(period)
    return per_day


def generate_block_patterns(days, periods_per_day, available_slots, hours):
    if hours <= 0:
        return []

    available_per_day = build_day_period_map(available_slots, days, periods_per_day)
    patterns = set()

    for day in days:
        for start in range(1, periods_per_day - hours + 2):
            block = tuple((day, period) for period in range(start, start + hours))
            if all(period in available_per_day[day] for _, period in block):
                patterns.add(block)

    for first_len in range(1, hours):
        second_len = hours - first_len
        for day_one_index, day_one in enumerate(days):
            for day_two in days[day_one_index + 1:]:
                for start_one, start_two in product(
                    range(1, periods_per_day - first_len + 2),
                    range(1, periods_per_day - second_len + 2),
                ):
                    block_one = tuple((day_one, period) for period in range(start_one, start_one + first_len))
                    block_two = tuple((day_two, period) for period in range(start_two, start_two + second_len))
                    if all(period in available_per_day[day_one] for _, period in block_one) and all(
                        period in available_per_day[day_two] for _, period in block_two
                    ):
                        patterns.add(tuple(sorted(block_one + block_two)))

    return [list(pattern) for pattern in sorted(patterns)]


def solve(data):
    classes = [int(value) for value in data.get("classes", [])]
    hours = int(data.get("hours", 0))
    days = [int(value) for value in data.get("days", [1, 2, 3, 4, 5, 6])]
    periods_per_day = int(data.get("periods_per_day", 6))
    occupied = build_slot_map(data.get("occupied_slots", {}))
    existing_edc = build_slot_map(data.get("existing_edc_slots", {}))

    if not classes:
        return {"error": "No classes provided for EDC scheduling."}
    if hours <= 0:
        return {"error": "EDC hours must be greater than 0."}
    if hours > periods_per_day * 2:
        return {"error": "EDC hours cannot be spread across more than two days."}

    common_available_slots = None
    for class_id in classes:
        available_slots = set()
        for day in days:
            for period in range(1, periods_per_day + 1):
                if (day, period) in occupied.get(class_id, set()):
                    continue
                available_slots.add((day, period))

        if len(available_slots) < hours:
            return {"error": f"Class {class_id} does not have enough free slots for {hours} EDC hour(s)."}

        if common_available_slots is None:
            common_available_slots = available_slots
        else:
            common_available_slots &= available_slots

    common_available_slots = common_available_slots or set()
    common_patterns = generate_block_patterns(days, periods_per_day, common_available_slots, hours)
    if not common_patterns:
        return {
            "error": (
                "No common grouped EDC slot pattern exists across the selected classes. "
                "All selected classes must share the exact same EDC slots within one or two days."
            )
        }

    model = cp_model.CpModel()
    pattern_vars = []
    for pattern_index, pattern in enumerate(common_patterns):
        pattern_vars.append((model.NewBoolVar(f"pattern_{pattern_index}"), pattern))

    model.Add(sum(var for var, _ in pattern_vars) == 1)

    preserve_terms = []
    early_slot_terms = []
    for var, pattern in pattern_vars:
        preserve_count = 0
        for class_id in classes:
            preserve_count += sum(1 for slot in pattern if slot in existing_edc.get(class_id, set()))
        preserve_terms.append(var * preserve_count)

        early_weight = sum(((len(days) - day + 1) * 10) + (periods_per_day - period + 1) for day, period in pattern)
        early_slot_terms.append(var * early_weight)

    model.Maximize((sum(preserve_terms) * 100000) + sum(early_slot_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"error": "No feasible EDC timetable could be generated for the selected classes."}

    selected_pattern = []
    for var, pattern in pattern_vars:
        if solver.Value(var) == 1:
            selected_pattern = pattern
            break

    scheduled_slots = []
    for class_id in classes:
        for day, period in selected_pattern:
            scheduled_slots.append({
                "class_id": class_id,
                "day_order": day,
                "period": period,
            })

    scheduled_slots.sort(key=lambda item: (item["class_id"], item["day_order"], item["period"]))
    return {"scheduled_slots": scheduled_slots}


def main():
    try:
        data = json.loads(sys.stdin.read())
        print(json.dumps(solve(data)))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
