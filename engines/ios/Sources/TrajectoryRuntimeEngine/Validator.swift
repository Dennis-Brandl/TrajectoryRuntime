import Foundation

private func normalizeStepType(_ t: String) -> String {
    return t.replacingOccurrences(of: "_", with: " ")
}

// Valid step types — includes SELECT_1 as accepted alias for SELECT 1
private let validStepTypes: Set<String> = [
    "START", "END", "ACTION PROXY", "WORKFLOW PROXY", "SELECT 1", "SELECT_1",
    "WAIT ANY", "PARALLEL", "WAIT ALL", "MATH", "SCRIPT",
    "YES_NO", "USER_INTERACTION"
]

private let validFormElementTypes: Set<String> = [
    "button", "text", "header", "textInput", "textarea",
    "image", "video", "checkbox", "radio", "divider", "timer"
]

// Pre-checks: catch missing required fields on steps/connections before
// semantic graph analysis (which would misinterpret them)
private func preStructuralChecks(_ workflow: [String: Any]) -> ValidationResult? {
    guard let steps = workflow["steps"] as? [[String: Any]] else {
        return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD", error_message: "Missing steps array")
    }
    guard let connections = workflow["connections"] as? [[String: Any]] else {
        return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD", error_message: "Missing connections array")
    }

    for step in steps {
        for field in ["local_id", "oid", "version", "last_modified_date"] {
            if step[field] == nil {
                return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD",
                                       error_message: "Step missing required field: \(field)")
            }
        }
        if step["step_type"] == nil {
            return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD",
                                   error_message: "Step missing required field: step_type")
        }
    }

    for conn in connections {
        if conn["from_step_id"] == nil {
            return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD",
                                   error_message: "Connection missing from_step_id")
        }
        if conn["to_step_id"] == nil {
            return ValidationResult(valid: false, error_code: "MISSING_REQUIRED_FIELD",
                                   error_message: "Connection missing to_step_id")
        }
    }

    return nil
}

// Semantic checks: graph-level analysis
private func semanticValidation(_ workflow: [String: Any]) -> ValidationResult? {
    let steps = workflow["steps"] as! [[String: Any]]
    let connections = workflow["connections"] as! [[String: Any]]

    // Duplicate step OIDs
    var oids = Set<String>()
    for step in steps {
        let oid = step["oid"] as! String
        if oids.contains(oid) {
            return ValidationResult(valid: false, error_code: "DUPLICATE_STEP_OID",
                                   error_message: "Duplicate step OID: \(oid)")
        }
        oids.insert(oid)
    }

    // Count START and END steps
    var startCount = 0
    var endCount = 0
    for step in steps {
        let st = normalizeStepType(step["step_type"] as! String)
        if st == "START" { startCount += 1 }
        if st == "END" { endCount += 1 }
    }

    if startCount == 0 {
        return ValidationResult(valid: false, error_code: "NO_START_STEP", error_message: "No START step found")
    }
    if startCount > 1 {
        return ValidationResult(valid: false, error_code: "MULTIPLE_START_STEPS", error_message: "Multiple START steps found")
    }
    if endCount == 0 {
        return ValidationResult(valid: false, error_code: "NO_END_STEP", error_message: "No END step found")
    }

    // Dangling connections
    for conn in connections {
        let from = conn["from_step_id"] as! String
        let to = conn["to_step_id"] as! String
        if !oids.contains(from) {
            return ValidationResult(valid: false, error_code: "DANGLING_CONNECTION",
                                   error_message: "Connection references non-existent step: \(from)")
        }
        if !oids.contains(to) {
            return ValidationResult(valid: false, error_code: "DANGLING_CONNECTION",
                                   error_message: "Connection references non-existent step: \(to)")
        }
    }

    // Self-referencing connections
    for conn in connections {
        let from = conn["from_step_id"] as! String
        let to = conn["to_step_id"] as! String
        if from == to {
            return ValidationResult(valid: false, error_code: "SELF_REFERENCING_CONNECTION",
                                   error_message: "Self-referencing connection on step: \(from)")
        }
    }

    // Orphaned steps (BFS from START)
    let startOid = steps.first { normalizeStepType($0["step_type"] as! String) == "START" }!["oid"] as! String
    var reachable = Set<String>([startOid])
    var queue = [startOid]
    while !queue.isEmpty {
        let current = queue.removeFirst()
        for conn in connections {
            if conn["from_step_id"] as! String == current {
                let to = conn["to_step_id"] as! String
                if !reachable.contains(to) {
                    reachable.insert(to)
                    queue.append(to)
                }
            }
        }
    }
    for step in steps {
        let oid = step["oid"] as! String
        if !reachable.contains(oid) {
            return ValidationResult(valid: false, error_code: "ORPHANED_STEP",
                                   error_message: "Step \(oid) is not reachable from START")
        }
    }

    // PARALLEL without matching WAIT ALL
    for step in steps {
        let st = normalizeStepType(step["step_type"] as! String)
        if st == "PARALLEL" {
            if !hasMatchingWaitAll(parallelOid: step["oid"] as! String, steps: steps, connections: connections) {
                return ValidationResult(valid: false, error_code: "UNMATCHED_PARALLEL",
                                       error_message: "PARALLEL step \(step["oid"]!) has no matching WAIT ALL")
            }
        }
    }

    return nil
}

