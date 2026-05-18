import Foundation

// MARK: - Workflow Document Types

public struct Position: Codable, Sendable {
    public let x: Double
    public let y: Double
}

public struct WorkflowConnection: Codable, Sendable {
    public let from_step_id: String
    public let to_step_id: String
    public let condition: String?
    public let connection_id: String?
    public let source_handle_id: String?

    public init(from_step_id: String, to_step_id: String, condition: String? = nil,
                connection_id: String? = nil, source_handle_id: String? = nil) {
        self.from_step_id = from_step_id
        self.to_step_id = to_step_id
        self.condition = condition
        self.connection_id = connection_id
        self.source_handle_id = source_handle_id
    }
}

public struct ParameterDefaultSource: Codable, Sendable {
    public let mode: String  // "static" | "property" | "parameter"
    public let value: String
}

public struct YesNoConfig: Codable, Sendable {
    public let yes_label: String?
    public let no_label: String?
    public let yes_value: String?
    public let no_value: String?
    public let default_selection: String?
}

public struct Select1Option: Codable, Sendable {
    public let id: String
    public let label: String
    public let `operator`: String
    public let value: String
    public let value_type: String
    public let is_default: Bool
}

public struct Select1Config: Codable, Sendable {
    public let input_name: String?
    public let input_value_type: String?
    public let options: [Select1Option]?
}

public struct ScriptConfig: Codable, Sendable {
    public let language: String?
    public let source: String?
}

public struct PropertyEntrySpecification: Codable, Sendable {
    public let name: String
    public let value: String
}

public struct ParameterSpecification: Codable, Sendable {
    public let id: String
    public let oid: String?
    public let description: String?
    public let default_value: String
    public let value_type: String?
    public let json_schema: String?
    public let entries: [PropertyEntrySpecification]?
}

public struct OutputParameterSpecification: Codable, Sendable {
    public let id: String
    public let oid: String?
    public let description: String?
    public let target: String?
    public let entries: [PropertyEntrySpecification]?
}

public struct PropertySpecification: Codable, Sendable {
    public let name: String
    public let oid: String?
    public let entries: [PropertyEntrySpecification]
}

public struct ResourceCommandSpecification: Codable, Sendable {
    public let oid: String?
    public let command_type: String
    public let resource_name: String
    public let amount: Double?
    public let target: String?
    public let source: String?
}

public struct ResourcePropertySpecification: Codable, Sendable {
    public let name: String
    public let resource_type: String
    public let use_limit: Int?
    public let description: String?
    public let names: [String]?
}

public struct FormLayoutExportEntry: Codable, Sendable {
    public let deviceType: String
    public let canvasWidth: Double
    public let canvasHeight: Double
    public let elements: [JSONValue]
}

public struct MasterWorkflowStep: Codable, Sendable {
    public let local_id: String
    public let oid: String
    public let description: String?
    public let version: String
    public let last_modified_date: String
    public let step_type: String
    public let position: Position?
    public let input_parameter_specifications: [ParameterSpecification]?
    public let output_parameter_specifications: [OutputParameterSpecification]?
    public let value_property_specifications: [PropertySpecification]?
    public let resource_command_specifications: [ResourceCommandSpecification]?
    public let form_layout_config: JSONValue?
    public let yes_no_config: YesNoConfig?
    public let script_config: ScriptConfig?
    public let select1_config: Select1Config?
}

public struct MasterWorkflowSpecification: Codable, Sendable {
    public let local_id: String
    public let oid: String
    public let description: String?
    public let version: String
    public let last_modified_date: String
    public let schemaVersion: String?
    public let steps: [MasterWorkflowStep]
    public let connections: [WorkflowConnection]
    public let starting_parameter_specifications: [ParameterSpecification]?
    public let output_parameter_specifications: [OutputParameterSpecification]?
    public let value_property_specifications: [PropertySpecification]?
    public let resource_command_specifications: [ResourceCommandSpecification]?
    public let resource_property_specifications: [ResourcePropertySpecification]?
    public let viewport: JSONValue?
}

