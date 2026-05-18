import XCTest
import Foundation
@testable import TrajectoryRuntimeEngine

final class ConformanceRunner: XCTestCase {

    private func findConformanceDir() -> URL {
        // Try relative to current working directory
        let cwd = FileManager.default.currentDirectoryPath
        let candidates = [
            URL(fileURLWithPath: cwd).appendingPathComponent("../../spec/conformance"),
            URL(fileURLWithPath: cwd).appendingPathComponent("../../../spec/conformance"),
            URL(fileURLWithPath: cwd).appendingPathComponent("spec/conformance"),
        ]

        for candidate in candidates {
            let standardized = candidate.standardized
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: standardized.path, isDirectory: &isDir), isDir.boolValue {
                return standardized
            }
        }

        // Try Bundle resources (when tests copy conformance/)
        if let resourceURL = Bundle.module.resourceURL?.appendingPathComponent("conformance") {
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: resourceURL.path, isDirectory: &isDir), isDir.boolValue {
                return resourceURL
            }
        }

        fatalError("Cannot find conformance directory")
    }

    private func discoverFixtures(baseDir: URL) -> [TestFixture] {
        var fixtures: [TestFixture] = []
        let subdirs = ["validation", "execution", "parameters"]
        let decoder = JSONDecoder()

        for subdir in subdirs {
            let dir = baseDir.appendingPathComponent(subdir)
            guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
                continue
            }
            let jsonFiles = files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
            for file in jsonFiles {
                guard let data = try? Data(contentsOf: file),
                      let fixture = try? decoder.decode(TestFixture.self, from: data) else {
                    continue
                }
                fixtures.append(fixture)
            }
        }
        return fixtures
    }

    func testConformance() throws {
        let conformanceDir = findConformanceDir()
        let fixtures = discoverFixtures(baseDir: conformanceDir)

        XCTAssertGreaterThan(fixtures.count, 0, "No fixtures found in \(conformanceDir.path)")

        var passed = 0
        var failed = 0
        var failures: [String] = []

        for fixture in fixtures {
            do {
                try runFixture(fixture)
                passed += 1
            } catch {
                failed += 1
                failures.append("\(fixture.test_id): \(fixture.name) - \(error)")
            }
        }

        if !failures.isEmpty {
            let failureList = failures.joined(separator: "\n  ")
            XCTFail("\(failed) fixture(s) failed:\n  \(failureList)")
        }

        print("\(passed) passed, \(failed) failed, \(passed + failed) total")
    }

    private func runFixture(_ fixture: TestFixture) throws {
        if fixture.category == "validation" {
            try runValidationFixture(fixture)
        } else {
            try runExecutionFixture(fixture)
        }
    }

    private func runValidationFixture(_ fixture: TestFixture) throws {
        let workflowMap = fixture.workflow.toAny() as! [String: Any]
        let result = validate(workflow: workflowMap)

        if fixture.expected.valid != result.valid {
            let extra = result.error_code.map { " (error: \($0))" } ?? ""
            throw FixtureError.mismatch("Expected valid=\(fixture.expected.valid), got valid=\(result.valid)\(extra)")
        }

        if !fixture.expected.valid, let expectedCode = fixture.expected.error_code {
            if result.error_code != expectedCode {
                throw FixtureError.mismatch("Expected error_code=\"\(expectedCode)\", got \"\(result.error_code ?? "nil")\"")
            }
        }
    }

    private func runExecutionFixture(_ fixture: TestFixture) throws {
        // First validate
        let workflowMap = fixture.workflow.toAny() as! [String: Any]
        let valResult = validate(workflow: workflowMap)
        if !valResult.valid {
            throw FixtureError.mismatch("Validation failed: \(valResult.error_code ?? "unknown")")
        }

        // Deserialize workflow as typed object
        let decoder = JSONDecoder()
        let workflowJSON = try JSONEncoder().encode(fixture.workflow)
        let workflow = try decoder.decode(MasterWorkflowSpecification.self, from: workflowJSON)

        let engine = WorkflowEngine(workflow: workflow, setup: fixture.setup)
        engine.start()

        // Submit user actions
        if let actions = fixture.user_actions {
            for (i, action) in actions.enumerated() {
                engine.submitAction(action, actionIndex: i)
            }
        }

        // Compare execution trace
        if let expectedTrace = fixture.expected.execution_trace {
            let actualTrace = engine.getTrace()
            try compareTrace(expected: expectedTrace, actual: actualTrace)
        }

        // Compare workflow state
        if let expectedState = fixture.expected.workflow_state {
            let actualState = engine.getWorkflowState().rawValue
            if actualState != expectedState {
                throw FixtureError.mismatch("Workflow state: expected \"\(expectedState)\", got \"\(actualState)\"")
            }
        }

        // Compare final properties
        if let expectedProps = fixture.expected.final_properties {
            let actualProps = engine.getProperties()
            try compareProperties(expected: expectedProps, actual: actualProps)
        }
    }

    private func compareTrace(expected: [TraceEntry], actual: [TraceEntry]) throws {
        if expected.count != actual.count {
            let expectedList = expected.map { "\($0.step_oid):\($0.state)" }
            let actualList = actual.map { "\($0.step_oid):\($0.state)" }
            throw FixtureError.mismatch(
                "Trace length mismatch: expected \(expected.count), got \(actual.count)\n" +
                "  Expected: \(expectedList)\n" +
                "  Actual:   \(actualList)"
            )
        }

        for i in 0..<expected.count {
            let exp = expected[i]
            let act = actual[i]

            if exp.step_oid != act.step_oid {
                throw FixtureError.mismatch("Trace[\(i)] step_oid: expected \"\(exp.step_oid)\", got \"\(act.step_oid)\"")
            }
            if exp.state != act.state {
                throw FixtureError.mismatch("Trace[\(i)] state: expected \"\(exp.state)\", got \"\(act.state)\" (step \(exp.step_oid))")
            }
            if exp.order != act.order {
                throw FixtureError.mismatch("Trace[\(i)] order: expected \(exp.order), got \(act.order) (step \(exp.step_oid))")
            }
            if let expAction = exp.after_action, expAction != act.after_action {
                throw FixtureError.mismatch("Trace[\(i)] after_action: expected \(expAction), got \(act.after_action ?? -1) (step \(exp.step_oid))")
            }
        }
    }

    private func compareProperties(expected: [String: String], actual: [String: String]) throws {
        for (key, expectedValue) in expected {
            let actualValue = actual[key]
            if actualValue != expectedValue {
                throw FixtureError.mismatch("Property \"\(key)\": expected \"\(expectedValue)\", got \"\(actualValue ?? "(undefined)")\"")
            }
        }
    }

    enum FixtureError: Error, CustomStringConvertible {
        case mismatch(String)
        var description: String {
            switch self {
            case .mismatch(let msg): return msg
            }
        }
    }
}
