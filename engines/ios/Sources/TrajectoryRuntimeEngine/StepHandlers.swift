import Foundation

// Normalize only SELECT_1 → SELECT 1 (the only fixture/schema discrepancy).
// USER_INTERACTION and YES_NO keep their underscores per the schema enum.
public func canonicalStepType(_ raw: String) -> String {
    if raw == "SELECT_1" { return "SELECT 1" }
    return raw
}

public func isAutoCompleting(_ stepType: String) -> Bool {
    let t = canonicalStepType(stepType)
    return ["START", "END", "PARALLEL", "SELECT 1", "SCRIPT", "MATH"].contains(t)
}

public func needsUserAction(_ stepType: String) -> Bool {
    return ["USER_INTERACTION", "YES_NO"].contains(stepType)
}

public func getFormElements(_ step: MasterWorkflowStep) -> [JSONValue] {
    guard let config = step.form_layout_config else { return [] }

    // Handle array of breakpoints — use first one (phone)
    if let arr = config.arrayValue {
        guard let first = arr.first, let firstObj = first.objectValue else { return [] }
        if let elements = firstObj["elements"]?.arrayValue {
            return elements
        }
        return []
    }

    // Handle plain object shape (some semantic fixtures use this)
    if let obj = config.objectValue, let elements = obj["elements"]?.arrayValue {
        return elements
    }

    return []
}

public func handleSelect1(step: MasterWorkflowStep, propertyStore: PropertyStore) -> RoutingResult {
    guard let config = step.select1_config, let options = config.options else {
        return RoutingResult()
    }

    // Resolve the input value
    var inputValue = ""
    if config.input_value_type == "property", let inputName = config.input_name {
        inputValue = propertyStore.get(inputName) ?? ""
    } else if let inputName = config.input_name {
        inputValue = inputName
    }

    // Evaluate options in order
    var defaultOption: Select1Option?
    for option in options {
        if option.is_default {
            defaultOption = option
            continue
        }

        let compareValue: String
        if option.value_type == "property" {
            compareValue = propertyStore.get(option.value) ?? ""
        } else {
            compareValue = option.value
        }

        if evaluateOperator(input: inputValue, op: option.operator, value: compareValue) {
            return RoutingResult(connectionId: option.id)
        }
    }

    // No match — use default
    if let def = defaultOption {
        return RoutingResult(connectionId: def.id)
    }

    return RoutingResult()
}

private func evaluateOperator(input: String, op: String, value: String) -> Bool {
    switch op {
    case "==": return input == value
    case "!=": return input != value
    case "<": return input < value
    case ">": return input > value
    case "<=": return input <= value
    case ">=": return input >= value
    case "Contains": return input.contains(value)
    case "Not Contains": return !input.contains(value)
    default: return false
    }
}

public func handleUserAction(step: MasterWorkflowStep, action: UserAction, propertyStore: PropertyStore) -> RoutingResult {
    let stepType = step.step_type

    if stepType == "YES_NO" {
        return RoutingResult(conditionValue: action.button_output)
    }

    if stepType == "USER_INTERACTION" {
        if action.action == "button_press" {
            return RoutingResult(conditionValue: action.button_output)
        }

        // Submit — capture form outputs
        if action.action == "submit", let formValues = action.form_values {
            let elements = getFormElements(step)
            propertyStore.captureFormOutputs(elements: elements, formValues: formValues)
        }

        return RoutingResult() // No routing condition for submit
    }

    return RoutingResult()
}