// MARK: - Engine Runtime Types

public enum StepState: String, Sendable {
    case IDLE, WAITING, STARTING, EXECUTING, COMPLETING, COMPLETED
}

public enum WorkflowState: String, Sendable {
    case IDLE, RUNNING, COMPLETED, ABORTED, STOPPED
}

public struct StepInstance: Sendable {
    public let oid: String
    public let stepType: String
    public var state: StepState
    public let step: MasterWorkflowStep
}

public struct TraceEntry: Codable, Sendable, Equatable {
    public let step_oid: String
    public let state: String
    public let order: Int
    public let after_action: Int?

    public init(step_oid: String, state: String, order: Int, after_action: Int? = nil) {
        self.step_oid = step_oid
        self.state = state
        self.order = order
        self.after_action = after_action
    }
}

public struct ValidationResult: Sendable {
    public let valid: Bool
    public let error_code: String?
    public let error_message: String?

    public init(valid: Bool, error_code: String? = nil, error_message: String? = nil) {
        self.valid = valid
        self.error_code = error_code
        self.error_message = error_message
    }
}

public struct RoutingResult: Sendable {
    public let conditionValue: String?
    public let connectionId: String?

    public init(conditionValue: String? = nil, connectionId: String? = nil) {
        self.conditionValue = conditionValue
        self.connectionId = connectionId
    }
}

// MARK: - Test Fixture Types

public struct UserAction: Codable, Sendable {
    public let step_oid: String
    public let action: String
    public let form_values: [String: JSONValue]?
    public let button_output: String?
}

public struct TestFixtureSetup: Codable, Sendable {
    public let starting_parameters: [String: String]?
    public let initial_properties: [String: String]?
}

public struct TestFixtureExpected: Codable, Sendable {
    public let valid: Bool
    public let error_code: String?
    public let execution_trace: [TraceEntry]?
    public let workflow_state: String?
    public let final_properties: [String: String]?
}

public struct TestFixture: Codable, Sendable {
    public let test_id: String
    public let name: String
    public let category: String
    public let tags: [String]
    public let workflow: JSONValue
    public let setup: TestFixtureSetup?
    public let user_actions: [UserAction]?
    public let expected: TestFixtureExpected
}

// MARK: - JSONValue (generic JSON representation)

public enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
            return
        }
        if let b = try? container.decode(Bool.self) {
            self = .bool(b)
            return
        }
        if let i = try? container.decode(Int.self) {
            self = .int(i)
            return
        }
        if let d = try? container.decode(Double.self) {
            self = .double(d)
            return
        }
        if let s = try? container.decode(String.self) {
            self = .string(s)
            return
        }
        if let arr = try? container.decode([JSONValue].self) {
            self = .array(arr)
            return
        }
        if let obj = try? container.decode([String: JSONValue].self) {
            self = .object(obj)
            return
        }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode JSONValue")
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .string(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .object(let v): try container.encode(v)
        }
    }

    public var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    public var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    public var intValue: Int? {
        if case .int(let i) = self { return i }
        return nil
    }

    public var doubleValue: Double? {
        switch self {
        case .int(let i): return Double(i)
        case .double(let d): return d
        default: return nil
        }
    }

    public var arrayValue: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    public var objectValue: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public subscript(index: Int) -> JSONValue? {
        if case .array(let a) = self, index < a.count { return a[index] }
        return nil
    }

    /// Convert to Any for use with JSON Schema validator
    public func toAny() -> Any {
        switch self {
        case .null: return NSNull()
        case .bool(let v): return v
        case .int(let v): return v
        case .double(let v): return v
        case .string(let v): return v
        case .array(let arr): return arr.map { $0.toAny() }
        case .object(let obj):
            var dict: [String: Any] = [:]
            for (k, v) in obj { dict[k] = v.toAny() }
            return dict
        }
    }

    /// Convert to JSON string
    public func toJSONString() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self),
              let str = String(data: data, encoding: .utf8) else {
            return "null"
        }
        return str
    }
}
