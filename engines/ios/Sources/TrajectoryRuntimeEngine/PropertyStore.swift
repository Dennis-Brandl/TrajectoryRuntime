import Foundation

public class PropertyStore: @unchecked Sendable {
    private var store: [String: String] = [:]

    public init() {}

    public func initializeFromWorkflow(_ workflow: MasterWorkflowSpecification) {
        guard let specs = workflow.value_property_specifications else { return }
        for prop in specs {
            for entry in prop.entries {
                store["\(prop.name).\(entry.name)"] = entry.value
            }
        }
    }

    public func initializeFromSetup(_ initialProperties: [String: String]) {
        for (key, value) in initialProperties {
            store[key] = value
        }
    }

    public func get(_ dotKey: String) -> String? {
        return store[dotKey]
    }

    public func set(_ dotKey: String, value: String) {
        store[dotKey] = value
    }

    public func resolveDefault(_ defaultSource: ParameterDefaultSource?) -> String {
        guard let ds = defaultSource else { return "" }
        switch ds.mode {
        case "static":
            return ds.value
        case "property", "parameter":
            return store[ds.value] ?? ""
        default:
            return ""
        }
    }

    public func captureFormOutputs(elements: [JSONValue], formValues: [String: JSONValue]) {
        for el in elements {
            guard let elObj = el.objectValue else { continue }
            guard let outputParam = elObj["outputParameter"]?.stringValue else { continue }
            guard let fieldName = elObj["fieldName"]?.stringValue else { continue }
            guard let value = formValues[fieldName] else { continue }

            switch value {
            case .array:
                // Checkbox arrays → JSON string
                store[outputParam] = value.toJSONString()
            case .string(let s):
                store[outputParam] = s
            case .int(let i):
                store[outputParam] = String(i)
            case .double(let d):
                store[outputParam] = String(d)
            case .bool(let b):
                store[outputParam] = String(b)
            default:
                store[outputParam] = value.toJSONString()
            }
        }
    }

    public func toFlatMap() -> [String: String] {
        return store
    }
}
