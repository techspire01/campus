import json
import sys
from ortools.sat.python import cp_model


def build_occupied_map(raw_occupied):
    occupied = {}
    for key, slots in raw_occupied.items():
        class_id = int(key)
        occupied[class_id] = set()
        for item in slots:
            occupied[class_id].add((int(item["day_order"]), int(item["period"])))
    return occupied


def build_staff_occupied_map(raw_occupied):
    occupied = {}
    for key, slots in raw_occupied.items():
        staff_id = int(key)
        occupied[staff_id] = set()
        for item in slots:
            occupied[staff_id].add((int(item["day_order"]), int(item["period"])))
    return occupied


def is_pt_subject(assignment):
    code = str(assignment.get("subject_code") or "").strip().lower()
    name = str(assignment.get("subject_name") or "").strip().lower()
    return (
        code == "pt"
        or code.startswith("pt ")
        or "physical education" in name
        or name == "pt"
    )


def build_candidates(class_id, assignments, days, periods_per_day, occupied_slots, staff_occupied):
    class_occupied = occupied_slots.get(class_id, set())
    candidates = {}

    for index, assignment in enumerate(assignments):
        staff_id = assignment.get("staff_id")
        staff_id_int = int(staff_id) if staff_id else None
        staff_slots = staff_occupied.get(staff_id_int, set()) if staff_id_int else set()
        only_late_periods = is_pt_subject(assignment)

        slots = []
        for day in days:
            for period in range(1, periods_per_day + 1):
                if (day, period) in class_occupied:
                    continue
                if only_late_periods and period not in (4, 5, 6):
                    continue
                if staff_id_int and (day, period) in staff_slots:
                    continue
                slots.append((day, period))
        candidates[index] = slots

    return candidates


def explain_failure(assignments, candidates):
    insufficient = []
    restricted = []

    for index, assignment in enumerate(assignments):
        needed = int(assignment.get("hours_per_week", 0))
        available = len(candidates.get(index, []))
        label = assignment.get("subject_name") or assignment.get("subject_code") or f"subject {assignment.get('subject_id')}"
        if available < needed:
            insufficient.append(f"{label}: needs {needed}, only {available} free slot(s)")
        elif is_pt_subject(assignment):
            restricted.append(f"{label}: PT can use only periods 4-6")

    if insufficient:
        return "Insufficient unassigned slots for this class. " + "; ".join(insufficient)
    if restricted:
        return "No valid class timetable could be generated. " + "; ".join(restricted)
    return "No valid class timetable could be generated with the available slots and staff availability."


def solve_class_schedule(class_id, assignments, days, periods_per_day, occupied_slots, staff_occupied):
    class_schedule = build_occupied_map(occupied_slots)
    staff_schedule = build_staff_occupied_map(staff_occupied)
    candidates = build_candidates(class_id, assignments, days, periods_per_day, class_schedule, staff_schedule)

    model = cp_model.CpModel()
    variables = {}
    slot_usage = {}
    staff_slot_usage = {}

    for index, assignment in enumerate(assignments):
        for day, period in candidates.get(index, []):
            key = (index, day, period)
            variables[key] = model.NewBoolVar(f"a{index}_d{day}_p{period}")
            slot_usage.setdefault((day, period), []).append(variables[key])

            staff_id = assignment.get("staff_id")
            if staff_id:
                staff_slot_usage.setdefault((int(staff_id), day, period), []).append(variables[key])

        model.Add(
            sum(variables[(index, day, period)] for day, period in candidates.get(index, []))
            == int(assignment.get("hours_per_week", 0))
        )

    for vars_for_slot in slot_usage.values():
        model.Add(sum(vars_for_slot) <= 1)

    for vars_for_staff_slot in staff_slot_usage.values():
        model.Add(sum(vars_for_staff_slot) <= 1)

    day_load_terms = []
    max_day_load = model.NewIntVar(0, periods_per_day, "max_day_load")
    for day in days:
      day_vars = [var for (index, slot_day, slot_period), var in variables.items() if slot_day == day]
      day_load = model.NewIntVar(0, periods_per_day, f"day_load_{day}")
      model.Add(day_load == sum(day_vars))
      day_load_terms.append(day_load)
      model.Add(day_load <= max_day_load)

    late_penalties = []
    for (index, day, period), var in variables.items():
        if not is_pt_subject(assignments[index]) and period >= 5:
            late_penalties.append(var)

    model.Minimize((max_day_load * 100) + sum(late_penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"error": explain_failure(assignments, candidates)}

    scheduled_slots = []
    for (index, day, period), var in variables.items():
        if solver.Value(var) != 1:
            continue
        assignment = assignments[index]
        scheduled_slots.append({
            "class_id": class_id,
            "subject_id": int(assignment["subject_id"]),
            "day_order": day,
            "period": period,
            "staff_id": int(assignment["staff_id"]) if assignment.get("staff_id") else None,
        })

    scheduled_slots.sort(key=lambda item: (item["day_order"], item["period"], item["subject_id"]))
    return {"scheduled_slots": scheduled_slots}


if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        result = solve_class_schedule(
            class_id=int(input_data.get("class_id")),
            assignments=input_data.get("assignments", []),
            days=input_data.get("days", [1, 2, 3, 4, 5, 6]),
            periods_per_day=int(input_data.get("periods_per_day", 6)),
            occupied_slots=input_data.get("occupied_slots", {}),
            staff_occupied=input_data.get("occupied_staff_slots", {}),
        )
        print(json.dumps(result))
        sys.stdout.flush()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.stdout.flush()
        sys.exit(1)