private func hasMatchingWaitAll(parallelOid: String, steps: [[String: Any]], connections: [[String: Any]]) -> Bool {
    var stepMap: [String: String] = [:]
    for s in steps {
        stepMap[s["oid"] as! String] = normalizeStepType(s["step_type"] as! String)
    }

    var visited = Set<String>()
    var queue: [String] = []
    for conn in connections {
        if conn["from_step_id"] as! String == parallelOid {
            queue.append(conn["to_step_id"] as! String)
        }
    }

    while !queue.isEmpty {
        let oid = queue.removeFirst()
        if visited.contains(oid) { continue }
        visited.insert(oid)
        let type = stepMap[oid]
        if type == "WAIT ALL" { return true }
        if type == "END" { continue }
        for conn in connections {
            if conn["from_step_id"] as! String == oid {
                queue.append(conn["to_step_id"] as! String)
            }
        }
    }
    return false
}

// Structural validation — checks step_type enum and form element types
// (replaces full JSON Schema validation which requires CoreFoundation on Windows)
private func structuralValidation(_ workflow: [String: Any]) -> ValidationResult? {
    let steps = workflow["steps"] as! [[String: Any]]

    // Validate step_type enum (check raw value, not normalized)
    for step in steps {
        let rawType = step["step_type"] as! String
        if !validStepTypes.contains(rawType) {
            return ValidationResult(valid: false, error_code: "INVALID_STEP_TYPE",
                                   error_message: "Invalid step type: \(rawType)")
        }
    }

    // Validate form element types
    for step in steps {
        if let formConfig = step["form_layout_config"] {
            if let err = validateFormElements(formConfig) {
                return err
            }
        }
    }

    return nil
}

private func validateFormElements(_ config: Any) -> ValidationResult? {
    // Array of breakpoints
    if let arr = config as? [[String: Any]] {
        for entry in arr {
            if let elements = entry["elements"] as? [[String: Any]] {
                for el in elements {
                    if let type = el["type"] as? String {
                        if !validFormElementTypes.contains(type) {
                            return ValidationResult(valid: false, error_code: "INVALID_FORM_ELEMENT_TYPE",
                                                   error_message: "Invalid form element type: \(type)")
                        }
                    }
                }
            }
        }
    }

    // Plain object with elements
    if let obj = config as? [String: Any], let elements = obj["elements"] as? [[String: Any]] {
        for el in elements {
            if let type = el["type"] as? String {
                if !validFormElementTypes.contains(type) {
                    return ValidationResult(valid: false, error_code: "INVALID_FORM_ELEMENT_TYPE",
                                           error_message: "Invalid form element type: \(type)")
                }
            }
        }
    }

    return nil
}

public func validate(workflow: [String: Any]) -> ValidationResult {
    // Phase 0: Pre-structural
    if let preError = preStructuralChecks(workflow) { return preError }

    // Phase A: Semantic checks
    if let semError = semanticValidation(workflow) { return semError }

    // Phase B: Structural validation
    if let structError = structuralValidation(workflow) { return structError }

    return ValidationResult(valid: true)
}
